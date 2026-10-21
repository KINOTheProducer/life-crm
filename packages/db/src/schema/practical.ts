import { debtDirections, giftDirections, lifeEventTypes } from "@life-crm/core";
import { boolean, date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantId, timestamps } from "./columns";
import { contacts } from "./contacts";
import { tenantIsolation } from "./tenants";

/**
 * Gifts given and received. Ideas stay as wishlist facts, so voice notes keep filling them in;
 * one becomes a row here once it's actually given.
 */
export const gifts = pgTable(
  "gifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    direction: text("direction", { enum: giftDirections }).notNull(),
    title: text("title").notNull(),
    /** "Birthday", "Christmas", "Housewarming". */
    occasion: text("occasion"),
    givenOn: date("given_on").notNull(),
    priceCents: integer("price_cents"),
    currency: text("currency").notNull().default("CAD"),
    url: text("url"),
    notes: text("notes"),
    /** Received gifts only: whether you've said thank you. */
    thanked: boolean("thanked").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("gifts_contact_idx").on(t.contactId, t.givenOn), tenantIsolation("gifts")],
).enableRLS();

/** Big things in someone's life: a new job, a move, a baby, a loss. */
export const lifeEvents = pgTable(
  "life_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    type: text("type", { enum: lifeEventTypes }).notNull(),
    /** Their words for it when the type alone isn't enough: "Started at Shopify". */
    title: text("title"),
    occurredOn: date("occurred_on").notNull(),
    notes: text("notes"),
    isSensitive: boolean("is_sensitive").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("life_events_contact_idx").on(t.contactId, t.occurredOn),
    index("life_events_tenant_occurred_idx").on(t.tenantId, t.occurredOn),
    tenantIsolation("life_events"),
  ],
).enableRLS();

/** Things to do for or with someone: "Return Jess's drill", "Send the wedding photos". */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    dueOn: date("due_on"),
    doneAt: timestamp("done_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("tasks_contact_idx").on(t.contactId), tenantIsolation("tasks")],
).enableRLS();

/** Money lent or borrowed. Amounts are always positive; direction says who owes. */
export const debts = pgTable(
  "debts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    direction: text("direction", { enum: debtDirections }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("CAD"),
    reason: text("reason"),
    occurredOn: date("occurred_on").notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("debts_contact_idx").on(t.contactId), tenantIsolation("debts")],
).enableRLS();
