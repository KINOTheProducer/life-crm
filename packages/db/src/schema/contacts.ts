import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { tenantId, timestamps } from "./columns";
import { contactMethodKinds } from "@life-crm/core";
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
    company: text("company"),
    jobTitle: text("job_title"),
    /** UID a CardDAV client gave the contact, kept so its vCard round-trips. Defaults to our id. */
    davUid: text("dav_uid"),
    /** CardDAV resource name ("<name>.vcf") when a client picked it. Defaults to our id. */
    davName: text("dav_name"),
    /** What they are to the user, in the user's words: "Mom", "Brother", "Best friend". */
    relationship: text("relationship"),
    /** The user's own row, so the family tree has someone to start from. Hidden from people lists. */
    isSelf: boolean("is_self").notNull().default(false),
    isDeceased: boolean("is_deceased").notNull().default(false),
    /** Often all anyone remembers; a full date goes in important_dates as a memorial. */
    deathYear: smallint("death_year"),
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
    uniqueIndex("contacts_self_idx").on(t.tenantId).where(sql`${t.isSelf}`),
    uniqueIndex("contacts_dav_name_idx").on(t.tenantId, t.davName),
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

/** Phones, emails, socials, websites and messaging handles. Values are normalised (E.164, lowercase email). */
export const contactMethods = pgTable(
  "contact_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: contactMethodKinds }).notNull(),
    /** "mobile", "work", or the service for socials and messaging: "instagram", "whatsapp". */
    label: text("label").notNull().default("other"),
    value: text("value").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("contact_methods_contact_idx").on(t.contactId),
    // Finding duplicates on import and matching CardDAV edits.
    index("contact_methods_value_idx").on(t.tenantId, t.kind, t.value),
    tenantIsolation("contact_methods"),
  ],
).enableRLS();

export const addresses = pgTable(
  "addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    label: text("label").notNull().default("home"),
    street: text("street"),
    line2: text("line2"),
    city: text("city"),
    region: text("region"),
    postalCode: text("postal_code"),
    country: text("country"),
    ...timestamps,
  },
  (t) => [index("addresses_contact_idx").on(t.contactId), index("addresses_city_idx").on(t.tenantId, t.city), tenantIsolation("addresses")],
).enableRLS();
