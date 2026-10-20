import { milestoneKinds, partnershipStatuses } from "@life-crm/core";
import { boolean, date, index, integer, pgTable, smallint, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { tenantId, timestamps } from "./columns";
import { contacts, importantDates } from "./contacts";
import { tenantIsolation } from "./tenants";
import { interactions } from "./timeline";

/**
 * The user's own romantic relationship with a person. One row per partner; monogamous users
 * have at most one current row, polyamorous users can have several.
 */
export const partnerships = pgTable(
  "partnerships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    /** Free text in their own words: "Wife", "Nesting partner", "Boyfriend". */
    label: text("label").notNull().default("Partner"),
    status: text("status", { enum: partnershipStatuses }).notNull().default("current"),
    isNesting: boolean("is_nesting").notNull().default(false),
    /** Ranked, most important first. */
    loveLanguages: text("love_languages").array().notNull().default([]),
    /** Goal for time together, e.g. a date night every 14 days. */
    dateCadenceDays: integer("date_cadence_days"),
    agreements: text("agreements"),
    endedOn: date("ended_on"),
    ...timestamps,
  },
  (t) => [uniqueIndex("partnerships_contact_idx").on(t.contactId), tenantIsolation("partnerships")],
).enableRLS();

export const partnershipMilestones = pgTable(
  "partnership_milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    partnershipId: uuid("partnership_id")
      .notNull()
      .references(() => partnerships.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: milestoneKinds }).notNull(),
    label: text("label"),
    year: smallint("year"),
    month: smallint("month").notNull(),
    day: smallint("day").notNull(),
    /** The yearly anniversary this milestone feeds into the reminder engine, if any. */
    importantDateId: uuid("important_date_id").references(() => importantDates.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("partnership_milestones_partnership_idx").on(t.partnershipId), tenantIsolation("partnership_milestones")],
).enableRLS();

/** Time set aside together. Each one is also logged as an in-person catch-up. */
export const dateNights = pgTable(
  "date_nights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    partnershipId: uuid("partnership_id")
      .notNull()
      .references(() => partnerships.id, { onDelete: "cascade" }),
    interactionId: uuid("interaction_id").references(() => interactions.id, { onDelete: "set null" }),
    occurredOn: date("occurred_on").notNull(),
    place: text("place"),
    costCents: integer("cost_cents"),
    currency: text("currency").notNull().default("CAD"),
    /** 1-5. */
    rating: smallint("rating"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("date_nights_partnership_occurred_idx").on(t.partnershipId, t.occurredOn), tenantIsolation("date_nights")],
).enableRLS();
