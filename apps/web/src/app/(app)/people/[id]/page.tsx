import { factCategoryLabels, todayIn, upcoming } from "@life-crm/core";
import { ArrowLeft, Mic } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Composer } from "@/components/profile/composer";
import { FactsPanel } from "@/components/profile/facts-panel";
import { CustomReminderList } from "@/components/reminders/custom-reminder-list";
import { ReminderForm } from "@/components/reminders/reminder-form";
import { Timeline } from "@/components/profile/timeline";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPartialDate, toIsoDate } from "@/lib/data/dates";
import { getProfile, parseKinds } from "@/lib/data/profile";
import { listCustomReminders } from "@/lib/data/reminders";
import { tenantQuery } from "@/lib/session";

const tierLabel = { inner: "Inner circle", close: "Close", friend: "Friend", acquaintance: "Acquaintance" } as const;

function daysSince(date: Date) {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function lastTalked(date: Date | null) {
  if (!date) return "No catch-ups logged yet";
  const days = daysSince(date);
  if (days <= 0) return "Caught up today";
  if (days === 1) return "Caught up yesterday";
  return `Last caught up ${days} days ago`;
}

export default async function PersonPage({ params, searchParams }: PageProps<"/people/[id]">) {
  const { id } = await params;
  const { kind, before } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const kinds = parseKinds(kind);
  const cursor = typeof before === "string" && /^[0-9a-f-]{36}$/.test(before) ? before : undefined;

  const result = await tenantQuery(async (tx, user) => ({
    profile: await getProfile(tx, id, { kinds, before: cursor }),
    reminders: await listCustomReminders(tx, user.id, id),
    timeZone: user.timeZone,
  }));
  if (!result.profile) notFound();
  const { profile, timeZone } = result;
  const { contact } = profile;

  const today = todayIn(timeZone);
  const nextBirthday = profile.birthday ? upcoming(profile.birthday, today) : null;
  const overdue =
    contact.keepInTouchDays != null &&
    (contact.lastInteractionAt ? daysSince(contact.lastInteractionAt) : Infinity) > contact.keepInTouchDays;

  return (
    <>
      <Link href="/people" className="type-label mb-6 inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        People
      </Link>
      <PageHeader
        eyebrow={tierLabel[contact.closeness]}
        title={
          <>
            {profile.name}
            {contact.nickname && <em className="text-accent-ink"> “{contact.nickname}”</em>}
          </>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            {contact.pronouns && <Badge>{contact.pronouns}</Badge>}
            <span>{lastTalked(contact.lastInteractionAt)}</span>
            {overdue && <Badge variant="accent">Due for a catch-up</Badge>}
          </span>
        }
        actions={
          <>
            <Link href={`/capture/new?contact=${contact.id}`} className={buttonVariants({ variant: "accent" })}>
              <Mic />
              Voice note
            </Link>
            <Link href="#compose" className={buttonVariants({ variant: "outline" })}>
              Log catch-up
            </Link>
          </>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="grid content-start gap-8">
          <Composer contactId={contact.id} firstName={contact.firstName} today={toIsoDate(today)} />
          <Timeline
            contactId={contact.id}
            entries={profile.timeline.entries}
            hasMore={profile.timeline.hasMore}
            activeKinds={kinds}
            names={profile.names}
            timeZone={timeZone}
          />
        </div>

        <aside className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <p className="type-label text-muted-foreground">At a glance</p>
              <CardTitle>Key dates</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <div className="grid gap-1">
                <p className="type-label text-muted-foreground">Birthday</p>
                {profile.birthday && nextBirthday ? (
                  <p>
                    {formatPartialDate(profile.birthday)}
                    <span className="text-muted-foreground">
                      {" · "}
                      {nextBirthday.daysAway === 0 ? "today" : `in ${nextBirthday.daysAway} days`}
                      {nextBirthday.turning != null && `, turning ${nextBirthday.turning}`}
                    </span>
                  </p>
                ) : (
                  <p className="text-muted-foreground">Unknown</p>
                )}
              </div>
              {contact.howMet && (
                <div className="grid gap-1">
                  <p className="type-label text-muted-foreground">How you met</p>
                  <p>{contact.howMet}</p>
                </div>
              )}
              {contact.keepInTouchDays && (
                <div className="grid gap-1">
                  <p className="type-label text-muted-foreground">Keep in touch</p>
                  <p>Every {contact.keepInTouchDays} days</p>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <p className="type-label text-muted-foreground">Don&apos;t forget</p>
              <CardTitle>Reminders</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <CustomReminderList items={result.reminders} />
              <ReminderForm today={toIsoDate(today)} contactId={contact.id} placeholder={`Ask ${contact.firstName} about…`} />
            </CardContent>
          </Card>
          <FactsPanel
            contactId={contact.id}
            firstName={contact.firstName}
            facts={profile.facts.map((f) => ({ ...f, category: f.category as keyof typeof factCategoryLabels }))}
          />
        </aside>
      </div>
    </>
  );
}
