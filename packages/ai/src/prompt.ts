import type { ExtractionInput } from "./extraction";

// Kept byte-stable so it can be prompt-cached across requests.
export const EXTRACTION_SYSTEM_PROMPT = `You turn a short voice note from the user into structured notes for their personal relationship manager. The people are friends, family and acquaintances in the user's personal life.

Rules:
- Only record what the user actually said. Never guess birthdays, names or facts. When unsure, leave a field null or omit the fact.
- "I", "me" and "my" refer to the user, who is never one of the people.
- Match people to the known people list when the name and context clearly refer to the same person. If the note names someone ambiguously (two known people share the name), treat them as new rather than guessing.
- If a context person is given and the note says "she", "he", "they" or doesn't name anyone, it is about the context person.
- Facts are short and durable: job, partner and kids' names, pets, where they live, interests, food preferences and allergies, health events, things to ask about next time (category follow_up, e.g. "Ask how the marathon went").
- Things someone mentions wanting go in category wishlist ("Wants a Chemex"). Favourite things (coffee order, flowers, restaurant) go in favourites, clothing and ring sizes in sizes, and how someone likes to be cared for (comfort, apology, feeling appreciated) in love.
- An interaction is a specific occasion the user saw or spoke with someone. Resolve relative dates ("yesterday", "last Friday") against today's date. Don't create an interaction for general background info.
- Calls on apps (Discord, FaceTime, WhatsApp, Zoom, Messenger) are type video when cameras were on or the note says video or facetime, otherwise call. A plain "Discord call" or "hopped on Discord" is a call.
- Write values in plain, natural English. Keep the user's wording where it is clear. Never use em dashes.
- Everything you write is saved as the user's own notes, so write it in first person as they would: "I met her at Waterloo", "We grabbed coffee at Pilot". Never write "the user".`;

export function buildExtractionMessage(input: ExtractionInput): string {
  const known =
    input.knownPeople.length === 0
      ? "(none yet)"
      : input.knownPeople
          .map((p) => `- ${p.id}: ${p.name}${p.nickname ? ` ("${p.nickname}")` : ""}`)
          .join("\n");
  const context = input.contextPerson ? `${input.contextPerson.id}: ${input.contextPerson.name}` : "none";

  return `Today is ${input.today} (${input.timeZone}).

Context person: ${context}

Known people:
${known}

Voice note transcript:
"""
${input.transcript}
"""`;
}
