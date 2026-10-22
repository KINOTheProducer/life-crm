"use server";

import { AiError, extractorFor, listAnthropicModels, listOpenAiCompatibleModels, speechModelsFirst, type AiConfig, type ModelOption } from "@life-crm/ai";
import { aiProviders, sttProviders } from "@life-crm/db/schema";
import { assertPublicHost } from "@life-crm/immich";
import { schema } from "@life-crm/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { aiConfigFor, aiSettingsFor } from "@/lib/ai";
import { env } from "@/lib/env";
import { decryptSecret, encryptSecret } from "@/lib/secrets";
import { tenantQuery } from "@/lib/session";

export interface AiState {
  error?: string;
  ok?: number;
  message?: string;
}

const { aiSettings } = schema;

const url = z
  .string()
  .trim()
  .max(500)
  .transform((v) => v.replace(/\/+$/, "") || null)
  .refine((v) => !v || /^https?:\/\/[^\s]+$/i.test(v), "Use an http or https address");

const settingsSchema = z.object({
  provider: z.enum(aiProviders),
  model: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null),
  chatModel: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null),
  baseUrl: url,
  apiKey: z.string().trim().max(500),
  sttProvider: z.enum(sttProviders),
  sttBaseUrl: url,
  sttModel: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null),
  sttApiKey: z.string().trim().max(500),
});

export async function saveAiSettings(_prev: AiState, form: FormData): Promise<AiState> {
  const parsed = settingsSchema.safeParse({
    provider: form.get("provider"),
    model: form.get("model") ?? "",
    chatModel: form.get("chatModel") ?? "",
    baseUrl: form.get("baseUrl") ?? "",
    apiKey: form.get("apiKey") ?? "",
    sttProvider: form.get("sttProvider"),
    sttBaseUrl: form.get("sttBaseUrl") ?? "",
    sttModel: form.get("sttModel") ?? "",
    sttApiKey: form.get("sttApiKey") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  if (d.provider === "openai_compatible" && (!d.baseUrl || !d.model)) return { error: "Add the base URL and model for your provider" };
  if (d.sttProvider === "openai_compatible" && (!d.sttBaseUrl || !d.sttModel)) return { error: "Add the base URL and model for speech to text" };
  if (d.sttProvider === "same_as_ai" && d.provider !== "openai_compatible") return { error: "Speech to text can only share the AI endpoint when that's an OpenAI-style provider" };
  if (d.sttProvider === "same_as_ai" && !d.sttModel) return { error: "Pick a speech to text model" };
  // On the hosted service, keep requests off our own network.
  if (env.DEPLOY_MODE === "cloud") {
    try {
      for (const u of [d.provider === "openai_compatible" ? d.baseUrl : null, d.sttProvider === "openai_compatible" ? d.sttBaseUrl : null]) if (u) await assertPublicHost(u);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "That address isn't allowed" };
    }
  }

  await tenantQuery(async (tx, user) => {
    const existing = await aiSettingsFor(tx, user.id);
    const values = {
      provider: d.provider,
      model: d.model,
      // "Same as above" is stored as null so it follows the main model.
      chatModel: d.chatModel && d.chatModel !== d.model ? d.chatModel : null,
      baseUrl: d.provider === "openai_compatible" ? d.baseUrl : null,
      // A blank key field keeps the saved one; switching provider drops it.
      apiKeyEnc: d.apiKey ? encryptSecret(d.apiKey) : existing?.provider === d.provider ? existing.apiKeyEnc : null,
      sttProvider: d.sttProvider,
      sttBaseUrl: d.sttProvider === "openai_compatible" ? d.sttBaseUrl : null,
      sttModel: d.sttProvider === "openai_compatible" || d.sttProvider === "same_as_ai" ? d.sttModel : null,
      sttApiKeyEnc: d.sttApiKey ? encryptSecret(d.sttApiKey) : existing?.sttProvider === d.sttProvider ? existing.sttApiKeyEnc : null,
    };
    await tx
      .insert(aiSettings)
      .values({ tenantId: user.tenantId, userId: user.id, ...values })
      .onConflictDoUpdate({ target: aiSettings.userId, set: values });
  });
  revalidatePath("/settings");
  return { ok: Date.now(), message: "Saved" };
}

/** Run a one-line voice note through the saved setup to check it works. */
export async function testAi(): Promise<AiState> {
  let config: AiConfig | null;
  try {
    config = await tenantQuery((tx, user) => aiConfigFor(tx, user.id));
  } catch {
    return { error: "Couldn't read the saved key. Save it again." };
  }
  if (!config) return { error: "AI is turned off" };
  try {
    const out = await extractorFor(config).extract({
      transcript: "Had coffee with Sam Rivera yesterday. She just started a new job at Shopify.",
      today: new Date().toISOString().slice(0, 10),
      timeZone: "America/Toronto",
      knownPeople: [],
      contextPerson: null,
    });
    const names = out.people.map((p) => [p.firstName, p.lastName].filter(Boolean).join(" ")).join(", ");
    return { ok: Date.now(), message: names ? `Works. It found ${names}.` : "It answered, but didn't find the person in the test note." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That didn't work" };
  }
}

export interface ModelsState {
  models?: ModelOption[];
  /** From the same list: the ones that look like speech to text, for the shared endpoint. */
  speech?: ModelOption[];
  error?: string;
}

const pullSchema = z.object({
  kind: z.enum(["ai", "stt"]),
  provider: z.enum(["anthropic", "openai_compatible"]),
  baseUrl: url,
  apiKey: z.string().trim().max(500),
});

/**
 * List the models a provider offers, using what's in the form right now (saved or not).
 * A blank key falls back to the saved one for the same provider.
 */
export async function pullModels(input: { kind: "ai" | "stt"; provider: string; baseUrl: string; apiKey: string }): Promise<ModelsState> {
  const parsed = pullSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the address and key" };
  const d = parsed.data;
  if (d.provider === "openai_compatible" && !d.baseUrl) return { error: "Add the base URL first" };
  if (env.DEPLOY_MODE === "cloud" && d.baseUrl) {
    try {
      await assertPublicHost(d.baseUrl);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "That address isn't allowed" };
    }
  }

  let apiKey = d.apiKey || undefined;
  if (!apiKey) {
    try {
      apiKey = await tenantQuery(async (tx, user) => {
        const s = await aiSettingsFor(tx, user.id);
        if (!s) return undefined;
        if (d.kind === "stt") return s.sttProvider === "openai_compatible" && s.sttApiKeyEnc ? decryptSecret(s.sttApiKeyEnc) : undefined;
        return s.provider === d.provider && s.apiKeyEnc ? decryptSecret(s.apiKeyEnc) : undefined;
      });
    } catch {
      return { error: "Couldn't read the saved key. Paste it again." };
    }
  }

  try {
    const models =
      d.provider === "anthropic"
        ? await listAnthropicModels({ apiKey })
        : await listOpenAiCompatibleModels({ baseUrl: d.baseUrl!, apiKey });
    if (models.length === 0) return { error: "That server didn't list any models." };
    if (d.kind === "stt") return { models: speechModelsFirst(models) };
    // One endpoint can serve everything; keep whisper and TTS out of the chat lists when it does.
    const speech = speechModelsFirst(models);
    const isSpeech = new Set(speech.length < models.length ? speech.map((m) => m.id) : []);
    const text = models.filter((m) => !isSpeech.has(m.id) && !/^tts|[-_]tts/i.test(m.id));
    return { models: text.length ? text : models, speech };
  } catch (err) {
    if (err instanceof AiError) return { error: err.message };
    throw err;
  }
}
