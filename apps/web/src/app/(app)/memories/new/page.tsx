import { todayIn } from "@life-crm/core";
import { MemoryForm } from "@/components/memories/memory-form";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { contactOptions } from "@/lib/data/contacts";
import { toIsoDate } from "@/lib/data/dates";
import { tenantQuery } from "@/lib/session";

export default async function NewMemoryPage({ searchParams }: PageProps<"/memories/new">) {
  const { person } = await searchParams;
  const { people, today } = await tenantQuery(async (tx, user) => ({
    people: (await contactOptions(tx)).map(({ id, name, nickname, avatarRef }) => ({ id, name, nickname, avatarRef })),
    today: toIsoDate(todayIn(user.timeZone)),
  }));
  const preselect = typeof person === "string" && people.some((p) => p.id === person) ? [person] : [];

  return (
    <>
      <PageHeader title="A new memory." aside="Photos come next." />
      <Card className="max-w-3xl">
        <CardContent>
          <MemoryForm
            memoryId={null}
            people={people}
            today={today}
            values={{ title: "", kind: "trip", reason: null, startedOn: today, endedOn: null, location: null, story: null, people: preselect }}
          />
        </CardContent>
      </Card>
    </>
  );
}
