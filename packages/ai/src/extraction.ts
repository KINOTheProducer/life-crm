import { factCategories, interactionTypes, isValidPartialDate } from "@life-crm/core";
import { z } from "zod";
import { stripEmDashes } from "./types";

// Every field is required-but-nullable: structured output modes require all keys present.

const extractedPerson = z.object({
  ref: z.string().describe('Short id for this person within this extraction, e.g. "p1".'),
  existingContactId: z
    .string()
    .nullable()
    .describe("Id from the known people list when this is clearly the same person, otherwise null."),
  firstName: z.string(),
  lastName: z.string().nullable(),
  nickname: z.string().nullable(),
  pronouns: z.string().nullable(),
  birthday: z
    .object({
      month: z.number().int(),
      day: z.number().int(),
      year: z.number().int().nullable(),
    })
    .nullable()
    .describe("Only when a birthday was stated. Year null if unknown."),
  howMet: z.string().nullable().describe("How I met them, in first person (\"At a friend's wedding\"), only if stated."),
  facts: z
    .array(
      z.object({
        category: z.enum(factCategories),
        label: z.string().describe('Short label, e.g. "Job", "Dog", "Allergy", "Ask about".'),
        value: z.string().describe('The fact itself, e.g. "Nurse at Sunnybrook", "Biscuit (golden retriever)".'),
      }),
    )
    .describe("Discrete, durable things worth remembering about this person."),
  note: z
    .string()
    .nullable()
    .describe("Anything else worth remembering about this person that is not a fact. 1-3 sentences, in first person."),
});

export const extractionSchema = z.object({
  people: z.array(extractedPerson),
  interaction: z
    .object({
      type: z.enum(interactionTypes),
      date: z.string().describe("YYYY-MM-DD, resolved against the date the note was recorded."),
      location: z.string().nullable(),
      summary: z.string().describe("One or two sentences on what happened, in first person: \"Grabbed coffee and caught up on her new job.\""),
      participantRefs: z.array(z.string()).describe("refs of people who were part of it."),
    })
    .nullable()
    .describe("Only when the user describes a specific time they saw or talked to someone."),
});

export type Extraction = z.infer<typeof extractionSchema>;
export type ExtractedPerson = Extraction["people"][number];

export interface KnownPerson {
  id: string;
  name: string;
  nickname?: string | null;
}

export interface ExtractionInput {
  transcript: string;
  /**
   * The day the note was recorded in the user's time zone, YYYY-MM-DD. "Yesterday" is
   * relative to this, not to when it's processed, so re-reading an old note lands on the same days.
   */
  today: string;
  timeZone: string;
  knownPeople: KnownPerson[];
  /** The person whose profile the user recorded from, if any. */
  contextPerson?: KnownPerson | null;
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Drop anything the model got wrong in ways the schema can't express: unknown contact ids,
 * impossible birthdays, malformed dates, participant refs that point nowhere.
 */
export function sanitizeExtraction(output: Extraction, input: ExtractionInput): Extraction {
  const raw = stripEmDashes(output);
  const knownIds = new Set(input.knownPeople.map((p) => p.id));
  const usedIds = new Set<string>();

  const people = raw.people
    .filter((p) => p.firstName.trim() !== "")
    .map((p) => {
      let existingContactId = p.existingContactId && knownIds.has(p.existingContactId) ? p.existingContactId : null;
      // Two extracted people can't both be the same contact.
      if (existingContactId && usedIds.has(existingContactId)) existingContactId = null;
      if (existingContactId) usedIds.add(existingContactId);
      const birthday = p.birthday && isValidPartialDate(p.birthday) ? p.birthday : null;
      return {
        ...p,
        existingContactId,
        birthday,
        facts: p.facts.filter((f) => f.label.trim() !== "" && f.value.trim() !== ""),
      };
    });

  const refs = new Set(people.map((p) => p.ref));
  let interaction = raw.interaction;
  if (interaction) {
    const participantRefs = interaction.participantRefs.filter((r) => refs.has(r));
    interaction =
      participantRefs.length === 0
        ? null
        : {
            ...interaction,
            participantRefs,
            // A catch-up can't happen after the note about it was recorded.
            date: isoDate.test(interaction.date) && interaction.date <= input.today ? interaction.date : input.today,
          };
  }
  return { people, interaction };
}
