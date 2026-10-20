import { and, eq, isNull, schema, withTenant } from "@life-crm/db";
import { NextResponse } from "next/server";
import { buildCalendar, hashCalendarToken, type CalendarEvent } from "@life-crm/reminders";
import { fullName } from "@/lib/data/contacts";
import { db } from "@/lib/db";

const { contacts, importantDates, reminders, user } = schema;
const pad = (n: number) => String(n).padStart(2, "0");
const typeLabel: Record<string, string> = {
  birthday: "birthday",
  anniversary: "anniversary",
  memorial: "remembrance",
  graduation: "graduation",
  due_date: "due date",
  custom: "",
};
const rruleFor = { weekly: "FREQ=WEEKLY", monthly: "FREQ=MONTHLY", yearly: "FREQ=YEARLY" } as const;

/** Read-only iCalendar feed of birthdays, dates and reminders. The URL token is the credential. */
export async function GET(_request: Request, { params }: RouteContext<"/api/calendar/[token]">) {
  const { token } = await params;
  const name = token.replace(/\.ics$/, "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(name)) return new NextResponse("Not found", { status: 404 });

  const [owner] = await db
    .select({ id: user.id, tenantId: user.tenantId, leadDays: user.reminderLeadDays })
    .from(user)
    .where(eq(user.calendarTokenHash, hashCalendarToken(name)));
  if (!owner?.tenantId) return new NextResponse("Not found", { status: 404 });

  const events = await withTenant(db, owner.tenantId, async (tx) => {
    const dates = await tx
      .select({
        id: importantDates.id,
        type: importantDates.type,
        label: importantDates.label,
        year: importantDates.year,
        month: importantDates.month,
        day: importantDates.day,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(importantDates)
      .innerJoin(contacts, eq(contacts.id, importantDates.contactId))
      .where(and(isNull(contacts.deletedAt), eq(contacts.isSelf, false)));
    const custom = await tx
      .select()
      .from(reminders)
      .where(and(eq(reminders.userId, owner.id), isNull(reminders.archivedAt)));

    const out: CalendarEvent[] = dates.map((d) => {
      const what = d.label ?? typeLabel[d.type] ?? d.type;
      // Unknown birth years start the series in 2000; it only affects the first occurrence.
      const year = d.year ?? 2000;
      return {
        uid: `date-${d.id}@life-crm`,
        date: `${year}${pad(d.month)}${pad(d.day)}`,
        summary: `${fullName(d)}'s ${what}`.trim(),
        rrule: d.month === 2 && d.day === 29 ? "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1" : "FREQ=YEARLY",
        alarms: owner.leadDays.filter((n) => n <= 14),
      };
    });
    for (const r of custom) {
      out.push({
        uid: `reminder-${r.id}@life-crm`,
        date: r.dueOn.replace(/-/g, ""),
        summary: r.title,
        rrule: r.repeat === "none" ? undefined : rruleFor[r.repeat],
        alarms: [0],
      });
    }
    return out;
  });

  return new NextResponse(buildCalendar("Life CRM", events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=900",
    },
  });
}
