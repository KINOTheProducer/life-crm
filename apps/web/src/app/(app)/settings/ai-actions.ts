"use server";

import { extractorFor, type AiConfig } from "@life-crm/ai";
import { aiProviders, sttProviders } from "@life-crm/db/schema";
import { assertPublicHost } from "@life-crm/immich";
import { schema } from "@life-crm/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { aiConfigFor, aiSettingsFor } from "@/lib/ai";
import { env } from "@/lib/env";
import { encryptSecret } from "@/lib/secrets";
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
      baseUrl: d.provider === "openai_compatible" ? d.baseUrl : null,
      // A blank key field keeps the saved one; switching provider drops it.
      apiKeyEnc: d.apiKey ? encryptSecret(d.apiKey) : existing?.provider === d.provider ? existing.apiKeyEnc : null,
      sttProvider: d.sttProvider,
      sttBaseUrl: d.sttProvider === "openai_compatible" ? d.sttBaseUrl : null,
      sttModel: d.sttProvider === "openai_compatible" ? d.sttModel : null,
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
