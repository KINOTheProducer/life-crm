import { Plus } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { CircleForm } from "@/components/circles/circle-form";
import { toneClass } from "@/components/circles/tones";
import { PageHeader } from "@/components/page-header";
import { listCircles } from "@/lib/data/circles";
import { avatarSrc } from "@/lib/immich-urls";
import { tenantQuery } from "@/lib/session";
import { cn } from "@/lib/utils";
import { createCircle } from "./actions";

export default async function CirclesPage() {
  const circles = await tenantQuery((tx) => listCircles(tx));

  return (
    <>
      <PageHeader title="Circles." aside={circles.length ? "The groups you think of together." : "Group the people who go together."} />
      <div className="grid gap-6 md:gap-8 lg:grid-cols-[1fr_340px]">
        <div className="grid content-start gap-3.5 sm:grid-cols-2">
          {circles.length === 0 && (
            <div className="grid gap-2 rounded-3xl bg-card p-6 md:p-8 sm:col-span-2">
              <p className="type-display text-3xl">Uni crew, the climbing gang, Mom&apos;s side.</p>
              <p className="text-muted-foreground">Keep shared notes for each group and log one catch-up for everyone who was there.</p>
            </div>
          )}
          {circles.map((c) => (
            <Link key={c.id} href={`/circles/${c.id}`} className="grid gap-4 rounded-3xl bg-card p-5 md:p-6 transition-transform hover:-translate-y-0.5">
              <div className="flex items-center gap-3">
                <span className={cn("size-4 rounded-full ring-1 ring-foreground/15", toneClass[c.tone])} />
                <span className="type-display text-2xl">{c.name}</span>
              </div>
              {c.notes && <p className="line-clamp-2 text-sm text-muted-foreground">{c.notes}</p>}
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {c.members.slice(0, 6).map((m) => (
                    <Avatar key={m.id} id={m.id} name={m.name} src={avatarSrc(m.avatarRef)} size={30} className="ring-2 ring-card" />
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">
                  {c.members.length === 0 ? "No one yet" : c.members.length === 1 ? "1 person" : `${c.members.length} people`}
                </span>
              </div>
            </Link>
          ))}
        </div>
        <aside className="grid content-start gap-3 rounded-3xl bg-card p-5 md:p-6">
          <h2 className="flex items-center gap-2 text-sm text-muted-foreground">
            <Plus className="size-4" />
            New circle
          </h2>
          <CircleForm action={createCircle} submitLabel="Create circle" />
        </aside>
      </div>
    </>
  );
}
