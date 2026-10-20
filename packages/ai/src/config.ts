import { AnthropicExtractor, DEFAULT_CLAUDE_MODEL } from "./anthropic";
import { AnthropicCardReader, OpenAiCompatibleCardReader, type CardReader } from "./card";
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
  return extractorFor(aiConfigFromEnv(env));
}

export interface AiConfig {
  provider: "anthropic" | "openai_compatible";
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export function aiConfigFromEnv(env: Env = process.env): AiConfig {
  const provider = env.AI_PROVIDER ?? "anthropic";
  if (provider === "anthropic") return { provider, apiKey: env.ANTHROPIC_API_KEY, model: env.AI_MODEL || DEFAULT_CLAUDE_MODEL };
  if (provider === "openai_compatible") return { provider, apiKey: env.AI_API_KEY, baseUrl: env.AI_BASE_URL, model: env.AI_MODEL };
  throw new AiError(`Unknown AI_PROVIDER "${provider}".`);
}

export function cardReaderFor(config: AiConfig): CardReader {
  if (config.provider === "anthropic") return new AnthropicCardReader({ apiKey: config.apiKey, baseURL: config.baseUrl }, config.model || DEFAULT_CLAUDE_MODEL);
  if (!config.baseUrl || !config.model) throw new AiError("A base URL and model are needed for an OpenAI-compatible provider.");
  return new OpenAiCompatibleCardReader({ baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model });
}

/** Build an extractor from explicit settings (a user's own key or local model). */
export function extractorFor(config: AiConfig): Extractor {
  if (config.provider === "anthropic") return new AnthropicExtractor({ apiKey: config.apiKey, baseURL: config.baseUrl }, config.model || DEFAULT_CLAUDE_MODEL);
  if (!config.baseUrl || !config.model) throw new AiError("A base URL and model are needed for an OpenAI-compatible provider.");
  return new OpenAiCompatibleExtractor({ baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model });
}

/**
 * Speech to text always goes through an OpenAI-compatible /audio/transcriptions endpoint:
 * the bundled faster-whisper container when self-hosting, or OpenAI/Groq when configured.
 */
export function transcriberFromEnv(env: Env = process.env): Transcriber {
  return new OpenAiCompatibleTranscriber(sttConfigFromEnv(env));
}

export function sttConfigFromEnv(env: Env = process.env) {
  return {
    baseUrl: env.STT_BASE_URL ?? "http://localhost:8000/v1",
    apiKey: env.STT_API_KEY,
    model: env.STT_MODEL ?? "Systran/faster-whisper-small",
  };
}
