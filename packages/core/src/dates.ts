/** A calendar date with no time or zone. Year is optional for dates like birthdays with unknown year. */
export interface PartialDate {
  year?: number | null;
  month: number; // 1-12
  day: number; // 1-31
}

export interface PlainDate {
  year: number;
  month: number;
  day: number;
}

/** How Feb 29 dates are observed in non-leap years. */
export type LeapDayRule = "feb28" | "mar1";

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function compareDates(a: PlainDate, b: PlainDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** The date a recurring month/day falls on in a given year. */
export function observedInYear(date: PartialDate, year: number, rule: LeapDayRule = "feb28"): PlainDate {
  if (date.month === 2 && date.day === 29 && !isLeapYear(year)) {
    return rule === "feb28" ? { year, month: 2, day: 28 } : { year, month: 3, day: 1 };
  }
  return { year, month: date.month, day: date.day };
}

/** Next occurrence of a recurring date on or after `from`. */
export function nextOccurrence(date: PartialDate, from: PlainDate, rule: LeapDayRule = "feb28"): PlainDate {
  const thisYear = observedInYear(date, from.year, rule);
  return compareDates(thisYear, from) >= 0 ? thisYear : observedInYear(date, from.year + 1, rule);
}

/** Whole days from `a` to `b` (negative if b is earlier). */
export function daysBetween(a: PlainDate, b: PlainDate): number {
  const ms = Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / 86_400_000);
}

export function addDays(d: PlainDate, days: number): PlainDate {
  const dt = new Date(Date.UTC(d.year, d.month - 1, d.day + days));
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

/** Age reached on `on`, or null if birth year is unknown. */
export function ageOn(birth: PartialDate, on: PlainDate): number | null {
  if (birth.year == null) return null;
  const hadBirthday = on.month > birth.month || (on.month === birth.month && on.day >= birth.day);
  return on.year - birth.year - (hadBirthday ? 0 : 1);
}

/** Today's date in an IANA time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): PlainDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export interface UpcomingDate {
  date: PlainDate;
  daysAway: number;
  /** Age turned on that date, when birth year is known. */
  turning: number | null;
}

export function upcoming(date: PartialDate, from: PlainDate, rule: LeapDayRule = "feb28"): UpcomingDate {
  const next = nextOccurrence(date, from, rule);
  return {
    date: next,
    daysAway: daysBetween(from, next),
    turning: date.year == null ? null : next.year - date.year,
  };
}

export function isValidPartialDate(d: PartialDate): boolean {
  if (!Number.isInteger(d.month) || d.month < 1 || d.month > 12) return false;
  // Unknown year: allow Feb 29 by checking against a leap year.
  const max = daysInMonth(d.year ?? 2000, d.month);
  return Number.isInteger(d.day) && d.day >= 1 && d.day <= max;
}
