
import { anniversaryName } from "@life-crm/core";
import { ArrowUpRight, Heart } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar, initials, toneFor } from "@/components/avatar";
import { YearChart } from "@/components/dashboard/year-chart";
import { PageHeader } from "@/components/page-header";
import { ReminderItem } from "@/components/reminders/reminder-item";
import { buttonVariants } from "@/components/ui/button";
import { closenessCounts, drifting, factsFor, yearOfCatchups } from "@/lib/data/dashboard";
import { partnerCards, userPrefs } from "@/lib/data/partners";
import { upcomingBirthdays } from "@/lib/data/people";
import { listInbox } from "@/lib/data/reminders";
import { tenantQuery } from "@/lib/session";
import { cn } from "@/lib/utils";
import { avatarSrc } from "@/lib/immich-urls";

const tiers = [
  { key: "inner", label: "Inner circle", tone: "bg-peach" },
  { key: "close", label: "Close friends", tone: "bg-sage" },
  { key: "friend", label: "Friends", tone: "bg-lilac" },
  { key: "acquaintance", label: "Acquaintances", tone: "bg-sky" },
] as const;

function greeting(hour: number) {
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

const longDate = (tz: string) => new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: tz });
const monthDay = new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

function countWord(n: number) {
  return ["No one", "One person", "Two people", "Three people", "Four people", "Five people"][n] ?? `${n} people`;
}

export default async function DashboardPage() {
  const prefs = await tenantQuery((tx, user) => userPrefs(tx, user.id));
  if (!prefs.onboardedAt) redirect("/onboarding");
  const birthdays = await upcomingBirthdays(30);
  const data = await tenantQuery(async (tx, user) => {
    const next = birthdays[0];
    return {
      user,
      partners: await partnerCards(tx, user.timeZone),
      inbox: await listInbox(tx, user.id, user.timeZone, 5),
      drifting: await drifting(tx),
      tiers: await closenessCounts(tx),
      year: await yearOfCatchups(tx, user.timeZone),
      nextFacts: next ? await factsFor(tx, next.contactId) : [],
    };
  });
  const { user } = data;
  const hour = Number(new Intl.DateTimeFormat("en-CA", { hour: "numeric", hourCycle: "h23", timeZone: user.timeZone }).format(new Date()));
  const first = user.name.split(" ")[0];
  const waiting = data.drifting.length;
  const next = birthdays[0];
  const askAbout = data.nextFacts.find((f) => f.category === "follow_up");
  // Something that says who they are, not an allergy.
  const known = ["work", "interest", "family", "pets", "home", "life"]
    .map((c) => data.nextFacts.find((f) => f.category === c))
    .find(Boolean);
  const people = Object.values(data.tiers).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        meta={longDate(user.timeZone).format(new Date())}
        title={`${greeting(hour)}, ${first}.`}
        aside={waiting > 0 ? `${countWord(waiting)} would love to hear from you.` : "Everyone's been heard from lately."}
        actions={
          <>
            <Link href="/people" className={buttonVariants({ variant: "outline" })}>
              Log a catch-up
            </Link>
            <Link href="/capture/new" className={buttonVariants()}>
              <span className="size-2 rounded-full bg-coral shadow-[0_0_0_4px_rgb(255_90_54/0.25)]" />
              Record a note
            </Link>
          </>
        }
      />

      {data.partners.length > 0 && (
        <div className={cn("mb-3.5 grid gap-3.5", data.partners.length > 1 && "lg:grid-cols-2")}>
          {data.partners.map((p) => (
            <PartnerCard key={p.contactId} partner={p} />
          ))}
        </div>
      )}

      <div className="grid gap-3.5 lg:grid-cols-[1.2fr_1fr_1fr]">
        {/* Next birthday */}
        <section className="flex flex-col overflow-hidden rounded-3xl bg-card lg:row-span-2">
          {next ? (
            <>
              <div className={cn("relative grid h-60 place-items-center", toneFor(next.contactId))}>
                <span className="type-display text-[7rem] text-foreground/80 italic">{initials(next.name)}</span>
                <span className="absolute top-4 left-4 rounded-full bg-white/90 px-3 py-1.5 text-xs">
                  Birthday · {next.daysAway === 0 ? "today" : monthDay.format(new Date(Date.UTC(next.date.year, next.date.month - 1, next.date.day))).split(",")[0]}
                </span>
                <span className="absolute right-4 bottom-4 grid rounded-2xl bg-coral px-4 py-2.5 text-center leading-none text-white">
                  <span className="type-display text-[2.25rem]">{next.daysAway}</span>
                  <span className="type-meta mt-1">{next.daysAway === 1 ? "day" : "days"}</span>
                </span>
              </div>
              <div className="grid gap-1 px-6 pt-5 pb-6">
                <p className="text-sm text-muted-foreground">Coming up</p>
                <Link href={`/people/${next.contactId}`} className="type-display text-[2rem] hover:underline">
                  {next.turning != null ? `${next.name.split(" ")[0]} turns ${next.turning}` : `${next.name}'s birthday`}
                </Link>
                {known && <p className="text-[15px] text-muted-foreground">{known.value}</p>}
                <dl className="mt-3 divide-y divide-border border-t border-border text-[15px]">
                  {askAbout && (
                    <div className="flex justify-between gap-4 py-3">
                      <dt className="text-muted-foreground">Ask about</dt>
                      <dd className="text-right">{askAbout.value}</dd>
                    </div>
                  )}
                  {birthdays.slice(1, 4).map((b) => (
                    <div key={b.contactId} className="flex justify-between gap-4 py-3">
                      <dt>
                        <Link href={`/people/${b.contactId}`} className="hover:underline">
                          {b.name}
                        </Link>
                      </dt>
                      <dd className="text-muted-foreground">in {b.daysAway} days</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </>
          ) : (
            <div className="grid flex-1 content-center gap-2 p-8">
              <p className="type-display text-3xl">No birthdays in the next month.</p>
              <p className="text-muted-foreground">Add birthdays to people and they&apos;ll show up here.</p>
            </div>
          )}
        </section>

        {/* Drifting */}
        <section className="rounded-3xl bg-card p-6">
          <h2 className="text-sm text-muted-foreground">Drifting</h2>
          {data.drifting.length === 0 ? (
            <p className="mt-3 text-[15px]">You&apos;re up to date with everyone.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {data.drifting.map((p) => (
                <li key={p.id}>
                  <Link href={`/people/${p.id}`} className="flex items-center gap-3 py-3 hover:opacity-80">
                    <Avatar id={p.id} name={p.name} src={avatarSrc(p.avatarRef)} size={38} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{p.name}</span>
                      <span className="block truncate text-[13px] text-muted-foreground">
                        {p.note ?? `Usually every ${Math.round(p.cadenceDays / 7)} weeks`}
                      </span>
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{p.daysSince != null ? `${p.daysSince}d` : "new"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Closeness */}
        <section className="rounded-3xl bg-card p-6">
          <h2 className="text-sm text-muted-foreground">{people} people</h2>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {tiers.map((t) => (
              <Link key={t.key} href={`/people?tier=${t.key}`} className={cn("flex min-h-24 flex-col justify-between rounded-2xl p-3.5 transition-transform hover:-translate-y-0.5", t.tone)}>
                <span className="text-[13px] text-foreground/70">{t.label}</span>
                <span className="type-display text-[2rem]">{data.tiers[t.key]}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Year */}
        <section className="rounded-3xl bg-card p-6 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-sm text-muted-foreground">Your year</h2>
              <p className="type-display mt-1 text-[1.875rem]">
                {data.year.total} catch-ups
                {data.year.previous > 0 && <em className="text-muted-foreground">, {data.year.total >= data.year.previous ? "up" : "down"} from {data.year.previous}</em>}
              </p>
            </div>
            <div className="flex gap-4 text-[13px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-foreground" />In person</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-coral" />Calls & messages</span>
            </div>
          </div>
          <div className="mt-4">
            <YearChart months={data.year.months} />
          </div>
        </section>
      </div>

      {data.inbox.length > 0 && (
        <section className="mt-3.5 rounded-3xl bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm text-muted-foreground">Reminders</h2>
            <Link href="/reminders" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              All <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {data.inbox.map((i) => (
              <ReminderItem key={i.id} item={i} compact />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

type Partner = Awaited<ReturnType<typeof partnerCards>>[number];

/** Your partner, pinned: next anniversary, time since the last date, and what to ask or get them. */
function PartnerCard({ partner: p }: { partner: Partner }) {
  const anniversary = p.nextAnniversary;
  const soon = anniversary != null && anniversary.daysAway <= 21;
  const lastDate =
    p.dateNight.daysSince == null ? "No date nights logged yet" : p.dateNight.daysSince === 0 ? "Date night today" : `Last date night ${p.dateNight.daysSince} days ago`;
  return (
    <section className="flex flex-wrap items-center gap-6 rounded-3xl bg-card p-6">
      <Avatar id={p.contactId} name={p.name} src={avatarSrc(p.avatarRef)} size={64} className="text-2xl" />
      <div className="grid min-w-48 flex-1 gap-1">
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
          <Heart className="size-3.5 fill-coral text-coral" />
          {p.label}
          {p.together && <span className="whitespace-nowrap">· together {p.together}</span>}
        </p>
        <Link href={`/people/${p.contactId}/partner`} className="type-display text-[1.875rem] leading-tight hover:underline">
          {p.name}
        </Link>
        <p className={cn("text-[15px]", p.dateNight.due ? "text-accent-ink" : "text-muted-foreground")}>
          {lastDate}
          {p.dateNight.due && ", time for one"}
        </p>
      </div>
      <dl className="grid min-w-56 flex-1 gap-2 text-[15px]">
        {(p.followUp || p.wish) && (
          <div className="grid gap-0.5">
            <dt className="text-[13px] text-muted-foreground">{p.followUp ? "Ask about" : "Gift idea"}</dt>
            <dd>{p.followUp ?? p.wish}</dd>
          </div>
        )}
        {!p.followUp && !p.wish && !anniversary && (
          <dd className="text-muted-foreground">
            <Link href={`/people/${p.contactId}/partner`} className="underline underline-offset-4">
              Add your anniversary and their love languages
            </Link>
          </dd>
        )}
      </dl>
      {anniversary && (
        <div className={cn("grid rounded-2xl px-5 py-3 text-center leading-none", soon ? "bg-coral text-white" : "bg-secondary")}>
          <span className="type-display text-[2.25rem]">{anniversary.daysAway}</span>
          <span className="type-meta mt-1">{anniversary.daysAway === 1 ? "day" : "days"}</span>
          <span className="mt-1.5 text-xs">to your {anniversaryName(anniversary.milestone)}</span>
        </div>
      )}
    </section>
  );
}
