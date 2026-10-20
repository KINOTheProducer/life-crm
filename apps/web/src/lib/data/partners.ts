import "server-only";
import {
  anniversaryName,
  dateNightDue,
  defaultAnniversary,
  formatDuration,
  milestoneLabels,
  nextAnniversary,
  relationshipStart,
  todayIn,
  type MilestoneKind,
  type PartialDate,
  type RelationshipStyle,
} from "@life-crm/core";
import { and, asc, desc, eq, inArray, isNull, schema, sql, type Tx } from "@life-crm/db";
import { fullName } from "./contacts";
import { dateToInstant, formatPartialDate, parseIsoDate } from "./dates";
import { recordTimeline } from "./timeline";

const { contacts, dateNights, facts, importantDates, partnershipMilestones, partnerships, user } = schema;

export const partnerFactCategories = ["love", "favourites", "sizes", "wishlist", "follow_up"] as const;

export async function userPrefs(tx: Tx, userId: string) {
  const [row] = await tx
    .select({
      relationshipStatus: user.relationshipStatus,
      relationshipStyle: user.relationshipStyle,
      onboardedAt: user.onboardedAt,
      digestHour: user.digestHour,
      emailDigest: user.emailDigest,
    })
    .from(user)
    .where(eq(user.id, userId));
  return row!;
}

export async function currentPartners(tx: Tx) {
  return tx
    .select({
      id: partnerships.id,
      contactId: partnerships.contactId,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      avatarRef: contacts.avatarRef,
    })
    .from(partnerships)
    .innerJoin(contacts, eq(contacts.id, partnerships.contactId))
    .where(and(eq(partnerships.status, "current"), isNull(contacts.deletedAt)))
    .orderBy(asc(partnerships.createdAt));
}

export async function partnershipFor(tx: Tx, contactId: string) {
  const [row] = await tx.select().from(partnerships).where(eq(partnerships.contactId, contactId));
  return row ?? null;
}

/**
 * Error message when adding another current partner would break a monogamous setup,
 * or null when it's fine.
 */
export async function monogamyConflict(tx: Tx, style: RelationshipStyle, contactId: string) {
  if (style !== "monogamous") return null;
  const others = (await currentPartners(tx)).filter((p) => p.contactId !== contactId);
  if (others.length === 0) return null;
  return `${fullName(others[0]!)} is already your partner. End that relationship first, or switch to more than one partner in Settings.`;
}

export async function createPartnership(tx: Tx, tenantId: string, contactId: string, input: { label: string; isNesting?: boolean }) {
  const [row] = await tx
    .insert(partnerships)
    .values({ tenantId, contactId, label: input.label, isNesting: input.isNesting ?? false })
    .onConflictDoUpdate({
      target: partnerships.contactId,
      set: { status: "current", endedOn: null, label: input.label, isNesting: input.isNesting ?? false },
    })
    .returning({ id: partnerships.id });
  // Partners default to the closest tier.
  await tx.update(contacts).set({ closeness: "inner" }).where(eq(contacts.id, contactId));
  return row!.id;
}

export async function addMilestone(
  tx: Tx,
  p: { tenantId: string; partnershipId: string; contactId: string },
  m: { kind: MilestoneKind; label: string | null; date: PartialDate; anniversary?: boolean },
) {
  const anniversary = m.anniversary ?? defaultAnniversary[m.kind];
  let importantDateId: string | null = null;
  if (anniversary) {
    const [d] = await tx
      .insert(importantDates)
      .values({
        tenantId: p.tenantId,
        contactId: p.contactId,
        type: "anniversary",
        label: anniversaryName(m),
        year: m.date.year ?? null,
        month: m.date.month,
        day: m.date.day,
      })
      .returning({ id: importantDates.id });
    importantDateId = d!.id;
  }
  const [row] = await tx
    .insert(partnershipMilestones)
    .values({
      tenantId: p.tenantId,
      partnershipId: p.partnershipId,
      kind: m.kind,
      label: m.label,
      year: m.date.year ?? null,
      month: m.date.month,
      day: m.date.day,
      importantDateId,
    })
    .returning({ id: partnershipMilestones.id });
  // Undated-year milestones go on the timeline today; dated ones on the day they happened.
  const occurredAt = m.date.year ? dateToInstant({ year: m.date.year, month: m.date.month, day: m.date.day }) : new Date();
  await recordTimeline(tx, [
    {
      tenantId: p.tenantId,
      contactId: p.contactId,
      kind: "milestone",
      occurredAt,
      title: m.kind === "custom" && m.label ? m.label : milestoneLabels[m.kind],
      body: formatPartialDate(m.date),
      refId: row!.id,
    },
  ]);
  return row!.id;
}

/** Remove the anniversaries a partnership feeds into reminders, e.g. when it ends. */
export async function dropAnniversaries(tx: Tx, partnershipId: string) {
  const linked = await tx
    .select({ id: partnershipMilestones.importantDateId })
    .from(partnershipMilestones)
    .where(and(eq(partnershipMilestones.partnershipId, partnershipId), sql`${partnershipMilestones.importantDateId} is not null`));
  const ids = linked.map((l) => l.id!);
  if (ids.length) await tx.delete(importantDates).where(inArray(importantDates.id, ids));
}

function toMilestone(r: typeof partnershipMilestones.$inferSelect) {
  return {
    id: r.id,
    kind: r.kind,
    label: r.label,
    date: { year: r.year, month: r.month, day: r.day },
    anniversary: r.importantDateId != null,
  };
}

/** Everything on the partner profile. */
export async function getPartnerProfile(tx: Tx, contactId: string, timeZone: string) {
  const partnership = await partnershipFor(tx, contactId);
  if (!partnership) return null;
  const today = todayIn(timeZone);

  const milestoneRows = await tx
    .select()
    .from(partnershipMilestones)
    .where(eq(partnershipMilestones.partnershipId, partnership.id))
    .orderBy(asc(partnershipMilestones.year), asc(partnershipMilestones.month), asc(partnershipMilestones.day));
  const milestones = milestoneRows.map(toMilestone);

  const dates = await tx
    .select()
    .from(dateNights)
    .where(eq(dateNights.partnershipId, partnership.id))
    .orderBy(desc(dateNights.occurredOn), desc(dateNights.createdAt))
    .limit(30);

  const partnerFacts = await tx
    .select({ id: facts.id, category: facts.category, label: facts.label, value: facts.value })
    .from(facts)
    .where(and(eq(facts.contactId, contactId), isNull(facts.archivedAt), inArray(facts.category, [...partnerFactCategories])))
    .orderBy(asc(facts.createdAt));

  const start = relationshipStart(milestones);
  const last = dates[0] ? parseIsoDate(dates[0].occurredOn) : null;
  return {
    partnership,
    milestones,
    dates,
    facts: partnerFacts,
    together: start ? formatDuration(start, today) : null,
    nextAnniversary: nextAnniversary(milestones, today),
    dateNight: dateNightDue(partnership.dateCadenceDays, last, todayIn(timeZone, partnership.createdAt), today),
  };
}

export type PartnerProfile = NonNullable<Awaited<ReturnType<typeof getPartnerProfile>>>;

/** Compact summaries of current partners for the dashboard. */
export async function partnerCards(tx: Tx, timeZone: string) {
  const current = await currentPartners(tx);
  const cards = [];
  for (const p of current) {
    const profile = await getPartnerProfile(tx, p.contactId, timeZone);
    if (!profile) continue;
    cards.push({
      contactId: p.contactId,
      name: fullName(p),
      firstName: p.firstName,
      avatarRef: p.avatarRef,
      label: profile.partnership.label,
      together: profile.together,
      nextAnniversary: profile.nextAnniversary,
      dateNight: profile.dateNight,
      cadence: profile.partnership.dateCadenceDays,
      followUp: profile.facts.find((f) => f.category === "follow_up")?.value ?? null,
      wish: profile.facts.find((f) => f.category === "wishlist")?.value ?? null,
    });
  }
  return cards;
}
