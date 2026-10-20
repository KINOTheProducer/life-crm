"use server";

import { todayIn } from "@life-crm/core";
import { and, eq, isNull, schema } from "@life-crm/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { extractorForUser } from "@/lib/ai";
import { fullName } from "@/lib/data/contacts";
import { toIsoDate } from "@/lib/data/dates";
import { commitImport, existingProfile, importProblem, MAX_IMPORT_CHARS, readImport, type ImportPreview } from "@/lib/data/import";
import { importSchema, type ImportItem } from "@/lib/import-items";
import { requireUser, tenantQuery } from "@/lib/session";

const uuid = z.uuid();

/** Read a file's text into reviewable items. Saves nothing. */
export async function previewImport(contactId: string, text: string): Promise<ImportPreview | { error: string }> {
  if (!uuid.safeParse(contactId).success) return { error: "Person not found" };
  if (typeof text !== "string" || !text.trim()) return { error: "That file is empty" };
  if (text.length > MAX_IMPORT_CHARS) return { error: "That file is too long. Split it up and import the parts." };
  const user = await requireUser();
  const { contact, extractor } = await tenantQuery(async (tx) => {
    const [row] = await tx
      .select({ id: schema.contacts.id, firstName: schema.contacts.firstName, lastName: schema.contacts.lastName, nickname: schema.contacts.nickname })
      .from(schema.contacts)
      .where(and(eq(schema.contacts.id, contactId), isNull(schema.contacts.deletedAt)));
    return { contact: row, extractor: await extractorForUser(tx, user.id).catch(() => null) };
  });
  if (!contact) return { error: "Person not found" };
  return readImport(text, { id: contact.id, name: fullName(contact), nickname: contact.nickname }, toIsoDate(todayIn(user.timeZone)), user.timeZone, extractor);
}

export async function saveImport(contactId: string, raw: ImportItem[]): Promise<{ error: string }> {
  if (!uuid.safeParse(contactId).success) return { error: "Person not found" };
  const parsed = importSchema.safeParse(raw);
  if (!parsed.success) return { error: "Something in the import doesn't look right. Reload and try again." };
  const user = await requireUser();
  const problem = importProblem(parsed.data, toIsoDate(todayIn(user.timeZone)));
  if (problem) return { error: problem };

  const error = await tenantQuery(async (tx) => {
    const existing = await existingProfile(tx, contactId);
    if (!existing) return "Person not found";
    await commitImport(tx, user.tenantId, contactId, parsed.data, existing);
    return null;
  });
  if (error) return { error };
  revalidatePath(`/people/${contactId}`);
  redirect(`/people/${contactId}`);
}
