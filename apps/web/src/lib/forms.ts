import { compareDates, partialDateSchema, todayIn, type PartialDate } from "@life-crm/core";
import { z } from "zod";

export function intOrNull(value: FormDataEntryValue | null | undefined): number | null {
  const s = String(value ?? "").trim();
  return s === "" ? null : Number(s);
}

export type DateProblem = "incomplete" | "invalid" | "future";

/**
 * Read a month/day/year triple like `birthdayMonth`, `birthdayDay`, `birthdayYear`.
 * Null when all three are empty, otherwise the date or what's wrong with it.
 */
export function partialDateFrom(form: FormData, prefix: string, { allowFuture = false } = {}): PartialDate | null | DateProblem {
  const month = intOrNull(form.get(`${prefix}Month`));
  const day = intOrNull(form.get(`${prefix}Day`));
  const year = intOrNull(form.get(`${prefix}Year`));
  if (month == null && day == null && year == null) return null;
  if (month == null || day == null) return "incomplete";
  const parsed = partialDateSchema.safeParse({ month, day, year });
  if (!parsed.success) return "invalid";
  // Earliest time zone, so nobody's "today" gets rejected as the future.
  if (!allowFuture && year != null && compareDates({ year, month, day }, todayIn("Pacific/Kiritimati")) > 0) return "future";
  return parsed.data;
}

export function dateProblemText(label: string, problem: DateProblem): string {
  if (problem === "incomplete") return `${label} needs a month and a day`;
  if (problem === "future") return `${label} can't be in the future`;
  return `${label} isn't a real date`;
}

/** Letters in any script plus spaces, apostrophes, hyphens and periods. Also used as the inputs' `pattern`. */
const namePattern = "\\s*[\\p{L}\\p{M}][\\p{L}\\p{M}\\s'’.\\-]*";
const nameRegex = new RegExp(`^(?:${namePattern})$`, "u");
const nameRule = "Names can only have letters, spaces, apostrophes, hyphens and periods";

export const nameInputProps = { pattern: namePattern, title: nameRule };

/** Trimmed, possibly empty person name. */
export const personName = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "That name is too long")
    .refine((v) => v === "" || nameRegex.test(v), nameRule);

export const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const selectClass =
  "h-11 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export const textareaClass =
  "w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
