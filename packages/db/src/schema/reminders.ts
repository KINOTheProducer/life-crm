import { repeatRules } from "@life-crm/core";
import { date, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { tenantId, timestamps } from "./columns";
import { contacts } from "./contacts";
import { tenantIsolation } from "./tenants";

/** Reminders the user set themselves ("Ask Lisa how the interview went", "Call Grandma every Sunday"). */
export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    dueOn: date("due_on").notNull(),
    repeat: text("repeat", { enum: repeatRules }).notNull().default("none"),
    ...timestamps,
    /** Set when a one-off reminder has fired or the user deletes it. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("reminders_user_due_idx").on(t.userId, t.dueOn), tenantIsolation("reminders")],
).enableRLS();

export const notificationStatuses = ["open", "done", "dismissed", "superseded"] as const;
export type NotificationStatus = (typeof notificationStatuses)[number];

/**
 * The reminder inbox. One row per reminder occurrence; `key` comes from the reminder engine
 * and is unique per user, which is what makes the daily pass safe to re-run.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    kind: text("kind", { enum: ["date", "checkin", "custom"] }).notNull(),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body"),
    dueOn: date("due_on").notNull(),
    status: text("status", { enum: notificationStatuses }).notNull().default("open"),
    snoozedUntil: date("snoozed_until"),
    createdAt: timestamps.createdAt,
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    pushedAt: timestamp("pushed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("notifications_user_key_idx").on(t.userId, t.key),
    index("notifications_user_status_idx").on(t.userId, t.status),
    tenantIsolation("notifications"),
  ],
).enableRLS();

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId), tenantIsolation("push_subscriptions")],
).enableRLS();
