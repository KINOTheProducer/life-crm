"use server";

import { birthdayInText, closenessTiers, factCategories, interactionTypes, todayIn } from "@life-crm/core";
import { and, eq, isNull, schema } from "@life-crm/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { birthdayOf, setBirthday } from "@/lib/data/contacts";
import { formatPartialDate, toIsoDate } from "@/lib/data/dates";
import { insertFact, insertInteraction, insertNote } from "@/lib/data/entries";
import { dateProblemText, partialDateFrom, personName } from "@/lib/forms";
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

const nameSchema = z.object({
  firstName: personName(100).pipe(z.string().min(1, "First name is required")),
  lastName: personName(100).transform((v) => v || null),
  nickname: personName(100).transform((v) => v || null),
  pronouns: z
    .string()
    .trim()
    .max(50)
    .transform((v) => v || null),
});

function revalidatePerson(contactId: string) {
  revalidatePath(`/people/${contactId}`);
  revalidatePath("/family");
}

export async function updateName(contactId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = nameSchema.safeParse({
    firstName: form.get("firstName") ?? "",
    lastName: form.get("lastName") ?? "",
    nickname: form.get("nickname") ?? "",
    pronouns: form.get("pronouns") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (!(await contactExists(contactId))) return { error: "Person not found" };
  await tenantQuery((tx) => tx.update(contacts).set(parsed.data).where(eq(contacts.id, contactId)));
  revalidatePerson(contactId);
  return { ok: Date.now() };
}

/** 0 or blank turns catch-up nudges off for this person. */
const cadenceSchema = z.coerce.number().int("Use whole days").min(0).max(3650, "That's more than ten years");

function cadenceFrom(form: FormData) {
  const raw = form.get("cadence") === "custom" ? form.get("customDays") : form.get("cadence");
  return cadenceSchema.safeParse(String(raw ?? "").trim() || 0);
}

export async function updateCadence(contactId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = cadenceFrom(form);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (!(await contactExists(contactId))) return { error: "Person not found" };
  await tenantQuery((tx) =>
    tx
      .update(contacts)
      .set({ keepInTouchDays: parsed.data || null })
      .where(eq(contacts.id, contactId)),
  );
  revalidatePerson(contactId);
  return { ok: Date.now() };
}

export async function updateCloseness(contactId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = z.enum(closenessTiers).safeParse(form.get("closeness"));
  if (!parsed.success) return { error: "Pick how close you are" };
  if (!(await contactExists(contactId))) return { error: "Person not found" };
  await tenantQuery((tx) => tx.update(contacts).set({ closeness: parsed.data }).where(eq(contacts.id, contactId)));
  revalidatePerson(contactId);
  return { ok: Date.now() };
}

/** Name, closeness and cadence in one go, for the edit panel in the tree. */
export async function updateBasics(contactId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const name = nameSchema.safeParse({
    firstName: form.get("firstName") ?? "",
    lastName: form.get("lastName") ?? "",
    nickname: form.get("nickname") ?? "",
    pronouns: form.get("pronouns") ?? "",
  });
  if (!name.success) return { error: name.error.issues[0]?.message };
  const closeness = z.enum(closenessTiers).safeParse(form.get("closeness"));
  if (!closeness.success) return { error: "Pick how close you are" };
  const cadence = cadenceFrom(form);
  if (!cadence.success) return { error: cadence.error.issues[0]?.message };
  if (!(await contactExists(contactId))) return { error: "Person not found" };
  await tenantQuery((tx) =>
    tx
      .update(contacts)
      .set({ ...name.data, closeness: closeness.data, keepInTouchDays: cadence.data || null })
      .where(eq(contacts.id, contactId)),
  );
  revalidatePerson(contactId);
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

const spanYear = z.union([
  z.literal("").transform(() => null),
  z.coerce.number().int("Use a whole year").min(1900, "That's before 1900").max(2100, "That's too far ahead"),
]);

/** When you met (year, optionally month) and the year you lost touch, for the life timeline. */
export async function updateSpan(contactId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({
      metYear: spanYear,
      metMonth: z.union([z.literal("").transform(() => null), z.coerce.number().int().min(1).max(12)]),
      lostTouchYear: spanYear,
    })
    .safeParse({
      metYear: String(form.get("metYear") ?? "").trim(),
      metMonth: String(form.get("metMonth") ?? "").trim(),
      lostTouchYear: String(form.get("lostTouchYear") ?? "").trim(),
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { metYear, metMonth, lostTouchYear } = parsed.data;
  const user = await requireUser();
  const thisYear = todayIn(user.timeZone).year;
  if (metYear != null && metYear > thisYear) return { error: "You can't have met in the future" };
  if (lostTouchYear != null && lostTouchYear > thisYear) return { error: "That year hasn't happened yet" };
  if (metYear != null && lostTouchYear != null && lostTouchYear < metYear) return { error: "You lost touch before you met" };
  if (!(await contactExists(contactId))) return { error: "Person not found" };
  await tenantQuery((tx) =>
    tx
      .update(contacts)
      .set({ metYear, metMonth: metYear == null ? null : metMonth, lostTouchYear })
      .where(eq(contacts.id, contactId)),
  );
  revalidatePath(`/people/${contactId}`);
  revalidatePath("/people/timeline");
  return { ok: Date.now() };
}
