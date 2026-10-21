"use server";

import { AiError } from "@life-crm/ai";
import { and, eq, isNull, schema } from "@life-crm/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { refreshSummary } from "@/lib/data/assistant";
import { tenantQuery } from "@/lib/session";

const { contacts } = schema;

/** Write or rewrite someone's summary card. Returns an error message instead of throwing. */
export async function refreshPersonSummary(contactId: string): Promise<{ error?: string }> {
  if (!z.uuid().safeParse(contactId).success) return { error: "Person not found" };
  try {
    await tenantQuery(async (tx, user) => {
      const [row] = await tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)));
      if (!row) throw new AiError("Person not found");
      await refreshSummary(tx, user, contactId);
    });
  } catch (error) {
    if (error instanceof AiError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/people/${contactId}`);
  revalidatePath(`/people/${contactId}/brief`);
  return {};
}
