import { partialDateSchema, type PartialDate } from "@life-crm/core";

export function intOrNull(value: FormDataEntryValue | null | undefined): number | null {
  const s = String(value ?? "").trim();
  return s === "" ? null : Number(s);
}

/**
 * Read a month/day/year triple like `birthdayMonth`, `birthdayDay`, `birthdayYear`.
 * Null when month and day are both empty, "invalid" when they don't make a date.
 */
export function partialDateFrom(form: FormData, prefix: string): PartialDate | null | "invalid" {
  const month = intOrNull(form.get(`${prefix}Month`));
  const day = intOrNull(form.get(`${prefix}Day`));
  const year = intOrNull(form.get(`${prefix}Year`));
  if (month == null && day == null) return null;
  const parsed = partialDateSchema.safeParse({ month, day, year });
  return parsed.success ? parsed.data : "invalid";
}

export const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const selectClass =
  "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export const textareaClass =
  "w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
