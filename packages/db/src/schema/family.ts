import { childKinds, familyStatuses } from "@life-crm/core";
import { index, pgTable, primaryKey, smallint, text, uuid } from "drizzle-orm/pg-core";
import { tenantId, timestamps } from "./columns";
import { contacts } from "./contacts";
import { tenantIsolation } from "./tenants";

/**
 * A family in the genealogy sense (GEDCOM's FAM): up to two partners and their children.
 * One person can be a partner in several (remarriage) and a child in more than one (adoption).
 */
export const families = pgTable(
  "families",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    partner1Id: uuid("partner1_id").references(() => contacts.id, { onDelete: "set null" }),
    partner2Id: uuid("partner2_id").references(() => contacts.id, { onDelete: "set null" }),
    status: text("status", { enum: familyStatuses }).notNull().default("unknown"),
    startYear: smallint("start_year"),
    endYear: smallint("end_year"),
    ...timestamps,
  },
  (t) => [
    index("families_partner1_idx").on(t.partner1Id),
    index("families_partner2_idx").on(t.partner2Id),
    tenantIsolation("families"),
  ],
).enableRLS();

export const familyChildren = pgTable(
  "family_children",
  {
    tenantId: tenantId(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    childId: uuid("child_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: childKinds }).notNull().default("biological"),
  },
  (t) => [primaryKey({ columns: [t.familyId, t.childId] }), index("family_children_child_idx").on(t.childId), tenantIsolation("family_children")],
).enableRLS();
