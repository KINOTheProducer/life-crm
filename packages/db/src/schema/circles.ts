import { circleTones } from "@life-crm/core";
import { index, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { tenantId, timestamps } from "./columns";
import { contacts } from "./contacts";
import { tenantIsolation } from "./tenants";

/** A group of people the user thinks of together: "Uni crew", "Climbing", "Mom's side". */
export const circles = pgTable(
  "circles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    tone: text("tone", { enum: circleTones }).notNull().default("sage"),
    /** Shared context: "Group chat on WhatsApp, cottage trip every July". */
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [uniqueIndex("circles_tenant_name_idx").on(t.tenantId, t.name), tenantIsolation("circles")],
).enableRLS();

export const circleMembers = pgTable(
  "circle_members",
  {
    tenantId: tenantId(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.circleId, t.contactId] }), index("circle_members_contact_idx").on(t.contactId), tenantIsolation("circle_members")],
).enableRLS();
