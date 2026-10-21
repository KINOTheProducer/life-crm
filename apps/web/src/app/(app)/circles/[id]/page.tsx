import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { todayIn } from "@life-crm/core";
import { CircleDetails, CircleMembers, GroupCatchup } from "@/components/circles/circle-panels";
import { toneClass } from "@/components/circles/tones";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCircle } from "@/lib/data/circles";
import { contactOptions } from "@/lib/data/contacts";
import { toIsoDate } from "@/lib/data/dates";
import { avatarSrc } from "@/lib/immich-urls";
import { tenantQuery } from "@/lib/session";
import { cn } from "@/lib/utils";

function lastSeen(date: Date | null) {
  if (!date) return "No catch-ups yet";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 60) return `${days} days ago`;
  return `${Math.round(days / 30)} months ago`;
}

function memberRow(m: { id: string; name: string; lastInteractionAt: Date | null; keepInTouchDays: number | null }) {
  const days = m.lastInteractionAt ? (Date.now() - m.lastInteractionAt.getTime()) / 86_400_000 : Infinity;
  return { id: m.id, name: m.name, detail: lastSeen(m.lastInteractionAt), overdue: m.keepInTouchDays != null && days > m.keepInTouchDays };
}

export default async function CirclePage({ params }: PageProps<"/circles/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await tenantQuery(async (tx, user) => ({
    circle: await getCircle(tx, id),
    people: await contactOptions(tx),
    today: toIsoDate(todayIn(user.timeZone)),
  }));
  if (!data.circle) notFound();
  const { circle } = data;
  const members = circle.members.map(memberRow);

  return (
    <>
      <Link href="/circles" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Circles
      </Link>
      <header className="flex items-center gap-4 pb-8">
        <span className={cn("size-5 rounded-full ring-1 ring-foreground/15", toneClass[circle.tone])} />
        <h1 className="type-display text-[3.25rem] leading-[1.02]">{circle.name}</h1>
      </header>
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{members.length === 1 ? "1 person" : `${members.length} people`}</CardTitle>
            </CardHeader>
            <CardContent>
              <CircleMembers
                circleId={circle.id}
                people={data.people}
                members={members}
                avatars={Object.fromEntries(circle.members.map((m) => [m.id, avatarSrc(m.avatarRef)]))}
              />
            </CardContent>
          </Card>
          <GroupCatchup circleId={circle.id} members={members} today={data.today} />
        </div>
        <aside>
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <CircleDetails circle={circle} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
