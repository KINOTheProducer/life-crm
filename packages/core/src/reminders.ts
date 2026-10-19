import {
  addDays,
  addMonths,
  compareDates,
  daysBetween,
  formatIsoDate,
  upcoming,
  type LeapDayRule,
  type PartialDate,
  type PlainDate,
} from "./dates";

/**
 * Reminder engine. Pure: given today's date and what we know, return the reminders that
 * should exist today. Each has a stable key so the caller can insert idempotently and never
 * send the same reminder twice, even if the job runs many times or is down for a few days.
 */

export const importantDateTypes = ["birthday", "anniversary", "memorial", "graduation", "due_date", "custom"] as const;
export type ImportantDateType = (typeof importantDateTypes)[number];

export const repeatRules = ["none", "weekly", "monthly", "yearly"] as const;
export type RepeatRule = (typeof repeatRules)[number];

export interface DateSource {
  id: string;
  contactId: string;
  contactName: string;
  type: ImportantDateType;
  label: string | null;
  date: PartialDate;
}

export interface CheckinSource {
  contactId: string;
  contactName: string;
  cadenceDays: number;
  /** Last catch-up, or null if none logged. */
  lastInteraction: PlainDate | null;
  /** When the person was added; the clock starts here if there's no catch-up yet. */
  addedOn: PlainDate;
}

export interface CustomSource {
  id: string;
  contactId: string | null;
  contactName: string | null;
  title: string;
  dueOn: PlainDate;
  repeat: RepeatRule;
}

export interface ReminderSettings {
  /** Days before a date to remind, e.g. [14, 3, 0]. */
  leadDays: number[];
  leapDayRule?: LeapDayRule;
}

export const defaultReminderSettings: ReminderSettings = { leadDays: [14, 3, 0] };

export type ReminderKind = "date" | "checkin" | "custom";

export interface DueReminder {
  key: string;
  kind: ReminderKind;
  contactId: string | null;
  title: string;
  body: string | null;
  /** The day the reminder is about (the birthday itself, the check-in due date, the custom due date). */
  dueOn: PlainDate;
  /** Earlier reminders for the same occurrence whose key starts with this are now outdated. */
  supersedes: string | null;
  sourceId: string;
}

const weekday = new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

function formatLong(d: PlainDate) {
  return weekday.format(new Date(Date.UTC(d.year, d.month - 1, d.day)));
}

function possessive(name: string) {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

function whenPhrase(daysAway: number) {
  if (daysAway === 0) return "today";
  if (daysAway === 1) return "tomorrow";
  return `in ${daysAway} days`;
}

function dateTitle(src: DateSource, daysAway: number, turning: number | null) {
  const when = whenPhrase(daysAway);
  switch (src.type) {
    case "birthday":
      return `${possessive(src.contactName)} birthday is ${when}`;
    case "anniversary":
      return `${possessive(src.contactName)} ${src.label ?? "anniversary"} is ${when}`;
    case "memorial":
      return daysAway === 0 ? `Remembering ${src.contactName} today` : `Remembering ${src.contactName} ${when}`;
    default:
      return `${possessive(src.contactName)} ${src.label ?? src.type.replace("_", " ")} is ${when}`;
  }
}

function dateReminder(src: DateSource, today: PlainDate, settings: ReminderSettings): DueReminder | null {
  const next = upcoming(src.date, today, settings.leapDayRule);
  const leads = [...new Set(settings.leadDays)].filter((l) => l >= 0).sort((a, b) => a - b);
  // The most specific tier reached: at 10 days away with tiers [0, 3, 14] that's 14.
  const tier = leads.find((l) => next.daysAway <= l);
  if (tier === undefined) return null;

  const occurrence = `date:${src.id}:${formatIsoDate(next.date)}`;
  const showAge = src.type === "birthday" || src.type === "anniversary";
  const turning = showAge ? next.turning : null;
  const body = [formatLong(next.date), turning != null && turning > 0 ? (src.type === "birthday" ? `turning ${turning}` : `${turning} years`) : null]
    .filter(Boolean)
    .join(" · ");

  return {
    key: `${occurrence}:${tier}`,
    kind: "date",
    contactId: src.contactId,
    title: dateTitle(src, next.daysAway, turning),
    body,
    dueOn: next.date,
    supersedes: `${occurrence}:`,
    sourceId: src.id,
  };
}

function checkinReminder(src: CheckinSource, today: PlainDate): DueReminder | null {
  if (src.cadenceDays <= 0) return null;
  const from = src.lastInteraction ?? src.addedOn;
  const due = addDays(from, src.cadenceDays);
  if (compareDates(today, due) < 0) return null;
  const since = daysBetween(from, today);
  return {
    key: `checkin:${src.contactId}:${formatIsoDate(due)}`,
    kind: "checkin",
    contactId: src.contactId,
    title: `Time to catch up with ${src.contactName}`,
    body: src.lastInteraction ? `Last caught up ${since} days ago` : `No catch-ups logged since you added them ${since} days ago`,
    dueOn: due,
    // A newer due date (after a catch-up) replaces any open nudge for this person.
    supersedes: `checkin:${src.contactId}:`,
    sourceId: src.contactId,
  };
}

function customReminder(src: CustomSource, today: PlainDate): DueReminder | null {
  if (compareDates(today, src.dueOn) < 0) return null;
  return {
    key: `custom:${src.id}:${formatIsoDate(src.dueOn)}`,
    kind: "custom",
    contactId: src.contactId,
    title: src.title,
    body: src.contactName ? `About ${src.contactName}` : null,
    dueOn: src.dueOn,
    supersedes: null,
    sourceId: src.id,
  };
}

/** Next due date of a repeating reminder after `dueOn`, strictly after `today`. Null when it doesn't repeat. */
export function nextDueDate(dueOn: PlainDate, repeat: RepeatRule, today: PlainDate): PlainDate | null {
  if (repeat === "none") return null;
  let next = dueOn;
  let steps = 0;
  // Skip occurrences missed while the job wasn't running.
  while (compareDates(next, today) <= 0) {
    steps += 1;
    next =
      repeat === "weekly"
        ? addDays(dueOn, 7 * steps)
        : repeat === "monthly"
          ? addMonths(dueOn, steps)
          : addMonths(dueOn, 12 * steps);
  }
  return next;
}

export function dueReminders(
  today: PlainDate,
  sources: { dates: DateSource[]; checkins: CheckinSource[]; custom: CustomSource[] },
  settings: ReminderSettings = defaultReminderSettings,
): DueReminder[] {
  return [
    ...sources.dates.map((d) => dateReminder(d, today, settings)),
    ...sources.checkins.map((c) => checkinReminder(c, today)),
    ...sources.custom.map((c) => customReminder(c, today)),
  ].filter((r): r is DueReminder => r !== null);
}
