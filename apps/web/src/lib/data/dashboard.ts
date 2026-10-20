import "server-only";
import { todayIn, type ClosenessTier } from "@life-crm/core";
import { and, desc, eq, gte, inArray, isNull, schema, sql, type Tx } from "@life-crm/db";
import { fullName } from "./contacts";

const { contacts, facts, interactionPeople, interactions } = schema;

export interface DriftingPerson {
  id: string;
  name: string;
  avatarRef: string | null;
  daysSince: number | null;
  cadenceDays: number;
  note: string | null;
}

const DAY = 86_400_000;

/** People past their keep-in-touch cadence, most overdue (relative to cadence) first. */
export async function drifting(tx: Tx, limit = 4): Promise<DriftingPerson[]> {
  const rows = await tx
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      avatarRef: contacts.avatarRef,
      cadence: contacts.keepInTouchDays,
      last: contacts.lastInteractionAt,
      createdAt: contacts.createdAt,
    })
    .from(contacts)
    .where(and(isNull(contacts.deletedAt), sql`${contacts.keepInTouchDays} > 0`));

  const now = Date.now();
  const overdue = rows
    .map((r) => {
      const since = Math.floor((now - (r.last ?? r.createdAt).getTime()) / DAY);
      return { r, since, ratio: since / r.cadence! };
    })
    .filter((x) => x.ratio >= 1)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, limit);

  const notes = await latestFacts(
    tx,
    overdue.map((x) => x.r.id),
  );
  return overdue.map(({ r, since }) => ({
    id: r.id,
    name: fullName(r),
    avatarRef: r.avatarRef,
    daysSince: r.last ? since : null,
    cadenceDays: r.cadence!,
    note: notes.get(r.id) ?? null,
  }));
}

/** Most recent fact per person, preferring things to ask about. */
export async function latestFacts(tx: Tx, contactIds: string[]) {
  const out = new Map<string, string>();
  if (contactIds.length === 0) return out;
  const rows = await tx
    .select({ contactId: facts.contactId, category: facts.category, label: facts.label, value: facts.value })
    .from(facts)
    .where(and(inArray(facts.contactId, contactIds), isNull(facts.archivedAt)))
    .orderBy(desc(facts.createdAt));
  for (const f of rows.filter((f) => f.category === "follow_up")) if (!out.has(f.contactId)) out.set(f.contactId, `Ask about ${lower(f.value)}`);
  for (const f of rows) if (!out.has(f.contactId)) out.set(f.contactId, f.value);
  return out;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export async function factsFor(tx: Tx, contactId: string) {
  return tx
    .select({ category: facts.category, label: facts.label, value: facts.value })
    .from(facts)
    .where(and(eq(facts.contactId, contactId), isNull(facts.archivedAt)))
    .orderBy(desc(facts.createdAt));
}

export async function closenessCounts(tx: Tx): Promise<Record<ClosenessTier, number>> {
  const rows = await tx
    .select({ tier: contacts.closeness, n: sql<number>`count(*)::int` })
    .from(contacts)
    .where(isNull(contacts.deletedAt))
    .groupBy(contacts.closeness);
  const out: Record<ClosenessTier, number> = { inner: 0, close: 0, friend: 0, acquaintance: 0 };
  for (const r of rows) out[r.tier] = r.n;
  return out;
}

export interface MonthPoint {
  label: string;
  inPerson: number;
  remote: number;
}

/** Catch-ups per month for the last 12 months, in the user's time zone. */
export async function yearOfCatchups(tx: Tx, timeZone: string): Promise<{ months: MonthPoint[]; total: number; previous: number }> {
  const today = todayIn(timeZone);
  const start = new Date(Date.UTC(today.year - 1, today.month, 1));
  const prevStart = new Date(Date.UTC(today.year - 2, today.month, 1));

  // Count each interaction once, even with several people in it.
  const rows = await tx
    .selectDistinct({ id: interactions.id, type: interactions.type, at: interactions.occurredAt })
    .from(interactions)
    .innerJoin(interactionPeople, eq(interactionPeople.interactionId, interactions.id))
    .where(gte(interactions.occurredAt, prevStart));

  const fmt = new Intl.DateTimeFormat("en-CA", { month: "short", timeZone: "UTC" });
  const months: MonthPoint[] = Array.from({ length: 12 }, (_, i) => ({
    label: fmt.format(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1))),
    inPerson: 0,
    remote: 0,
  }));
  let previous = 0;
  for (const r of rows) {
    if (r.at < start) {
      previous += 1;
      continue;
    }
    const i = (r.at.getUTCFullYear() - start.getUTCFullYear()) * 12 + (r.at.getUTCMonth() - start.getUTCMonth());
    const m = months[i];
    if (!m) continue;
    if (r.type === "in_person" || r.type === "event") m.inPerson += 1;
    else m.remote += 1;
  }
  const total = months.reduce((n, m) => n + m.inPerson + m.remote, 0);
  return { months, total, previous };
}
