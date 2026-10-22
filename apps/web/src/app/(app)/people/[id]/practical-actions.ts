"use server";

import { debtDirections, giftDirections, lifeEventTypes, parseMoney, todayIn } from "@life-crm/core";
import { and, eq, isNull, schema } from "@life-crm/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { insertFact } from "@/lib/data/entries";
import { toIsoDate } from "@/lib/data/dates";
import { insertDebt, insertGift, insertLifeEvent } from "@/lib/data/practical";
import { personName } from "@/lib/forms";
import { tenantQuery } from "@/lib/session";
import type { FormState } from "./actions";

const { contacts, debts, gifts, tasks, timelineEntries } = schema;
const uuid = z.uuid();

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const yearShort = (iso: string) => iso.slice(0, 4);

async function findContact(contactId: string) {
  if (!uuid.safeParse(contactId).success) return null;
  return tenantQuery(async (tx) => {
    const [row] = await tx
      .select({ id: contacts.id, firstName: contacts.firstName })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)));
    return row ?? null;
  });
}

function money(form: FormData, field: string) {
  const cents = parseMoney(String(form.get(field) ?? ""));
  return Number.isNaN(cents) ? "invalid" : cents;
}

const done = (contactId: string, message?: string): FormState => {
  revalidatePath(`/people/${contactId}`);
  return { ok: Date.now(), message };
};

/* Gifts */

const ideaSchema = z.string().trim().min(1, "What's the idea?").max(500);

export async function addGiftIdea(contactId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const idea = ideaSchema.safeParse(form.get("idea"));
  if (!idea.success) return { error: idea.error.issues[0]?.message };
  if (!(await findContact(contactId))) return { error: "Person not found" };
  await tenantQuery((tx, user) => insertFact(tx, user.tenantId, contactId, { category: "wishlist", label: "Gift idea", value: idea.data }));
  return done(contactId);
}

const giftSchema = z.object({
  direction: z.enum(giftDirections),
  // Room for a gift idea's full wording when it's logged from one.
  title: z.string().trim().min(1, "What was it?").max(500, "Keep it under 500 characters"),
  occasion: optional(100),
  date: z.iso.date("Pick a date"),
  url: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => v || null)
    .refine((v) => v == null || /^https?:\/\//i.test(v), "Links start with http:// or https://"),
  fromIdea: z.union([z.uuid(), z.literal("")]).transform((v) => v || undefined),
});

export async function addGift(contactId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = giftSchema.safeParse({
    direction: form.get("direction"),
    title: form.get("title") ?? "",
    occasion: form.get("occasion") ?? "",
    date: form.get("date"),
    url: form.get("url") ?? "",
    fromIdea: form.get("fromIdea") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const priceCents = money(form, "price");
  if (priceCents === "invalid") return { error: "Price should be an amount, like 40 or 39.99" };
  if (!(await findContact(contactId))) return { error: "Person not found" };

  const { fromIdea, ...input } = parsed.data;
  const repeat = await tenantQuery(async (tx, user) => {
    if (input.date > toIsoDate(todayIn(user.timeZone))) return "future" as const;
    return insertGift(tx, user.tenantId, contactId, { ...input, priceCents }, fromIdea);
  });
  if (repeat === "future") return { error: "That date is in the future" };
  return done(contactId, repeat ? `Heads up: you gave them ${repeat.title} in ${yearShort(repeat.givenOn)}.` : undefined);
}

export async function setThanked(contactId: string, giftId: string, thanked: boolean) {
  if (!uuid.safeParse(giftId).success) return;
  await tenantQuery((tx) =>
    tx
      .update(gifts)
      .set({ thanked })
      .where(and(eq(gifts.id, giftId), eq(gifts.contactId, contactId), eq(gifts.direction, "received"))),
  );
  revalidatePath(`/people/${contactId}`);
}

export async function deleteGift(contactId: string, giftId: string) {
  if (!uuid.safeParse(giftId).success) return;
  await tenantQuery(async (tx) => {
    await tx.delete(gifts).where(and(eq(gifts.id, giftId), eq(gifts.contactId, contactId)));
    await tx.delete(timelineEntries).where(and(eq(timelineEntries.refId, giftId), eq(timelineEntries.kind, "gift")));
  });
  revalidatePath(`/people/${contactId}`);
}

/* Life events */

const lifeEventSchema = z.object({
  type: z.enum(lifeEventTypes, "Pick what happened"),
  title: optional(200),
  date: z.iso.date("Pick a date"),
  notes: optional(2000),
  checkIn: z.boolean(),
  babyName: personName(100).transform((v) => v || null),
});

export async function addLifeEvent(contactId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = lifeEventSchema.safeParse({
    type: form.get("type"),
    title: form.get("title") ?? "",
    date: form.get("date"),
    notes: form.get("notes") ?? "",
    checkIn: form.get("checkIn") === "on",
    babyName: form.get("babyName") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (parsed.data.type === "other" && !parsed.data.title) return { error: "Say what happened" };
  const contact = await findContact(contactId);
  if (!contact) return { error: "Person not found" };

  const extras = await tenantQuery((tx, user) => insertLifeEvent(tx, user, contact, parsed.data, toIsoDate(todayIn(user.timeZone))));
  revalidatePath("/dashboard");
  revalidatePath("/family");
  revalidatePath("/reminders");
  return done(contactId, extras.length ? `Saved, and ${extras.join(" and ")}.` : undefined);
}

/* Tasks */

const taskSchema = z.object({
  title: z.string().trim().min(1, "What needs doing?").max(300),
  dueOn: z.union([z.iso.date(), z.literal("")]).transform((v) => v || null),
});

export async function addTask(contactId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = taskSchema.safeParse({ title: form.get("title") ?? "", dueOn: form.get("dueOn") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (!(await findContact(contactId))) return { error: "Person not found" };
  await tenantQuery((tx, user) => tx.insert(tasks).values({ tenantId: user.tenantId, contactId, ...parsed.data }));
  return done(contactId);
}

export async function setTaskDone(contactId: string, taskId: string, isDone: boolean) {
  if (!uuid.safeParse(taskId).success) return;
  await tenantQuery((tx) =>
    tx
      .update(tasks)
      .set({ doneAt: isDone ? new Date() : null })
      .where(and(eq(tasks.id, taskId), eq(tasks.contactId, contactId))),
  );
  revalidatePath(`/people/${contactId}`);
}

export async function deleteTask(contactId: string, taskId: string) {
  if (!uuid.safeParse(taskId).success) return;
  await tenantQuery((tx) => tx.delete(tasks).where(and(eq(tasks.id, taskId), eq(tasks.contactId, contactId))));
  revalidatePath(`/people/${contactId}`);
}

/* Money */

const debtSchema = z.object({
  direction: z.enum(debtDirections),
  reason: optional(200),
  date: z.iso.date("Pick a date"),
});

export async function addDebt(contactId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = debtSchema.safeParse({ direction: form.get("direction"), reason: form.get("reason") ?? "", date: form.get("date") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const amountCents = money(form, "amount");
  if (amountCents === "invalid" || amountCents === null || amountCents === 0) return { error: "Add an amount, like 40 or 39.99" };
  if (amountCents > 100_000_000) return { error: "That's more than a million dollars" };
  if (!(await findContact(contactId))) return { error: "Person not found" };
  await tenantQuery((tx, user) => insertDebt(tx, user.tenantId, contactId, { ...parsed.data, amountCents }));
  return done(contactId);
}

export async function settleDebt(contactId: string, debtId: string) {
  if (!uuid.safeParse(debtId).success) return;
  await tenantQuery((tx) =>
    tx
      .update(debts)
      .set({ settledAt: new Date() })
      .where(and(eq(debts.id, debtId), eq(debts.contactId, contactId))),
  );
  revalidatePath(`/people/${contactId}`);
}
