import "server-only";
import {
  addDays,
  lifeEventTypeLabels,
  sensitiveLifeEvents,
  similarGift,
  type DebtDirection,
  type GiftDirection,
  type LifeEventType,
} from "@life-crm/core";
import { and, asc, desc, eq, gte, isNotNull, isNull, or, schema, sql, type Tx } from "@life-crm/db";
import { fullName, insertContact } from "./contacts";
import { dateToInstant, parseIsoDate, toIsoDate } from "./dates";
import { connectRelative } from "./family";
import { recordTimeline } from "./timeline";

const { contacts, debts, facts, gifts, importantDates, lifeEvents, partnerships, reminders, tasks } = schema;

export type Gift = Awaited<ReturnType<typeof listGifts>>[number];

export async function listGifts(tx: Tx, contactId: string) {
  return tx
    .select({
      id: gifts.id,
      direction: gifts.direction,
      title: gifts.title,
      occasion: gifts.occasion,
      givenOn: gifts.givenOn,
      priceCents: gifts.priceCents,
      currency: gifts.currency,
      url: gifts.url,
      thanked: gifts.thanked,
    })
    .from(gifts)
    .where(eq(gifts.contactId, contactId))
    .orderBy(desc(gifts.givenOn), desc(gifts.createdAt));
}

export interface GiftInput {
  direction: GiftDirection;
  title: string;
  occasion: string | null;
  date: string;
  priceCents: number | null;
  url: string | null;
}

/**
 * Log a gift. Returns an earlier gift to them that looks like the same thing, so the form can
 * say "you gave them one in 2023" instead of letting it slip by.
 */
export async function insertGift(tx: Tx, tenantId: string, contactId: string, input: GiftInput, fromIdeaId?: string) {
  const earlier = input.direction === "given" ? (await listGifts(tx, contactId)).filter((g) => g.direction === "given") : [];
  const repeat = similarGift(input.title, earlier);
  const [row] = await tx
    .insert(gifts)
    .values({ tenantId, contactId, direction: input.direction, title: input.title, occasion: input.occasion, givenOn: input.date, priceCents: input.priceCents, url: input.url })
    .returning({ id: gifts.id });
  if (fromIdeaId) {
    await tx
      .update(facts)
      .set({ archivedAt: new Date() })
      .where(and(eq(facts.id, fromIdeaId), eq(facts.contactId, contactId), eq(facts.category, "wishlist")));
  }
  await recordTimeline(tx, [
    {
      tenantId,
      contactId,
      kind: "gift",
      occurredAt: dateToInstant(parseIsoDate(input.date)),
      title: input.direction === "given" ? `Gave ${input.title}` : `Got ${input.title}`,
      body: input.occasion,
      refId: row!.id,
      data: { direction: input.direction },
    },
  ]);
  return repeat;
}

/** Gift ideas that look like something you already gave, keyed by idea id, with the year it was given. */
export function repeatedIdeas(ideas: { id: string; value: string }[], given: Gift[]) {
  const past = given.filter((g) => g.direction === "given");
  const out: Record<string, string> = {};
  for (const idea of ideas) {
    const match = similarGift(idea.value, past);
    if (match) out[idea.id] = match.givenOn.slice(0, 4);
  }
  return out;
}

export interface LifeEventInput {
  type: LifeEventType;
  title: string | null;
  date: string;
  notes: string | null;
  /** Hard times only: add a weekly "check in on them" reminder. */
  checkIn: boolean;
  /** Babies only: add them to the tree as this person's child. */
  babyName: string | null;
}

/**
 * Record something big in someone's life and do what it implies: a wedding gets a yearly
 * anniversary, a baby gets a place in the tree, a loss or illness can get a weekly check-in.
 * Returns what else was set up, for the confirmation line.
 */
export async function insertLifeEvent(
  tx: Tx,
  user: { id: string; tenantId: string },
  contact: { id: string; firstName: string },
  input: LifeEventInput,
  /** The user's today, YYYY-MM-DD. */
  today: string,
): Promise<string[]> {
  const { tenantId } = user;
  const contactId = contact.id;
  const isSensitive = sensitiveLifeEvents.includes(input.type);
  const day = parseIsoDate(input.date);
  const [row] = await tx
    .insert(lifeEvents)
    .values({ tenantId, contactId, type: input.type, title: input.title, occurredOn: input.date, notes: input.notes, isSensitive })
    .returning({ id: lifeEvents.id });
  await recordTimeline(tx, [
    {
      tenantId,
      contactId,
      kind: "life_event",
      occurredAt: dateToInstant(day),
      title: input.title ?? lifeEventTypeLabels[input.type],
      body: input.notes,
      refId: row!.id,
      data: { type: input.type, sensitive: isSensitive },
    },
  ]);

  const done: string[] = [];

  // Your own partner's anniversaries live on the partner profile, so don't add a second one.
  if (input.type === "married") {
    const [partner] = await tx.select({ id: partnerships.id }).from(partnerships).where(eq(partnerships.contactId, contactId));
    const [existing] = await tx
      .select({ id: importantDates.id })
      .from(importantDates)
      .where(and(eq(importantDates.contactId, contactId), eq(importantDates.type, "anniversary")));
    if (!partner && !existing) {
      await tx.insert(importantDates).values({ tenantId, contactId, type: "anniversary", label: "Wedding anniversary", ...day });
      done.push("added their wedding anniversary to your reminders");
    }
  }

  if (input.type === "baby" && input.babyName) {
    const babyId = await insertContact(tx, tenantId, {
      firstName: input.babyName,
      closeness: "acquaintance",
      keepInTouchDays: null,
      birthday: day,
    });
    await connectRelative(tx, tenantId, { anchorId: contactId, personId: babyId, role: "child" });
    done.push(`added ${input.babyName} to the family tree`);
  }

  if (isSensitive && input.checkIn) {
    // A week on from the event, or today if that's already passed.
    const weekOn = toIsoDate(addDays(day, 7));
    await tx.insert(reminders).values({
      tenantId,
      userId: user.id,
      contactId,
      title: `Check in on ${contact.firstName}`,
      dueOn: weekOn < today ? today : weekOn,
      repeat: "weekly",
    });
    done.push("set a weekly reminder to check in");
  }

  return done;
}

export type NewsItem = Awaited<ReturnType<typeof recentNews>>[number];

/** Life events from the last few weeks, newest first, for "news from your people" on the dashboard. */
export async function recentNews(tx: Tx, today: string, days = 30, limit = 5) {
  const since = toIsoDate(addDays(parseIsoDate(today), -days));
  const rows = await tx
    .select({
      id: lifeEvents.id,
      contactId: lifeEvents.contactId,
      type: lifeEvents.type,
      title: lifeEvents.title,
      occurredOn: lifeEvents.occurredOn,
      isSensitive: lifeEvents.isSensitive,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      avatarRef: contacts.avatarRef,
    })
    .from(lifeEvents)
    .innerJoin(contacts, eq(contacts.id, lifeEvents.contactId))
    .where(and(isNull(contacts.deletedAt), gte(lifeEvents.occurredOn, since), sql`${lifeEvents.occurredOn} <= ${today}::date`))
    .orderBy(desc(lifeEvents.occurredOn), desc(lifeEvents.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, name: fullName(r), label: r.title ?? lifeEventTypeLabels[r.type] }));
}

export type Task = Awaited<ReturnType<typeof listTasks>>[number];

/** Open tasks (dated ones first, soonest first), then the last few done this month. */
export async function listTasks(tx: Tx, contactId: string) {
  const monthAgo = new Date(Date.now() - 30 * 86_400_000);
  return tx
    .select({ id: tasks.id, title: tasks.title, dueOn: tasks.dueOn, doneAt: tasks.doneAt })
    .from(tasks)
    .where(and(eq(tasks.contactId, contactId), or(isNull(tasks.doneAt), gte(tasks.doneAt, monthAgo))))
    .orderBy(sql`${tasks.doneAt} is not null`, sql`${tasks.dueOn} asc nulls last`, asc(tasks.createdAt))
    .limit(20);
}

export type Debt = Awaited<ReturnType<typeof listDebts>>[number];

/** Money still owed either way, oldest first. */
export async function listDebts(tx: Tx, contactId: string) {
  return tx
    .select({
      id: debts.id,
      direction: debts.direction,
      amountCents: debts.amountCents,
      currency: debts.currency,
      reason: debts.reason,
      occurredOn: debts.occurredOn,
    })
    .from(debts)
    .where(and(eq(debts.contactId, contactId), isNull(debts.settledAt)))
    .orderBy(asc(debts.occurredOn));
}

export async function countSettled(tx: Tx, contactId: string) {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(debts)
    .where(and(eq(debts.contactId, contactId), isNotNull(debts.settledAt)));
  return row?.n ?? 0;
}

export async function insertDebt(
  tx: Tx,
  tenantId: string,
  contactId: string,
  input: { direction: DebtDirection; amountCents: number; reason: string | null; date: string },
) {
  await tx.insert(debts).values({ tenantId, contactId, direction: input.direction, amountCents: input.amountCents, reason: input.reason, occurredOn: input.date });
}
