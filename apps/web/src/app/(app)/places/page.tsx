import { House, MapPin, Search } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { listPlaces } from "@/lib/data/places";
import { avatarSrc } from "@/lib/immich-urls";
import { tenantQuery } from "@/lib/session";

export default async function PlacesPage({ searchParams }: PageProps<"/places">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 100) : "";
  const all = await tenantQuery((tx) => listPlaces(tx));
  const needle = query.toLowerCase();
  const places = needle
    ? all.filter((p) => [p.city, p.region, p.country].some((v) => v?.toLowerCase().includes(needle)))
    : all;
  const total = new Set(all.flatMap((p) => p.people.map((x) => x.id))).size;

  return (
    <>
      <PageHeader
        title="Places."
        aside={all.length ? `${total} ${total === 1 ? "person" : "people"} in ${all.length} ${all.length === 1 ? "city" : "cities"}.` : "Where your people are."}
        actions={
          <Link href="/households" className={buttonVariants({ variant: "outline" })}>
            <House />
            Households
          </Link>
        }
      />
      <form action="/places" className="relative mb-6 max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          name="q"
          defaultValue={query}
          placeholder="Going somewhere? Vancouver, Ontario…"
          aria-label="Find a city, province or country"
          className="h-10 w-full rounded-full border border-input bg-card pr-4 pl-10 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </form>

      {all.length === 0 ? (
        <div className="grid max-w-xl gap-2 rounded-3xl bg-card p-8">
          <p className="type-display text-3xl">Add addresses and they&apos;ll gather here.</p>
          <p className="text-muted-foreground">Handy before a trip: see who you know in a city before you book.</p>
        </div>
      ) : places.length === 0 ? (
        <div className="grid max-w-xl gap-2 rounded-3xl bg-card p-8">
          <p className="type-display text-3xl">No one in &ldquo;{query}&rdquo; yet.</p>
          <Link href="/places" className="text-sm text-muted-foreground underline underline-offset-4">
            See every city
          </Link>
        </div>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {places.map((p) => (
            <section key={p.city.toLowerCase()} className="grid content-start gap-3 rounded-3xl bg-card p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="type-display text-2xl">{p.city}</h2>
                  {(p.region || p.country) && <p className="text-[13px] text-muted-foreground">{[p.region, p.country].filter(Boolean).join(", ")}</p>}
                </div>
                <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                  <MapPin className="size-3.5" />
                  {p.people.length}
                </span>
              </div>
              <ul className="grid gap-1">
                {p.people.map((person) => (
                  <li key={person.id}>
                    <Link href={`/people/${person.id}`} className="flex items-center gap-2.5 rounded-xl py-1 text-sm hover:opacity-80">
                      <Avatar id={person.id} name={person.name} src={avatarSrc(person.avatarRef)} size={28} />
                      <span className="flex-1 truncate">{person.name}</span>
                      {person.label !== "home" && <span className="text-[13px] text-muted-foreground">{person.label}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
