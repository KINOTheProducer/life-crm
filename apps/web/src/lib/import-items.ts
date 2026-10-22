import {
  factCategories,
  factCategoryLabels,
  importantDateKinds,
  interactionTypes,
  isValidPartialDate,
  milestoneKinds,
  partialDateSchema,
  personRelations,
  type FactCategory,
  type ImportantDateKind,
  type InteractionType,
  type MilestoneKind,
  type PartialDate,
  type PersonRelation,
} from "@life-crm/core";
import { z } from "zod";
import { monthNames } from "@/lib/forms";

/** Where one piece of an imported file ends up on a person's profile. */
export const destinations = ["birthday", "nickname", "pronouns", "howMet", "fact", "date", "milestone", "note", "catchup", "skip"] as const;
export type Destination = (typeof destinations)[number];

export const destinationLabels: Record<Destination, string> = {
  birthday: "Birthday",
  nickname: "Nickname",
  pronouns: "Pronouns",
  howMet: "How you met",
  fact: "Fact",
  date: "Important date",
  milestone: "Our milestone",
  note: "Note",
  catchup: "Catch-up",
  skip: "Don't import",
};

/** Destinations for someone the file mentions, as opposed to the person it's imported into. */
export const otherDestinations: Destination[] = ["birthday", "fact", "date", "note", "skip"];

/** Fields there's only one of per person. */
export const singleDestinations: Destination[] = ["birthday", "nickname", "pronouns", "howMet"];

/** The person being imported into. Everyone else the file mentions has their own ref. */
export const SUBJECT = "subject";

/**
 * Every item carries all fields, so switching its destination keeps what was there:
 * `text` is the value or note, `label` is used by facts, dates and custom milestones,
 * `category` by facts, `date` by birthdays, dates and milestones, `on` and `type` by catch-ups.
 */
export interface ImportItem {
  id: string;
  /** SUBJECT, or the ref of someone else in the file. */
  person: string;
  destination: Destination;
  text: string;
  label: string;
  category: FactCategory;
  date: PartialDate | null;
  dateKind: ImportantDateKind;
  milestone: MilestoneKind;
  on: string;
  type: InteractionType;
}

/** Someone the file mentions besides the person it's imported into. */
export interface ImportPerson {
  ref: string;
  firstName: string;
  lastName: string;
  /** An existing person to add to, or null to create them. */
  contactId: string | null;
  skip: boolean;
  relation: PersonRelation;
  relationLabel: string;
}

/** What's already saved for the person, to spot an import that disagrees with it. */
export interface ExistingProfile {
  firstName: string;
  birthday: PartialDate | null;
  nickname: string | null;
  pronouns: string | null;
  howMet: string | null;
  facts: { category: string; label: string; value: string }[];
  dates: { type: string; label: string | null; month: number; day: number }[];
  milestones: { kind: string; month: number; day: number }[];
  /** "Girlfriend" when they're your current partner. */
  partnerLabel: string | null;
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const importItemSchema = z.object({
  id: z.string().max(40),
  person: z.string().max(40),
  destination: z.enum(destinations),
  text: z.string().trim().max(5000),
  label: z.string().trim().max(100),
  category: z.enum(factCategories),
  date: partialDateSchema.nullable(),
  dateKind: z.enum(importantDateKinds),
  milestone: z.enum(milestoneKinds),
  on: z.string().regex(isoDate).or(z.literal("")),
  type: z.enum(interactionTypes),
});

export const importPersonSchema = z.object({
  ref: z.string().max(40),
  firstName: z.string().trim().max(100),
  lastName: z.string().trim().max(100),
  contactId: z.uuid().nullable(),
  skip: z.boolean(),
  relation: z.enum(personRelations),
  relationLabel: z.string().trim().max(100),
});

export const importSchema = z.object({
  items: z.array(importItemSchema).max(300),
  people: z.array(importPersonSchema).max(50),
});
export type ImportInput = z.infer<typeof importSchema>;

export function formatDate(d: PartialDate) {
  const base = `${monthNames[d.month - 1]} ${d.day}`;
  return d.year ? `${base}, ${d.year}` : base;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Why an item can't be saved as it stands, or null. */
export function itemProblem(item: ImportItem, today: string): string | null {
  switch (item.destination) {
    case "birthday":
    case "milestone":
      return item.date && isValidPartialDate(item.date) ? null : "Pick the date";
    case "date":
      return !item.date || !isValidPartialDate(item.date) ? "Pick the date" : !item.label.trim() ? "Say what the date is" : null;
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

/** Why a mentioned person can't be saved as they stand, or null. */
export function personProblem(person: ImportPerson): string | null {
  if (person.skip || person.contactId) return null;
  return person.firstName.trim() ? null : "Add their first name";
}

/**
 * When the item would replace something different that's already saved, a warning saying so.
 * A mismatch is also a hint the file is about someone else. Only checked for the subject.
 */
export function itemConflict(item: ImportItem, existing: ExistingProfile): string | null {
  if (item.person !== SUBJECT) return null;
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

/** True when the item is already on the subject's profile, so importing it would only duplicate it. */
export function itemDuplicate(item: ImportItem, existing: ExistingProfile): boolean {
  if (item.person !== SUBJECT) return false;
  const d = item.date;
  switch (item.destination) {
    case "birthday":
      return !!existing.birthday && !!d && itemConflict(item, existing) == null;
    case "nickname":
    case "pronouns":
    case "howMet": {
      const current = existing[item.destination];
      return !!current && same(current, item.text);
    }
    case "fact":
      return existing.facts.some((f) => f.category === item.category && same(f.label, item.label) && same(f.value, item.text));
    case "date":
      return !!d && existing.dates.some((x) => x.type === item.dateKind && x.month === d.month && x.day === d.day);
    case "milestone":
      return !!d && existing.milestones.some((m) => m.kind === item.milestone && m.month === d.month && m.day === d.day);
    default:
      return false;
  }
}

/** Check the reviewed import, or say what's wrong with it. */
export function importProblem(input: ImportInput, today: string, isPartner: boolean): string | null {
  const people = new Map(input.people.map((p) => [p.ref, p]));
  for (const p of input.people) {
    const problem = personProblem(p);
    if (problem) return problem;
  }
  for (const i of input.items) {
    if (i.destination === "skip") continue;
    if (i.person !== SUBJECT) {
      const p = people.get(i.person);
      if (!p) return "Something in the import doesn't look right. Reload and try again.";
      if (p.skip) continue;
      if (!otherDestinations.includes(i.destination)) return `${destinationLabels[i.destination]} only works for the person you're importing into`;
    }
    if (i.destination === "milestone" && !isPartner) return "Milestones are only for partners";
    const problem = itemProblem(i, today);
    if (problem) return problem;
  }
  for (const person of [SUBJECT, ...people.keys()]) {
    for (const d of singleDestinations) {
      if (input.items.filter((i) => i.person === person && i.destination === d).length > 1) return `Only one item per person can go to ${destinationLabels[d]}`;
    }
  }
  return null;
}

export const categoryOptions = factCategories.map((c) => [c, factCategoryLabels[c]] as const);
