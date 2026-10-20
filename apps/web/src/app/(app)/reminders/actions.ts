"use server";

import { addDays, formatIsoDate, repeatRules, todayIn } from "@life-crm/core";
import { and, eq, isNull, schema } from "@life-crm/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, tenantQuery } from "@/lib/session";

const { contacts, notifications, reminders } = schema;
const uuid = z.uuid();

function refresh(contactId?: string | null) {
  revalidatePath("/reminders");
  revalidatePath("/dashboard");
  if (contactId) revalidatePath(`/people/${contactId}`);
}

async function updateNotification(id: string, values: Partial<typeof notifications.$inferInsert>) {
  if (!uuid.safeParse(id).success) return;
  const user = await requireUser();
  const [row] = await tenantQuery((tx) =>
    tx
      .update(notifications)
      .set(values)
      .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)))
      .returning({ contactId: notifications.contactId }),
  );
  refresh(row?.contactId);
}

export async function markDone(id: string) {
  await updateNotification(id, { status: "done", resolvedAt: new Date() });
}

export async function dismiss(id: string) {
  await updateNotification(id, { status: "dismissed", resolvedAt: new Date() });
}

export async function snooze(id: string, days: number) {
  const user = await requireUser();
  const until = addDays(todayIn(user.timeZone), Math.min(Math.max(1, Math.round(days)), 90));
  // Cleared delivery stamps make it go out again when it comes back.
  await updateNotification(id, { snoozedUntil: formatIsoDate(until), emailedAt: null, pushedAt: null });
}

export interface ReminderFormState {
  error?: string;
  ok?: number;
}

const reminderSchema = z.object({
  title: z.string().trim().min(1, "What should we remind you about?").max(200),
  dueOn: z.iso.date("Pick a date"),
  repeat: z.enum(repeatRules),
  contactId: z
    .string()
    .transform((v) => v || null)
    .pipe(z.uuid().nullable()),
});

export async function createReminder(_prev: ReminderFormState, form: FormData): Promise<ReminderFormState> {
  const parsed = reminderSchema.safeParse({
    title: form.get("title"),
    dueOn: form.get("dueOn"),
    repeat: form.get("repeat") ?? "none",
    contactId: form.get("contactId") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const user = await requireUser();
  if (parsed.data.dueOn < formatIsoDate(todayIn(user.timeZone))) {
    return { error: "That date has already passed" };
  }

  const error = await tenantQuery(async (tx) => {
    if (parsed.data.contactId) {
      const [c] = await tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.id, parsed.data.contactId), isNull(contacts.deletedAt)));
      if (!c) return "Person not found";
    }
    await tx.insert(reminders).values({ tenantId: user.tenantId, userId: user.id, ...parsed.data });
    return null;
  });
  if (error) return { error };
  refresh(parsed.data.contactId);
  return { ok: Date.now() };
}

export async function deleteReminder(id: string) {
  if (!uuid.safeParse(id).success) return;
  const user = await requireUser();
  const [row] = await tenantQuery((tx) =>
    tx
      .update(reminders)
      .set({ archivedAt: new Date() })
      .where(and(eq(reminders.id, id), eq(reminders.userId, user.id)))
      .returning({ contactId: reminders.contactId }),
  );
  refresh(row?.contactId);
}
