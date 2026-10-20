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
