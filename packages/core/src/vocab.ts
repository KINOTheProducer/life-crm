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
  "love",
  "favourites",
  "sizes",
  "wishlist",
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
  love: "How they like to be loved",
  favourites: "Favourites",
  sizes: "Sizes",
  wishlist: "Gift ideas",
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

export const memoryKinds = ["trip", "celebration", "event", "everyday", "milestone", "other"] as const;
export type MemoryKind = (typeof memoryKinds)[number];

export const memoryKindLabels: Record<MemoryKind, string> = {
  trip: "Trip",
  celebration: "Celebration",
  event: "Event",
  everyday: "Everyday",
  milestone: "Milestone",
  other: "Other",
};
