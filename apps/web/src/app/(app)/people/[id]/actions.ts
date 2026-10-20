"use server";

import { birthdayInText, factCategories, interactionTypes, todayIn } from "@life-crm/core";
import { and, eq, isNull, schema } from "@life-crm/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { birthdayOf, setBirthday } from "@/lib/data/contacts";
import { formatPartialDate, toIsoDate } from "@/lib/data/dates";
import { insertFact, insertInteraction, insertNote } from "@/lib/data/entries";
import { dateProblemText, partialDateFrom } from "@/lib/forms";
import { requireUser, tenantQuery } from "@/lib/session";

export interface FormState {
  error?: string;
  ok?: number;
  message?: string;
}

const { contacts, facts } = schema;
const uuid = z.uuid();

async function contactExists(contactId: string) {
  if (!uuid.safeParse(contactId).success) return false;
  return tenantQuery(async (tx) => {
    const [row] = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)));
    return !!row;
  });
}

export async function addNote(contactId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const body = z.string().trim().min(1, "Write something first").max(5000).safeParse(form.get("body"));
  if (!body.success) return { error: body.error.issues[0]?.message };
  if (!(await contactExists(contactId))) return { error: "Person not found" };

  // "Birthday: August 8, 1995" in a note fills in the birthday, but never quietly replaces a different one.
  const mentioned = birthdayInText(body.data);
  const message = await tenantQuery(async (tx, user) => {
    await insertNote(tx, user.tenantId, contactId, body.data);
    if (!mentioned) return undefined;
    const current = await birthdayOf(tx, contactId);
    if (!current) {
      await setBirthday(tx, user.tenantId, contactId, mentioned);
      return `Saved their birthday as ${formatPartialDate(mentioned)}`;
    }
    const same = current.month === mentioned.month && current.day === mentioned.day && (current.year ?? null) === (mentioned.year ?? null);
    return same
      ? undefined
      : `This note says ${formatPartialDate(mentioned)}, but their saved birthday is ${formatPartialDate(current)}. Change it under Details if it's wrong.`;
  });
  revalidatePath(`/people/${contactId}`);
  return { ok: Date.now(), message };
}

export async function updateBirthday(contactId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const birthday = form.get("remove") === "1" ? null : partialDateFrom(form, "birthday");
  if (typeof birthday === "string") return { error: dateProblemText("Birthday", birthday) };
  if (!(await contactExists(contactId))) return { error: "Person not found" };
  await tenantQuery((tx, user) => setBirthday(tx, user.tenantId, contactId, birthday));
  revalidatePath(`/people/${contactId}`);
  return { ok: Date.now() };
}

const interactionSchema = z.object({
  type: z.enum(interactionTypes),
  date: z.iso.date(),
  location: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null),
  summary: z.string().trim().min(1, "Add a sentence about it").max(2000),
});

export async function logInteraction(contactId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = interactionSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const user = await requireUser();
  if (parsed.data.date > toIsoDate(todayIn(user.timeZone))) return { error: "That date is in the future" };
  if (!(await contactExists(contactId))) return { error: "Person not found" };

  await tenantQuery((tx) => insertInteraction(tx, user.tenantId, contactId, parsed.data));
  revalidatePath(`/people/${contactId}`);
  return { ok: Date.now() };
}

const factSchema = z.object({
  category: z.enum(factCategories),
  label: z.string().trim().min(1, "Add a label").max(100),
  value: z.string().trim().min(1, "Add a value").max(500),
});

export async function addFact(contactId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = factSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (!(await contactExists(contactId))) return { error: "Person not found" };

  await tenantQuery((tx, user) => insertFact(tx, user.tenantId, contactId, parsed.data));
  revalidatePath(`/people/${contactId}`);
  return { ok: Date.now() };
}

export async function archiveFact(contactId: string, factId: string) {
  if (!uuid.safeParse(factId).success) return;
  await tenantQuery((tx) =>
    tx
      .update(facts)
      .set({ archivedAt: new Date() })
      .where(and(eq(facts.id, factId), eq(facts.contactId, contactId))),
  );
  revalidatePath(`/people/${contactId}`);
}
