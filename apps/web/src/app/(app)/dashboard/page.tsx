import { Cake } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { ReminderItem } from "@/components/reminders/reminder-item";
import { upcomingBirthdays } from "@/lib/data/people";
import { listInbox } from "@/lib/data/reminders";
import { tenantQuery } from "@/lib/session";

const monthDay = new Intl.DateTimeFormat("en-CA", { month: "long", day: "numeric", timeZone: "UTC" });

function whenLabel(daysAway: number) {
  if (daysAway === 0) return "Today";
  if (daysAway === 1) return "Tomorrow";
  return `In ${daysAway} days`;
}

export default async function DashboardPage() {
  const birthdays = await upcomingBirthdays(30);
  const inbox = await tenantQuery((tx, user) => listInbox(tx, user.id, user.timeZone, 6));

  return (
    <>
      <PageHeader eyebrow="Dashboard" title="This month with your people" />
      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <p className="type-label text-muted-foreground">Needs you</p>
          <CardTitle>Reminders</CardTitle>
        </CardHeader>
        <CardContent>
          {inbox.length === 0 ? (
            <p className="text-muted-foreground">Nothing right now.</p>
          ) : (
            <ul className="divide-y divide-border">
              {inbox.map((i) => (
                <ReminderItem key={i.id} item={i} compact />
              ))}
            </ul>
          )}
          <Link href="/reminders" className="type-label mt-4 inline-block text-muted-foreground hover:text-foreground">
            All reminders
          </Link>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <p className="type-label flex items-center gap-2 text-muted-foreground">
            <Cake className="size-3.5" />
            Next 30 days
          </p>
          <CardTitle>Birthdays</CardTitle>
        </CardHeader>
        <CardContent>
          {birthdays.length === 0 ? (
            <p className="text-muted-foreground">Nothing coming up.</p>
          ) : (
            <ul className="divide-y divide-border">
              {birthdays.map((b) => (
                <li key={b.contactId} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <span>
                    <span className="font-medium">{b.name}</span>
                    {b.turning != null && <span className="text-muted-foreground"> turns {b.turning}</span>}
                  </span>
                  <span className="type-label text-muted-foreground">
                    {b.daysAway <= 1 ? (
                      <span className="rounded-full bg-accent px-2.5 py-1 text-accent-foreground">{whenLabel(b.daysAway)}</span>
                    ) : (
                      whenLabel(b.daysAway)
                    )}{" "}
                    · {monthDay.format(new Date(Date.UTC(b.date.year, b.date.month - 1, b.date.day)))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      </div>
    </>
  );
}
