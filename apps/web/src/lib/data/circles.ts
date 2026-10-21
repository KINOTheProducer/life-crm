import "server-only";
import type { CircleTone, InteractionType } from "@life-crm/core";
import { and, asc, eq, inArray, isNull, schema, sql, type Tx } from "@life-crm/db";
import { fullName } from "./contacts";
import { dateToInstant, parseIsoDate } from "./dates";
import { resolveCheckins } from "./reminders";
import { recordTimeline } from "./timeline";

const { circleMembers, circles, contacts, interactionPeople, interactions } = schema;

export type CircleSummary = Awaited<ReturnType<typeof listCircles>>[number];

/** Every circle with its living members, biggest first. */
export async function listCircles(tx: Tx) {
  const rows = await tx.select().from(circles).orderBy(asc(circles.name));
  const members = await circleMembersOf(tx, rows.map((r) => r.id));
  return rows
    .map((c) => ({ ...c, members: members.filter((m) => m.circleId === c.id) }))
    .sort((a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name));
}

async function circleMembersOf(tx: Tx, circleIds: string[]) {
  if (circleIds.length === 0) return [];
  const rows = await tx
    .select({
      circleId: circleMembers.circleId,
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      avatarRef: contacts.avatarRef,
      lastInteractionAt: contacts.lastInteractionAt,
      keepInTouchDays: contacts.keepInTouchDays,
    })
    .from(circleMembers)
    .innerJoin(contacts, eq(contacts.id, circleMembers.contactId))
    .where(and(inArray(circleMembers.circleId, circleIds), isNull(contacts.deletedAt)))
    .orderBy(asc(contacts.firstName), asc(contacts.lastName));
  return rows.map((r) => ({ ...r, name: fullName(r) }));
}

export async function getCircle(tx: Tx, id: string) {
  const [circle] = await tx.select().from(circles).where(eq(circles.id, id));
  if (!circle) return null;
  return { ...circle, members: await circleMembersOf(tx, [id]) };
}

/** The circles one person is in. */
export async function circlesOf(tx: Tx, contactId: string) {
  return tx
    .select({ id: circles.id, name: circles.name, tone: circles.tone })
    .from(circleMembers)
    .innerJoin(circles, eq(circles.id, circleMembers.circleId))
    .where(eq(circleMembers.contactId, contactId))
    .orderBy(asc(circles.name));
}

export async function circleOptions(tx: Tx) {
  return tx.select({ id: circles.id, name: circles.name, tone: circles.tone }).from(circles).orderBy(asc(circles.name));
}

export async function insertCircle(tx: Tx, tenantId: string, input: { name: string; tone: CircleTone; notes: string | null }) {
  const [row] = await tx.insert(circles).values({ tenantId, ...input }).onConflictDoNothing().returning({ id: circles.id });
  return row?.id ?? null;
}

/** Make the circle's members exactly `contactIds`, ignoring ids that aren't live people in this tenant. */
export async function setMembers(tx: Tx, tenantId: string, circleId: string, contactIds: string[]) {
  const live = contactIds.length
    ? await tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(inArray(contacts.id, contactIds), isNull(contacts.deletedAt)))
    : [];
  await tx.delete(circleMembers).where(eq(circleMembers.circleId, circleId));
  if (live.length) await tx.insert(circleMembers).values(live.map((c) => ({ tenantId, circleId, contactId: c.id })));
}

export async function addMember(tx: Tx, tenantId: string, circleId: string, contactId: string) {
  await tx.insert(circleMembers).values({ tenantId, circleId, contactId }).onConflictDoNothing();
}

export async function removeMember(tx: Tx, circleId: string, contactId: string) {
  await tx.delete(circleMembers).where(and(eq(circleMembers.circleId, circleId), eq(circleMembers.contactId, contactId)));
}

/**
 * One catch-up with several people at once (a group dinner): a single interaction linked to
 * everyone, which counts as keeping in touch with each of them.
 */
export async function insertGroupInteraction(
  tx: Tx,
  tenantId: string,
  contactIds: string[],
  input: { type: InteractionType; date: string; location: string | null; summary: string },
) {
  const occurredAt = dateToInstant(parseIsoDate(input.date));
  const [row] = await tx
    .insert(interactions)
    .values({ tenantId, ...input, occurredAt })
    .returning({ id: interactions.id });
  await tx.insert(interactionPeople).values(contactIds.map((contactId) => ({ tenantId, interactionId: row!.id, contactId })));
  await tx
    .update(contacts)
    .set({ lastInteractionAt: sql`greatest(${contacts.lastInteractionAt}, ${occurredAt.toISOString()}::timestamptz)` })
    .where(inArray(contacts.id, contactIds));
  await resolveCheckins(tx, contactIds);
  await recordTimeline(
    tx,
    contactIds.map((contactId) => ({
      tenantId,
      contactId,
      kind: "interaction" as const,
      occurredAt,
      title: input.type,
      body: input.summary,
      refId: row!.id,
      data: { location: input.location, with: contactIds },
    })),
  );
}
