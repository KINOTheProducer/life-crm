import { AnthropicExtractor, DEFAULT_CLAUDE_MODEL } from "./anthropic";
import { OpenAiCompatibleExtractor, OpenAiCompatibleTranscriber } from "./openai-compatible";
import { AiError, type Extractor, type Transcriber } from "./types";

type Env = Record<string, string | undefined>;

/**
 * Pick the extraction provider from environment variables.
 *
 * AI_PROVIDER=anthropic (default): ANTHROPIC_API_KEY, optional AI_MODEL.
 * AI_PROVIDER=openai_compatible: AI_BASE_URL, AI_MODEL, optional AI_API_KEY. Covers local
 * models (Ollama, LM Studio, vLLM) and bring-your-own providers (OpenAI, OpenRouter, Groq).
 */
export function extractorFromEnv(env: Env = process.env): Extractor {
  const provider = env.AI_PROVIDER ?? "anthropic";
  if (provider === "anthropic") {
    return new AnthropicExtractor({ apiKey: env.ANTHROPIC_API_KEY }, env.AI_MODEL || DEFAULT_CLAUDE_MODEL);
  }
  if (provider === "openai_compatible") {
    if (!env.AI_BASE_URL || !env.AI_MODEL) throw new AiError("AI_BASE_URL and AI_MODEL must be set.");
    return new OpenAiCompatibleExtractor({ baseUrl: env.AI_BASE_URL, apiKey: env.AI_API_KEY, model: env.AI_MODEL });
  }
  throw new AiError(`Unknown AI_PROVIDER "${provider}".`);
}

/**
 * Speech to text always goes through an OpenAI-compatible /audio/transcriptions endpoint:
 * the bundled faster-whisper container when self-hosting, or OpenAI/Groq when configured.
 */
export function transcriberFromEnv(env: Env = process.env): Transcriber {
  return new OpenAiCompatibleTranscriber({
    baseUrl: env.STT_BASE_URL ?? "http://localhost:8000/v1",
    apiKey: env.STT_API_KEY,
    model: env.STT_MODEL ?? "Systran/faster-whisper-small",
  });
}
