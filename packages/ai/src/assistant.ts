import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { DEFAULT_CLAUDE_MODEL } from "./anthropic";
import { AiError } from "./types";

/**
 * Something the model can read and point back to: a fact, note, catch-up or life event.
 * `ref` is a short handle ("F3", "N1") so the model can cite it without copying uuids.
 */
export interface Source {
  ref: string;
  /** Who it's about, when it's about one person. */
  person?: string | null;
  /** YYYY-MM-DD, when it happened or was written down. */
  date?: string | null;
  text: string;
}

export const summarySchema = z.object({
  summary: z.string().describe("2-4 sentences on who this person is to you, in second person. Plain, warm, specific. No headings."),
  askAbout: z
    .array(
      z.object({
        text: z.string().describe('Something to ask or follow up on next time, as a short prompt: "How the new job at Shopify is going".'),
        ref: z.string().nullable().describe("The source ref this comes from."),
      }),
    )
    .describe("Open threads worth a follow-up question, newest first. At most 5. Empty if nothing is open."),
});
export type PersonSummary = z.infer<typeof summarySchema>;

export const answerSchema = z.object({
  answer: z.string().describe("A short, direct answer in plain English. Say plainly when the sources don't say."),
  refs: z.array(z.string()).describe("Refs of the sources the answer relies on."),
});
export type Answer = z.infer<typeof answerSchema>;

export interface SummaryInput {
  /** Who the person is in one line: name, what they are to the user, where they live and work. */
  person: string;
  sources: Source[];
  /** User's local date, YYYY-MM-DD. */
  today: string;
}

export interface AskInput {
  question: string;
  sources: Source[];
  today: string;
}

export const SUMMARY_SYSTEM_PROMPT = `You write a short profile card for the user's personal relationship manager, about one person in their life, from the user's own notes.

Rules:
- Only use what the sources say. Never guess or add detail.
- Write to the user, in second person ("your cousin", "you met at…"). Keep it to 2-4 sentences: who they are to the user, what's going on in their life lately, what they care about.
- askAbout lists things still open that deserve a follow-up question: an interview, a surgery, a trip, a move, a new baby, a "how did it go". Skip anything already resolved by a later source or older than a year unless it's still clearly open. Cite the source ref each one comes from.
- Be gentle with sensitive things (health, loss, breakups): phrase follow-ups kindly.
- Never write "the user". The notes are in the user's own first person ("I", "we"); turn that into "you".`;

export const ASK_SYSTEM_PROMPT = `You answer the user's questions about the people in their life, using only the numbered sources from their personal relationship manager.

Rules:
- Only use what the sources say. If they don't answer the question, say so in one sentence and suggest what to note down.
- "I", "me" and "my" in the question mean the user.
- Answer in one to three sentences, or a short list when the question asks for several people. Use people's names.
- Put the refs of every source you relied on in refs. Don't write refs into the answer text.
- For "when did I last…" questions, use the most recent dated source and give the date.
- Talk to the user as "you". Never write "the user".`;

function sourceBlock(sources: Source[]) {
  return sources
    .map((s) => `[${s.ref}]${s.date ? ` ${s.date}` : ""}${s.person ? ` (${s.person})` : ""}: ${s.text.replace(/\s+/g, " ").trim()}`)
    .join("\n");
}

export function buildSummaryMessage(input: SummaryInput): string {
  return `Today is ${input.today}.

Person: ${input.person}

Sources:
${sourceBlock(input.sources) || "(nothing recorded yet)"}`;
}

export function buildAskMessage(input: AskInput): string {
  return `Today is ${input.today}.

Sources:
${sourceBlock(input.sources) || "(no matching notes)"}

Question: ${input.question}`;
}

/** Drop refs the model made up, and empty items. */
export function sanitizeSummary(raw: PersonSummary, sources: Source[]): PersonSummary {
  const refs = new Set(sources.map((s) => s.ref));
  return {
    summary: raw.summary.trim(),
    askAbout: raw.askAbout
      .filter((a) => a.text.trim() !== "")
      .slice(0, 5)
      .map((a) => ({ text: a.text.trim(), ref: a.ref && refs.has(a.ref) ? a.ref : null })),
  };
}

export function sanitizeAnswer(raw: Answer, sources: Source[]): Answer {
  const refs = new Set(sources.map((s) => s.ref));
  return { answer: raw.answer.trim(), refs: [...new Set(raw.refs.filter((r) => refs.has(r)))] };
}

/** Summaries and questions over the user's own notes. */
export interface Assistant {
  readonly name: string;
  summarize(input: SummaryInput): Promise<PersonSummary>;
  ask(input: AskInput): Promise<Answer>;
}

export class AnthropicAssistant implements Assistant {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(
    options: { apiKey?: string; baseURL?: string; fetch?: typeof fetch } = {},
    private readonly model = DEFAULT_CLAUDE_MODEL,
  ) {
    this.client = new Anthropic({ apiKey: options.apiKey, baseURL: options.baseURL, fetch: options.fetch });
  }

  private async run<T extends z.ZodType>(schema: T, system: string, message: string, effort: "low" | "medium") {
    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort, format: betaZodOutputFormat(schema) },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: message }],
      });
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) throw new AiError("Claude API key is missing or invalid.");
      if (error instanceof Anthropic.RateLimitError) throw new AiError("Claude is rate limiting requests.", true);
      if (error instanceof Anthropic.APIConnectionError) throw new AiError("Could not reach the Claude API.", true);
      if (error instanceof Anthropic.APIError) throw new AiError(`Claude API error ${error.status}: ${error.message}`);
      throw error;
    }
    if (response.stop_reason === "refusal") throw new AiError("Claude declined to answer this.");
    if (response.stop_reason === "max_tokens") throw new AiError("There was too much to read in one go.");
    if (!response.parsed_output) throw new AiError("Claude returned output that didn't match the expected format.", true);
    return response.parsed_output as z.infer<T>;
  }

  async summarize(input: SummaryInput) {
    return sanitizeSummary(await this.run(summarySchema, SUMMARY_SYSTEM_PROMPT, buildSummaryMessage(input), "low"), input.sources);
  }

  async ask(input: AskInput) {
    return sanitizeAnswer(await this.run(answerSchema, ASK_SYSTEM_PROMPT, buildAskMessage(input), "medium"), input.sources);
  }
}

const jsonSchema = (schema: z.ZodType) => {
  // Some servers reject the $schema key.
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema);
  return rest;
};

export class OpenAiCompatibleAssistant implements Assistant {
  readonly name = "openai_compatible";

  constructor(private readonly config: { baseUrl: string; apiKey?: string; model: string; fetch?: typeof fetch }) {}

  private async run<T extends z.ZodType>(schema: T, name: string, system: string, message: string): Promise<z.infer<T>> {
    const doFetch = this.config.fetch ?? fetch;
    const res = await doFetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: message },
        ],
        response_format: { type: "json_schema", json_schema: { name, strict: true, schema: jsonSchema(schema) } },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new AiError(`${res.status} from the model: ${text.slice(0, 200)}`, res.status === 429 || res.status >= 500);
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new AiError("The model returned an empty response.", true);
    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch {
      throw new AiError("The model returned invalid JSON.", true);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new AiError("The model's output didn't match the expected format.", true);
    return parsed.data;
  }

  async summarize(input: SummaryInput) {
    return sanitizeSummary(await this.run(summarySchema, "summary", SUMMARY_SYSTEM_PROMPT, buildSummaryMessage(input)), input.sources);
  }

  async ask(input: AskInput) {
    return sanitizeAnswer(await this.run(answerSchema, "answer", ASK_SYSTEM_PROMPT, buildAskMessage(input)), input.sources);
  }
}
