import "server-only";
import { timelineKinds, type TimelineKind } from "@life-crm/db/schema";
import { and, asc, eq, inArray, isNull, schema, type Tx } from "@life-crm/db";
import { fullName } from "./contacts";
import { listTimeline } from "./timeline";

const { contacts, facts, importantDates } = schema;

export function parseKinds(value: string | string[] | undefined): TimelineKind[] {
  const raw = typeof value === "string" ? value.split(",") : [];
  return raw.filter((k): k is TimelineKind => (timelineKinds as readonly string[]).includes(k));
}

export async function getProfile(tx: Tx, contactId: string, options: { kinds: TimelineKind[]; before?: string }) {
  const [contact] = await tx
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)));
  if (!contact) return null;

  const [birthday] = await tx
    .select({ id: importantDates.id, year: importantDates.year, month: importantDates.month, day: importantDates.day })
    .from(importantDates)
    .where(and(eq(importantDates.contactId, contactId), eq(importantDates.type, "birthday")));

  const knownFacts = await tx
    .select({ id: facts.id, category: facts.category, label: facts.label, value: facts.value, createdAt: facts.createdAt })
    .from(facts)
    .where(and(eq(facts.contactId, contactId), isNull(facts.archivedAt)))
    .orderBy(asc(facts.createdAt));

  const timeline = await listTimeline(tx, contactId, options);

  // Names of other people mentioned in interaction entries.
  const otherIds = [
    ...new Set(
      timeline.entries.flatMap((e) => ((e.data as { with?: string[] } | null)?.with ?? []).filter((id) => id !== contactId)),
    ),
  ];
  const others = otherIds.length
    ? await tx
        .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
        .from(contacts)
        .where(inArray(contacts.id, otherIds))
    : [];

  return {
    contact,
    name: fullName(contact),
    birthday: birthday ?? null,
    facts: knownFacts,
    timeline,
    names: Object.fromEntries(others.map((o) => [o.id, fullName(o)])) as Record<string, string>,
  };
}

export type Profile = NonNullable<Awaited<ReturnType<typeof getProfile>>>;
