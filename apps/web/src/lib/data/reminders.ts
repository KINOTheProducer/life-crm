import "server-only";
import { formatIsoDate, todayIn } from "@life-crm/core";
import { and, asc, eq, inArray, isNull, or, schema, sql, type Tx } from "@life-crm/db";
import { fullName } from "./contacts";

const { contacts, notifications, reminders } = schema;

export type InboxItem = Awaited<ReturnType<typeof listInbox>>[number];

/** Open reminders, soonest first. Snoozed ones are hidden until their snooze date. */
export async function listInbox(tx: Tx, userId: string, timeZone: string, limit = 100) {
  const today = formatIsoDate(todayIn(timeZone));
  const rows = await tx
    .select({
      id: notifications.id,
      kind: notifications.kind,
      title: notifications.title,
      body: notifications.body,
      dueOn: notifications.dueOn,
      contactId: notifications.contactId,
      snoozedUntil: notifications.snoozedUntil,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.status, "open"),
        or(isNull(notifications.snoozedUntil), sql`${notifications.snoozedUntil} <= ${today}::date`),
      ),
    )
    .orderBy(asc(notifications.dueOn))
    .limit(limit);
  return rows.map((r) => ({ ...r, overdue: r.dueOn < today, today: r.dueOn === today }));
}

export async function countSnoozed(tx: Tx, userId: string, timeZone: string) {
  const today = formatIsoDate(todayIn(timeZone));
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.status, "open"), sql`${notifications.snoozedUntil} > ${today}::date`));
  return row?.n ?? 0;
}

/** Reminders the user set, optionally for one person. */
export async function listCustomReminders(tx: Tx, userId: string, contactId?: string) {
  const rows = await tx
    .select({
      id: reminders.id,
      title: reminders.title,
      dueOn: reminders.dueOn,
      repeat: reminders.repeat,
      contactId: reminders.contactId,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(reminders)
    .leftJoin(contacts, eq(contacts.id, reminders.contactId))
    .where(and(eq(reminders.userId, userId), isNull(reminders.archivedAt), contactId ? eq(reminders.contactId, contactId) : undefined))
    .orderBy(asc(reminders.dueOn));
  return rows.map((r) => ({ ...r, contactName: r.firstName ? fullName({ firstName: r.firstName, lastName: r.lastName }) : null }));
}

/** A catch-up answers any open "time to catch up" nudge for those people. */
export async function resolveCheckins(tx: Tx, contactIds: string[]) {
  if (contactIds.length === 0) return;
  await tx
    .update(notifications)
    .set({ status: "done", resolvedAt: new Date() })
    .where(and(eq(notifications.kind, "checkin"), eq(notifications.status, "open"), inArray(notifications.contactId, contactIds)));
}
