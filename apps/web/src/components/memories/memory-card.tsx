import { memoryKindLabels } from "@life-crm/core";
import Link from "next/link";
import { Avatar, toneFor } from "@/components/avatar";
import { formatDateRange } from "@/lib/data/dates";
import type { MemorySummary } from "@/lib/data/memories";
import { avatarSrc, thumbUrl } from "@/lib/immich-urls";
import { cn } from "@/lib/utils";

export function MemoryCard({ memory: m, compact = false }: { memory: MemorySummary; compact?: boolean }) {
  return (
    <Link href={`/memories/${m.id}`} className="group grid overflow-hidden rounded-3xl bg-card transition-transform hover:-translate-y-0.5">
      <div className={cn("relative overflow-hidden", compact ? "aspect-[16/9]" : "aspect-[4/3]", !m.cover && toneFor(m.id))}>
        {m.cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- proxied Immich thumbnail
          <img src={thumbUrl(m.cover, compact ? "thumbnail" : "preview")} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <span className="type-display absolute inset-0 grid place-items-center px-6 text-center text-3xl text-foreground/70 italic">{m.title}</span>
        )}
        <span className="absolute top-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-xs">{memoryKindLabels[m.kind]}</span>
        {m.photoCount > 0 && <span className="absolute right-3 bottom-3 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">{m.photoCount} photos</span>}
      </div>
      <div className="grid gap-1 p-5">
        <p className="type-meta text-muted-foreground">{formatDateRange(m.startedOn, m.endedOn)}</p>
        <p className="type-display text-[1.5rem] leading-tight group-hover:underline">{m.title}</p>
        {(m.reason || m.location) && <p className="text-sm text-muted-foreground">{[m.reason, m.location].filter(Boolean).join(" · ")}</p>}
        {m.people.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex -space-x-2">
              {m.people.slice(0, 5).map((p) => (
                <Avatar key={p.id} id={p.id} name={p.name} src={avatarSrc(p.avatarRef)} size={28} className="ring-2 ring-card" />
              ))}
            </div>
            <span className="truncate text-[13px] text-muted-foreground">
              {m.people.length <= 2 ? m.people.map((p) => p.name.split(" ")[0]).join(" and ") : `${m.people[0]!.name.split(" ")[0]} and ${m.people.length - 1} others`}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
