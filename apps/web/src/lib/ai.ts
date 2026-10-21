import "server-only";
import {
  AiError,
  aiConfigFromEnv,
  assistantFor,
  cardReaderFor,
  extractorFor,
  OpenAiCompatibleTranscriber,
  sttConfigFromEnv,
  type AiConfig,
  type Assistant,
  type CardReader,
  type Extractor,
  type Transcriber,
} from "@life-crm/ai";
import { eq, schema, type Tx } from "@life-crm/db";
import { decryptSecret } from "./secrets";

const { aiSettings } = schema;

export async function aiSettingsFor(tx: Tx, userId: string) {
  const [row] = await tx.select().from(aiSettings).where(eq(aiSettings.userId, userId));
  return row ?? null;
}

function serverAi(): AiConfig | null {
  try {
    return aiConfigFromEnv();
  } catch {
    return null;
  }
}

/** The AI setup a user's requests go through: their own choice, or the server's. Null when off. */
export async function aiConfigFor(tx: Tx, userId: string): Promise<AiConfig | null> {
  const s = await aiSettingsFor(tx, userId);
  if (!s || s.provider === "server") return serverAi();
  if (s.provider === "off") return null;
  return {
    provider: s.provider,
    apiKey: s.apiKeyEnc ? decryptSecret(s.apiKeyEnc) : undefined,
    baseUrl: s.baseUrl ?? undefined,
    model: s.model ?? undefined,
  };
}

const off = () => new AiError("AI features are turned off in Settings.");

export async function extractorForUser(tx: Tx, userId: string): Promise<Extractor> {
  const config = await aiConfigFor(tx, userId);
  if (!config) throw off();
  return extractorFor(config);
}

export async function cardReaderForUser(tx: Tx, userId: string): Promise<CardReader> {
  const config = await aiConfigFor(tx, userId);
  if (!config) throw off();
  return cardReaderFor(config);
}

export async function assistantForUser(tx: Tx, userId: string): Promise<Assistant> {
  const config = await aiConfigFor(tx, userId);
  if (!config) throw off();
  return assistantFor(config);
}

/** Whether the AI features can run for this user at all. */
export async function aiEnabledFor(tx: Tx, userId: string) {
  return (await aiConfigFor(tx, userId)) !== null;
}

export async function transcriberForUser(tx: Tx, userId: string): Promise<Transcriber> {
  const s = await aiSettingsFor(tx, userId);
  if (s?.sttProvider === "off") throw new AiError("Speech to text is turned off in Settings.");
  if (s?.sttProvider === "openai_compatible") {
    if (!s.sttBaseUrl || !s.sttModel) throw new AiError("Speech to text needs a base URL and model in Settings.");
    return new OpenAiCompatibleTranscriber({ baseUrl: s.sttBaseUrl, model: s.sttModel, apiKey: s.sttApiKeyEnc ? decryptSecret(s.sttApiKeyEnc) : undefined });
  }
  return new OpenAiCompatibleTranscriber(sttConfigFromEnv());
}

/** Plain-language summary of where things go, for Settings. */
export function describeServerAi() {
  const ai = serverAi();
  const stt = sttConfigFromEnv();
  return {
    ai: ai ? (ai.provider === "anthropic" ? `Claude (${ai.model})${ai.apiKey ? "" : ", no API key set"}` : `${ai.model} at ${ai.baseUrl}`) : "not set up",
    stt: `${stt.model} at ${stt.baseUrl}`,
  };
}
