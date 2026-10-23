"use client";

import { Check, MapPin, Pencil, Play, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { acceptSuggestion, dismissSuggestion, findSuggestions, type SuggestionView } from "@/app/(app)/memories/suggestion-actions";
import { Avatar } from "@/components/avatar";
import { Lightbox } from "@/components/lightbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateRange } from "@/lib/data/dates";
import { avatarSrc, thumbUrl } from "@/lib/immich-urls";
import { cn } from "@/lib/utils";

const ranges = [
  [6, "6 months"],
  [12, "Past year"],
  [36, "3 years"],
] as const;

export function Suggestions() {
  const [months, setMonths] = useState(12);
  const [result, setResult] = useState<Awaited<ReturnType<typeof findSuggestions>> | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    findSuggestions(months).then((res) => {
      if (!cancelled) setResult(res);
    });
    return () => {
      cancelled = true;
    };
  }, [months]);

  const visible = result?.suggestions.filter((s) => !hidden.has(s.key)) ?? [];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="flex gap-1">
          {ranges.map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={months === m}
              onClick={() => {
                setResult(null);
                setMonths(m);
              }}
              className={cn("rounded-full px-3.5 py-2 text-sm", months === m ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary")}
            >
              {label}
            </button>
          ))}
        </div>
        {result && !result.error && (
          <p className="text-sm text-muted-foreground">
            Looked at {result.scanned.photos.toLocaleString("en-CA")} photos of {result.scanned.faces} {result.scanned.faces === 1 ? "face" : "faces"}
          </p>
        )}
      </div>

      {!result && <p className="rounded-3xl bg-card p-6 md:p-8 text-muted-foreground">Looking through Immich for times with your people…</p>}
      {result?.error && <p className="rounded-3xl bg-card p-6 md:p-8 text-destructive">{result.error}</p>}
      {result && !result.error && visible.length === 0 && (
        <div className="grid gap-2 rounded-3xl bg-card p-6 md:p-8">
          <p className="type-display text-3xl">Nothing new to suggest.</p>
          <p className="text-muted-foreground">Every big day with your people is already a memory, or you said no to it. Try a longer range, or link more faces.</p>
        </div>
      )}
      {visible.map((s) => (
        <SuggestionCard key={s.key} suggestion={s} onGone={() => setHidden((h) => new Set(h).add(s.key))} />
      ))}
    </div>
  );
}

function SuggestionCard({ suggestion: s, onGone }: { suggestion: SuggestionView; onGone: () => void }) {
  const [title, setTitle] = useState(s.title);
  const [editing, setEditing] = useState(false);
  const [left, setLeft] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // One big photo plus eight small fills the 4-column grid exactly.
  const shown = s.photos.slice(0, 9);
  const people = s.people.filter((p) => !left.has(p.id));

  return (
    <section className="grid gap-5 rounded-3xl bg-card p-5 md:p-6 lg:grid-cols-[1.3fr_1fr]">
      <ul className="grid grid-cols-4 gap-1.5">
        {shown.map((p, i) => (
          <li key={p.id} className={cn("relative overflow-hidden rounded-xl bg-secondary", i === 0 ? "col-span-2 row-span-2" : "aspect-square")}>
            <button type="button" onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1}`} className="block size-full">
              {/* eslint-disable-next-line @next/next/no-img-element -- proxied Immich thumbnail */}
              <img src={thumbUrl(p.id)} alt="" loading="lazy" className="size-full object-cover" />
            </button>
            {p.type === "VIDEO" && <Play className="pointer-events-none absolute bottom-1.5 left-1.5 size-4 fill-white text-white drop-shadow" />}
            {i === shown.length - 1 && s.photos.length > shown.length && (
              <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/50 text-sm text-white">+{s.photos.length - shown.length}</span>
            )}
          </li>
        ))}
      </ul>

      <div className="grid content-start gap-4">
        <div className="grid gap-1">
          <p className="type-meta text-muted-foreground">
            {s.kind === "trip" ? "Trip" : "Day"} · {formatDateRange(s.startedOn, s.endedOn === s.startedOn ? null : s.endedOn)} · {s.photos.length} photos
          </p>
          {editing ? (
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus aria-label="Title" onBlur={() => setEditing(false)} />
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="group flex items-center gap-2 text-left">
              <span className="type-display text-[1.875rem] leading-tight">{title}</span>
              <Pencil className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
            </button>
          )}
          {s.location && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-3.5" />
              {s.location}
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <p className="text-[13px] text-muted-foreground">Who was there</p>
          <ul className="flex flex-wrap gap-1.5">
            {s.people.map((p) => {
              const out = left.has(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={!out}
                    onClick={() =>
                      setLeft((l) => {
                        const next = new Set(l);
                        if (out) next.delete(p.id);
                        else next.add(p.id);
                        return next;
                      })
                    }
                    title={`In ${p.photos} photos`}
                    className={cn("flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm ring-1 ring-border", out ? "text-muted-foreground line-through opacity-60" : "bg-secondary")}
                  >
                    <Avatar id={p.id} name={p.name} src={avatarSrc(p.avatarRef)} size={24} />
                    {p.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending || people.length === 0 || !title.trim()}
            onClick={() =>
              start(async () => {
                const res = await acceptSuggestion({
                  title: title.trim(),
                  kind: s.kind,
                  startedOn: s.startedOn,
                  endedOn: s.endedOn,
                  location: s.location,
                  people: people.map((p) => p.id),
                  photos: s.photos,
                });
                if (res?.error) setError(res.error);
              })
            }
          >
            <Check />
            {pending ? "Saving…" : "Make it a memory"}
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await dismissSuggestion(s.key);
                onGone();
              })
            }
          >
            <X />
            Not a memory
          </Button>
        </div>
      </div>
      <Lightbox assetIds={s.photos.map((p) => p.id)} index={open} onChange={setOpen} />
    </section>
  );
}
