import "server-only";
import { defaultCadenceDays, type ClosenessTier, type PartialDate } from "@life-crm/core";
import { and, asc, eq, isNull, schema, type Tx } from "@life-crm/db";
import { formatPartialDate } from "./dates";
import { recordTimeline } from "./timeline";

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
    .where(and(isNull(contacts.deletedAt), eq(contacts.isSelf, false)))
    .orderBy(asc(contacts.firstName), asc(contacts.lastName));
  return rows.map((r) => ({
    id: r.id,
    name: fullName(r),
    birthday: r.month && r.day ? { year: r.year, month: r.month, day: r.day } : null,
  }));
}

export interface NewContact {
  firstName: string;
  lastName?: string | null;
  nickname?: string | null;
  pronouns?: string | null;
  closeness: ClosenessTier;
  keepInTouchDays?: number | null;
  howMet?: string | null;
  relationship?: string | null;
  birthday?: PartialDate | null;
}

/** Create a person with their birthday and the matching timeline entries. */
export async function insertContact(tx: Tx, tenantId: string, input: NewContact) {
  const { birthday, ...fields } = input;
  const [contact] = await tx
    .insert(contacts)
    .values({ ...fields, tenantId, keepInTouchDays: fields.keepInTouchDays === undefined ? defaultCadenceDays[fields.closeness] : fields.keepInTouchDays })
    .returning({ id: contacts.id, createdAt: contacts.createdAt });
  await recordTimeline(tx, [
    { tenantId, contactId: contact!.id, kind: "created", occurredAt: contact!.createdAt, title: "Added", body: fields.howMet },
  ]);
  if (birthday) {
    await tx.insert(importantDates).values({
      tenantId,
      contactId: contact!.id,
      type: "birthday",
      year: birthday.year ?? null,
      month: birthday.month,
      day: birthday.day,
    });
    await recordTimeline(tx, [
      { tenantId, contactId: contact!.id, kind: "date", occurredAt: contact!.createdAt, title: "Birthday added", body: formatPartialDate(birthday) },
    ]);
  }
  return contact!.id;
}
