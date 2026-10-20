import { closenessTiers, type ClosenessTier } from "@life-crm/core";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { listPeople } from "@/lib/data/people";
import { cn } from "@/lib/utils";

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
  const { tier, q } = await searchParams;
  const activeTier = typeof tier === "string" && (closenessTiers as readonly string[]).includes(tier) ? (tier as ClosenessTier) : undefined;
  const query = typeof q === "string" ? q.slice(0, 100) : "";
  const people = await listPeople({ tier: activeTier, q: query });
  const href = (t?: ClosenessTier) => `/people${t ? `?tier=${t}` : ""}`;

  return (
    <>
      <PageHeader
        title="People"
        aside={activeTier ? tierLabel[activeTier].toLowerCase() : undefined}
        actions={
          <Link href="/people/new" className={buttonVariants()}>
            <Plus />
            Add someone
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form action="/people" className="relative mr-2">
          {activeTier && <input type="hidden" name="tier" value={activeTier} />}
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search"
            className="h-10 w-64 rounded-full border border-input bg-card pr-4 pl-10 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </form>
        <Link href={href()} className={cn("rounded-full px-3.5 py-2 text-sm", !activeTier ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary")}>
          Everyone
        </Link>
        {closenessTiers.map((t) => (
          <Link
            key={t}
            href={href(t)}
            className={cn("flex items-center gap-2 rounded-full px-3.5 py-2 text-sm", activeTier === t ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary")}
          >
            <span className={cn("size-2.5 rounded-full", tierTone[t])} />
            {tierLabel[t]}
          </Link>
        ))}
      </div>

      {people.length === 0 ? (
        <div className="rounded-3xl bg-card p-10">
          <p className="type-display text-3xl">{query ? `No one matches "${query}".` : "No one here yet."}</p>
          {!query && (
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
          <div className="grid grid-cols-[1fr_160px_160px_140px] gap-4 border-b border-border px-6 py-3 text-[13px] text-muted-foreground">
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
                  <Link href={`/people/${p.id}`} className="grid grid-cols-[1fr_160px_160px_140px] items-center gap-4 px-6 py-3 transition-colors hover:bg-secondary/50">
                    <span className="flex min-w-0 items-center gap-3">
                      <Avatar id={p.id} name={name} size={36} />
                      <span className="truncate font-medium">{name}</span>
                      {p.nickname && <span className="truncate text-sm text-muted-foreground">“{p.nickname}”</span>}
                    </span>
                    <span className="text-sm text-muted-foreground">{ago(p.lastInteractionAt)}</span>
                    <span className={cn("text-sm", p.birthday && p.birthday.daysAway <= 7 ? "text-accent-ink" : "text-muted-foreground")}>
                      {p.birthday ? (p.birthday.daysAway === 0 ? "Today" : `In ${p.birthday.daysAway} days`) : "Not set"}
                    </span>
                    <span className="flex items-center gap-2 text-sm">
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
