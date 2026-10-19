import { Cake } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { upcomingBirthdays } from "@/lib/data/people";

const monthDay = new Intl.DateTimeFormat("en-CA", { month: "long", day: "numeric", timeZone: "UTC" });

function whenLabel(daysAway: number) {
  if (daysAway === 0) return "Today";
  if (daysAway === 1) return "Tomorrow";
  return `In ${daysAway} days`;
}

export default async function DashboardPage() {
  const birthdays = await upcomingBirthdays(30);

  return (
    <>
      <PageHeader eyebrow="Dashboard" title="This month with your people" />
      <Card className="max-w-3xl">
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
    </>
  );
}
