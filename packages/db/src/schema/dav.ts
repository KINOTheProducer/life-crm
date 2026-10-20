import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { tenantId } from "./columns";
import { tenantIsolation } from "./tenants";

/**
 * App passwords for CardDAV. Not tenant-scoped by RLS: a phone signs in with one before
 * a tenant is known, the same as auth.
 */
export const davPasswords = pgTable("dav_passwords", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  /** What the user called it: "iPhone", "Thunderbird". */
  name: text("name").notNull(),
  /** SHA-256 of the password. Passwords are random, so no slow hash needed. */
  tokenHash: text("token_hash").notNull().unique(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * People deleted for good, so CardDAV sync can tell phones to drop them. Written by a
 * trigger on contacts; soft-deleted people show up through deleted_at instead.
 */
export const contactTombstones = pgTable(
  "contact_tombstones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    /** The vCard resource name the person had. */
    davName: text("dav_name").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("contact_tombstones_tenant_idx").on(t.tenantId, t.deletedAt), tenantIsolation("contact_tombstones")],
).enableRLS();
