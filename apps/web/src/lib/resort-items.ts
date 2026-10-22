import {
  factCategories,
  factCategoryLabels,
  importantDateKindLabels,
  importantDateKinds,
  milestoneKinds,
  milestoneLabels,
  partialDateSchema,
  personRelations,
  type FactCategory,
  type ImportantDateKind,
  type MilestoneKind,
  type PartialDate,
  type PersonRelation,
} from "@life-crm/core";
import { z } from "zod";
import { formatDate } from "@/lib/import-items";

/** Something already saved about a person that a re-sort can move. */
export const savedKinds = ["fact", "note", "date"] as const;
export type SavedKind = (typeof savedKinds)[number];

/** What a saved item becomes. */
export type ResortTarget =
  | { kind: "fact"; category: FactCategory; label: string; value: string }
  | { kind: "note"; value: string }
  | { kind: "date"; dateKind: ImportantDateKind; label: string; date: PartialDate }
  | { kind: "milestone"; milestone: MilestoneKind; label: string | null; date: PartialDate };

/** Who a part of a re-sorted item ends up on. */
export type ResortDestination =
  | { kind: "subject" }
  | { kind: "person"; id: string; name: string }
  /** Someone the item names who isn't saved yet. The same name in several moves is one new person. */
  | { kind: "new"; firstName: string; lastName: string | null; relation: PersonRelation; relationLabel: string | null };

export interface ResortMove {
  target: ResortTarget;
  to: ResortDestination;
}

/** One suggested change, as shown for review and sent back when accepted. */
export interface ResortSuggestion {
  key: string;
  source: { kind: SavedKind; id: string; text: string };
  reason: string;
  /** Set when the source is dropped because this saved item already says it. */
  duplicateOf: { kind: SavedKind; id: string; text: string } | null;
  into: ResortMove[];
}

const savedRef = z.object({ kind: z.enum(savedKinds), id: z.uuid(), text: z.string().max(6000) });

export const resortTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fact"), category: z.enum(factCategories), label: z.string().trim().min(1).max(100), value: z.string().trim().min(1).max(500) }),
  z.object({ kind: z.literal("note"), value: z.string().trim().min(1).max(5000) }),
  z.object({ kind: z.literal("date"), dateKind: z.enum(importantDateKinds), label: z.string().trim().min(1).max(100), date: partialDateSchema }),
  z.object({ kind: z.literal("milestone"), milestone: z.enum(milestoneKinds), label: z.string().trim().max(100).nullable(), date: partialDateSchema }),
]);

export const resortSuggestionSchema = z.object({
  key: z.string().max(40),
  source: savedRef,
  reason: z.string().max(500),
  duplicateOf: savedRef.nullable(),
  into: z
    .array(
      z.object({
        target: resortTargetSchema,
        to: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("subject") }),
          z.object({ kind: z.literal("person"), id: z.uuid(), name: z.string().max(200) }),
          z.object({
            kind: z.literal("new"),
            firstName: z.string().trim().min(1).max(100),
            lastName: z.string().trim().max(100).nullable(),
            relation: z.enum(personRelations),
            relationLabel: z.string().trim().max(100).nullable(),
          }),
        ]),
      }),
    )
    .max(20),
});

export const resortAcceptSchema = z.array(resortSuggestionSchema).max(200);

/** Key for a new person, so the same name in several moves becomes one person. */
export function newPersonKey(to: { firstName: string; lastName: string | null }) {
  return [to.firstName, to.lastName].filter(Boolean).join(" ").trim().toLowerCase();
}

/** "Interests · Game: Stardew Valley", "Note", "Memorial · Dad's death anniversary, Jun 2". */
export function describeTarget(t: ResortTarget): string {
  switch (t.kind) {
    case "fact":
      return `${factCategoryLabels[t.category]} · ${t.label}: ${t.value}`;
    case "note":
      return `Note: ${t.value}`;
    case "date":
      return `${importantDateKindLabels[t.dateKind]} · ${t.label}, ${formatDate(t.date)}`;
    case "milestone":
      return `${t.milestone === "custom" && t.label ? t.label : milestoneLabels[t.milestone]}, ${formatDate(t.date)}`;
  }
}
