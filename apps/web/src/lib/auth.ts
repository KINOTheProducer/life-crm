import "server-only";
import { count, schema } from "@life-crm/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

import { db } from "./db";
import { env } from "./env";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
  }),
  emailAndPassword: { enabled: true, minPasswordLength: 10 },
  user: {
    additionalFields: {
      tenantId: { type: "string", required: false, input: false },
      timeZone: { type: "string", required: false, defaultValue: "America/Toronto" },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (env.DEPLOY_MODE === "self-hosted") {
            const [row] = await db.select({ n: count() }).from(schema.user);
            if ((row?.n ?? 0) > 0) {
              throw new APIError("FORBIDDEN", { message: "Sign-up is closed on this instance." });
            }
          }
          // Every new user gets their own tenant. Household sharing (V2) will join existing ones.
          const [tenant] = await db
            .insert(schema.tenants)
            .values({ name: `${user.name}'s people`, plan: env.DEPLOY_MODE === "cloud" ? "trial" : "self_hosted" })
            .returning({ id: schema.tenants.id });
          return { data: { ...user, tenantId: tenant!.id } };
        },
      },
    },
  },
  plugins: [nextCookies()],
});
