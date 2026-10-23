import { desc, isNotNull, schema } from "@life-crm/db";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { TrashActions } from "@/components/people/trash-actions";
import { PageHeader } from "@/components/page-header";
import { fullName } from "@/lib/data/contacts";
import { tenantQuery } from "@/lib/session";

const DAY = 86_400_000;

/** Who's in the trash, with the time we checked so days left are counted from one moment. */
function trashed() {
  return tenantQuery(async (tx) => ({
    rows: await tx
      .select({ id: schema.contacts.id, firstName: schema.contacts.firstName, lastName: schema.contacts.lastName, deletedAt: schema.contacts.deletedAt })
      .from(schema.contacts)
      .where(isNotNull(schema.contacts.deletedAt))
      .orderBy(desc(schema.contacts.deletedAt)),
    now: Date.now(),
  }));
}

export default async function TrashPage() {
  const { rows, now } = await trashed();
  return (
    <>
      <Link href="/people" className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm md:mb-6 md:min-h-0 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        People
      </Link>
      <PageHeader title="Trash." aside="Kept for 30 days." description="Restore someone with everything you'd saved about them, or delete them for good." />
      {rows.length === 0 ? (
        <p className="rounded-3xl bg-card p-6 md:p-8 text-muted-foreground">The trash is empty.</p>
      ) : (
        <ul className="divide-y divide-border rounded-3xl bg-card px-6">
          {rows.map((r) => {
            const left = Math.max(0, 30 - Math.floor((now - r.deletedAt!.getTime()) / DAY));
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-4 py-3">
                <Avatar id={r.id} name={fullName(r)} size={36} className="grayscale" />
                <span className="min-w-0 flex-1 truncate font-medium">{fullName(r)}</span>
                <span className="text-sm text-muted-foreground">{left === 0 ? "Goes today" : `${left} days left`}</span>
                <TrashActions contactId={r.id} name={fullName(r)} />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
