import { createDb, purgeTrash } from "@life-crm/db";
import { mailerFromEnv, pushSenderFromEnv, runDueUsers } from "@life-crm/reminders";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const db = createDb(url);
const deps = {
  mailer: mailerFromEnv(),
  push: pushSenderFromEnv(),
  appUrl: (process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, ""),
};
const intervalMs = Number(process.env.REMINDER_INTERVAL_MS ?? 5 * 60 * 1000);

console.log(
  `worker: reminders every ${intervalMs / 1000}s, email ${deps.mailer ? "on" : "off"}, push ${deps.push ? "on" : "off"}`,
);

let running = false;
let lastPurge = 0;
async function tick() {
  // Skip overlapping runs; per-user claims in runDueUsers make extra workers safe too.
  if (running) return;
  running = true;
  try {
    const { users, created } = await runDueUsers(db, deps);
    if (users > 0) console.log(`worker: ran reminders for ${users} user(s), ${created} new`);
    // Empty the trash of anything older than 30 days, once a day.
    if (Date.now() - lastPurge > 24 * 60 * 60 * 1000) {
      const removed = await purgeTrash(db);
      lastPurge = Date.now();
      if (removed > 0) console.log(`worker: removed ${removed} person(s) from the trash`);
    }
  } catch (error) {
    console.error("worker: reminder tick failed", error);
  } finally {
    running = false;
  }
}

const timer = setInterval(tick, intervalMs);
void tick();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    clearInterval(timer);
    await db.$client.end({ timeout: 5 });
    process.exit(0);
  });
}
