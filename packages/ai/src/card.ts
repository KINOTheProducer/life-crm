import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { DEFAULT_CLAUDE_MODEL } from "./anthropic";
import { AiError } from "./types";

/** What we read off a business card. Only what's printed; nothing guessed. */
export const cardExtractionSchema = z.object({
  firstName: z.string().describe("Given name as printed. Empty if the card has no person's name."),
  lastName: z.string().nullable(),
  jobTitle: z.string().nullable().describe("In English when the card is bilingual and has both."),
  company: z.string().nullable(),
  phones: z.array(z.object({ label: z.enum(["mobile", "work", "home", "fax", "other"]), value: z.string() })),
  emails: z.array(z.string()),
  websites: z.array(z.string()),
  socials: z.array(z.object({ service: z.enum(["instagram", "linkedin", "x", "facebook", "tiktok", "github", "other"]), handle: z.string() })),
  address: z
    .object({
      street: z.string().nullable(),
      line2: z.string().nullable(),
      city: z.string().nullable(),
      region: z.string().nullable(),
      postalCode: z.string().nullable(),
      country: z.string().nullable(),
    })
    .nullable(),
  other: z.string().nullable().describe("Anything else worth keeping: a tagline, a handwritten note, office hours."),
});
export type CardExtraction = z.infer<typeof cardExtractionSchema>;

export const CARD_SYSTEM_PROMPT = `You read photos of business cards and return the contact details printed on them.

Rules:
- Only return what is printed or handwritten on the card. Never guess or fill in details.
- One person per card. If both sides are given, combine them.
- Cards are often bilingual English and French (Canada). Keep names as printed; give the job title in English when both are shown.
- Phone labels: M, C, Cell, Mobile = mobile; T, Tel, P, Phone, Office, Direct, Bureau = work; F, Fax, Téléc = fax; Home, Domicile = home.
- Keep phone numbers and extensions as printed ("416 555 0123 ext. 204").
- Socials: return the handle without @ or the URL path ("hollyc", "in/holly-chen" becomes "holly-chen").
- Put a Canadian or US province or state in region and the postal or ZIP code in postalCode.`;

export interface CardImage {
  data: Uint8Array;
  mimeType: string;
}

export interface CardReader {
  readonly name: string;
  read(images: CardImage[]): Promise<CardExtraction>;
}

const toBase64 = (d: Uint8Array) => Buffer.from(d).toString("base64");

export class AnthropicCardReader implements CardReader {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(
    options: { apiKey?: string; baseURL?: string; fetch?: typeof fetch } = {},
    private readonly model = DEFAULT_CLAUDE_MODEL,
  ) {
    this.client = new Anthropic({ apiKey: options.apiKey, baseURL: options.baseURL, fetch: options.fetch });
  }

  async read(images: CardImage[]): Promise<CardExtraction> {
    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(cardExtractionSchema) },
        system: CARD_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              ...images.map((img) => ({
                type: "image" as const,
                source: { type: "base64" as const, media_type: img.mimeType as "image/jpeg", data: toBase64(img.data) },
              })),
              { type: "text" as const, text: images.length > 1 ? "Front and back of one business card." : "A business card." },
            ],
          },
        ],
      });
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) throw new AiError("Claude API key is missing or invalid.");
      if (error instanceof Anthropic.RateLimitError) throw new AiError("Claude is rate limiting requests.", true);
      if (error instanceof Anthropic.APIConnectionError) throw new AiError("Could not reach the Claude API.", true);
      if (error instanceof Anthropic.APIError) throw new AiError(`Claude API error ${error.status}: ${error.message}`);
      throw error;
    }
    if (response.stop_reason === "refusal") throw new AiError("Claude declined to read this image.");
    if (!response.parsed_output) throw new AiError("Couldn't read the card. Try a sharper photo.", true);
    return response.parsed_output;
  }
}

const { $schema: _ignored, ...cardJsonSchema } = z.toJSONSchema(cardExtractionSchema);

/** Vision models behind an OpenAI-compatible API (OpenAI, OpenRouter, Ollama with llava or qwen-vl). */
export class OpenAiCompatibleCardReader implements CardReader {
  readonly name = "openai_compatible";

  constructor(private readonly config: { baseUrl: string; apiKey?: string; model: string; fetch?: typeof fetch }) {}

  async read(images: CardImage[]): Promise<CardExtraction> {
    const doFetch = this.config.fetch ?? fetch;
    const res = await doFetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: "system", content: CARD_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              ...images.map((img) => ({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${toBase64(img.data)}` } })),
              { type: "text", text: images.length > 1 ? "Front and back of one business card." : "A business card." },
            ],
          },
        ],
        response_format: { type: "json_schema", json_schema: { name: "card", strict: true, schema: cardJsonSchema } },
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
      throw new AiError("The model returned invalid JSON. It may not support images.", true);
    }
    const parsed = cardExtractionSchema.safeParse(json);
    if (!parsed.success) throw new AiError("The model's answer didn't match the card format.", true);
    return parsed.data;
  }
}
