import { factCategories, importantDateKinds, isValidPartialDate, milestoneKinds, personRelations } from "@life-crm/core";
import { z } from "zod";
import type { KnownPerson } from "./extraction";
import { stripEmDashes } from "./types";

// Looking again at what's already saved about someone and suggesting a better home for it.
// Each saved item is either left alone, rewritten in place, moved somewhere else (possibly
// split up, and across people), or dropped as a duplicate of another saved item. Never copied.

export const resortTargetKinds = ["fact", "note", "date", "milestone"] as const;

const target = z.object({
  kind: z.enum(resortTargetKinds),
  category: z.enum(factCategories).nullable().describe("For facts."),
  label: z.string().nullable().describe("For facts and dates; for milestones only when kind is custom."),
  value: z.string().nullable().describe("The fact's value, or the note's text."),
  dateKind: z.enum(importantDateKinds).nullable().describe("For dates."),
  milestone: z.enum(milestoneKinds).nullable().describe("For milestones."),
  month: z.number().int().nullable(),
  day: z.number().int().nullable(),
  year: z.number().int().nullable(),
  personId: z.string().nullable().describe("Known person id when this part is really about them. Null for the subject or a new person."),
  newPerson: z
    .object({
      firstName: z.string(),
      lastName: z.string().nullable(),
      relation: z.enum(personRelations).describe("What they are to the subject."),
      relationLabel: z.string().nullable().describe('In the item\'s words, e.g. "Older brother", "Cousin".'),
    })
    .nullable()
    .describe("When this part is about someone named who isn't in the known people list. Use the same name each time they come up."),
});

export const resortSchema = z.object({
  changes: z.array(
    z.object({
      id: z.string().describe('The saved item\'s id, e.g. "f3".'),
      reason: z.string().describe("One short sentence on why, shown to the user."),
      duplicateOf: z.string().nullable().describe("Id of another saved item that already says the same thing. into is then empty."),
      into: z.array(target).describe("What the item becomes. Several entries to split it up, each on whoever it's about."),
    }),
  ),
});

export type Resort = z.infer<typeof resortSchema>;
export type ResortChange = Resort["changes"][number];
export type ResortTarget = ResortChange["into"][number];

/** One saved item, as the model sees it. */
export interface SavedItem {
  id: string;
  kind: "fact" | "note" | "date";
  /** "interest / Game: Stardew Valley", "Note: ...", "memorial / Dad's death anniversary: Jun 2, 2019". */
  text: string;
}

export interface ResortInput {
  today: string;
  subject: KnownPerson & { partnerLabel?: string | null };
  items: SavedItem[];
  knownPeople: KnownPerson[];
  partnerPrompts?: Record<string, readonly string[]>;
}

// Kept byte-stable so it can be prompt-cached across requests.
export const RESORT_SYSTEM_PROMPT = `You tidy what the user has saved about one person, the subject, in their personal relationship manager. You get a list of saved facts, notes and dates, each with an id. Suggest changes only where an item is clearly in the wrong place; most items should be left alone.

Possible changes:
- A better category or label for a fact. Statements are facts, not things to ask about: "Loves bouldering" is an interest, not follow_up. follow_up is only for something to ask about, check in on, or still open.
- A note that holds facts or dates becomes those facts or dates, split up. Keep any part that isn't a fact as a shorter note in the same change.
- A fact that is really a yearly date (with a month and day) becomes a date. When the subject is the user's partner, dates about their relationship become milestones.
- A fact, note or date that is really about someone else moves to them. Use personId for someone in the known people list. For someone named who isn't in the list ("her brother Jake loves fishing"), fill newPerson with their name and what they are to the subject, and they'll be added. When an item mixes the subject and other people, split it so each part goes to whoever it's about.
- Only move things to people who are named. Something about an unnamed relative ("her mom is a nurse") stays on the subject as a family fact whose label says who it's about ("Mom's job").
- An item that says the same thing as another saved item is a duplicate: set duplicateOf to the one to keep (the more complete one) and leave into empty.

Rules:
- Never invent anything. Every change only re-homes or rewords what the item already says.
- Leave out items that are fine as they are. Don't suggest a change that only rewords without moving or fixing it.
- Categories: work, family, pets, home, interest (hobbies, shows, games, books, sports), preference (likes and dislikes), dietary, health, love (how they like to be cared for), favourites, sizes, wishlist (things they want, gift ideas), follow_up, other.
- When the subject is the user's partner and a fact answers one of the partner prompts in the message, use that prompt's label exactly, with its category.
- Write in plain natural English, first person as the user would. Never write "the user". Never use em dashes.`;

export function buildResortMessage(input: ResortInput): string {
  const s = input.subject;
  const known = input.knownPeople.filter((p) => p.id !== s.id);
  const prompts =
    s.partnerLabel && input.partnerPrompts
      ? `\nPartner prompts by category:\n${Object.entries(input.partnerPrompts)
          .map(([category, labels]) => `- ${category}: ${labels.join("; ")}`)
          .join("\n")}\n`
      : "";
  return `Today is ${input.today}.

Subject: ${s.name}${s.nickname ? ` ("${s.nickname}")` : ""}${s.partnerLabel ? `, my partner (${s.partnerLabel})` : ""}
${prompts}
Known people:
${known.length ? known.map((p) => `- ${p.id}: ${p.name}`).join("\n") : "(none)"}

Saved items:
${input.items.map((i) => `- ${i.id} [${i.kind}] ${i.text}`).join("\n")}`;
}

function validTarget(t: ResortTarget, isPartner: boolean): boolean {
  if (t.newPerson && !t.newPerson.firstName.trim()) return false;
  const date = t.month != null && t.day != null && isValidPartialDate({ month: t.month, day: t.day, year: t.year });
  switch (t.kind) {
    case "fact":
      return !!t.category && !!t.label?.trim() && !!t.value?.trim();
    case "note":
      return !!t.value?.trim();
    case "date":
      return date && !!t.dateKind && !!t.label?.trim();
    case "milestone":
      // Milestones belong to the relationship, so only ever on the subject.
      return isPartner && !t.personId && !t.newPerson && date && !!t.milestone;
  }
}

/**
 * Drop changes that point at unknown items or people, that touch an item twice, that move an
 * item onto itself, or that would turn into nothing without naming a duplicate.
 */
export function sanitizeResort(output: Resort, input: ResortInput): Resort {
  const raw = stripEmDashes(output);
  const ids = new Set(input.items.map((i) => i.id));
  const others = input.knownPeople.filter((p) => p.id !== input.subject.id);
  const people = new Set(others.map((p) => p.id));
  // A "new" person who is already known by full name is that person.
  const byName = new Map(others.map((p) => [p.name.trim().toLowerCase(), p.id]));
  const isPartner = !!input.subject.partnerLabel;
  const touched = new Set<string>();
  const dropped = new Set<string>();
  const changes: ResortChange[] = [];

  for (const c of raw.changes) {
    if (!ids.has(c.id) || touched.has(c.id)) continue;
    if (c.duplicateOf) {
      // Keep chains out: the one kept can't itself be dropped.
      if (c.duplicateOf === c.id || !ids.has(c.duplicateOf) || dropped.has(c.duplicateOf)) continue;
      touched.add(c.id);
      dropped.add(c.id);
      changes.push({ ...c, into: [] });
      continue;
    }
    const into = c.into
      .map((t) => {
        const personId = t.personId && people.has(t.personId) ? t.personId : null;
        if (personId || !t.newPerson) return { ...t, personId, newPerson: null };
        const name = [t.newPerson.firstName, t.newPerson.lastName].filter(Boolean).join(" ").trim().toLowerCase();
        const known = byName.get(name);
        return known ? { ...t, personId: known, newPerson: null } : t;
      })
      .filter((t) => validTarget(t, isPartner));
    if (into.length === 0) continue;
    touched.add(c.id);
    changes.push({ ...c, into });
  }
  return { changes };
}
