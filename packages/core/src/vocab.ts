/** Shared vocabularies used by the database, AI extraction and UI. */

export const factCategories = [
  "work",
  "family",
  "pets",
  "home",
  "interest",
  "preference",
  "dietary",
  "health",
  "follow_up",
  "other",
] as const;
export type FactCategory = (typeof factCategories)[number];

export const factCategoryLabels: Record<FactCategory, string> = {
  work: "Work",
  family: "Family",
  pets: "Pets",
  home: "Home",
  interest: "Interests",
  preference: "Likes & dislikes",
  dietary: "Food & allergies",
  health: "Health",
  follow_up: "Ask them about",
  other: "Other",
};

export const interactionTypes = ["in_person", "call", "video", "message", "email", "event", "other"] as const;
export type InteractionType = (typeof interactionTypes)[number];

export const interactionTypeLabels: Record<InteractionType, string> = {
  in_person: "In person",
  call: "Call",
  video: "Video call",
  message: "Messages",
  email: "Email",
  event: "Event",
  other: "Other",
};
