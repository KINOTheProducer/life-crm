import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb, withTenant } from "./client";
import { contactMethods, contactTombstones, contacts, tenants } from "./schema";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("CardDAV triggers", () => {
  const db = createDb(url!);
  afterAll(() => db.$client.end());

  it("bumps the person when their details change and remembers hard deletes", async () => {
    const [t] = await db.insert(tenants).values({ name: "dav-test" }).returning();
    await withTenant(db, t!.id, async (tx) => {
      const [c] = await tx
        .insert(contacts)
        .values({ tenantId: t!.id, firstName: "Ana", davName: "ana-card", updatedAt: new Date("2020-01-01T00:00:00Z") })
        .returning();
      await tx.insert(contactMethods).values({ tenantId: t!.id, contactId: c!.id, kind: "phone", label: "mobile", value: "+14165550100" });
      const [after] = await tx.select({ updatedAt: contacts.updatedAt }).from(contacts).where(eq(contacts.id, c!.id));
      expect(after!.updatedAt.getFullYear()).toBeGreaterThan(2020);

      await tx.delete(contacts).where(eq(contacts.id, c!.id));
      const stones = await tx.select({ name: contactTombstones.davName }).from(contactTombstones);
      expect(stones.map((s) => s.name)).toEqual(["ana-card"]);
    });
    await db.delete(tenants).where(eq(tenants.id, t!.id));
  });
});
