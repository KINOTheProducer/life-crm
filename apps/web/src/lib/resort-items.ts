import {
  factCategories,
  factCategoryLabels,
  importantDateKindLabels,
  importantDateKinds,
  milestoneKinds,
  milestoneLabels,
  partialDateSchema,
  type FactCategory,
  type ImportantDateKind,
  type MilestoneKind,
  type PartialDate,
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

/** One suggested change, as shown for review and sent back when accepted. */
export interface ResortSuggestion {
  key: string;
  source: { kind: SavedKind; id: string; text: string };
  reason: string;
  /** Set when the source is dropped because this saved item already says it. */
  duplicateOf: { kind: SavedKind; id: string; text: string } | null;
  /** Someone else it moves to; null keeps it on this person. */
  person: { id: string; name: string } | null;
  into: ResortTarget[];
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
  person: z.object({ id: z.uuid(), name: z.string().max(200) }).nullable(),
  into: z.array(resortTargetSchema).max(20),
});

export const resortAcceptSchema = z.array(resortSuggestionSchema).max(200);

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
