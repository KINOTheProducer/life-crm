import "server-only";
import { and, asc, eq, isNull, schema, type Tx } from "@life-crm/db";

const { contacts, importantDates } = schema;

export function fullName(c: { firstName: string; lastName: string | null }) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ");
}

/** Every person with their birthday, for pickers. */
export async function contactOptions(tx: Tx) {
  const rows = await tx
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      year: importantDates.year,
      month: importantDates.month,
      day: importantDates.day,
    })
    .from(contacts)
    .leftJoin(importantDates, and(eq(importantDates.contactId, contacts.id), eq(importantDates.type, "birthday")))
    .where(isNull(contacts.deletedAt))
    .orderBy(asc(contacts.firstName), asc(contacts.lastName));
  return rows.map((r) => ({
    id: r.id,
    name: fullName(r),
    birthday: r.month && r.day ? { year: r.year, month: r.month, day: r.day } : null,
  }));
}
