"use client";

import { Check, ChevronLeft, ChevronRight, ImageIcon, Play, Search, Star, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { attachPhotos, detachPhoto, findPhotos, setCover, type PhotoResult } from "@/app/(app)/memories/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { thumbUrl } from "@/lib/immich-urls";
import { cn } from "@/lib/utils";

type Found = PhotoResult["assets"][number];

/** Pick photos from Immich: everything from the memory's dates, or a smart search. */
export function PhotoPicker({ memoryId, attached, onClose }: { memoryId: string; attached: string[]; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Map<string, Found>>(new Map());
  const [saving, startSaving] = useTransition();

  const load = useCallback(
    async (q: string, page: number) => {
      setLoading(true);
      const res = await findPhotos(memoryId, q, page);
      setError(res.error ?? null);
      setResults((prev) => (page === 1 ? res.assets : [...prev, ...res.assets]));
      setNextPage(res.nextPage);
      setLoading(false);
    },
    [memoryId],
  );

  useEffect(() => {
    let cancelled = false;
    findPhotos(memoryId, submitted, 1).then((res) => {
      if (cancelled) return;
      setError(res.error ?? null);
      setResults(res.assets);
      setNextPage(res.nextPage);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [memoryId, submitted]);

  const toggle = (a: Found) =>
    setPicked((m) => {
      const next = new Map(m);
      if (next.has(a.id)) next.delete(a.id);
      else next.set(a.id, a);
      return next;
    });

  const fresh = results.filter((a) => !attached.includes(a.id));
  const allPicked = fresh.length > 0 && fresh.every((a) => picked.has(a.id));

  return (
    <div className="grid gap-4 rounded-3xl bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="type-display text-[1.625rem]">{submitted ? `Searching “${submitted}”` : "Photos from those days"}</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setLoading(true);
          setSubmitted(query.trim());
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Or search your library: beach, dinner, Holly"
            aria-label="Search Immich"
            className="pl-10"
          />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
        {submitted && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setQuery("");
              setLoading(true);
              setSubmitted("");
            }}
          >
            By date
          </Button>
        )}
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!error && !loading && results.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {submitted ? "Nothing matched." : "No photos in Immich from those dates. Try a search instead."}
        </p>
      )}

      {results.length > 0 && (
        <>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{results.length} found</span>
            {fresh.length > 0 && (
              <button
                type="button"
                className="hover:text-foreground"
                onClick={() => setPicked(allPicked ? new Map() : new Map(fresh.map((a) => [a.id, a])))}
              >
                {allPicked ? "Clear" : "Select all"}
              </button>
            )}
          </div>
          <ul className="grid max-h-[60vh] grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-5 lg:grid-cols-6">
            {results.map((a) => {
              const already = attached.includes(a.id);
              const on = picked.has(a.id);
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    disabled={already}
                    aria-pressed={on}
                    aria-label={`${a.localDateTime ?? "Photo"}${already ? ", already added" : ""}`}
                    onClick={() => toggle(a)}
                    className={cn(
                      "group relative block aspect-square w-full overflow-hidden rounded-xl bg-secondary",
                      on && "ring-3 ring-coral",
                      already && "opacity-40",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- proxied Immich thumbnails, not optimisable */}
                    <img src={thumbUrl(a.id)} alt="" loading="lazy" className="size-full object-cover" />
                    {a.type === "VIDEO" && <Play className="absolute bottom-1.5 left-1.5 size-4 fill-white text-white drop-shadow" />}
                    {(on || already) && (
                      <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-coral text-white">
                        <Check className="size-3.5" />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {nextPage && (
            <Button variant="ghost" className="justify-self-center" disabled={loading} onClick={() => load(submitted, nextPage)}>
              {loading ? "Loading…" : "Load more"}
            </Button>
          )}
        </>
      )}
      {loading && results.length === 0 && <p className="text-sm text-muted-foreground">Looking in Immich…</p>}

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button
          disabled={picked.size === 0 || saving}
          onClick={() =>
            startSaving(async () => {
              const res = await attachPhotos(
                memoryId,
                [...picked.values()].map(({ id, type, localDateTime }) => ({ id, type, localDateTime })),
              );
              if (res.error) {
                setError(res.error);
                return;
              }
              router.refresh();
              onClose();
            })
          }
        >
          {saving ? "Adding…" : picked.size ? `Add ${picked.size} ${picked.size === 1 ? "photo" : "photos"}` : "Add photos"}
        </Button>
      </div>
    </div>
  );
}

/** Attached photos with a full-size viewer. */
export function Gallery({
  memoryId,
  assets,
  cover,
  immichConnected,
}: {
  memoryId: string;
  assets: { assetId: string; type: string }[];
  cover: string | null;
  immichConnected: boolean;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (open == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i == null ? i : Math.min(i + 1, assets.length - 1)));
      if (e.key === "ArrowLeft") setOpen((i) => (i == null ? i : Math.max(i - 1, 0)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, assets.length]);

  const current = open != null ? assets[open] : null;

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm text-muted-foreground">
          {assets.length ? `${assets.length} ${assets.length === 1 ? "photo" : "photos"}` : "Photos"}
        </h2>
        {immichConnected && !picking && (
          <Button variant="outline" size="sm" onClick={() => setPicking(true)}>
            <ImageIcon />
            Add from Immich
          </Button>
        )}
      </div>

      {picking && <PhotoPicker memoryId={memoryId} attached={assets.map((a) => a.assetId)} onClose={() => setPicking(false)} />}

      {!immichConnected && assets.length === 0 && (
        <p className="rounded-3xl bg-card p-6 text-sm text-muted-foreground">
          <a href="/settings" className="underline underline-offset-4">
            Connect Immich
          </a>{" "}
          to pull in photos from these days.
        </p>
      )}

      {assets.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {assets.map((a, i) => (
            <li key={a.assetId} className="group relative aspect-square overflow-hidden rounded-2xl bg-secondary">
              <button type="button" onClick={() => setOpen(i)} className="block size-full" aria-label={`Open photo ${i + 1}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- proxied Immich thumbnails */}
                <img src={thumbUrl(a.assetId)} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-[1.02]" />
              </button>
              {a.type === "VIDEO" && <Play className="pointer-events-none absolute bottom-2 left-2 size-5 fill-white text-white drop-shadow" />}
              {cover === a.assetId && (
                <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-xs">Cover</span>
              )}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                {cover !== a.assetId && (
                  <TileButton label="Use as cover" disabled={pending} onClick={() => start(async () => { await setCover(memoryId, a.assetId); router.refresh(); })}>
                    <Star />
                  </TileButton>
                )}
                <TileButton label="Remove from memory" disabled={pending} onClick={() => start(async () => { await detachPhoto(memoryId, a.assetId); router.refresh(); })}>
                  <Trash2 />
                </TileButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      {current && (
        <div role="dialog" aria-modal aria-label="Photo" className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-6" onClick={() => setOpen(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- proxied Immich preview */}
          <img
            src={thumbUrl(current.assetId, "preview")}
            alt=""
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button type="button" aria-label="Close" className="absolute top-5 right-5 rounded-full p-2 text-white/80 hover:text-white" onClick={() => setOpen(null)}>
            <X className="size-6" />
          </button>
          {open! > 0 && (
            <button type="button" aria-label="Previous" className="absolute left-4 rounded-full p-2 text-white/80 hover:text-white" onClick={(e) => { e.stopPropagation(); setOpen(open! - 1); }}>
              <ChevronLeft className="size-8" />
            </button>
          )}
          {open! < assets.length - 1 && (
            <button type="button" aria-label="Next" className="absolute right-4 rounded-full p-2 text-white/80 hover:text-white" onClick={(e) => { e.stopPropagation(); setOpen(open! + 1); }}>
              <ChevronRight className="size-8" />
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function TileButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-full bg-white/90 text-foreground hover:bg-white [&_svg]:size-4"
    >
      {children}
    </button>
  );
}
