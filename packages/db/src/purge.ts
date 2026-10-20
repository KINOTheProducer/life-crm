import { and, isNotNull, lt } from "drizzle-orm";
import { withTenant, type Db } from "./client";
import { contactTombstones, contacts, tenants } from "./schema";

/** How long CardDAV remembers deletions. A phone that hasn't synced in longer does a full resync. */
export const TOMBSTONE_DAYS = 90;

/**
 * Permanently remove people who have been in the trash longer than `days`. Everything
 * hanging off them (notes, dates, facts, timeline) goes with them via cascades.
 */
export async function purgeTrash(db: Db, days = 30, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const all = await db.select({ id: tenants.id }).from(tenants);
  let removed = 0;
  for (const t of all) {
    const gone = await withTenant(db, t.id, async (tx) => {
      await tx.delete(contactTombstones).where(lt(contactTombstones.deletedAt, new Date(now.getTime() - TOMBSTONE_DAYS * 86_400_000)));
      return tx
        .delete(contacts)
        .where(and(isNotNull(contacts.deletedAt), lt(contacts.deletedAt, cutoff)))
        .returning({ id: contacts.id });
    });
    removed += gone.length;
  }
  return removed;
}
