import "server-only";
import { todayIn, upcoming, type UpcomingDate } from "@life-crm/core";
import { and, asc, eq, isNull, schema } from "@life-crm/db";

import { tenantQuery } from "@/lib/session";

const { contacts, importantDates } = schema;

export async function listPeople() {
  return tenantQuery((tx) =>
    tx
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        nickname: contacts.nickname,
        closeness: contacts.closeness,
        lastInteractionAt: contacts.lastInteractionAt,
      })
      .from(contacts)
      .where(isNull(contacts.deletedAt))
      .orderBy(asc(contacts.firstName), asc(contacts.lastName)),
  );
}

export interface UpcomingBirthday extends UpcomingDate {
  contactId: string;
  name: string;
}

/** Birthdays in the next `days` days, soonest first, in the user's time zone. */
export async function upcomingBirthdays(days: number): Promise<UpcomingBirthday[]> {
  return tenantQuery(async (tx, user) => {
    const rows = await tx
      .select({
        contactId: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        year: importantDates.year,
        month: importantDates.month,
        day: importantDates.day,
      })
      .from(importantDates)
      .innerJoin(contacts, eq(contacts.id, importantDates.contactId))
      .where(and(eq(importantDates.type, "birthday"), isNull(contacts.deletedAt)));

    const today = todayIn(user.timeZone);
    return rows
      .map((r) => ({
        contactId: r.contactId,
        name: [r.firstName, r.lastName].filter(Boolean).join(" "),
        ...upcoming({ year: r.year, month: r.month, day: r.day }, today),
      }))
      .filter((b) => b.daysAway <= days)
      .sort((a, b) => a.daysAway - b.daysAway);
  });
}
