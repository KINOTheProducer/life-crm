import { and, isNotNull, lt } from "drizzle-orm";
import { withTenant, type Db } from "./client";
import { contacts, tenants } from "./schema";

/**
 * Permanently remove people who have been in the trash longer than `days`. Everything
 * hanging off them (notes, dates, facts, timeline) goes with them via cascades.
 */
export async function purgeTrash(db: Db, days = 30, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const all = await db.select({ id: tenants.id }).from(tenants);
  let removed = 0;
  for (const t of all) {
    const gone = await withTenant(db, t.id, (tx) =>
      tx
        .delete(contacts)
        .where(and(isNotNull(contacts.deletedAt), lt(contacts.deletedAt, cutoff)))
        .returning({ id: contacts.id }),
    );
    removed += gone.length;
  }
  return removed;
}
