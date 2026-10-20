import "server-only";
import type { TimelineKind } from "@life-crm/db/schema";
import { and, desc, eq, inArray, schema, sql, type Tx } from "@life-crm/db";

const { timelineEntries } = schema;

export interface TimelineInput {
  tenantId: string;
  contactId: string;
  kind: TimelineKind;
  occurredAt: Date;
  title: string;
  body?: string | null;
  refId?: string | null;
  captureId?: string | null;
  data?: unknown;
}

/** Append entries to people's timelines. Call inside the transaction that writes the underlying record. */
export async function recordTimeline(tx: Tx, entries: TimelineInput[]) {
  if (entries.length === 0) return;
  await tx.insert(timelineEntries).values(entries);
}

export type TimelineEntry = typeof timelineEntries.$inferSelect;

export const TIMELINE_PAGE_SIZE = 40;

export async function listTimeline(
  tx: Tx,
  contactId: string,
  /** `before` is the id of the last entry on the previous page. */
  options: { kinds?: TimelineKind[]; before?: string } = {},
): Promise<{ entries: TimelineEntry[]; hasMore: boolean }> {
  const rows = await tx
    .select()
    .from(timelineEntries)
    .where(
      and(
        eq(timelineEntries.contactId, contactId),
        options.kinds?.length ? inArray(timelineEntries.kind, options.kinds) : undefined,
        options.before
          ? sql`(${timelineEntries.occurredAt}, ${timelineEntries.id}) < (select occurred_at, id from timeline_entries where id = ${options.before})`
          : undefined,
      ),
    )
    .orderBy(desc(timelineEntries.occurredAt), desc(timelineEntries.id))
    .limit(TIMELINE_PAGE_SIZE + 1);
  return { entries: rows.slice(0, TIMELINE_PAGE_SIZE), hasMore: rows.length > TIMELINE_PAGE_SIZE };
}
