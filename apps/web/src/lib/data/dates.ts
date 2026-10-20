import type { PartialDate, PlainDate } from "@life-crm/core";

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatPartialDate(d: PartialDate): string {
  const base = `${monthNames[d.month - 1]} ${d.day}`;
  return d.year ? `${base}, ${d.year}` : base;
}

export function parseIsoDate(s: string): PlainDate {
  const [year, month, day] = s.split("-").map(Number);
  return { year: year!, month: month!, day: day! };
}

export function toIsoDate(d: PlainDate): string {
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

/** Noon UTC on a calendar date: a stable instant that stays on the same day in any user time zone. */
export function dateToInstant(d: PlainDate): Date {
  return new Date(Date.UTC(d.year, d.month - 1, d.day, 12));
}

const shortMonth = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "March 10, 2025", "Mar 10 to 16, 2025", "Dec 28, 2024 to Jan 3, 2025". Takes ISO dates. */
export function formatDateRange(start: string, end: string | null): string {
  const a = parseIsoDate(start);
  if (!end || end === start) return formatPartialDate(a);
  const b = parseIsoDate(end);
  if (a.year !== b.year) return `${shortMonth[a.month - 1]} ${a.day}, ${a.year} to ${shortMonth[b.month - 1]} ${b.day}, ${b.year}`;
  if (a.month !== b.month) return `${shortMonth[a.month - 1]} ${a.day} to ${shortMonth[b.month - 1]} ${b.day}, ${a.year}`;
  return `${shortMonth[a.month - 1]} ${a.day} to ${b.day}, ${a.year}`;
}
