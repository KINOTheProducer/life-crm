import "server-only";
import type { FactCategory, InteractionType } from "@life-crm/core";
import { and, eq, inArray, schema, sql, type Tx } from "@life-crm/db";
import { dateToInstant, parseIsoDate } from "./dates";
import { resolveCheckins } from "./reminders";
import { recordTimeline } from "./timeline";

const { contacts, dateNights, facts, interactionPeople, interactions, notes, timelineEntries } = schema;

export async function insertNote(tx: Tx, tenantId: string, contactId: string, body: string) {
  const [note] = await tx.insert(notes).values({ tenantId, contactId, body }).returning({ id: notes.id, createdAt: notes.createdAt });
  await recordTimeline(tx, [{ tenantId, contactId, kind: "note", occurredAt: note!.createdAt, title: "Note", body, refId: note!.id }]);
}

export async function insertFact(tx: Tx, tenantId: string, contactId: string, fact: { category: FactCategory; label: string; value: string }) {
  const [row] = await tx
    .insert(facts)
    .values({ tenantId, contactId, ...fact })
    .returning({ id: facts.id, createdAt: facts.createdAt });
  await recordTimeline(tx, [
    {
      tenantId,
      contactId,
      kind: "fact",
      occurredAt: row!.createdAt,
      title: fact.label,
      body: fact.value,
      refId: row!.id,
      data: { category: fact.category },
    },
  ]);
}

/** A catch-up with one person on a YYYY-MM-DD date, which also counts as keeping in touch. */
export async function insertInteraction(
  tx: Tx,
  tenantId: string,
  contactId: string,
  input: { type: InteractionType; date: string; location: string | null; summary: string },
) {
  const occurredAt = dateToInstant(parseIsoDate(input.date));
  const [row] = await tx
    .insert(interactions)
    .values({ tenantId, ...input, occurredAt })
    .returning({ id: interactions.id });
  await tx.insert(interactionPeople).values({ tenantId, interactionId: row!.id, contactId });
  await tx
    .update(contacts)
    .set({ lastInteractionAt: sql`greatest(${contacts.lastInteractionAt}, ${occurredAt.toISOString()}::timestamptz)` })
    .where(eq(contacts.id, contactId));
  await resolveCheckins(tx, [contactId]);
  await recordTimeline(tx, [
    {
      tenantId,
      contactId,
      kind: "interaction",
      occurredAt,
      title: input.type,
      body: input.summary,
      refId: row!.id,
      data: { location: input.location, with: [] },
    },
  ]);
}

/** Set people's last catch-up from what's left after one was moved or removed. */
export async function refreshLastInteraction(tx: Tx, contactIds: string[]) {
  if (contactIds.length === 0) return;
  await tx
    .update(contacts)
    .set({
      lastInteractionAt: sql`(
        select max(${interactions.occurredAt}) from ${interactions}
        join ${interactionPeople} on ${interactionPeople.interactionId} = ${interactions.id}
        where ${interactionPeople.contactId} = ${contacts.id}
      )`,
    })
    .where(inArray(contacts.id, contactIds));
}

async function participantsOf(tx: Tx, interactionId: string) {
  const rows = await tx
    .select({ contactId: interactionPeople.contactId })
    .from(interactionPeople)
    .where(eq(interactionPeople.interactionId, interactionId));
  return rows.map((r) => r.contactId);
}

/** Change a logged catch-up, and the timeline entry on everyone who was there. Returns their ids, or null if it's gone. */
export async function updateInteraction(
  tx: Tx,
  interactionId: string,
  input: { type: InteractionType; date: string; location: string | null; summary: string },
): Promise<string[] | null> {
  const occurredAt = dateToInstant(parseIsoDate(input.date));
  const [row] = await tx
    .update(interactions)
    .set({ type: input.type, occurredAt, location: input.location, summary: input.summary })
    .where(eq(interactions.id, interactionId))
    .returning({ id: interactions.id });
  if (!row) return null;
  await tx
    .update(timelineEntries)
    .set({
      occurredAt,
      title: input.type,
      body: input.summary,
      data: sql`jsonb_set(coalesce(${timelineEntries.data}, '{}'::jsonb), '{location}', ${JSON.stringify(input.location)}::jsonb)`,
    })
    .where(and(eq(timelineEntries.refId, interactionId), eq(timelineEntries.kind, "interaction")));
  // Keep a date night's own record in step.
  await tx.update(dateNights).set({ occurredOn: input.date, place: input.location }).where(eq(dateNights.interactionId, interactionId));
  const people = await participantsOf(tx, interactionId);
  await refreshLastInteraction(tx, people);
  return people;
}

/** Remove a logged catch-up from everyone's timeline. Returns who was there. */
export async function deleteInteraction(tx: Tx, interactionId: string): Promise<string[]> {
  const people = await participantsOf(tx, interactionId);
  await tx.delete(timelineEntries).where(and(eq(timelineEntries.refId, interactionId), eq(timelineEntries.kind, "interaction")));
  await tx.delete(dateNights).where(eq(dateNights.interactionId, interactionId));
  await tx.delete(interactions).where(eq(interactions.id, interactionId));
  await refreshLastInteraction(tx, people);
  return people;
}
