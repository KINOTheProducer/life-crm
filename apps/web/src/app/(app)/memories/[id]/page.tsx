import { memoryKindLabels, todayIn } from "@life-crm/core";
import { ArrowLeft, MapPin } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, toneFor } from "@/components/avatar";
import { MemoryEdit } from "@/components/memories/memory-edit";
import { Gallery } from "@/components/memories/photos";
import { contactOptions } from "@/lib/data/contacts";
import { formatDateRange, toIsoDate } from "@/lib/data/dates";
import { getMemory } from "@/lib/data/memories";
import { immichConnection } from "@/lib/immich";
import { avatarSrc, thumbUrl } from "@/lib/immich-urls";
import { tenantQuery } from "@/lib/session";
import { cn } from "@/lib/utils";

export default async function MemoryPage({ params }: PageProps<"/memories/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await tenantQuery(async (tx, user) => {
    const found = await getMemory(tx, id);
    if (!found) return null;
    return {
      ...found,
      options: (await contactOptions(tx)).map(({ id, name }) => ({ id, name })),
      immich: Boolean(await immichConnection(tx, user.id)),
      today: toIsoDate(todayIn(user.timeZone)),
    };
  });
  if (!data) notFound();
  const { memory: m, people, assets, cover } = data;

  return (
    <>
      <Link href="/memories" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Memories
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="grid content-start gap-8">
          <section className={cn("relative isolate min-h-80 overflow-hidden rounded-3xl", cover ? "bg-[#2a211b] text-white" : toneFor(m.id))}>
            {cover && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- proxied Immich preview */}
                <img src={thumbUrl(cover, "preview")} alt="" className="absolute inset-0 -z-20 size-full object-cover" />
                <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
              </>
            )}
            <div className="flex min-h-80 flex-col justify-end gap-2 p-8 [text-shadow:0_1px_24px_rgb(0_0_0/0.25)]">
              <p className="type-meta opacity-80">
                {memoryKindLabels[m.kind]} · {formatDateRange(m.startedOn, m.endedOn)}
              </p>
              <h1 className="type-display text-[3.25rem] leading-[1.02]">
                {m.title}
                {m.reason && <em className={cover ? "text-white/75" : "text-muted-foreground"}> {m.reason}</em>}
              </h1>
              {m.location && (
                <p className="flex items-center gap-1.5 text-[15px] opacity-90">
                  <MapPin className="size-4" />
                  {m.location}
                </p>
              )}
            </div>
          </section>

          <Gallery memoryId={m.id} assets={assets} cover={cover} immichConnected={data.immich} />
        </div>

        <aside className="grid content-start gap-6">
          <MemoryEdit
            memoryId={m.id}
            people={data.options}
            today={data.today}
            values={{ title: m.title, kind: m.kind, reason: m.reason, startedOn: m.startedOn, endedOn: m.endedOn, location: m.location, story: m.story, people: people.map((p) => p.id) }}
          >
            <div className="grid gap-5 rounded-3xl bg-card p-6">
              <div className="grid gap-2">
                <h2 className="text-sm text-muted-foreground">Who was there</h2>
                {people.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No one tagged yet.</p>
                ) : (
                  <ul className="grid gap-1">
                    {people.map((p) => (
                      <li key={p.id}>
                        <Link href={`/people/${p.id}`} className="flex items-center gap-3 rounded-2xl py-1.5 hover:opacity-80">
                          <Avatar id={p.id} name={p.name} src={avatarSrc(p.avatarRef)} size={32} />
                          <span className="font-medium">{p.name}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {m.story && (
                <div className="grid gap-2 border-t border-border pt-4">
                  <h2 className="text-sm text-muted-foreground">The story</h2>
                  <p className="text-[15px] leading-relaxed whitespace-pre-line">{m.story}</p>
                </div>
              )}
            </div>
          </MemoryEdit>
        </aside>
      </div>
    </>
  );
}
