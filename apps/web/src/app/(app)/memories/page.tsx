import { schema, eq } from "@life-crm/db";
import { Plus } from "lucide-react";
import Link from "next/link";
import { MemoryCard } from "@/components/memories/memory-card";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { fullName } from "@/lib/data/contacts";
import { listMemories } from "@/lib/data/memories";
import { tenantQuery } from "@/lib/session";

export default async function MemoriesPage({ searchParams }: PageProps<"/memories">) {
  const { person } = await searchParams;
  const contactId = typeof person === "string" && /^[0-9a-f-]{36}$/.test(person) ? person : undefined;
  const { items, who } = await tenantQuery(async (tx) => {
    const [c] = contactId ? await tx.select().from(schema.contacts).where(eq(schema.contacts.id, contactId)) : [];
    return { items: await listMemories(tx, { contactId }), who: c ? fullName(c) : null };
  });

  // Group by year, newest first.
  const years = new Map<string, typeof items>();
  for (const m of items) years.set(m.startedOn.slice(0, 4), [...(years.get(m.startedOn.slice(0, 4)) ?? []), m]);

  return (
    <>
      <PageHeader
        title={who ? `With ${who}.` : "Memories."}
        aside={items.length ? "The times worth keeping." : "Start with one you never want to forget."}
        actions={
          <>
            {who && (
              <Link href="/memories" className={buttonVariants({ variant: "outline" })}>
                Everyone
              </Link>
            )}
            <Link href={contactId ? `/memories/new?person=${contactId}` : "/memories/new"} className={buttonVariants()}>
              <Plus />
              New memory
            </Link>
          </>
        }
      />
      {items.length === 0 ? (
        <div className="grid max-w-xl gap-2 rounded-3xl bg-card p-8">
          <p className="type-display text-3xl">Trips, birthdays, the dinner that went until 2am.</p>
          <p className="text-muted-foreground">Tag who was there and pull in the photos from Immich. Each memory shows up on everyone&apos;s timeline.</p>
        </div>
      ) : (
        <div className="grid gap-10">
          {[...years].map(([year, list]) => (
            <section key={year} className="grid gap-4">
              <h2 className="type-display text-2xl italic">{year}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((m) => (
                  <MemoryCard key={m.id} memory={m} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
