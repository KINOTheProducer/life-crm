import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb, withTenant } from "./client";
import { contacts, tenants } from "./schema";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("tenant isolation", () => {
  const db = createDb(url!);
  afterAll(() => db.$client.end());

  it("only exposes the current tenant's rows", async () => {
    const [a, b] = await db
      .insert(tenants)
      .values([{ name: "rls-a" }, { name: "rls-b" }])
      .returning();

    await withTenant(db, a!.id, (tx) => tx.insert(contacts).values({ tenantId: a!.id, firstName: "Alice" }));
    await withTenant(db, b!.id, (tx) => tx.insert(contacts).values({ tenantId: b!.id, firstName: "Bob" }));

    const seenByA = await withTenant(db, a!.id, (tx) => tx.select().from(contacts));
    expect(seenByA.map((c) => c.firstName)).toEqual(["Alice"]);

    // Without a tenant set, nothing is visible.
    expect(await db.select().from(contacts)).toEqual([]);

    // Writing into another tenant is rejected.
    await expect(
      withTenant(db, a!.id, (tx) => tx.insert(contacts).values({ tenantId: b!.id, firstName: "Mallory" })),
    ).rejects.toThrow();

    await db.delete(tenants).where(eq(tenants.id, a!.id));
    await db.delete(tenants).where(eq(tenants.id, b!.id));
  });
});
