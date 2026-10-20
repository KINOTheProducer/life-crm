import { compareDates, daysBetween, upcoming, type PartialDate, type PlainDate, type UpcomingDate } from "./dates";

/** Partners: the user's own romantic relationships. Monogamous by default, any number of partners when polyamorous. */

export const relationshipStatuses = ["single", "dating", "relationship", "married", "complicated", "private"] as const;
export type RelationshipStatus = (typeof relationshipStatuses)[number];

export const relationshipStatusLabels: Record<RelationshipStatus, string> = {
  single: "Single",
  dating: "Dating",
  relationship: "In a relationship",
  married: "Married",
  complicated: "It's complicated",
  private: "Prefer not to say",
};

/** Statuses where onboarding asks about partners. */
export const partneredStatuses: readonly RelationshipStatus[] = ["dating", "relationship", "married", "complicated"];

export const relationshipStyles = ["monogamous", "polyamorous"] as const;
export type RelationshipStyle = (typeof relationshipStyles)[number];

/** Suggestions only; the label is free text so people can use their own words. */
export const partnerLabelSuggestions = [
  "Partner",
  "Spouse",
  "Wife",
  "Husband",
  "Girlfriend",
  "Boyfriend",
  "Fiancé",
  "Fiancée",
  "Nesting partner",
  "Anchor partner",
  "Comet",
  "Play partner",
  "Situationship",
] as const;

export const partnershipStatuses = ["current", "past"] as const;
export type PartnershipStatus = (typeof partnershipStatuses)[number];

export const milestoneKinds = ["met", "first_date", "official", "moved_in", "engaged", "married", "custom"] as const;
export type MilestoneKind = (typeof milestoneKinds)[number];

export const milestoneLabels: Record<MilestoneKind, string> = {
  met: "Met",
  first_date: "First date",
  official: "Got together",
  moved_in: "Moved in",
  engaged: "Got engaged",
  married: "Got married",
  custom: "Milestone",
};

/** What the yearly reminder is called when a milestone has one. */
export const anniversaryLabels: Record<MilestoneKind, string> = {
  met: "anniversary of meeting",
  first_date: "first date anniversary",
  official: "anniversary",
  moved_in: "moving-in anniversary",
  engaged: "engagement anniversary",
  married: "wedding anniversary",
  custom: "anniversary",
};

/** Milestones that get a yearly reminder unless the user turns it off. */
export const defaultAnniversary: Record<MilestoneKind, boolean> = {
  met: false,
  first_date: false,
  official: true,
  moved_in: false,
  engaged: false,
  married: true,
  custom: false,
};

export const loveLanguages = ["words", "time", "gifts", "acts", "touch"] as const;
export type LoveLanguage = (typeof loveLanguages)[number];

export const loveLanguageLabels: Record<LoveLanguage, string> = {
  words: "Words of affirmation",
  time: "Quality time",
  gifts: "Gifts",
  acts: "Acts of service",
  touch: "Physical touch",
};

/** Guided prompts on the partner profile. Answers are stored as facts under the section's category. */
export const partnerPrompts = {
  love: [
    "Comforted when stressed by",
    "An apology that lands",
    "Feels appreciated when",
    "Needs space when",
    "Pet peeves",
    "Hard dates in the year",
  ],
  favourites: [
    "Coffee or tea order",
    "Go-to takeout",
    "Favourite restaurant",
    "Drink",
    "Dessert",
    "Flowers",
    "Scent",
    "Colour",
    "Music",
    "Show",
    "Reading right now",
  ],
  sizes: ["Tops", "Bottoms", "Dress", "Shoes", "Ring", "Bra", "Jewellery metal"],
} as const;

export type PartnerPromptSection = keyof typeof partnerPrompts;

export interface Milestone {
  kind: MilestoneKind;
  label: string | null;
  date: PartialDate;
  anniversary: boolean;
}

/** When the relationship started: the "got together" date, else the earliest dated milestone with a year. */
export function relationshipStart(milestones: Milestone[]): PlainDate | null {
  const dated = milestones.filter((m): m is Milestone & { date: PlainDate } => m.date.year != null);
  const official = dated.find((m) => m.kind === "official");
  if (official) return official.date;
  const sorted = [...dated].sort((a, b) => compareDates(a.date, b.date));
  return sorted.find((m) => m.kind !== "met")?.date ?? sorted[0]?.date ?? null;
}

/** "3 years, 2 months", "5 months", "2 weeks". */
export function formatDuration(from: PlainDate, to: PlainDate): string {
  let months = (to.year - from.year) * 12 + (to.month - from.month);
  if (to.day < from.day) months -= 1;
  if (months < 1) {
    const days = Math.max(0, daysBetween(from, to));
    if (days < 14) return days === 1 ? "1 day" : `${days} days`;
    return `${Math.floor(days / 7)} weeks`;
  }
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [years && `${years} ${years === 1 ? "year" : "years"}`, rest && `${rest} ${rest === 1 ? "month" : "months"}`];
  return parts.filter(Boolean).join(", ");
}

/** The next anniversary across milestones that have one. */
export function nextAnniversary(milestones: Milestone[], today: PlainDate): (UpcomingDate & { milestone: Milestone }) | null {
  let best: (UpcomingDate & { milestone: Milestone }) | null = null;
  for (const m of milestones) {
    if (!m.anniversary) continue;
    const next = upcoming(m.date, today);
    if (!best || next.daysAway < best.daysAway) best = { ...next, milestone: m };
  }
  return best;
}

export function anniversaryName(m: Pick<Milestone, "kind" | "label">): string {
  return m.kind === "custom" && m.label ? m.label : anniversaryLabels[m.kind];
}

/** Whether the partner is past their date-night goal. */
export function dateNightDue(cadenceDays: number | null, lastDate: PlainDate | null, since: PlainDate, today: PlainDate) {
  if (!cadenceDays || cadenceDays <= 0) return { due: false, daysSince: lastDate ? daysBetween(lastDate, today) : null };
  const from = lastDate ?? since;
  const daysSince = daysBetween(from, today);
  return { due: daysSince >= cadenceDays, daysSince: lastDate ? daysSince : null };
}
