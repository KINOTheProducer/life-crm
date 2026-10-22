import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AiError } from "./types";

export interface ModelOption {
  id: string;
  /** Friendlier name when the provider gives one ("Claude Opus 5.5"). */
  label: string;
}

/** Models on the Claude API that this key can use, newest first as Anthropic lists them. */
export async function listAnthropicModels(options: { apiKey?: string; baseURL?: string; fetch?: typeof fetch }): Promise<ModelOption[]> {
  const client = new Anthropic({ apiKey: options.apiKey, baseURL: options.baseURL, fetch: options.fetch });
  const out: ModelOption[] = [];
  try {
    for await (const m of client.models.list({ limit: 100 })) out.push({ id: m.id, label: m.display_name || m.id });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new AiError("Claude API key is missing or invalid.");
    if (error instanceof Anthropic.APIConnectionError) throw new AiError("Could not reach the Claude API.", true);
    if (error instanceof Anthropic.APIError) throw new AiError(`Claude API error ${error.status}: ${error.message}`);
    throw error;
  }
  return out;
}

const modelList = z.object({ data: z.array(z.object({ id: z.string() }).passthrough()) });

/** GET /models on anything OpenAI-shaped: OpenAI, OpenRouter, Groq, Ollama, LM Studio, vLLM, speaches. */
export async function listOpenAiCompatibleModels(config: { baseUrl: string; apiKey?: string; fetch?: typeof fetch }): Promise<ModelOption[]> {
  const doFetch = config.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${config.baseUrl.replace(/\/$/, "")}/models`, {
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AiError(`Couldn't reach ${config.baseUrl}.`, true);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AiError(res.status === 401 || res.status === 403 ? "The server turned down the API key." : `${res.status} from ${config.baseUrl}/models: ${text.slice(0, 200)}`);
  }
  const parsed = modelList.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new AiError("That server didn't return a model list.");
  return [...new Set(parsed.data.data.map((m) => m.id))].sort((a, b) => a.localeCompare(b)).map((id) => ({ id, label: id }));
}

const speechModel = /whisper|transcri|speech|stt|parakeet|canary|voxtral/i;

/**
 * Speech-to-text servers often list chat and TTS models too. Keep the ones that look like
 * transcription models, unless that leaves nothing, in which case show everything.
 */
export function speechModelsFirst(models: ModelOption[]): ModelOption[] {
  const speech = models.filter((m) => speechModel.test(m.id) && !/tts/i.test(m.id));
  return speech.length ? speech : models;
}
