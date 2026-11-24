import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));
// Postgres may still be starting (e.g. after a backup restarts containers), so keep
// trying for a while instead of failing the whole container on the first refusal.
const deadline = Date.now() + Number(process.env.MIGRATE_WAIT_MS ?? 120_000);

for (let attempt = 1; ; attempt++) {
  const client = postgres(url, { max: 1, connect_timeout: 10, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder });
    await client.end();
    break;
  } catch (error) {
    await client.end({ timeout: 1 }).catch(() => {});
    const cause = (error as { cause?: { code?: string } }).cause;
    const code = cause?.code ?? (error as { code?: string }).code;
    const retryable = ["ECONNREFUSED", "ECONNRESET", "CONNECT_TIMEOUT", "ENOTFOUND", "EAI_AGAIN", "57P03"].includes(code ?? "");
    if (!retryable || Date.now() > deadline) throw error;
    const wait = Math.min(2000 * attempt, 15_000);
    console.log(`migrate: database not reachable (${code}), retrying in ${wait / 1000}s`);
    await sleep(wait);
  }
}
console.log("Migrations applied");
