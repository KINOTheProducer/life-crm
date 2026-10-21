"use server";

import { circleTones, interactionTypes, todayIn } from "@life-crm/core";
import { and, eq, inArray, isNull, ne, schema } from "@life-crm/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/app/(app)/people/[id]/actions";
import { addMember, insertCircle, insertGroupInteraction, removeMember, setMembers } from "@/lib/data/circles";
import { toIsoDate } from "@/lib/data/dates";
import { tenantQuery } from "@/lib/session";

const { circles, contacts } = schema;
const uuid = z.uuid();

const circleSchema = z.object({
  name: z.string().trim().min(1, "Give the circle a name").max(60, "Keep the name under 60 characters"),
  tone: z.enum(circleTones).catch("sage"),
  notes: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => v || null),
});

function parseCircle(form: FormData) {
  return circleSchema.safeParse({ name: form.get("name") ?? "", tone: form.get("tone"), notes: form.get("notes") ?? "" });
}

const taken = (name: string): FormState => ({ error: `You already have a circle called ${name}` });

export async function createCircle(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = parseCircle(form);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const id = await tenantQuery((tx, user) => insertCircle(tx, user.tenantId, parsed.data));
  if (!id) return taken(parsed.data.name);
  revalidatePath("/circles");
  redirect(`/circles/${id}`);
}

/** From a person's page: make a circle and put them straight in it. */
export async function createCircleWith(contactId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = parseCircle(form);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (!uuid.safeParse(contactId).success) return { error: "Person not found" };
  const id = await tenantQuery(async (tx, user) => {
    const circleId = await insertCircle(tx, user.tenantId, parsed.data);
    if (circleId) await addMember(tx, user.tenantId, circleId, contactId);
    return circleId;
  });
  if (!id) return taken(parsed.data.name);
  revalidatePath(`/people/${contactId}`);
  revalidatePath("/circles");
  return { ok: Date.now() };
}

export async function updateCircle(circleId: string, _prev: FormState, form: FormData): Promise<FormState> {
  if (!uuid.safeParse(circleId).success) return { error: "Circle not found" };
  const parsed = parseCircle(form);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const clash = await tenantQuery(async (tx) => {
    const [other] = await tx
      .select({ id: circles.id })
      .from(circles)
      .where(and(eq(circles.name, parsed.data.name), ne(circles.id, circleId)));
    if (other) return true;
    await tx.update(circles).set(parsed.data).where(eq(circles.id, circleId));
    return false;
  });
  if (clash) return taken(parsed.data.name);
  revalidatePath(`/circles/${circleId}`);
  revalidatePath("/circles");
  return { ok: Date.now() };
}

export async function deleteCircle(circleId: string) {
  if (!uuid.safeParse(circleId).success) return;
  await tenantQuery((tx) => tx.delete(circles).where(eq(circles.id, circleId)));
  revalidatePath("/circles");
  redirect("/circles");
}

export async function saveMembers(circleId: string, _prev: FormState, form: FormData): Promise<FormState> {
  if (!uuid.safeParse(circleId).success) return { error: "Circle not found" };
  const ids = form.getAll("people").map(String).filter((id) => uuid.safeParse(id).success);
  await tenantQuery((tx, user) => setMembers(tx, user.tenantId, circleId, ids));
  revalidatePath(`/circles/${circleId}`);
  revalidatePath("/circles");
  return { ok: Date.now() };
}

export async function joinCircle(contactId: string, circleId: string) {
  if (!uuid.safeParse(contactId).success || !uuid.safeParse(circleId).success) return;
  await tenantQuery((tx, user) => addMember(tx, user.tenantId, circleId, contactId));
  revalidatePath(`/people/${contactId}`);
  revalidatePath(`/circles/${circleId}`);
}

export async function leaveCircle(contactId: string, circleId: string) {
  if (!uuid.safeParse(contactId).success || !uuid.safeParse(circleId).success) return;
  await tenantQuery((tx) => removeMember(tx, circleId, contactId));
  revalidatePath(`/people/${contactId}`);
  revalidatePath(`/circles/${circleId}`);
}

const groupSchema = z.object({
  type: z.enum(interactionTypes),
  date: z.iso.date("Pick a date"),
  location: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null),
  summary: z.string().trim().min(1, "Add a sentence about it").max(2000),
});

/** One catch-up with the members who were there. */
export async function logGroupCatchup(circleId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = groupSchema.safeParse({
    type: form.get("type"),
    date: form.get("date"),
    location: form.get("location") ?? "",
    summary: form.get("summary") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const ids = form.getAll("people").map(String).filter((id) => uuid.safeParse(id).success);
  if (ids.length === 0) return { error: "Tick who was there" };

  const result = await tenantQuery(async (tx, user) => {
    if (parsed.data.date > toIsoDate(todayIn(user.timeZone))) return "future" as const;
    const live = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(inArray(contacts.id, ids), isNull(contacts.deletedAt)));
    if (live.length === 0) return "none" as const;
    await insertGroupInteraction(
      tx,
      user.tenantId,
      live.map((c) => c.id),
      parsed.data,
    );
    return live.map((c) => c.id);
  });
  if (result === "future") return { error: "That date is in the future" };
  if (result === "none") return { error: "Those people aren't around anymore" };
  for (const id of result) revalidatePath(`/people/${id}`);
  revalidatePath(`/circles/${circleId}`);
  revalidatePath("/dashboard");
  return { ok: Date.now(), message: `Logged for ${result.length} ${result.length === 1 ? "person" : "people"}.` };
}
