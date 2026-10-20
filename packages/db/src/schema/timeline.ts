import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { factCategories, interactionTypes } from "@life-crm/core";
import { user } from "./auth";
import { bytea, tenantId, timestamps } from "./columns";
import { contacts } from "./contacts";
import { tenantIsolation } from "./tenants";

export const captureStatuses = ["transcribing", "extracting", "ready", "committed", "failed", "discarded"] as const;

/** A raw capture (voice note today; card scans and shares later) and its AI processing state. */
export const captures = pgTable(
  "captures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["voice"] }).notNull(),
    status: text("status", { enum: captureStatuses }).notNull().default("transcribing"),
    /** Person the user was viewing when recording, used as a hint for who "she" or "he" is. */
    contextContactId: uuid("context_contact_id").references(() => contacts.id, { onDelete: "set null" }),
    /** Raw audio, deleted once the capture is committed or discarded. */
    audio: bytea("audio"),
    audioMime: text("audio_mime"),
    durationMs: integer("duration_ms"),
    transcript: text("transcript"),
    extraction: jsonb("extraction"),
    error: text("error"),
    ...timestamps,
    committedAt: timestamp("committed_at", { withTimezone: true }),
  },
  (t) => [index("captures_tenant_created_idx").on(t.tenantId, t.createdAt), tenantIsolation("captures")],
).enableRLS();

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    captureId: uuid("capture_id").references(() => captures.id, { onDelete: "set null" }),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("notes_contact_idx").on(t.contactId), tenantIsolation("notes")],
).enableRLS();

/** A single thing you know about someone ("Works at Sunnybrook", "Allergic to peanuts"). */
export const facts = pgTable(
  "facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    category: text("category", { enum: factCategories }).notNull(),
    label: text("label").notNull(),
    value: text("value").notNull(),
    captureId: uuid("capture_id").references(() => captures.id, { onDelete: "set null" }),
    ...timestamps,
    /** Set when a newer fact replaces this one, or the user removes it. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("facts_contact_idx").on(t.contactId), tenantIsolation("facts")],
).enableRLS();

export const interactions = pgTable(
  "interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    type: text("type", { enum: interactionTypes }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    location: text("location"),
    summary: text("summary").notNull(),
    captureId: uuid("capture_id").references(() => captures.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("interactions_tenant_occurred_idx").on(t.tenantId, t.occurredAt), tenantIsolation("interactions")],
).enableRLS();

export const interactionPeople = pgTable(
  "interaction_people",
  {
    tenantId: tenantId(),
    interactionId: uuid("interaction_id")
      .notNull()
      .references(() => interactions.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.interactionId, t.contactId] }),
    index("interaction_people_contact_idx").on(t.contactId),
    tenantIsolation("interaction_people"),
  ],
).enableRLS();

export const timelineKinds = ["created", "note", "interaction", "fact", "date", "voice", "milestone", "memory"] as const;
export type TimelineKind = (typeof timelineKinds)[number];

/**
 * Append-only feed of everything that happened with a person. Written in the same
 * transaction as the record it describes, so the profile can page through one table.
 */
export const timelineEntries = pgTable(
  "timeline_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: timelineKinds }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    title: text("title").notNull(),
    body: text("body"),
    /** Id of the note, interaction, fact or date this entry describes. */
    refId: uuid("ref_id"),
    captureId: uuid("capture_id").references(() => captures.id, { onDelete: "set null" }),
    data: jsonb("data"),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("timeline_contact_occurred_idx").on(t.tenantId, t.contactId, t.occurredAt.desc()),
    tenantIsolation("timeline_entries"),
  ],
).enableRLS();
