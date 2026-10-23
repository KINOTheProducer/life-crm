import { todayIn } from "@life-crm/core";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ImportReview } from "@/components/profile/import-review";
import { ResortPanel } from "@/components/profile/resort-list";
import { toIsoDate } from "@/lib/data/dates";
import { existingProfile, knownPeople } from "@/lib/data/import";
import { tenantQuery } from "@/lib/session";

export default async function ImportPage({ params }: PageProps<"/people/[id]/import">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await tenantQuery(async (tx, user) => ({
    existing: await existingProfile(tx, id),
    people: await knownPeople(tx, id),
    today: toIsoDate(todayIn(user.timeZone)),
  }));
  if (!data.existing) notFound();

  return (
    <>
      <Link href={`/people/${id}`} className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm md:mb-6 md:min-h-0 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        {data.existing.firstName}
      </Link>
      <PageHeader
        title="Import notes"
        aside={`about ${data.existing.firstName}.`}
        description="A text or Markdown file with anything you know about them. People it mentions get their own profiles. You'll see where each part goes, and can move it, before anything is saved."
      />
      <section className="mb-10 grid gap-2">
        <p className="max-w-xl text-sm text-muted-foreground">
          Already imported something? Look over everything saved about {data.existing.firstName} for things in the wrong place or saved twice. Nothing changes until you
          say so.
        </p>
        <ResortPanel contactId={id} firstName={data.existing.firstName} />
      </section>
      <ImportReview contactId={id} firstName={data.existing.firstName} existing={data.existing} today={data.today} people={data.people.map((p) => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name))} />
    </>
  );
}
