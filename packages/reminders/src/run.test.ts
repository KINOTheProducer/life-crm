import { createDb, eq, schema, withTenant } from "@life-crm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Email } from "./mailer";
import type { PushMessage } from "./push";
import { runDueUsers } from "./run";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("runDueUsers", () => {
  const db = createDb(url!);
  // Other users may exist in the database; only record what is sent to the test user.
  const emails: Email[] = [];
  const pushes: PushMessage[] = [];
  let tenantId = "";
  const userId = `test-${Date.now()}`;
  const email = `${userId}@example.com`;
  let ourEndpoint = "";
  const deps = {
    appUrl: "https://crm.test",
    onlyUserIds: [userId],
    mailer: { send: async (e: Email) => void (e.to === email && emails.push(e)) },
    push: {
      send: async (t: { endpoint: string }, m: PushMessage) => (t.endpoint === ourEndpoint && pushes.push(m), "sent" as const),
    },
  };

  // 2026-10-19 09:00 in Toronto (13:00 UTC); digest hour is 8.
  const at = (iso: string) => new Date(iso);

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "reminders-test" }).returning();
    tenantId = t!.id;
    await db.insert(schema.user).values({ id: userId, name: "Kino Test", email, tenantId, timeZone: "America/Toronto" });
    ourEndpoint = `https://push.test/${userId}`;
    await withTenant(db, tenantId, async (tx) => {
      const [sarah] = await tx
        .insert(schema.contacts)
        .values({ tenantId, firstName: "Sarah", keepInTouchDays: 21, lastInteractionAt: at("2026-09-01T16:00:00Z") })
        .returning();
      await tx.insert(schema.importantDates).values({ tenantId, contactId: sarah!.id, type: "birthday", year: 1994, month: 10, day: 24 });
      await tx.insert(schema.reminders).values({ tenantId, userId, contactId: sarah!.id, title: "Call Sarah", dueOn: "2026-10-19", repeat: "weekly" });
      await tx.insert(schema.pushSubscriptions).values({ tenantId, userId, endpoint: ourEndpoint, p256dh: "k", auth: "a" });
    });
  });

  afterAll(async () => {
    await db.delete(schema.user).where(eq(schema.user.id, userId));
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
    await db.$client.end();
  });

  const open = () =>
    withTenant(db, tenantId, (tx) =>
      tx.select().from(schema.notifications).where(eq(schema.notifications.userId, userId)),
    );

  it("waits for the digest hour", async () => {
    await runDueUsers(db, { ...deps, now: at("2026-10-19T11:00:00Z") }); // 07:00 local
    expect(await open()).toEqual([]);
  });

  it("creates, emails and pushes the day's reminders once", async () => {
    await runDueUsers(db, { ...deps, now: at("2026-10-19T13:00:00Z") });
    const rows = await open();
    expect(rows.map((n) => n.title).sort()).toEqual([
      "Call Sarah",
      "Sarah's birthday is in 5 days",
      "Time to catch up with Sarah",
    ]);
    expect(emails).toHaveLength(1);
    expect(emails[0]!.subject).toBe("3 reminders about your people");
    expect(emails[0]!.text).toContain("Good morning, Kino");
    expect(pushes).toHaveLength(3);

    await runDueUsers(db, { ...deps, now: at("2026-10-19T15:00:00Z") });
    expect(await open()).toHaveLength(3);
    expect(emails).toHaveLength(1);
    expect(pushes).toHaveLength(3);
  });

  it("advances repeating reminders", async () => {
    const [r] = await withTenant(db, tenantId, (tx) => tx.select().from(schema.reminders));
    expect(r!.dueOn).toBe("2026-10-26");
  });

  it("replaces the earlier birthday tier and brings back snoozed reminders", async () => {
    const checkin = (await open()).find((n) => n.kind === "checkin")!;
    await withTenant(db, tenantId, (tx) =>
      tx.update(schema.notifications).set({ snoozedUntil: "2026-10-21" }).where(eq(schema.notifications.id, checkin.id)),
    );

    await runDueUsers(db, { ...deps, now: at("2026-10-21T13:00:00Z") });
    const rows = await open();
    const birthday = rows.filter((n) => n.kind === "date");
    expect(birthday.map((n) => [n.title, n.status]).sort()).toEqual([
      ["Sarah's birthday is in 3 days", "open"],
      ["Sarah's birthday is in 5 days", "superseded"],
    ]);
    expect(rows.find((n) => n.id === checkin.id)!.snoozedUntil).toBeNull();
    // New tier and the un-snoozed check-in go out again.
    expect(emails.at(-1)!.subject).toBe("2 reminders about your people");
  });
});
