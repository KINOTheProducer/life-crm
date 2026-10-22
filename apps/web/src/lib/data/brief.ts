import "server-only";
import { interactionTypeLabels, type InteractionType } from "@life-crm/core";
import { and, desc, eq, gte, schema, type Tx } from "@life-crm/db";

const { interactionPeople, interactions, lifeEvents } = schema;

/** The last few catch-ups with someone, newest first. */
export async function recentInteractions(tx: Tx, contactId: string, limit = 3) {
  const rows = await tx
    .select({ id: interactions.id, type: interactions.type, occurredAt: interactions.occurredAt, location: interactions.location, summary: interactions.summary })
    .from(interactions)
    .innerJoin(interactionPeople, eq(interactionPeople.interactionId, interactions.id))
    .where(eq(interactionPeople.contactId, contactId))
    .orderBy(desc(interactions.occurredAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, typeLabel: interactionTypeLabels[r.type as InteractionType] }));
}

/** Life events from the past year, the things worth asking about. */
export async function recentLifeEvents(tx: Tx, contactId: string) {
  const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  return tx
    .select({ id: lifeEvents.id, type: lifeEvents.type, title: lifeEvents.title, occurredOn: lifeEvents.occurredOn, isSensitive: lifeEvents.isSensitive })
    .from(lifeEvents)
    .where(and(eq(lifeEvents.contactId, contactId), gte(lifeEvents.occurredOn, yearAgo)))
    .orderBy(desc(lifeEvents.occurredOn));
}
