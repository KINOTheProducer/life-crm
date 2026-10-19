import { Plus } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { listPeople } from "@/lib/data/people";

const tierLabel = { inner: "Inner circle", close: "Close", friend: "Friend", acquaintance: "Acquaintance" } as const;

export default async function PeoplePage() {
  const people = await listPeople();

  return (
    <>
      <PageHeader
        eyebrow={`${people.length} ${people.length === 1 ? "person" : "people"}`}
        title="Your people"
        actions={
          <Link href="/people/new" className={buttonVariants({ variant: "accent" })}>
            <Plus />
            Add person
          </Link>
        }
      />
      {people.length === 0 ? (
        <p className="text-muted-foreground">No one here yet. Add the first person in your life.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-[2rem] bg-card ring-1 ring-foreground/8">
          {people.map((p) => (
            <li key={p.id}>
              <Link
                href={`/people/${p.id}`}
                className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-muted/50"
              >
                <span>
                  <span className="type-display text-2xl">{[p.firstName, p.lastName].filter(Boolean).join(" ")}</span>
                  {p.nickname && <span className="ml-3 text-sm text-muted-foreground">“{p.nickname}”</span>}
                </span>
                <Badge>{tierLabel[p.closeness]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
