import { Cake } from "lucide-react";
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
    <div className="grid max-w-3xl gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cake className="size-4" />
            Birthdays in the next 30 days
          </CardTitle>
        </CardHeader>
        <CardContent>
          {birthdays.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing coming up.</p>
          ) : (
            <ul className="grid gap-3">
              {birthdays.map((b) => (
                <li key={b.contactId} className="flex items-center justify-between text-sm">
                  <span>
                    <span className="font-medium">{b.name}</span>
                    {b.turning != null && <span className="text-muted-foreground"> turns {b.turning}</span>}
                  </span>
                  <span className="text-muted-foreground">
                    {whenLabel(b.daysAway)} ·{" "}
                    {monthDay.format(new Date(Date.UTC(b.date.year, b.date.month - 1, b.date.day)))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
