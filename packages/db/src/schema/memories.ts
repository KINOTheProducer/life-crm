import { memoryKinds } from "@life-crm/core";
import { date, index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { tenantId, timestamps } from "./columns";
import { contacts } from "./contacts";
import { tenantIsolation } from "./tenants";

/** Something you did with people: a trip to Jamaica with Holly, a 30th birthday, a Sunday at the cottage. */
export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    title: text("title").notNull(),
    kind: text("kind", { enum: memoryKinds }).notNull().default("other"),
    /** Why it happened, in the user's words: "Holly's 30th", "Just a vacation". */
    reason: text("reason"),
    startedOn: date("started_on").notNull(),
    /** Last day, for trips and other multi-day memories. */
    endedOn: date("ended_on"),
    location: text("location"),
    story: text("story"),
    /** Immich asset shown as the cover. */
    coverAssetId: text("cover_asset_id"),
    ...timestamps,
  },
  (t) => [index("memories_tenant_started_idx").on(t.tenantId, t.startedOn), tenantIsolation("memories")],
).enableRLS();

export const memoryPeople = pgTable(
  "memory_people",
  {
    tenantId: tenantId(),
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.memoryId, t.contactId] }),
    index("memory_people_contact_idx").on(t.contactId),
    tenantIsolation("memory_people"),
  ],
).enableRLS();

/** Immich photos and videos attached to a memory. Only the id is stored; media stays in Immich. */
export const memoryAssets = pgTable(
  "memory_assets",
  {
    tenantId: tenantId(),
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    assetId: text("asset_id").notNull(),
    type: text("type").notNull().default("IMAGE"),
    /** Camera-local time, for ordering. */
    takenAt: timestamp("taken_at"),
    addedAt: timestamps.createdAt,
  },
  (t) => [primaryKey({ columns: [t.memoryId, t.assetId] }), tenantIsolation("memory_assets")],
).enableRLS();

/** A user's Immich server. The API key is encrypted with the app secret. */
export const immichConnections = pgTable(
  "immich_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    baseUrl: text("base_url").notNull(),
    apiKeyEnc: text("api_key_enc").notNull(),
    /** Immich account name, shown in Settings. */
    accountName: text("account_name"),
    /** The user's own face in Immich, for "photos together". */
    selfPersonId: text("self_person_id"),
    ...timestamps,
  },
  (t) => [uniqueIndex("immich_connections_user_idx").on(t.userId), tenantIsolation("immich_connections")],
).enableRLS();

/**
 * Immich face clusters that are this person. Immich sometimes splits one person into
 * several clusters, so a contact can have more than one.
 */
export const contactFaces = pgTable(
  "contact_faces",
  {
    tenantId: tenantId(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    personId: text("person_id").notNull(),
    /** The name Immich had when linked, to spot renames. */
    immichName: text("immich_name"),
    linkedAt: timestamps.createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.contactId, t.personId] }),
    uniqueIndex("contact_faces_person_idx").on(t.tenantId, t.personId),
    tenantIsolation("contact_faces"),
  ],
).enableRLS();

/** Memory suggestions the user said no to, keyed by date range, so they don't come back. */
export const dismissedSuggestions = pgTable(
  "dismissed_suggestions",
  {
    tenantId: tenantId(),
    key: text("key").notNull(),
    dismissedAt: timestamps.createdAt,
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key] }), tenantIsolation("dismissed_suggestions")],
).enableRLS();

export const aiProviders = ["server", "anthropic", "openai_compatible", "off"] as const;
export const sttProviders = ["server", "openai_compatible", "off"] as const;

/**
 * A user's AI choices. "server" means whatever the instance is configured with in its
 * environment; keys are encrypted like the Immich one.
 */
export const aiSettings = pgTable(
  "ai_settings",
  {
    tenantId: tenantId(),
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: aiProviders }).notNull().default("server"),
    model: text("model"),
    baseUrl: text("base_url"),
    apiKeyEnc: text("api_key_enc"),
    sttProvider: text("stt_provider", { enum: sttProviders }).notNull().default("server"),
    sttBaseUrl: text("stt_base_url"),
    sttModel: text("stt_model"),
    sttApiKeyEnc: text("stt_api_key_enc"),
    ...timestamps,
  },
  () => [tenantIsolation("ai_settings")],
).enableRLS();
