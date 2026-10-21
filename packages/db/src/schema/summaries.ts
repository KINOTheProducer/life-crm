import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantId } from "./columns";
import { contacts } from "./contacts";
import { tenantIsolation } from "./tenants";

export interface AskAboutItem {
  text: string;
  /** What it came from, so the brief can link back: "fact:<id>", "note:<id>", "interaction:<id>", "life_event:<id>". */
  source: string | null;
}

/**
 * The AI "who this person is to you" card. `sourceKey` is a hash of what it was written from,
 * so the profile can tell when new notes have landed and it needs rewriting.
 */
export const contactSummaries = pgTable(
  "contact_summaries",
  {
    contactId: uuid("contact_id")
      .primaryKey()
      .references(() => contacts.id, { onDelete: "cascade" }),
    tenantId: tenantId(),
    summary: text("summary").notNull(),
    askAbout: jsonb("ask_about").$type<AskAboutItem[]>().notNull().default([]),
    sourceKey: text("source_key").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [tenantIsolation("contact_summaries")],
).enableRLS();
