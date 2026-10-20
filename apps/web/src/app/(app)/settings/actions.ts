"use server";

import { eq, schema } from "@life-crm/db";
import { loadUser, mailerFromEnv, pushSenderFromEnv, runForUser } from "@life-crm/reminders";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { newCalendarToken } from "@life-crm/reminders";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/session";

const { user } = schema;

export interface SettingsState {
  error?: string;
  ok?: number;
}

const leadOptions = [30, 14, 7, 3, 1, 0];

const settingsSchema = z.object({
  timeZone: z.string().refine((tz) => Intl.supportedValuesOf("timeZone").includes(tz) || tz === "UTC", "Unknown time zone"),
  digestHour: z.coerce.number().int().min(0).max(23),
  emailDigest: z.boolean(),
  leadDays: z.array(z.coerce.number().int()).refine((a) => a.every((n) => leadOptions.includes(n)), "Invalid reminder days"),
});

export async function saveSettings(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const parsed = settingsSchema.safeParse({
    timeZone: form.get("timeZone"),
    digestHour: form.get("digestHour"),
    emailDigest: form.get("emailDigest") === "on",
    leadDays: form.getAll("leadDays"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const me = await requireUser();
  await db
    .update(user)
    .set({
      timeZone: parsed.data.timeZone,
      digestHour: parsed.data.digestHour,
      emailDigest: parsed.data.emailDigest,
      reminderLeadDays: [...new Set(parsed.data.leadDays)].sort((a, b) => b - a),
    })
    .where(eq(user.id, me.id));
  revalidatePath("/settings");
  return { ok: Date.now() };
}

/** Create or replace the calendar feed URL. The old URL stops working. */
export async function rotateCalendarFeed(): Promise<string> {
  const me = await requireUser();
  const { token, hash } = newCalendarToken();
  await db.update(user).set({ calendarTokenHash: hash }).where(eq(user.id, me.id));
  revalidatePath("/settings");
  return `${env.BETTER_AUTH_URL.replace(/\/$/, "")}/api/calendar/${token}.ics`;
}

export async function disableCalendarFeed() {
  const me = await requireUser();
  await db.update(user).set({ calendarTokenHash: null }).where(eq(user.id, me.id));
  revalidatePath("/settings");
}

/** Run today's reminder pass right away, regardless of the digest hour. */
export async function checkRemindersNow(): Promise<{ created: number }> {
  const me = await requireUser();
  const u = await loadUser(db, me.id);
  if (!u?.tenantId) return { created: 0 };
  const created = await runForUser(db, { ...u, tenantId: u.tenantId }, {
    mailer: mailerFromEnv(),
    push: pushSenderFromEnv(),
    appUrl: env.BETTER_AUTH_URL.replace(/\/$/, ""),
  });
  revalidatePath("/reminders");
  revalidatePath("/dashboard");
  return { created };
}
