import { boolean, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { tenantId, timestamps } from "./columns";
import { tenantIsolation } from "./tenants";

/**
 * People who live together: one address, one holiday card. Members point here from
 * contacts.household_id, so someone is in at most one household.
 */
export const households = pgTable(
  "households",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    /** What goes on the envelope. Null means work it out from the members ("Ryan & Mia Park"). */
    name: text("name"),
    street: text("street"),
    line2: text("line2"),
    city: text("city"),
    region: text("region"),
    postalCode: text("postal_code"),
    country: text("country"),
    /** On the holiday card list. */
    sendCard: boolean("send_card").notNull().default(true),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("households_tenant_idx").on(t.tenantId), tenantIsolation("households")],
).enableRLS();
