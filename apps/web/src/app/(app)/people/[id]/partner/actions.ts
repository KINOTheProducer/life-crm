"use server";

import { loveLanguages, milestoneKinds, partnerPrompts, todayIn, type PartnerPromptSection } from "@life-crm/core";
import { and, eq, inArray, isNull, schema, sql } from "@life-crm/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dateToInstant, parseIsoDate, toIsoDate } from "@/lib/data/dates";
import {
  addMilestone as insertMilestone,
  createPartnership,
  dropAnniversaries,
  monogamyConflict,
  partnershipFor,
  userPrefs,
} from "@/lib/data/partners";
import { resolveCheckins } from "@/lib/data/reminders";
import { recordTimeline } from "@/lib/data/timeline";
import { partialDateFrom } from "@/lib/forms";
import { tenantQuery } from "@/lib/session";

export interface FormState {
  error?: string;
  ok?: number;
}

const { contacts, dateNights, facts, importantDates, interactionPeople, interactions, partnershipMilestones, partnerships } = schema;
const uuid = z.uuid();

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const paths = (contactId: string) => {
  revalidatePath(`/people/${contactId}`);
  revalidatePath(`/people/${contactId}/partner`);
  revalidatePath("/dashboard");
};

const labelSchema = z.string().trim().min(1, "Add what you call them, e.g. Partner").max(50);

export async function makePartner(contactId: string, _prev: FormState, form: FormData): Promise<FormState> {
  if (!uuid.safeParse(contactId).success) return { error: "Person not found" };
  const label = labelSchema.safeParse(form.get("label"));
  if (!label.success) return { error: label.error.issues[0]?.message };

  const error = await tenantQuery(async (tx, user) => {
    const [contact] = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)));
    if (!contact) return "Person not found";
    const { relationshipStyle } = await userPrefs(tx, user.id);
    const conflict = await monogamyConflict(tx, relationshipStyle, contactId);
    if (conflict) return conflict;
    await createPartnership(tx, user.tenantId, contactId, { label: label.data, isNesting: form.get("isNesting") === "on" });
    return null;
  });
  if (error) return { error };
  paths(contactId);
  return { ok: Date.now() };
}

const detailsSchema = z.object({
  label: labelSchema,
  isNesting: z.boolean(),
  dateCadenceDays: z.coerce.number().int().min(0).max(365),
  agreements: optional(5000),
});

export async function updatePartnership(contactId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = detailsSchema.safeParse({
    label: form.get("label"),
    isNesting: form.get("isNesting") === "on",
    dateCadenceDays: form.get("dateCadenceDays") || 0,
    agreements: form.get("agreements") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { dateCadenceDays, ...rest } = parsed.data;
  await tenantQuery((tx) =>
    tx
      .update(partnerships)
      .set({ ...rest, dateCadenceDays: dateCadenceDays || null })
      .where(eq(partnerships.contactId, contactId)),
  );
  paths(contactId);
  return { ok: Date.now() };
}

export async function setLoveLanguages(contactId: string, ranked: string[]) {
  const parsed = z.array(z.enum(loveLanguages)).max(loveLanguages.length).safeParse(ranked);
  if (!parsed.success) return;
  await tenantQuery((tx) =>
    tx
      .update(partnerships)
      .set({ loveLanguages: [...new Set(parsed.data)] })
      .where(eq(partnerships.contactId, contactId)),
  );
  paths(contactId);
}

export async function addMilestone(contactId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const kind = z.enum(milestoneKinds).safeParse(form.get("kind"));
  if (!kind.success) return { error: "Pick a milestone" };
  const label = optional(80).safeParse(form.get("label") ?? "");
  if (!label.success) return { error: "Label is too long" };
  if (kind.data === "custom" && !label.data) return { error: "Name the milestone" };
  const date = partialDateFrom(form, "date");
  if (!date) return { error: "Add at least the month and day" };
  if (date === "invalid") return { error: "That date doesn't exist" };

  const error = await tenantQuery(async (tx, user) => {
    const p = await partnershipFor(tx, contactId);
    if (!p) return "Not a partner";
    await insertMilestone(tx, { tenantId: user.tenantId, partnershipId: p.id, contactId }, {
      kind: kind.data,
      label: label.data,
      date,
      anniversary: form.get("anniversary") === "on",
    });
    return null;
  });
  if (error) return { error };
  paths(contactId);
  return { ok: Date.now() };
}

export async function removeMilestone(contactId: string, milestoneId: string) {
  if (!uuid.safeParse(milestoneId).success) return;
  await tenantQuery(async (tx) => {
    const p = await partnershipFor(tx, contactId);
    if (!p) return;
    const [m] = await tx
      .delete(partnershipMilestones)
      .where(and(eq(partnershipMilestones.id, milestoneId), eq(partnershipMilestones.partnershipId, p.id)))
      .returning({ importantDateId: partnershipMilestones.importantDateId });
    if (m?.importantDateId) await tx.delete(importantDates).where(eq(importantDates.id, m.importantDateId));
  });
  paths(contactId);
}

const dateNightSchema = z.object({
  date: z.iso.date(),
  place: optional(200),
  cost: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Math.round(Number(v.replace(/[$,]/g, "")) * 100)))
    .refine((v) => v == null || (Number.isFinite(v) && v >= 0 && v < 100_000_00), "Cost doesn't look right"),
  rating: z.coerce.number().int().min(0).max(5),
  notes: optional(2000),
});

export async function logDateNight(contactId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = dateNightSchema.safeParse({
    date: form.get("date"),
    place: form.get("place") ?? "",
    cost: form.get("cost") ?? "",
    rating: form.get("rating") || 0,
    notes: form.get("notes") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { date, place, cost, rating, notes } = parsed.data;

  const error = await tenantQuery(async (tx, user) => {
    if (date > toIsoDate(todayIn(user.timeZone))) return "That date is in the future";
    const p = await partnershipFor(tx, contactId);
    if (!p) return "Not a partner";

    // A date night is a catch-up too, so it resets keep-in-touch and shows on the timeline.
    const occurredAt = dateToInstant(parseIsoDate(date));
    const summary = notes ?? (place ? `Date night at ${place}` : "Date night");
    const [interaction] = await tx
      .insert(interactions)
      .values({ tenantId: user.tenantId, type: "in_person", occurredAt, location: place, summary })
      .returning({ id: interactions.id });
    await tx.insert(interactionPeople).values({ tenantId: user.tenantId, interactionId: interaction!.id, contactId });
    await tx.insert(dateNights).values({
      tenantId: user.tenantId,
      partnershipId: p.id,
      interactionId: interaction!.id,
      occurredOn: date,
      place,
      costCents: cost,
      rating: rating || null,
      notes,
    });
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
        title: "in_person",
        body: summary,
        refId: interaction!.id,
        data: { location: place, with: [], dateNight: true },
      },
    ]);
    return null;
  });
  if (error) return { error };
  paths(contactId);
  return { ok: Date.now() };
}

/** Save one section of guided prompts. Changed answers replace the old fact; cleared ones are archived. */
export async function savePrompts(contactId: string, section: PartnerPromptSection, _prev: FormState, form: FormData): Promise<FormState> {
  const labels: readonly string[] = partnerPrompts[section];
  if (!labels) return { error: "Unknown section" };
  const answers = new Map<string, string>();
  for (const [i, label] of labels.entries()) {
    const v = String(form.get(`p${i}`) ?? "").trim();
    if (v.length > 500) return { error: `${label} is too long` };
    answers.set(label, v);
  }

  await tenantQuery(async (tx, user) => {
    if (!(await partnershipFor(tx, contactId))) return;
    const existing = await tx
      .select({ id: facts.id, label: facts.label, value: facts.value })
      .from(facts)
      .where(and(eq(facts.contactId, contactId), eq(facts.category, section), isNull(facts.archivedAt), inArray(facts.label, [...labels])));
    const current = new Map(existing.map((f) => [f.label, f]));
    const stale: string[] = [];
    const added: { label: string; value: string }[] = [];
    for (const [label, value] of answers) {
      const old = current.get(label);
      if (old?.value === value) continue;
      if (old) stale.push(old.id);
      if (value) added.push({ label, value });
    }
    if (stale.length) await tx.update(facts).set({ archivedAt: new Date() }).where(inArray(facts.id, stale));
    if (added.length === 0) return;
    const rows = await tx
      .insert(facts)
      .values(added.map((a) => ({ tenantId: user.tenantId, contactId, category: section, ...a })))
      .returning({ id: facts.id, label: facts.label, value: facts.value, createdAt: facts.createdAt });
    await recordTimeline(
      tx,
      rows.map((r) => ({
        tenantId: user.tenantId,
        contactId,
        kind: "fact" as const,
        occurredAt: r.createdAt,
        title: r.label,
        body: r.value,
        refId: r.id,
        data: { category: section },
      })),
    );
  });
  paths(contactId);
  return { ok: Date.now() };
}

export async function endPartnership(contactId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const endedOn = z.iso.date().safeParse(form.get("endedOn"));
  if (!endedOn.success) return { error: "Pick the date it ended" };
  await tenantQuery(async (tx, user) => {
    const p = await partnershipFor(tx, contactId);
    if (!p || p.status === "past") return;
    await dropAnniversaries(tx, p.id);
    await tx.update(partnerships).set({ status: "past", endedOn: endedOn.data }).where(eq(partnerships.id, p.id));
    await recordTimeline(tx, [
      {
        tenantId: user.tenantId,
        contactId,
        kind: "milestone",
        occurredAt: dateToInstant(parseIsoDate(endedOn.data)),
        title: "Relationship ended",
        refId: p.id,
      },
    ]);
  });
  paths(contactId);
  return { ok: Date.now() };
}
