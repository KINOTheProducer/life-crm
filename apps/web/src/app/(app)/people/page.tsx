import { closenessTiers, type ClosenessTier } from "@life-crm/core";
import { ChartGantt, Plus, Search, Upload } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { filterOptions, listPeople } from "@/lib/data/people";
import { PeopleFilters } from "@/components/people/filters";
import { cn } from "@/lib/utils";
import { avatarSrc } from "@/lib/immich-urls";

const tierLabel: Record<ClosenessTier, string> = {
  inner: "Inner circle",
  close: "Close friends",
  friend: "Friends",
  acquaintance: "Acquaintances",
};
const tierTone: Record<ClosenessTier, string> = { inner: "bg-peach", close: "bg-sage", friend: "bg-lilac", acquaintance: "bg-sky" };

function ago(date: Date | null) {
  if (!date) return "Never";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 60) return `${days} days ago`;
  return `${Math.round(days / 30)} months ago`;
}

export default async function PeoplePage({ searchParams }: PageProps<"/people">) {
  const params = await searchParams;
  const str = (v: unknown, max = 100) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const activeTier = (closenessTiers as readonly string[]).includes(str(params.tier)) ? (str(params.tier) as ClosenessTier) : undefined;
  const query = str(params.q);
  const month = Number(str(params.month)) || undefined;
  const city = str(params.city);
  const interest = str(params.interest);
  const overdue = params.overdue === "1";
  const circle = /^[0-9a-f-]{36}$/.test(str(params.circle)) ? str(params.circle) : "";
  const filtered = Boolean(query || month || city || interest || overdue || circle);
  const [people, options] = await Promise.all([
    listPeople({ tier: activeTier, q: query, month: month && month >= 1 && month <= 12 ? month : undefined, city, interest, overdue, circleId: circle || undefined }),
    filterOptions(),
  ]);
  // Keep the other filters when switching tiers.
  const href = (t?: ClosenessTier) => {
    const sp = new URLSearchParams();
    if (t) sp.set("tier", t);
    if (query) sp.set("q", query);
    if (month) sp.set("month", String(month));
    if (city) sp.set("city", city);
    if (interest) sp.set("interest", interest);
    if (overdue) sp.set("overdue", "1");
    if (circle) sp.set("circle", circle);
    const qs = sp.toString();
    return `/people${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="People"
        aside={activeTier ? tierLabel[activeTier].toLowerCase() : undefined}
        actions={
          <>
            <Link href="/people/timeline" className={buttonVariants({ variant: "ghost", className: "max-md:bg-card" })}>
              <ChartGantt />
              Over the years
            </Link>
            <Link href="/people/import" className={buttonVariants({ variant: "outline" })}>
              <Upload />
              Import
            </Link>
            <Link href="/people/new" className={buttonVariants()}>
              <Plus />
              Add someone
            </Link>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form action="/people" className="relative w-full md:mr-2 md:w-auto">
          {activeTier && <input type="hidden" name="tier" value={activeTier} />}
          {month && <input type="hidden" name="month" value={month} />}
          {city && <input type="hidden" name="city" value={city} />}
          {interest && <input type="hidden" name="interest" value={interest} />}
          {overdue && <input type="hidden" name="overdue" value="1" />}
          {circle && <input type="hidden" name="circle" value={circle} />}
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search names, notes, numbers…"
            aria-label="Search people"
            className="h-11 w-full rounded-full border md:h-10 md:w-72 border-input bg-card pr-4 pl-10 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </form>
        {/* One row that scrolls sideways on phones, wraps on wider screens. */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        <Link href={href()} className={cn("shrink-0 rounded-full px-3.5 py-2.5 text-sm md:py-2", !activeTier ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary")}>
          Everyone
        </Link>
        {closenessTiers.map((t) => (
          <Link
            key={t}
            href={href(t)}
            className={cn("flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2.5 text-sm md:py-2", activeTier === t ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary")}
          >
            <span className={cn("size-2.5 rounded-full", tierTone[t])} />
            {tierLabel[t]}
          </Link>
        ))}
        </div>
      </div>

      <PeopleFilters
        values={{ q: query, tier: activeTier ?? "", month: month ? String(month) : "", city, interest, circle, overdue }}
        cities={options.cities}
        interests={options.interests}
        circles={options.circles}
      />

      {people.length === 0 ? (
        <div className="rounded-3xl bg-card p-6 md:p-10">
          <p className="type-display text-3xl">{query ? `No one matches "${query}".` : filtered ? "No one matches those filters." : "No one here yet."}</p>
          {!query && !filtered && (
            <p className="mt-2 text-muted-foreground">
              Add someone by hand, or{" "}
              <Link href="/capture/new" className="underline underline-offset-4">
                record a voice note
              </Link>{" "}
              about a person and we&apos;ll fill in the details.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl bg-card">
          <div className="hidden grid-cols-[1fr_160px_160px_140px] gap-4 border-b md:grid border-border px-6 py-3 text-[13px] text-muted-foreground">
            <span>Name</span>
            <span>Last catch-up</span>
            <span>Birthday</span>
            <span>Circle</span>
          </div>
          <ul className="divide-y divide-border">
            {people.map((p) => {
              const name = [p.firstName, p.lastName].filter(Boolean).join(" ");
              return (
                <li key={p.id}>
                  <Link
                    href={`/people/${p.id}`}
                    className="flex min-h-16 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-secondary/50 md:grid md:min-h-0 md:grid-cols-[1fr_160px_160px_140px] md:gap-4 md:px-6 md:py-3"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar id={p.id} name={name} src={avatarSrc(p.avatarRef)} size={40} className="md:size-9!" />
                      <span className="grid min-w-0">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium">{name}</span>
                          {p.nickname && <span className="truncate text-sm text-muted-foreground">“{p.nickname}”</span>}
                          <span className={cn("size-2 shrink-0 rounded-full md:hidden", tierTone[p.closeness])} aria-label={tierLabel[p.closeness]} role="img" />
                        </span>
                        <span className="truncate text-[13px] text-muted-foreground">
                          {p.matched ?? <span className="md:hidden">{p.lastInteractionAt ? `Last catch-up ${ago(p.lastInteractionAt).toLowerCase()}` : "No catch-ups yet"}</span>}
                        </span>
                      </span>
                    </span>
                    {p.birthday && p.birthday.daysAway <= 7 && (
                      <span className="shrink-0 rounded-full bg-coral/15 px-2.5 py-1 text-xs font-medium text-accent-ink md:hidden">
                        {p.birthday.daysAway === 0 ? "Birthday today" : `Bday in ${p.birthday.daysAway}d`}
                      </span>
                    )}
                    <span className="hidden text-sm text-muted-foreground md:block">{ago(p.lastInteractionAt)}</span>
                    <span className={cn("hidden text-sm md:block", p.birthday && p.birthday.daysAway <= 7 ? "text-accent-ink" : "text-muted-foreground")}>
                      {p.birthday ? (p.birthday.daysAway === 0 ? "Today" : `In ${p.birthday.daysAway} days`) : "Not set"}
                    </span>
                    <span className="hidden items-center gap-2 text-sm md:flex">
                      <span className={cn("size-2.5 rounded-full", tierTone[p.closeness])} />
                      {tierLabel[p.closeness]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
