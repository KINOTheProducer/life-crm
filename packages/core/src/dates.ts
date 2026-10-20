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

/** Same day-of-month in a later month, clamped to the month's length (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(d: PlainDate, months: number): PlainDate {
  const index = d.year * 12 + (d.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return { year, month, day: Math.min(d.day, daysInMonth(year, month)) };
}

export function formatIsoDate(d: PlainDate): string {
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

export function parseIsoDate(s: string): PlainDate {
  const [year, month, day] = s.split("-").map(Number);
  return { year: year!, month: month!, day: day! };
}

const monthIndex: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const monthWord = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const dayWord = "(\\d{1,2})(?:st|nd|rd|th)?";
const yearWord = "(\\d{4})";

/**
 * A birthday stated in free text, like "Birthday: August 8, 1995", "bday is 8 Aug" or "born 1995-08-08".
 * Null unless the text mentions a birthday and holds exactly one real date. Numeric dates other than
 * ISO are skipped since 08/09 reads differently depending on who wrote it.
 */
export function birthdayInText(text: string): PartialDate | null {
  if (!/\b(birthday|b-?day|born)\b/i.test(text)) return null;
  const found: PartialDate[] = [];
  const patterns: [RegExp, (m: RegExpExecArray) => PartialDate][] = [
    [new RegExp(`\\b${monthWord}\\.?\\s+${dayWord}\\b(?:,?\\s+${yearWord}\\b)?`, "gi"), (m) => ({ month: monthIndex[m[1]!.slice(0, 3).toLowerCase()]!, day: Number(m[2]), year: m[3] ? Number(m[3]) : null })],
    [new RegExp(`\\b${dayWord}\\s+(?:of\\s+)?${monthWord}\\b\\.?(?:,?\\s+${yearWord}\\b)?`, "gi"), (m) => ({ month: monthIndex[m[2]!.slice(0, 3).toLowerCase()]!, day: Number(m[1]), year: m[3] ? Number(m[3]) : null })],
    [/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => ({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) })],
  ];
  for (const [re, toDate] of patterns) {
    for (const m of text.matchAll(re)) {
      const d = toDate(m);
      if (isValidPartialDate(d) && (d.year == null || (d.year >= 1900 && d.year <= 2200))) found.push(d);
    }
  }
  const unique = new Set(found.map((d) => `${d.year ?? ""}-${d.month}-${d.day}`));
  return unique.size === 1 ? found[0]! : null;
}
