import "server-only";
import type { FactCategory, InteractionType } from "@life-crm/core";
import { eq, schema, sql, type Tx } from "@life-crm/db";
import { dateToInstant, parseIsoDate } from "./dates";
import { resolveCheckins } from "./reminders";
import { recordTimeline } from "./timeline";

const { contacts, facts, interactionPeople, interactions, notes } = schema;

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
