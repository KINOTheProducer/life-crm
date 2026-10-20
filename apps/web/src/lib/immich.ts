import "server-only";
import { createImmichClient, type ImmichClient } from "@life-crm/immich";
import { eq, schema, type Tx } from "@life-crm/db";
import { decryptSecret } from "./secrets";

const { immichConnections } = schema;

export async function immichConnection(tx: Tx, userId: string) {
  const [row] = await tx.select().from(immichConnections).where(eq(immichConnections.userId, userId));
  return row ?? null;
}

/** The user's Immich client, or null if they haven't connected one (or the key can't be read). */
export async function immichFor(tx: Tx, userId: string): Promise<ImmichClient | null> {
  const row = await immichConnection(tx, userId);
  if (!row) return null;
  try {
    return createImmichClient({ baseUrl: row.baseUrl, apiKey: decryptSecret(row.apiKeyEnc) });
  } catch {
    return null;
  }
}
