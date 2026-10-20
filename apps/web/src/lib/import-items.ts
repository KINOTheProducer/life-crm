import {
  factCategories,
  factCategoryLabels,
  interactionTypes,
  isValidPartialDate,
  partialDateSchema,
  type FactCategory,
  type InteractionType,
  type PartialDate,
} from "@life-crm/core";
import { z } from "zod";
import { monthNames } from "@/lib/forms";

/** Where one piece of an imported file ends up on the person's profile. */
export const destinations = ["birthday", "nickname", "pronouns", "howMet", "fact", "note", "catchup", "skip"] as const;
export type Destination = (typeof destinations)[number];

export const destinationLabels: Record<Destination, string> = {
  birthday: "Birthday",
  nickname: "Nickname",
  pronouns: "Pronouns",
  howMet: "How you met",
  fact: "Fact",
  note: "Note",
  catchup: "Catch-up",
  skip: "Don't import",
};

/**
 * Every item carries all fields, so switching its destination keeps what was there:
 * `text` is the value or note, `label` and `category` are used by facts, `date` by birthdays,
 * `on` and `type` by catch-ups.
 */
export interface ImportItem {
  id: string;
  destination: Destination;
  text: string;
  label: string;
  category: FactCategory;
  date: PartialDate | null;
  on: string;
  type: InteractionType;
}

/** What's already saved for the person, to spot an import that disagrees with it. */
export interface ExistingProfile {
  firstName: string;
  birthday: PartialDate | null;
  nickname: string | null;
  pronouns: string | null;
  howMet: string | null;
  facts: { category: string; label: string; value: string }[];
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const importItemSchema = z.object({
  id: z.string().max(40),
  destination: z.enum(destinations),
  text: z.string().trim().max(5000),
  label: z.string().trim().max(100),
  category: z.enum(factCategories),
  date: partialDateSchema.nullable(),
  on: z.string().regex(isoDate).or(z.literal("")),
  type: z.enum(interactionTypes),
});

export const importSchema = z.array(importItemSchema).max(200);

function formatDate(d: PartialDate) {
  const base = `${monthNames[d.month - 1]} ${d.day}`;
  return d.year ? `${base}, ${d.year}` : base;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Why an item can't be saved as it stands, or null. */
export function itemProblem(item: ImportItem, today: string): string | null {
  switch (item.destination) {
    case "birthday":
      return item.date && isValidPartialDate(item.date) ? null : "Pick the date";
    case "fact":
      return !item.label.trim() ? "Add a label" : !item.text.trim() ? "Add the fact" : null;
    case "catchup":
      if (!item.on) return "Pick the date";
      return item.on > today ? "That date is in the future" : !item.text.trim() ? "Add what you did" : null;
    case "skip":
      return null;
    default:
      return item.text.trim() ? null : "This is empty";
  }
}

/**
 * When the item would replace something different that's already saved, a warning saying so.
 * A mismatch is also a hint the file is about someone else.
 */
export function itemConflict(item: ImportItem, existing: ExistingProfile): string | null {
  const replacing = (current: string) => `Saved as “${current}”. Importing will replace it.`;
  switch (item.destination) {
    case "birthday": {
      const b = existing.birthday;
      const d = item.date;
      if (!b || !d) return null;
      if (b.month === d.month && b.day === d.day && (b.year ?? null) === (d.year ?? null)) return null;
      return replacing(formatDate(b));
    }
    case "nickname":
    case "pronouns":
    case "howMet": {
      const current = existing[item.destination];
      return current && !same(current, item.text) ? replacing(current) : null;
    }
    default:
      return null;
  }
}

/** True when the item is already on the profile word for word, so importing it would only duplicate it. */
export function itemDuplicate(item: ImportItem, existing: ExistingProfile): boolean {
  switch (item.destination) {
    case "birthday":
      return !!existing.birthday && !!item.date && itemConflict(item, existing) == null;
    case "nickname":
    case "pronouns":
    case "howMet": {
      const current = existing[item.destination];
      return !!current && same(current, item.text);
    }
    case "fact":
      return existing.facts.some((f) => f.category === item.category && same(f.label, item.label) && same(f.value, item.text));
    default:
      return false;
  }
}

export const categoryOptions = factCategories.map((c) => [c, factCategoryLabels[c]] as const);
