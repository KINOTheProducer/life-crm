import { Download, MapPin, Plus } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { MakeHouseholdButton, NewHouseholdForm, SendCardToggle } from "@/components/households/household-bits";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { contactOptions } from "@/lib/data/contacts";
import { householdSuggestions, listHouseholds } from "@/lib/data/households";
import { avatarSrc } from "@/lib/immich-urls";
import { tenantQuery } from "@/lib/session";

export default async function HouseholdsPage() {
  const { households, suggestions, people } = await tenantQuery(async (tx) => ({
    households: await listHouseholds(tx),
    suggestions: await householdSuggestions(tx),
    people: await contactOptions(tx),
  }));
  const onList = households.filter((h) => h.sendCard).length;

  return (
    <>
      <PageHeader
        title="Households."
        aside={households.length ? `${households.length} ${households.length === 1 ? "home" : "homes"}, ${onList} on the card list.` : "Who lives together."}
        actions={
          households.length > 0 && (
            <a href="/api/export/holiday-cards" download className={buttonVariants({ variant: "outline" })}>
              <Download />
              Card list (CSV)
            </a>
          )
        }
      />
      <div className="grid gap-6 md:gap-8 lg:grid-cols-[1fr_340px]">
        <div className="grid content-start gap-8">
          {suggestions.length > 0 && (
            <section className="grid gap-3">
              <h2 className="text-sm text-muted-foreground">Probably live together</h2>
              <ul className="grid gap-2">
                {suggestions.map((s) => (
                  <li key={s.key} className="flex flex-wrap items-center gap-3 rounded-3xl bg-card px-5 py-3.5">
                    <div className="flex -space-x-2">
                      {s.members.map((m) => (
                        <Avatar key={m.id} id={m.id} name={m.name} src={avatarSrc(m.avatarRef)} size={30} className="ring-2 ring-card" />
                      ))}
                    </div>
                    <div className="grid min-w-0 flex-1">
                      <span className="text-sm font-medium">{s.label}</span>
                      <span className="text-[13px] text-muted-foreground">{s.reason}</span>
                    </div>
                    <MakeHouseholdButton ids={s.members.map((m) => m.id)} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {households.length === 0 ? (
            <div className="grid gap-2 rounded-3xl bg-card p-6 md:p-8">
              <p className="type-display text-3xl">One address, one card.</p>
              <p className="text-muted-foreground">Group the people who live together, then export the list for holiday cards or labels.</p>
            </div>
          ) : (
            <div className="grid gap-3.5 sm:grid-cols-2">
              {households.map((h) => (
                <div key={h.id} className="grid content-start gap-3 rounded-3xl bg-card p-5 md:p-6">
                  <Link href={`/households/${h.id}`} className="type-display text-2xl leading-tight hover:underline">
                    {h.label}
                  </Link>
                  <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" />
                    {[h.street, h.city, h.region].filter(Boolean).join(", ") || "No address yet"}
                  </p>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex -space-x-2">
                      {h.members.slice(0, 6).map((m) => (
                        <Avatar key={m.id} id={m.id} name={m.name} src={avatarSrc(m.avatarRef)} size={28} className="ring-2 ring-card" />
                      ))}
                    </div>
                    <SendCardToggle id={h.id} sendCard={h.sendCard} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <aside className="grid content-start gap-3 rounded-3xl bg-card p-5 md:p-6">
          <h2 className="flex items-center gap-2 text-sm text-muted-foreground">
            <Plus className="size-4" />
            New household
          </h2>
          <NewHouseholdForm people={people} />
        </aside>
      </div>
    </>
  );
}
