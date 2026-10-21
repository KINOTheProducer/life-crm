import "server-only";
import { lifeEventTypeLabels, lifeSpan, type ClosenessTier, type LifeEventType, type Span } from "@life-crm/core";
import { and, asc, eq, isNull, schema, sql, type Tx } from "@life-crm/db";
import { fullName } from "./contacts";
import { ensureSelf, loadFamily } from "./family";

const { circleMembers, contacts, eras, interactionPeople, interactions, lifeEvents } = schema;

export interface LifeRow extends Span {
  id: string;
  name: string;
  closeness: ClosenessTier;
  isFamily: boolean;
  circleIds: string[];
  /** Catch-ups per year. */
  contacts: Record<number, number>;
  events: { year: number; type: LifeEventType; label: string }[];
}

export async function listEras(tx: Tx) {
  return tx.select().from(eras).orderBy(asc(eras.startYear), asc(eras.label));
}

/** Everyone you know as a bar on a shared years axis, with catch-ups per year and life events. */
export async function lifeTimeline(tx: Tx, user: { tenantId: string; name: string }, currentYear: number) {
  const selfId = await ensureSelf(tx, user);
  const family = await loadFamily(tx, selfId);
  const selfBirthYear = family.people.get(selfId)?.birth?.year ?? null;

  const people = await tx
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      closeness: contacts.closeness,
      metYear: contacts.metYear,
      lostTouchYear: contacts.lostTouchYear,
      deathYear: contacts.deathYear,
      createdAt: contacts.createdAt,
    })
    .from(contacts)
    .where(and(isNull(contacts.deletedAt), eq(contacts.isSelf, false)));

  const year = sql<number>`extract(year from ${interactions.occurredAt} at time zone 'UTC')::int`;
  const counts = await tx
    .select({ contactId: interactionPeople.contactId, year, n: sql<number>`count(*)::int` })
    .from(interactionPeople)
    .innerJoin(interactions, eq(interactions.id, interactionPeople.interactionId))
    .groupBy(interactionPeople.contactId, year);

  const events = await tx
    .select({ contactId: lifeEvents.contactId, type: lifeEvents.type, title: lifeEvents.title, occurredOn: lifeEvents.occurredOn })
    .from(lifeEvents);
  const members = await tx.select({ contactId: circleMembers.contactId, circleId: circleMembers.circleId }).from(circleMembers);

  const rows: LifeRow[] = people.map((p) => {
    const perYear: Record<number, number> = {};
    for (const c of counts) if (c.contactId === p.id) perYear[c.year] = c.n;
    const years = Object.keys(perYear).map(Number);
    const tree = family.people.get(p.id);
    const span = lifeSpan(
      {
        metYear: p.metYear,
        familyBirthYear: tree?.birth?.year ?? null,
        isFamily: Boolean(tree),
        selfBirthYear,
        firstInteractionYear: years.length ? Math.min(...years) : null,
        addedYear: p.createdAt.getUTCFullYear(),
        lostTouchYear: p.lostTouchYear,
        deathYear: p.deathYear ?? tree?.deathYear ?? null,
      },
      currentYear,
    );
    return {
      ...span,
      id: p.id,
      name: fullName(p),
      closeness: p.closeness,
      isFamily: Boolean(tree),
      circleIds: members.filter((m) => m.contactId === p.id).map((m) => m.circleId),
      contacts: perYear,
      events: events
        .filter((e) => e.contactId === p.id)
        .map((e) => ({ year: Number(e.occurredOn.slice(0, 4)), type: e.type, label: e.title ?? lifeEventTypeLabels[e.type] })),
    };
  });

  return { rows: rows.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name)), selfBirthYear };
}
