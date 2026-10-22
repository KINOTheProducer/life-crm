import { z } from "zod";
import { buildDocumentMessage, DOCUMENT_SYSTEM_PROMPT, documentSchema, sanitizeDocument, type DocumentExtraction, type DocumentInput } from "./document";
import { buildResortMessage, RESORT_SYSTEM_PROMPT, resortSchema, sanitizeResort, type Resort, type ResortInput } from "./resort";
import { extractionSchema, sanitizeExtraction, type Extraction, type ExtractionInput } from "./extraction";
import { parsePartialJson, type PartialExtraction } from "./progress";
import { buildExtractionMessage, EXTRACTION_SYSTEM_PROMPT } from "./prompt";
import { AiError, type Extractor, type Transcriber } from "./types";

/** Any server speaking the OpenAI REST shape: OpenAI, OpenRouter, Groq, Ollama, LM Studio, vLLM, speaches. */
export interface OpenAiCompatibleConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
  fetch?: typeof fetch;
}

function headers(apiKey?: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

async function readError(res: Response): Promise<AiError> {
  const text = await res.text().catch(() => "");
  return new AiError(`${res.status} from ${res.url}: ${text.slice(0, 300)}`, res.status === 429 || res.status >= 500);
}

// JSON Schema for response_format; some servers reject the $schema key.
function jsonSchemaFor(schema: z.ZodType) {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema);
  return rest;
}
const extractionJsonSchema = jsonSchemaFor(extractionSchema);
const documentJsonSchema = jsonSchemaFor(documentSchema);
const resortJsonSchema = jsonSchemaFor(resortSchema);

/**
 * Read a streamed chat completion (server-sent events), calling `onText` with everything so
 * far. Servers that ignore `stream` and answer with plain JSON are read as-is.
 */
export async function readChatStream(res: Response, onText: (snapshot: string) => void): Promise<string> {
  if (!res.headers.get("content-type")?.includes("text/event-stream") || !res.body) {
    const body = chatResponse.parse(await res.json());
    return body.choices[0]?.message.content ?? "";
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const data = line.startsWith("data:") ? line.slice(5).trim() : "";
      if (!data || data === "[DONE]") continue;
      let delta: string | null | undefined;
      try {
        delta = (JSON.parse(data) as { choices?: { delta?: { content?: string | null } }[] }).choices?.[0]?.delta?.content;
      } catch {
        continue;
      }
      if (delta) {
        text += delta;
        onText(text);
      }
    }
  }
  return text;
}

const chatResponse = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }), finish_reason: z.string().nullish() })),
});

export class OpenAiCompatibleExtractor implements Extractor {
  readonly name = "openai_compatible";
  private readonly fetch: typeof fetch;

  constructor(private readonly config: OpenAiCompatibleConfig) {
    this.fetch = config.fetch ?? fetch;
  }

  async extract(input: ExtractionInput, onPartial?: (partial: PartialExtraction) => void): Promise<Extraction> {
    const output = await this.run(extractionSchema, { name: "extraction", schema: extractionJsonSchema }, EXTRACTION_SYSTEM_PROMPT, buildExtractionMessage(input), onPartial);
    return sanitizeExtraction(output, input);
  }

  async readDocument(input: DocumentInput): Promise<DocumentExtraction> {
    const output = await this.run(documentSchema, { name: "document", schema: documentJsonSchema }, DOCUMENT_SYSTEM_PROMPT, buildDocumentMessage(input));
    return sanitizeDocument(output, input);
  }

  async resort(input: ResortInput): Promise<Resort> {
    const output = await this.run(resortSchema, { name: "resort", schema: resortJsonSchema }, RESORT_SYSTEM_PROMPT, buildResortMessage(input));
    return sanitizeResort(output, input);
  }

  private async run<S extends z.ZodType>(
    schema: S,
    format: { name: string; schema: Record<string, unknown> },
    system: string,
    message: string,
    onPartial?: (partial: PartialExtraction) => void,
  ): Promise<z.infer<S>> {
    const res = await this.fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers(this.config.apiKey) },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: message },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: format.name, strict: true, schema: format.schema },
        },
        ...(onPartial ? { stream: true } : {}),
      }),
    });
    if (!res.ok) throw await readError(res);

    const content = onPartial
      ? await readChatStream(res, (snapshot) => {
          const partial = parsePartialJson(snapshot);
          if (partial) onPartial(partial as PartialExtraction);
        })
      : chatResponse.parse(await res.json()).choices[0]?.message.content;
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
}

const extensionFor: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

export class OpenAiCompatibleTranscriber implements Transcriber {
  readonly name = "openai_compatible";
  private readonly fetch: typeof fetch;

  constructor(private readonly config: OpenAiCompatibleConfig) {
    this.fetch = config.fetch ?? fetch;
  }

  async transcribe(audio: Uint8Array, mimeType: string): Promise<string> {
    const baseType = mimeType.split(";")[0]!.trim();
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(audio)], { type: baseType }), `note.${extensionFor[baseType] ?? "webm"}`);
    form.set("model", this.config.model);
    form.set("response_format", "json");

    const res = await this.fetch(`${this.config.baseUrl.replace(/\/$/, "")}/audio/transcriptions`, {
      method: "POST",
      headers: headers(this.config.apiKey),
      body: form,
    });
    if (!res.ok) throw await readError(res);
    const body = z.object({ text: z.string() }).parse(await res.json());
    return body.text.trim();
  }
}
