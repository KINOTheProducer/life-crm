import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { buildDocumentMessage, DOCUMENT_SYSTEM_PROMPT, documentSchema, sanitizeDocument, type DocumentExtraction, type DocumentInput } from "./document";
import { extractionSchema, sanitizeExtraction, type Extraction, type ExtractionInput } from "./extraction";
import { parsePartialJson, type PartialExtraction } from "./progress";
import { buildExtractionMessage, EXTRACTION_SYSTEM_PROMPT } from "./prompt";
import { AiError, type Extractor } from "./types";

export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";

export class AnthropicExtractor implements Extractor {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(
    options: { apiKey?: string; baseURL?: string; fetch?: typeof fetch } = {},
    private readonly model = DEFAULT_CLAUDE_MODEL,
  ) {
    this.client = new Anthropic({ apiKey: options.apiKey, baseURL: options.baseURL, fetch: options.fetch });
  }

  async extract(input: ExtractionInput, onPartial?: (partial: PartialExtraction) => void): Promise<Extraction> {
    const output = await this.run(extractionSchema, EXTRACTION_SYSTEM_PROMPT, buildExtractionMessage(input), onPartial);
    return sanitizeExtraction(output, input);
  }

  async readDocument(input: DocumentInput): Promise<DocumentExtraction> {
    const output = await this.run(documentSchema, DOCUMENT_SYSTEM_PROMPT, buildDocumentMessage(input));
    return sanitizeDocument(output, input);
  }

  private async run<S extends z.ZodType>(schema: S, system: string, message: string, onPartial?: (partial: PartialExtraction) => void): Promise<z.infer<S>> {
    const params = {
      model: this.model,
      max_tokens: 16000,
      // Retries on another model if this one declines for policy reasons.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default" as const,
      output_config: { effort: "medium" as const, format: betaZodOutputFormat(schema) },
      system: [{ type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } }],
      messages: [{ role: "user" as const, content: message }],
    };
    let response;
    try {
      if (onPartial) {
        const stream = this.client.beta.messages.stream(params);
        stream.on("text", (_delta, snapshot) => {
          const partial = parsePartialJson(snapshot);
          if (partial) onPartial(partial as PartialExtraction);
        });
        response = await stream.finalMessage();
      } else {
        response = await this.client.beta.messages.parse(params);
      }
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) throw new AiError("Claude API key is missing or invalid.");
      if (error instanceof Anthropic.RateLimitError) throw new AiError("Claude is rate limiting requests.", true);
      if (error instanceof Anthropic.APIConnectionError) throw new AiError("Could not reach the Claude API.", true);
      if (error instanceof Anthropic.APIError) throw new AiError(`Claude API error ${error.status}: ${error.message}`);
      throw error;
    }

    if (response.stop_reason === "refusal") throw new AiError("Claude declined to process this note.");
    if (response.stop_reason === "max_tokens") throw new AiError("The note was too long to process in one go.");
    if (!response.parsed_output) throw new AiError("Claude returned output that didn't match the expected format.", true);
    return response.parsed_output as z.infer<S>;
  }
}
