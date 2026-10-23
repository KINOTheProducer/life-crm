import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddMembersForm, HouseholdForm, MemberList } from "@/components/households/household-bits";
import { PageHeader } from "@/components/page-header";
import { contactOptions } from "@/lib/data/contacts";
import { getHousehold } from "@/lib/data/households";
import { tenantQuery } from "@/lib/session";

export default async function HouseholdPage({ params }: PageProps<"/households/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await tenantQuery(async (tx) => ({ household: await getHousehold(tx, id), people: await contactOptions(tx) }));
  const h = data.household;
  if (!h) notFound();
  const memberIds = new Set(h.members.map((m) => m.id));

  return (
    <>
      <Link href="/households" className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm md:mb-6 md:min-h-0 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Households
      </Link>
      <PageHeader title={h.label} aside={h.members.length === 1 ? "1 person" : `${h.members.length} people`} />
      <div className="grid gap-6 md:gap-8 lg:grid-cols-[1fr_340px]">
        <section className="grid content-start gap-4 rounded-3xl bg-card p-5 md:p-6">
          <HouseholdForm
            id={h.id}
            values={{ name: h.name, label: h.label, street: h.street, line2: h.line2, city: h.city, region: h.region, postalCode: h.postalCode, country: h.country, notes: h.notes, sendCard: h.sendCard }}
          />
        </section>
        <aside className="grid content-start gap-6 rounded-3xl bg-card p-5 md:p-6">
          <div className="grid gap-3">
            <h2 className="text-sm text-muted-foreground">Who lives here</h2>
            <MemberList householdId={h.id} members={h.members} />
          </div>
          <AddMembersForm householdId={h.id} people={data.people.filter((p) => !memberIds.has(p.id))} />
        </aside>
      </div>
    </>
  );
}
