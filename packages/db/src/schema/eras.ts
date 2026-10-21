import { eraKinds } from "@life-crm/core";
import { index, pgTable, smallint, text, uuid } from "drizzle-orm/pg-core";
import { tenantId, timestamps } from "./columns";
import { tenantIsolation } from "./tenants";

/** A chapter of the user's own life ("Waterloo", "Shopify", "Lived in Montreal"), in years. */
export const eras = pgTable(
  "eras",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    label: text("label").notNull(),
    kind: text("kind", { enum: eraKinds }).notNull().default("other"),
    startYear: smallint("start_year").notNull(),
    /** Null while it's still going. */
    endYear: smallint("end_year"),
    ...timestamps,
  },
  (t) => [index("eras_tenant_idx").on(t.tenantId, t.startYear), tenantIsolation("eras")],
).enableRLS();
