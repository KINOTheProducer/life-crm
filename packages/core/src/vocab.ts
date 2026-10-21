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

export const lifeEventTypes = [
  "new_job",
  "moved",
  "engaged",
  "married",
  "baby",
  "graduated",
  "new_pet",
  "loss",
  "illness",
  "retired",
  "big_trip",
  "other",
] as const;
export type LifeEventType = (typeof lifeEventTypes)[number];

export const lifeEventTypeLabels: Record<LifeEventType, string> = {
  new_job: "New job",
  moved: "Moved",
  engaged: "Got engaged",
  married: "Got married",
  baby: "Had a baby",
  graduated: "Graduated",
  new_pet: "New pet",
  loss: "Lost someone",
  illness: "Illness or surgery",
  retired: "Retired",
  big_trip: "Big trip",
  other: "Something else",
};

/** Hard times, where a gentle check-in matters more than a congratulations. */
export const sensitiveLifeEvents: readonly LifeEventType[] = ["loss", "illness"];

export const giftDirections = ["given", "received"] as const;
export type GiftDirection = (typeof giftDirections)[number];

/** Who owes whom, from your side. */
export const debtDirections = ["they_owe", "i_owe"] as const;
export type DebtDirection = (typeof debtDirections)[number];
