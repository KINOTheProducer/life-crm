import { closenessLabels, lifeEventTypeLabels, todayIn, upcoming, type LifeEventType } from "@life-crm/core";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { MemoryCard } from "@/components/memories/memory-card";
import { SummaryCard } from "@/components/profile/summary-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { aiEnabledFor } from "@/lib/ai";
import { summaryFor } from "@/lib/data/assistant";
import { recentInteractions, recentLifeEvents } from "@/lib/data/brief";
import { formatPartialDate } from "@/lib/data/dates";
import { ensureSelf, loadFamily, relationsOf } from "@/lib/data/family";
import { listMemories } from "@/lib/data/memories";
import { listTasks } from "@/lib/data/practical";
import { getProfile } from "@/lib/data/profile";
import { listCustomReminders } from "@/lib/data/reminders";
import { avatarSrc } from "@/lib/immich-urls";
import { tenantQuery } from "@/lib/session";

const day = (d: Date, timeZone: string) => d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone });
const isoDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">{children}</CardContent>
    </Card>
  );
}

/** Everything worth remembering before you see someone, on one screen. */
export default async function BriefPage({ params }: PageProps<"/people/[id]/brief">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const data = await tenantQuery(async (tx, user) => {
    const profile = await getProfile(tx, id, { kinds: [] });
    if (!profile || profile.contact.isSelf) return null;
    const family = relationsOf(await loadFamily(tx, await ensureSelf(tx, user)), id);
    return {
      profile,
      family,
      summary: await summaryFor(tx, user, id),
      aiEnabled: await aiEnabledFor(tx, user.id),
      interactions: await recentInteractions(tx, id, 3),
      events: await recentLifeEvents(tx, id),
      reminders: await listCustomReminders(tx, user.id, id),
      tasks: (await listTasks(tx, id)).filter((t) => !t.doneAt),
      memories: await listMemories(tx, { contactId: id, limit: 2 }),
      timeZone: user.timeZone,
    };
  });
  if (!data) notFound();
  const { profile, family, timeZone } = data;
  const { contact } = profile;
  const first = contact.firstName;

  const byCategory = (...cats: string[]) => profile.facts.filter((f) => cats.includes(f.category));
  const careful = byCategory("dietary", "health");
  const people = family.relations.filter((r) => r.name !== "You" && /partner|wife|husband|spouse|son|daughter|child/.test(r.term));
  const pets = byCategory("pets");
  const followUps = byCategory("follow_up");
  const askReminders = data.reminders.filter((r) => /\bask\b/i.test(r.title));
  // The summary's follow-ups, minus ones already written down as facts.
  const noted = new Set(followUps.map((f) => f.value.toLowerCase()));
  const aiFollowUps = (data.summary.view?.askAbout ?? []).filter((a) => !noted.has(a.text.toLowerCase()));
  const about = byCategory("work", "home", "interest", "preference", "favourites", "love");
  const nextBirthday = profile.birthday ? upcoming(profile.birthday, todayIn(timeZone)) : null;
  const toYou = family.toYou && family.toYou !== "you" ? family.toYou : (contact.relationship ?? closenessLabels[contact.closeness]);

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <Link href={`/people/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        {profile.name}
      </Link>
      <header className="flex items-end gap-5 pb-2">
        <Avatar id={contact.id} name={profile.name} src={avatarSrc(contact.avatarRef)} size={84} className="text-[2rem]" />
        <div className="grid gap-1.5">
          <p className="type-meta text-muted-foreground">Brief</p>
          <h1 className="type-display text-[2.75rem] leading-[1.02]">
            {profile.name}
            {contact.nickname && <em className="text-muted-foreground"> “{contact.nickname}”</em>}
          </h1>
          <p className="text-[15px] text-muted-foreground">
            {[
              toYou,
              contact.lastInteractionAt ? `last caught up ${day(contact.lastInteractionAt, timeZone)}` : "no catch-ups logged",
              nextBirthday && nextBirthday.daysAway <= 30
                ? nextBirthday.daysAway === 0
                  ? "birthday today"
                  : `birthday in ${nextBirthday.daysAway} days`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </header>

      {careful.length > 0 && (
        <div className="flex gap-3 rounded-3xl bg-accent/40 p-5 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <ul className="grid gap-1">
            {careful.map((f) => (
              <li key={f.id}>
                <span className="font-medium">{f.label}:</span> {f.value}
              </li>
            ))}
          </ul>
        </div>
      )}

      <SummaryCard contactId={id} firstName={first} view={data.summary.view} sourceCount={data.summary.sourceCount} aiEnabled={data.aiEnabled} showAskAbout={false} />

      {(followUps.length > 0 || aiFollowUps.length > 0 || askReminders.length > 0 || data.events.length > 0) && (
        <Section title={`Ask ${first} about`}>
          <ul className="grid gap-1.5 pl-4 [list-style:disc] marker:text-muted-foreground">
            {followUps.map((f) => (
              <li key={f.id}>{f.value}</li>
            ))}
            {aiFollowUps.map((a, i) => (
              <li key={i}>{a.text}</li>
            ))}
            {askReminders.map((r) => (
              <li key={r.id}>{r.title}</li>
            ))}
            {data.events.map((e) => (
              <li key={e.id}>
                {e.title ?? lifeEventTypeLabels[e.type as LifeEventType]}
                <span className="text-muted-foreground">
                  {" "}
                  · {isoDay(e.occurredOn)}
                  {e.isSensitive && ", go gently"}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(people.length > 0 || pets.length > 0) && (
        <Section title="Their people">
          {people.map((r) => (
            <p key={r.id}>
              <span className="text-muted-foreground capitalize">{r.term}:</span>{" "}
              <Link href={`/people/${r.id}`} className="underline-offset-4 hover:underline">
                {r.name}
              </Link>
            </p>
          ))}
          {pets.map((f) => (
            <p key={f.id}>
              <span className="text-muted-foreground">{f.label}:</span> {f.value}
            </p>
          ))}
        </Section>
      )}

      <Section title="Last catch-ups">
        {data.interactions.length === 0 && <p className="text-muted-foreground">Nothing logged yet.</p>}
        {data.interactions.map((i) => (
          <div key={i.id} className="grid gap-0.5 py-1">
            <p className="text-[13px] text-muted-foreground">
              {day(i.occurredAt, timeZone)} · {i.typeLabel}
              {i.location && ` · ${i.location}`}
            </p>
            <p>{i.summary}</p>
          </div>
        ))}
      </Section>

      {about.length > 0 && (
        <Section title="Good to remember">
          {about.map((f) => (
            <p key={f.id}>
              <span className="text-muted-foreground">{f.label}:</span> {f.value}
            </p>
          ))}
          {profile.birthday && <p><span className="text-muted-foreground">Birthday:</span> {formatPartialDate(profile.birthday)}</p>}
        </Section>
      )}

      {data.tasks.length > 0 && (
        <Section title="You said you'd">
          <ul className="grid gap-1 pl-4 [list-style:disc] marker:text-muted-foreground">
            {data.tasks.map((t) => (
              <li key={t.id}>{t.title}</li>
            ))}
          </ul>
        </Section>
      )}

      {data.memories.length > 0 && (
        <div className="grid gap-3.5 sm:grid-cols-2">
          {data.memories.map((m) => (
            <MemoryCard key={m.id} memory={m} compact />
          ))}
        </div>
      )}
    </div>
  );
}
