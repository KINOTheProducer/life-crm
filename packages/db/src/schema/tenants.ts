import { sql } from "drizzle-orm";
import { pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** A tenant owns all CRM data. Self-hosted installs typically have one; cloud has one per customer. */
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("self_hosted"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Session setting holding the tenant for the current transaction. See withTenant(). */
export const currentTenant = sql`nullif(current_setting('app.tenant_id', true), '')::uuid`;

/** RLS policy restricting every operation to rows of the current tenant. */
export const tenantIsolation = (table: string) =>
  pgPolicy(`${table}_tenant_isolation`, {
    as: "permissive",
    for: "all",
    using: sql`tenant_id = ${currentTenant}`,
    withCheck: sql`tenant_id = ${currentTenant}`,
  });
