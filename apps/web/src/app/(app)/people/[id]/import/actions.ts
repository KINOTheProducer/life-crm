"use server";

import { todayIn } from "@life-crm/core";
import { and, eq, isNull, schema } from "@life-crm/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { extractorForUser } from "@/lib/ai";
import { fullName } from "@/lib/data/contacts";
import { toIsoDate } from "@/lib/data/dates";
import { commitImport, existingProfile, ImportError, knownPeople, MAX_IMPORT_CHARS, readImport, type ImportPreview } from "@/lib/data/import";
import { partnershipFor } from "@/lib/data/partners";
import { applyResort, ResortError, savedAbout, suggestResort } from "@/lib/data/resort";
import { importProblem, importSchema, type ImportInput } from "@/lib/import-items";
import { resortAcceptSchema, type ResortSuggestion } from "@/lib/resort-items";
import { requireUser, tenantQuery } from "@/lib/session";

const uuid = z.uuid();

/** Read a file's text into reviewable items. Saves nothing. */
export async function previewImport(contactId: string, text: string): Promise<ImportPreview | { error: string }> {
  if (!uuid.safeParse(contactId).success) return { error: "Person not found" };
  if (typeof text !== "string" || !text.trim()) return { error: "That file is empty" };
  if (text.length > MAX_IMPORT_CHARS) return { error: "That file is too long. Split it up and import the parts." };
  const user = await requireUser();
  const { contact, others, saved, partnerLabel, extractor } = await tenantQuery(async (tx) => {
    const [row] = await tx
      .select({ id: schema.contacts.id, firstName: schema.contacts.firstName, lastName: schema.contacts.lastName, nickname: schema.contacts.nickname })
      .from(schema.contacts)
      .where(and(eq(schema.contacts.id, contactId), isNull(schema.contacts.deletedAt)));
    const partnership = row ? await partnershipFor(tx, contactId) : null;
    return {
      contact: row,
      others: row ? await knownPeople(tx, contactId) : [],
      saved: row ? await savedAbout(tx, contactId) : [],
      partnerLabel: partnership?.status === "current" ? partnership.label : null,
      extractor: await extractorForUser(tx, user.id).catch(() => null),
    };
  });
  if (!contact) return { error: "Person not found" };
  return readImport(
    text,
    { id: contact.id, name: fullName(contact), nickname: contact.nickname, partnerLabel },
    others,
    saved,
    toIsoDate(todayIn(user.timeZone)),
    user.timeZone,
    extractor,
  );
}

/** Rolls the transaction back and carries a message that's safe to show. */
class Refused extends Error {}

/** Save the reviewed file, and apply the re-sort suggestions accepted alongside it, in one go. */
export async function saveImport(contactId: string, raw: ImportInput, rawResort: ResortSuggestion[] = []): Promise<{ error: string }> {
  if (!uuid.safeParse(contactId).success) return { error: "Person not found" };
  const parsed = importSchema.safeParse(raw);
  const resort = resortAcceptSchema.safeParse(rawResort);
  if (!parsed.success || !resort.success) return { error: "Something in the import doesn't look right. Reload and try again." };
  const user = await requireUser();

  const error = await tenantQuery(async (tx) => {
    if (!(await existingProfile(tx, contactId))) return "Person not found";
    try {
      await applyResort(tx, user.tenantId, contactId, resort.data as ResortSuggestion[]);
      // Read again so duplicate checks see the profile after the re-sort.
      const existing = (await existingProfile(tx, contactId))!;
      const problem = importProblem(parsed.data, toIsoDate(todayIn(user.timeZone)), !!existing.partnerLabel);
      if (problem) throw new Refused(problem);
      await commitImport(tx, user.tenantId, contactId, parsed.data, existing);
    } catch (e) {
      if (e instanceof ImportError || e instanceof ResortError || e instanceof Refused) throw new Refused(e.message);
      throw e;
    }
    return null;
  }).catch((e) => {
    if (e instanceof Refused) return e.message;
    throw e;
  });
  if (error) return { error };
  revalidatePath(`/people/${contactId}`);
  redirect(`/people/${contactId}`);
}

/** Look again at everything saved about someone and suggest better homes for it. Saves nothing. */
export async function previewResort(contactId: string): Promise<{ suggestions: ResortSuggestion[] } | { error: string }> {
  if (!uuid.safeParse(contactId).success) return { error: "Person not found" };
  const user = await requireUser();
  const data = await tenantQuery(async (tx) => {
    const [row] = await tx
      .select({ id: schema.contacts.id, firstName: schema.contacts.firstName, lastName: schema.contacts.lastName, nickname: schema.contacts.nickname })
      .from(schema.contacts)
      .where(and(eq(schema.contacts.id, contactId), isNull(schema.contacts.deletedAt)));
    if (!row) return null;
    const partnership = await partnershipFor(tx, contactId);
    return {
      subject: { id: row.id, name: fullName(row), nickname: row.nickname, partnerLabel: partnership?.status === "current" ? partnership.label : null },
      others: await knownPeople(tx, contactId),
      saved: await savedAbout(tx, contactId),
      extractor: await extractorForUser(tx, user.id).catch(() => null),
    };
  });
  if (!data) return { error: "Person not found" };
  if (!data.extractor) return { error: "Set up AI in Settings to re-sort." };
  if (data.saved.length === 0) return { suggestions: [] };
  try {
    return { suggestions: await suggestResort(data.extractor, data.saved, data.subject, data.others, toIsoDate(todayIn(user.timeZone))) };
  } catch (e) {
    console.warn("Re-sort failed", e);
    return { error: "Couldn't re-sort right now. Try again in a bit." };
  }
}

export async function saveResort(contactId: string, raw: ResortSuggestion[]): Promise<{ error: string } | { ok: true }> {
  if (!uuid.safeParse(contactId).success) return { error: "Person not found" };
  const parsed = resortAcceptSchema.safeParse(raw);
  if (!parsed.success) return { error: "Something doesn't look right. Reload and try again." };
  const user = await requireUser();
  const error = await tenantQuery(async (tx) => {
    try {
      await applyResort(tx, user.tenantId, contactId, parsed.data as ResortSuggestion[]);
    } catch (e) {
      if (e instanceof ResortError) throw new Refused(e.message);
      throw e;
    }
    return null;
  }).catch((e) => {
    if (e instanceof Refused) return e.message;
    throw e;
  });
  if (error) return { error };
  revalidatePath(`/people/${contactId}`);
  revalidatePath(`/people/${contactId}/partner`);
  return { ok: true };
}
