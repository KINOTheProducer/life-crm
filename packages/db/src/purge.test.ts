import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb, withTenant } from "./client";
import { purgeTrash } from "./purge";
import { contacts, tenants } from "./schema";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("purgeTrash", () => {
  const db = createDb(url!);
  afterAll(() => db.$client.end());

  it("removes only people trashed more than 30 days ago", async () => {
    const [t] = await db.insert(tenants).values({ name: "purge-test" }).returning();
    const now = new Date("2026-10-20T12:00:00Z");
    await withTenant(db, t!.id, (tx) =>
      tx.insert(contacts).values([
        { tenantId: t!.id, firstName: "Old", deletedAt: new Date("2026-09-01T00:00:00Z") },
        { tenantId: t!.id, firstName: "Recent", deletedAt: new Date("2026-10-10T00:00:00Z") },
        { tenantId: t!.id, firstName: "Live" },
      ]),
    );
    expect(await purgeTrash(db, 30, now)).toBeGreaterThanOrEqual(1);
    const left = await withTenant(db, t!.id, (tx) => tx.select({ name: contacts.firstName }).from(contacts));
    expect(left.map((c) => c.name).sort()).toEqual(["Live", "Recent"]);
    await db.delete(tenants).where(eq(tenants.id, t!.id));
  });
});
