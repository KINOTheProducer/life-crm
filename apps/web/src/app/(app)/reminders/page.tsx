import { formatIsoDate, todayIn } from "@life-crm/core";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { CustomReminderList } from "@/components/reminders/custom-reminder-list";
import { ReminderForm } from "@/components/reminders/reminder-form";
import { ReminderItem } from "@/components/reminders/reminder-item";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { contactOptions } from "@/lib/data/contacts";
import { countSnoozed, listCustomReminders, listInbox } from "@/lib/data/reminders";
import { tenantQuery } from "@/lib/session";

export default async function RemindersPage() {
  const data = await tenantQuery(async (tx, user) => ({
    inbox: await listInbox(tx, user.id, user.timeZone),
    snoozed: await countSnoozed(tx, user.id, user.timeZone),
    custom: await listCustomReminders(tx, user.id),
    people: await contactOptions(tx),
    today: formatIsoDate(todayIn(user.timeZone)),
  }));
  const now = data.inbox.filter((i) => i.overdue || i.today);
  const soon = data.inbox.filter((i) => !i.overdue && !i.today);

  return (
    <>
      <PageHeader
        title="Reminders."
        aside={now.length ? `${now.length} for today.` : "You're all caught up."}
        description={
          <>
            New reminders show up at your daily time.{" "}
            <Link href="/settings" className="underline underline-offset-4">
              Change when and how
            </Link>
            .
          </>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Today</CardTitle>
            </CardHeader>
            <CardContent>
              {now.length === 0 ? (
                <p className="text-muted-foreground">Nothing needs you today.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {now.map((i) => (
                    <ReminderItem key={i.id} item={i} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          {soon.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Coming up</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {soon.map((i) => (
                    <ReminderItem key={i.id} item={i} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {data.snoozed > 0 && (
            <p className="text-sm text-muted-foreground">
              {data.snoozed} snoozed {data.snoozed === 1 ? "reminder" : "reminders"} will come back on their own.
            </p>
          )}
        </div>
        <aside className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Remind me</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5">
              <ReminderForm today={data.today} people={data.people} />
              <CustomReminderList items={data.custom} showPerson />
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
