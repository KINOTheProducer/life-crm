import {
  dueReminders,
  formatIsoDate,
  nextDueDate,
  parseIsoDate,
  todayIn,
  type CheckinSource,
  type CustomSource,
  type DateSource,
  type ImportantDateType,
} from "@life-crm/core";
import { and, eq, inArray, isNull, lte, ne, schema, sql, withTenant, type Db, type Tx } from "@life-crm/db";
import { digestEmail } from "./email-template";
import type { Mailer } from "./mailer";
import type { PushSender } from "./push";

const { contacts, importantDates, notifications, partnershipMilestones, pushSubscriptions, reminders, user } = schema;

export interface RunDeps {
  mailer: Mailer | null;
  push: PushSender | null;
  appUrl: string;
  now?: Date;
  /** Limit the run to these users (tests). */
  onlyUserIds?: string[];
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  tenantId: string | null;
  timeZone: string;
  digestHour: number;
  emailDigest: boolean;
  reminderLeadDays: number[];
}

function localHour(timeZone: string, now: Date) {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now));
}

const fullName = (c: { firstName: string; lastName: string | null }) => [c.firstName, c.lastName].filter(Boolean).join(" ");

async function loadSources(tx: Tx, userId: string, timeZone: string) {
  const dateRows = await tx
    .select({
      id: importantDates.id,
      type: importantDates.type,
      label: importantDates.label,
      year: importantDates.year,
      month: importantDates.month,
      day: importantDates.day,
      contactId: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      milestoneId: partnershipMilestones.id,
    })
    .from(importantDates)
    .innerJoin(contacts, eq(contacts.id, importantDates.contactId))
    .leftJoin(partnershipMilestones, eq(partnershipMilestones.importantDateId, importantDates.id))
    .where(isNull(contacts.deletedAt));

  const people = await tx
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      keepInTouchDays: contacts.keepInTouchDays,
      lastInteractionAt: contacts.lastInteractionAt,
      createdAt: contacts.createdAt,
    })
    .from(contacts)
    .where(isNull(contacts.deletedAt));
  const nameById = new Map(people.map((p) => [p.id, fullName(p)]));

  const custom = await tx
    .select()
    .from(reminders)
    .where(and(eq(reminders.userId, userId), isNull(reminders.archivedAt)));

  const dates: DateSource[] = dateRows.map((r) => ({
    id: r.id,
    contactId: r.contactId,
    contactName: r.firstName,
    type: r.type as ImportantDateType,
    label: r.label,
    date: { year: r.year, month: r.month, day: r.day },
    withYou: r.milestoneId != null,
  }));
  const checkins: CheckinSource[] = people
    .filter((p) => p.keepInTouchDays && p.keepInTouchDays > 0)
    .map((p) => ({
      contactId: p.id,
      contactName: p.firstName,
      cadenceDays: p.keepInTouchDays!,
      lastInteraction: p.lastInteractionAt ? todayIn(timeZone, p.lastInteractionAt) : null,
      addedOn: todayIn(timeZone, p.createdAt),
    }));
  const customSources: CustomSource[] = custom.map((r) => ({
    id: r.id,
    contactId: r.contactId,
    contactName: r.contactId ? (nameById.get(r.contactId) ?? null) : null,
    title: r.title,
    dueOn: parseIsoDate(r.dueOn),
    repeat: r.repeat,
  }));
  return { dates, checkins, custom: customSources, customRows: custom };
}

/**
 * Create today's reminders for one user. Idempotent: notification keys are unique per user,
 * so running twice inserts nothing new. Returns how many new notifications were created.
 */
export async function generateReminders(tx: Tx, u: UserRow & { tenantId: string }, now: Date): Promise<number> {
  const today = todayIn(u.timeZone, now);
  const todayIso = formatIsoDate(today);
  const sources = await loadSources(tx, u.id, u.timeZone);
  const due = dueReminders(today, sources, { leadDays: u.reminderLeadDays });

  let created = 0;
  for (const r of due) {
    const [row] = await tx
      .insert(notifications)
      .values({
        tenantId: u.tenantId,
        userId: u.id,
        key: r.key,
        kind: r.kind,
        contactId: r.contactId,
        title: r.title,
        body: r.body,
        dueOn: formatIsoDate(r.dueOn),
      })
      .onConflictDoNothing({ target: [notifications.userId, notifications.key] })
      .returning({ id: notifications.id });
    if (!row) continue;
    created += 1;
    if (r.supersedes) {
      // e.g. the 3-days-before birthday reminder replaces the 14-days-before one.
      await tx
        .update(notifications)
        .set({ status: "superseded", resolvedAt: now })
        .where(
          and(
            eq(notifications.userId, u.id),
            eq(notifications.status, "open"),
            ne(notifications.key, r.key),
            sql`starts_with(${notifications.key}, ${r.supersedes})`,
          ),
        );
    }
  }

  // Advance repeating custom reminders, archive one-offs that fired.
  const fired = new Set(due.filter((r) => r.kind === "custom").map((r) => r.sourceId));
  for (const row of sources.customRows.filter((r) => fired.has(r.id))) {
    const next = nextDueDate(parseIsoDate(row.dueOn), row.repeat, today);
    await tx
      .update(reminders)
      .set(next ? { dueOn: formatIsoDate(next) } : { archivedAt: now })
      .where(eq(reminders.id, row.id));
  }

  // Snoozed reminders whose snooze is over come back (and get delivered again).
  await tx
    .update(notifications)
    .set({ snoozedUntil: null, pushedAt: null, emailedAt: null })
    .where(and(eq(notifications.userId, u.id), eq(notifications.status, "open"), lte(notifications.snoozedUntil, todayIso)));

  return created;
}

/** Send anything open and not yet delivered: one digest email, one push per reminder. */
export async function deliverReminders(tx: Tx, u: UserRow, deps: RunDeps, now: Date) {
  const pending = await tx
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, u.id), eq(notifications.status, "open"), isNull(notifications.snoozedUntil)));
  const url = (n: { contactId: string | null }) => (n.contactId ? `${deps.appUrl}/people/${n.contactId}` : `${deps.appUrl}/reminders`);

  const toPush = pending.filter((n) => !n.pushedAt);
  if (deps.push && toPush.length > 0) {
    const subs = await tx.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, u.id));
    if (subs.length > 0) {
      const gone = new Set<string>();
      for (const n of toPush) {
        for (const s of subs) {
          if (gone.has(s.id)) continue;
          const result = await deps.push.send(s, { title: n.title, body: n.body, url: url(n), tag: n.key });
          if (result === "gone") gone.add(s.id);
        }
      }
      if (gone.size) await tx.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, [...gone]));
      await tx.update(notifications).set({ pushedAt: now }).where(inArray(notifications.id, toPush.map((n) => n.id)));
    }
  }

  const toEmail = pending.filter((n) => !n.emailedAt);
  if (deps.mailer && u.emailDigest && toEmail.length > 0) {
    const items = toEmail
      .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
      .map((n) => ({ title: n.title, body: n.body, url: url(n) }));
    await deps.mailer.send(digestEmail(u.email, u.name, items, deps.appUrl, localHour(u.timeZone, now)));
    await tx.update(notifications).set({ emailedAt: now }).where(inArray(notifications.id, toEmail.map((n) => n.id)));
  }
}

const userColumns = {
  id: user.id,
  name: user.name,
  email: user.email,
  tenantId: user.tenantId,
  timeZone: user.timeZone,
  digestHour: user.digestHour,
  emailDigest: user.emailDigest,
  reminderLeadDays: user.reminderLeadDays,
};

/**
 * The daily pass for every user whose local digest hour has arrived and who hasn't had
 * today's pass. Safe to call every few minutes from any number of workers: each user's day
 * is claimed with a conditional update before any work happens.
 */
export async function runDueUsers(db: Db, deps: RunDeps): Promise<{ users: number; created: number }> {
  const now = deps.now ?? new Date();
  const nowIso = now.toISOString();
  const localNow = sql`(${nowIso}::timestamptz at time zone ${user.timeZone})`;
  const candidates = await db
    .select(userColumns)
    .from(user)
    .where(
      and(
        sql`${user.tenantId} is not null`,
        deps.onlyUserIds ? inArray(user.id, deps.onlyUserIds) : undefined,
        sql`extract(hour from ${localNow}) >= ${user.digestHour}`,
        sql`coalesce(${user.lastReminderRunOn}, '1900-01-01'::date) < (${localNow})::date`,
      ),
    );

  let users = 0;
  let created = 0;
  for (const u of candidates) {
    const today = formatIsoDate(todayIn(u.timeZone, now));
    const [claimed] = await db
      .update(user)
      .set({ lastReminderRunOn: today })
      .where(and(eq(user.id, u.id), sql`coalesce(${user.lastReminderRunOn}, '1900-01-01'::date) < ${today}::date`))
      .returning({ id: user.id });
    if (!claimed) continue;
    try {
      created += await runForUser(db, { ...u, tenantId: u.tenantId! }, deps, now);
      users += 1;
    } catch (error) {
      console.error(`Reminder run failed for user ${u.id}`, error);
    }
  }
  return { users, created };
}

export async function runForUser(db: Db, u: UserRow & { tenantId: string }, deps: RunDeps, now = deps.now ?? new Date()) {
  const created = await withTenant(db, u.tenantId, (tx) => generateReminders(tx, u, now));
  await withTenant(db, u.tenantId, (tx) => deliverReminders(tx, u, deps, now));
  return created;
}

export async function loadUser(db: Db, userId: string) {
  const [u] = await db.select(userColumns).from(user).where(eq(user.id, userId));
  return u ?? null;
}
