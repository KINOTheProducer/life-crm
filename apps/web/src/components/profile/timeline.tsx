import { interactionTypeLabels, type InteractionType } from "@life-crm/core";
import type { TimelineKind } from "@life-crm/db/schema";
import {
  Cake,
  Lightbulb,
  Mail,
  MessageCircle,
  Mic,
  PartyPopper,
  Phone,
  Sparkles,
  StickyNote,
  UserPlus,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { TimelineEntry } from "@/lib/data/timeline";
import { cn } from "@/lib/utils";

const filters: { label: string; kinds: TimelineKind[] }[] = [
  { label: "Everything", kinds: [] },
  { label: "Catch-ups", kinds: ["interaction"] },
  { label: "Notes", kinds: ["note", "voice"] },
  { label: "Facts & dates", kinds: ["fact", "date"] },
];

const interactionIcons: Record<InteractionType, LucideIcon> = {
  in_person: Users,
  call: Phone,
  video: Video,
  message: MessageCircle,
  email: Mail,
  event: PartyPopper,
  other: Sparkles,
};

function iconFor(entry: TimelineEntry): LucideIcon {
  switch (entry.kind) {
    case "created":
      return UserPlus;
    case "note":
      return StickyNote;
    case "voice":
      return Mic;
    case "fact":
      return Lightbulb;
    case "date":
      return Cake;
    case "interaction":
      return interactionIcons[entry.title as InteractionType] ?? Users;
  }
}

function titleFor(entry: TimelineEntry, names: Record<string, string>) {
  if (entry.kind !== "interaction") return entry.title;
  const label = interactionTypeLabels[entry.title as InteractionType] ?? "Catch-up";
  const others = ((entry.data as { with?: string[] } | null)?.with ?? []).map((id) => names[id]).filter(Boolean);
  return others.length ? `${label} with ${others.join(", ")}` : label;
}

export function Timeline({
  contactId,
  entries,
  hasMore,
  activeKinds,
  names,
  timeZone,
}: {
  contactId: string;
  entries: TimelineEntry[];
  hasMore: boolean;
  activeKinds: TimelineKind[];
  names: Record<string, string>;
  timeZone: string;
}) {
  const monthFmt = new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric", timeZone });
  // Catch-ups are stored as calendar dates (noon UTC), so show them in UTC to keep the day stable.
  const dayFmt = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone });
  const dateOnlyFmt = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });

  const groups: { month: string; items: TimelineEntry[] }[] = [];
  for (const entry of entries) {
    const month = monthFmt.format(entry.occurredAt);
    const last = groups.at(-1);
    if (last?.month === month) last.items.push(entry);
    else groups.push({ month, items: [entry] });
  }

  const activeKey = activeKinds.slice().sort().join(",");
  const base = `/people/${contactId}`;
  const kindParam = activeKinds.length ? `kind=${activeKinds.join(",")}&` : "";

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => {
          const key = f.kinds.slice().sort().join(",");
          const active = key === activeKey;
          return (
            <Link
              key={f.label}
              href={f.kinds.length ? `${base}?kind=${f.kinds.join(",")}` : base}
              scroll={false}
              aria-current={active ? "true" : undefined}
              className={cn(
                "rounded-full px-3.5 py-2 text-sm transition-colors",
                active ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary",
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {entries.length === 0 && <p className="text-muted-foreground">Nothing here yet.</p>}

      {groups.map((g) => (
        <div key={g.month} className="grid gap-4">
          <p className="type-display sticky top-0 z-10 bg-background/90 py-2 text-xl italic backdrop-blur">{g.month}</p>
          <ol className="relative grid gap-5 border-l border-border pl-8">
            {g.items.map((entry) => {
              const Icon = iconFor(entry);
              const learned = (entry.data as { learned?: string[] } | null)?.learned ?? [];
              const location = (entry.data as { location?: string | null } | null)?.location;
              const day = (entry.kind === "interaction" ? dateOnlyFmt : dayFmt).format(entry.occurredAt);
              return (
                <li key={entry.id} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[49px] top-0 grid size-8 place-items-center rounded-full ring-4 ring-background",
                      entry.kind === "interaction" ? "bg-accent text-accent-foreground" : "bg-secondary text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="grid gap-1.5 rounded-2xl bg-card p-4">
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="font-medium">
                        {entry.kind === "fact" ? (
                          <>
                            <span className="text-muted-foreground">{entry.title}: </span>
                            {entry.body}
                          </>
                        ) : (
                          titleFor(entry, names)
                        )}
                      </p>
                      <p className="shrink-0 font-mono text-xs text-muted-foreground">{day}</p>
                    </div>
                    {location && <p className="text-[13px] text-muted-foreground">{location}</p>}
                    {entry.body && entry.kind !== "fact" && <p className="whitespace-pre-line text-[15px] leading-relaxed">{entry.body}</p>}
                    {learned.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5 pt-1">
                        {learned.map((l) => (
                          <li key={l} className="rounded-full bg-secondary px-2.5 py-1 text-xs">
                            {l}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}

      {hasMore && entries.length > 0 && (
        <Link
          href={`${base}?${kindParam}before=${entries.at(-1)!.id}`}
          scroll={false}
          className="justify-self-center rounded-full bg-card px-4 py-2 text-sm hover:bg-secondary"
        >
          Older
        </Link>
      )}
    </section>
  );
}
