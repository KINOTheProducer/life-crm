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
    .where(isNull(contacts.deletedAt))
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

export async function birthdayOf(tx: Tx, contactId: string) {
  const [row] = await tx
    .select({ id: importantDates.id, year: importantDates.year, month: importantDates.month, day: importantDates.day })
    .from(importantDates)
    .where(and(eq(importantDates.contactId, contactId), eq(importantDates.type, "birthday")));
  return row ?? null;
}

/** Add, change or clear someone's birthday, with a timeline entry when it changes. Returns whether anything changed. */
export async function setBirthday(tx: Tx, tenantId: string, contactId: string, birthday: PartialDate | null): Promise<boolean> {
  const existing = await birthdayOf(tx, contactId);
  const now = new Date();
  if (!birthday) {
    if (!existing) return false;
    await tx.delete(importantDates).where(eq(importantDates.id, existing.id));
    await recordTimeline(tx, [{ tenantId, contactId, kind: "date", occurredAt: now, title: "Birthday removed", body: formatPartialDate(existing) }]);
    return true;
  }
  const value = { year: birthday.year ?? null, month: birthday.month, day: birthday.day };
  if (existing && existing.year === value.year && existing.month === value.month && existing.day === value.day) return false;
  if (existing) await tx.update(importantDates).set(value).where(eq(importantDates.id, existing.id));
  else await tx.insert(importantDates).values({ tenantId, contactId, type: "birthday", ...value });
  await recordTimeline(tx, [
    { tenantId, contactId, kind: "date", occurredAt: now, title: existing ? "Birthday changed" : "Birthday added", body: formatPartialDate(birthday) },
  ]);
  return true;
}
