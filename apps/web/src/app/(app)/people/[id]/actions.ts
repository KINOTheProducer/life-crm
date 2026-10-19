"use server";

import { factCategories, interactionTypes, todayIn } from "@life-crm/core";
import { and, eq, isNull, schema, sql } from "@life-crm/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dateToInstant, parseIsoDate, toIsoDate } from "@/lib/data/dates";
import { resolveCheckins } from "@/lib/data/reminders";
import { recordTimeline } from "@/lib/data/timeline";
import { requireUser, tenantQuery } from "@/lib/session";

export interface FormState {
  error?: string;
  ok?: number;
}

const { contacts, facts, interactionPeople, interactions, notes } = schema;
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

  await tenantQuery(async (tx, user) => {
    const [note] = await tx
      .insert(notes)
      .values({ tenantId: user.tenantId, contactId, body: body.data })
      .returning({ id: notes.id, createdAt: notes.createdAt });
    await recordTimeline(tx, [
      { tenantId: user.tenantId, contactId, kind: "note", occurredAt: note!.createdAt, title: "Note", body: body.data, refId: note!.id },
    ]);
  });
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

  const occurredAt = dateToInstant(parseIsoDate(parsed.data.date));
  await tenantQuery(async (tx) => {
    const [row] = await tx
      .insert(interactions)
      .values({ tenantId: user.tenantId, ...parsed.data, occurredAt })
      .returning({ id: interactions.id });
    await tx.insert(interactionPeople).values({ tenantId: user.tenantId, interactionId: row!.id, contactId });
    await tx
      .update(contacts)
      .set({ lastInteractionAt: sql`greatest(${contacts.lastInteractionAt}, ${occurredAt.toISOString()}::timestamptz)` })
      .where(eq(contacts.id, contactId));
    await resolveCheckins(tx, [contactId]);
    await recordTimeline(tx, [
      {
        tenantId: user.tenantId,
        contactId,
        kind: "interaction",
        occurredAt,
        title: parsed.data.type,
        body: parsed.data.summary,
        refId: row!.id,
        data: { location: parsed.data.location, with: [] },
      },
    ]);
  });
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

  await tenantQuery(async (tx, user) => {
    const [fact] = await tx
      .insert(facts)
      .values({ tenantId: user.tenantId, contactId, ...parsed.data })
      .returning({ id: facts.id, createdAt: facts.createdAt });
    await recordTimeline(tx, [
      {
        tenantId: user.tenantId,
        contactId,
        kind: "fact",
        occurredAt: fact!.createdAt,
        title: parsed.data.label,
        body: parsed.data.value,
        refId: fact!.id,
        data: { category: parsed.data.category },
      },
    ]);
  });
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
