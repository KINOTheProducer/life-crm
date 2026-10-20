import { sql } from "drizzle-orm";
import { index, integer, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantId, timestamps } from "./columns";
import { tenantIsolation } from "./tenants";

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    nickname: text("nickname"),
    pronouns: text("pronouns"),
    closeness: text("closeness", { enum: ["inner", "close", "friend", "acquaintance"] })
      .notNull()
      .default("friend"),
    keepInTouchDays: integer("keep_in_touch_days"),
    howMet: text("how_met"),
    /** What they are to the user, in the user's words: "Mom", "Brother", "Best friend". */
    relationship: text("relationship"),
    /** Where the avatar comes from: "immich-person:<id>", or null for initials. */
    avatarRef: text("avatar_ref"),
    lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true }),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("contacts_tenant_idx").on(t.tenantId),
    index("contacts_name_trgm_idx").using(
      "gin",
      sql`(coalesce(${t.firstName}, '') || ' ' || coalesce(${t.lastName}, '') || ' ' || coalesce(${t.nickname}, '')) gin_trgm_ops`,
    ),
    tenantIsolation("contacts"),
  ],
).enableRLS();

export const importantDates = pgTable(
  "important_dates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["birthday", "anniversary", "memorial", "graduation", "due_date", "custom"],
    }).notNull(),
    label: text("label"),
    year: smallint("year"),
    month: smallint("month").notNull(),
    day: smallint("day").notNull(),
    ...timestamps,
  },
  (t) => [
    index("important_dates_contact_idx").on(t.contactId),
    index("important_dates_tenant_month_day_idx").on(t.tenantId, t.month, t.day),
    tenantIsolation("important_dates"),
  ],
).enableRLS();
