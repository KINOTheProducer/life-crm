"use server";

import { assertPublicHost, createImmichClient, ImmichError, normalizeBaseUrl } from "@life-crm/immich";
import { eq, schema } from "@life-crm/db";
import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";
import { encryptSecret } from "@/lib/secrets";
import { tenantQuery } from "@/lib/session";

export interface ImmichState {
  error?: string;
  ok?: number;
}

const { immichConnections } = schema;

/** Test the URL and key against Immich, then save them. */
export async function connectImmich(_prev: ImmichState, form: FormData): Promise<ImmichState> {
  const apiKey = String(form.get("apiKey") ?? "").trim();
  if (!apiKey || apiKey.length > 500) return { error: "Paste an API key from Immich" };
  let baseUrl: string;
  try {
    baseUrl = normalizeBaseUrl(String(form.get("baseUrl") ?? ""));
  } catch {
    return { error: "That doesn't look like a URL" };
  }

  try {
    if (env.DEPLOY_MODE === "cloud") await assertPublicHost(baseUrl);
    const { accountName, missing } = await createImmichClient({ baseUrl, apiKey }).checkKey();
    if (missing.length) return { error: `The API key is missing ${missing.join(", ")}. Edit the key in Immich and tick ${missing.length === 1 ? "it" : "them"}.` };
    await tenantQuery(async (tx, user) => {
      const values = { baseUrl, apiKeyEnc: encryptSecret(apiKey), accountName };
      await tx
        .insert(immichConnections)
        .values({ tenantId: user.tenantId, userId: user.id, ...values })
        .onConflictDoUpdate({ target: immichConnections.userId, set: values });
    });
  } catch (err) {
    return { error: err instanceof ImmichError || err instanceof Error ? err.message : "Couldn't connect" };
  }
  revalidatePath("/settings");
  return { ok: Date.now() };
}

export async function disconnectImmich() {
  await tenantQuery((tx, user) => tx.delete(immichConnections).where(eq(immichConnections.userId, user.id)));
  revalidatePath("/settings");
}
