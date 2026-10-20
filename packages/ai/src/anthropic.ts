import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { extractionSchema, sanitizeExtraction, type Extraction, type ExtractionInput } from "./extraction";
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

  async extract(input: ExtractionInput): Promise<Extraction> {
    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 16000,
        // Retries on another model if this one declines for policy reasons.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: betaZodOutputFormat(extractionSchema) },
        system: [{ type: "text", text: EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: buildExtractionMessage(input) }],
      });
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
    return sanitizeExtraction(response.parsed_output, input);
  }
}
