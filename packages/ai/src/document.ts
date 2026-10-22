import { factCategories, importantDateKinds, interactionTypes, isValidPartialDate, milestoneKinds, personRelations } from "@life-crm/core";
import { z } from "zod";
import type { KnownPerson } from "./extraction";
import { stripEmDashes } from "./types";

// Reading a file of notes about one person. Unlike a voice note it's background the user
// already knows, so most of it is facts, and it often names the person's own people.
// Every field is required-but-nullable: structured output modes require all keys present.

const partialDate = {
  month: z.number().int(),
  day: z.number().int(),
  year: z.number().int().nullable(),
};

const fact = z.object({
  category: z.enum(factCategories),
  label: z.string().describe('Short, specific label, e.g. "Job", "Favourite snack", "Game", "Shoe size".'),
  value: z.string().describe("The fact itself, in the file's wording where it is clear."),
});

const importantDate = z.object({
  kind: z.enum(importantDateKinds),
  label: z.string().describe('Short label, e.g. "Dad\'s death anniversary", "Graduation".'),
  ...partialDate,
});

export const documentSchema = z.object({
  nameInFile: z.string().nullable().describe("The name the file uses for the subject, if it names them at all."),
  subject: z.object({
    nickname: z.string().nullable(),
    pronouns: z.string().nullable(),
    birthday: z.object(partialDate).nullable().describe("Only when the subject's birthday is stated. Year null if unknown."),
    howMet: z.string().nullable().describe("How I met them, in first person, only if stated."),
    facts: z.array(fact),
    dates: z.array(importantDate).describe("Recurring dates that matter to the subject, other than their birthday."),
    milestones: z
      .array(z.object({ kind: z.enum(milestoneKinds), label: z.string().nullable().describe("Only for kind custom."), ...partialDate }))
      .describe("Only when the subject is my partner: dated moments in our relationship. Empty otherwise."),
    catchups: z
      .array(
        z.object({
          date: z.string().describe("YYYY-MM-DD."),
          type: z.enum(interactionTypes),
          summary: z.string().describe("One or two sentences in first person."),
        }),
      )
      .describe("Specific past occasions I spent with the subject, with a full date."),
    notes: z.array(z.string()).describe("Anything worth keeping that isn't a fact or date, 1-3 sentences each, in first person."),
  }),
  others: z.array(
    z.object({
      ref: z.string().describe('Short id, e.g. "p1".'),
      existingContactId: z.string().nullable().describe("Id from the known people list when this is clearly the same person, otherwise null."),
      firstName: z.string(),
      lastName: z.string().nullable(),
      relation: z.enum(personRelations).describe("What they are to the subject."),
      relationLabel: z.string().nullable().describe('In the file\'s words, e.g. "Older sister", "Best friend from high school", "Cousin".'),
      birthday: z.object(partialDate).nullable(),
      facts: z.array(fact),
      dates: z.array(importantDate),
      note: z.string().nullable(),
    }),
  ),
});

export type DocumentExtraction = z.infer<typeof documentSchema>;
export type DocumentPerson = DocumentExtraction["others"][number];

export interface DocumentInput {
  text: string;
  /** User's local date, YYYY-MM-DD. */
  today: string;
  timeZone: string;
  /** The person the file is being imported into. */
  subject: KnownPerson & {
    /** Set when they're the user's current partner, e.g. "Girlfriend". */
    partnerLabel?: string | null;
  };
  /** Everyone else the user has, to match names against. */
  knownPeople: KnownPerson[];
  /** Labels the partner profile asks about, by fact category, so matching facts land in its fields. */
  partnerPrompts?: Record<string, readonly string[]>;
  /** What's already saved about the subject, one line each, so a re-import doesn't repeat it. */
  alreadySaved?: string[];
}

// Kept byte-stable so it can be prompt-cached across requests.
export const DOCUMENT_SYSTEM_PROMPT = `You read a file of notes the user wrote about one person, the subject, and sort it into their personal relationship manager. The file is background the user already knows: profiles, lists, journal-style notes, pasted messages.

Rules:
- Only record what the file says. Never guess dates, names or facts. When unsure, leave a field null or leave it out.
- "I", "me" and "my" are the user, who is never the subject or one of the other people.
- Unnamed "she", "he", "they", and anything not clearly about someone else, is about the subject.
- Statements are facts, not things to ask about. "Loves bouldering" is an interest, "Hates cilantro" is a like or dislike, "Reading Dune" is an interest. Use follow_up only when the file says to ask, check in or follow up, or describes something still open or coming up ("Waiting to hear back on the job", "Surgery on the 12th").
- Categories: work (job, school, career), family (the subject's relatives, only when not worth a separate person), pets, home (where they live), interest (hobbies, shows, music, games, books, sports, things they're into), preference (likes and dislikes), dietary (food, allergies), health, love (how they like to be cared for: comfort, apologies, feeling appreciated), favourites (favourite things, coffee order, go-to restaurant), sizes (clothing, shoe and ring sizes), wishlist (things they want, gift ideas), other.
- One fact per thing. Keep a list together under one label unless each item stands on its own.
- Other people: anyone the file names who isn't the subject, like their mom, sister, best friend or coworker. Record what the file says about them on them, not on the subject: their birthday, job, where they live. Give their relation to the subject. Match them to the known people list when the name and context clearly refer to the same person, otherwise existingContactId is null. Pets are facts on their owner, not people. Never list the subject as another person.
- Dates: the subject's birthday goes in birthday. Other yearly dates that matter go in dates with a short label: a parent's death anniversary, a graduation, a due date, the subject's anniversary with someone other than me. Only with a month and day; year if given. A month or year on its own is a fact or note, not a date.
- When the subject is my partner, dates about our relationship (met, first date, got together or started dating, moved in, engaged, married, other moments of ours) go in milestones, not dates. Otherwise milestones is empty. When a fact answers one of the partner prompts in the message, use that prompt's label exactly, with its category.
- Catch-ups are specific past occasions I spent with the subject and a full date ("Oct 3 we went to the AGO"). Not general background, not plans.
- Notes are for what's worth keeping and isn't a fact or date. Don't repeat facts in notes.
- Leave out anything the message lists as already saved about the subject, even when the file words it differently. Only include it when the file says something new or different about it.
- Write in plain, natural English, in first person as the user would ("I met her at Waterloo"). Never write "the user". Never use em dashes.`;

export function buildDocumentMessage(input: DocumentInput): string {
  const s = input.subject;
  const subject = `${s.id}: ${s.name}${s.nickname ? ` ("${s.nickname}")` : ""}${s.partnerLabel ? `, my partner (${s.partnerLabel})` : ""}`;
  const known = input.knownPeople.filter((p) => p.id !== s.id);
  const knownList = known.length === 0 ? "(none)" : known.map((p) => `- ${p.id}: ${p.name}${p.nickname ? ` ("${p.nickname}")` : ""}`).join("\n");
  const prompts =
    s.partnerLabel && input.partnerPrompts
      ? `\nPartner prompts by category:\n${Object.entries(input.partnerPrompts)
          .map(([category, labels]) => `- ${category}: ${labels.join("; ")}`)
          .join("\n")}\n`
      : "";

  const saved = input.alreadySaved?.length ? `\nAlready saved about the subject:\n${input.alreadySaved.map((l) => `- ${l}`).join("\n")}\n` : "";

  return `Today is ${input.today} (${input.timeZone}).

Subject: ${subject}
${prompts}${saved}
Known people:
${knownList}

File:
"""
${input.text}
"""`;
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (d: { month: number; day: number; year: number | null }) => isValidPartialDate(d) && (d.year == null || (d.year >= 1800 && d.year <= 2200));

/**
 * Drop what the model got wrong in ways the schema can't express: unknown or repeated contact
 * ids, the subject listed as someone else, impossible dates, milestones for a non-partner.
 */
export function sanitizeDocument(output: DocumentExtraction, input: DocumentInput): DocumentExtraction {
  const raw = stripEmDashes(output);
  const knownIds = new Set(input.knownPeople.map((p) => p.id).filter((id) => id !== input.subject.id));
  const usedIds = new Set<string>();
  const facts = (list: DocumentPerson["facts"]) => list.filter((f) => f.label.trim() !== "" && f.value.trim() !== "");
  const dates = (list: DocumentPerson["dates"]) => list.filter((d) => d.label.trim() !== "" && validDate(d));

  const others = raw.others
    .filter((p) => p.firstName.trim() !== "" && p.existingContactId !== input.subject.id)
    .map((p) => {
      let existingContactId = p.existingContactId && knownIds.has(p.existingContactId) ? p.existingContactId : null;
      if (existingContactId && usedIds.has(existingContactId)) existingContactId = null;
      if (existingContactId) usedIds.add(existingContactId);
      return {
        ...p,
        existingContactId,
        birthday: p.birthday && validDate(p.birthday) ? p.birthday : null,
        facts: facts(p.facts),
        dates: dates(p.dates),
      };
    });

  const s = raw.subject;
  return {
    nameInFile: raw.nameInFile?.trim() || null,
    subject: {
      ...s,
      birthday: s.birthday && validDate(s.birthday) ? s.birthday : null,
      facts: facts(s.facts),
      dates: dates(s.dates),
      milestones: input.subject.partnerLabel ? s.milestones.filter(validDate) : [],
      catchups: s.catchups.filter((c) => isoDate.test(c.date) && c.date <= input.today && c.summary.trim() !== ""),
      notes: s.notes.filter((n) => n.trim() !== ""),
    },
    others,
  };
}
