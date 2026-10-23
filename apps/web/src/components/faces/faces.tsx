"use client";

import { Check, Play, ScanFace, Search, Star, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  linkFacesTo,
  listFaces,
  personPhotos,
  setAvatarFace,
  setSelfFace,
  unlinkFaceFrom,
  type FaceOption,
  type PersonPhotos,
} from "@/app/(app)/people/faces-actions";
import { Lightbox } from "@/components/lightbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { immichAvatarRef, personThumbUrl, thumbUrl } from "@/lib/immich-urls";
import { cn } from "@/lib/utils";

function FaceThumb({ personId, size = 64, lazy = false, className }: { personId: string; size?: number; lazy?: boolean; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- proxied Immich face
    <img
      src={personThumbUrl(personId)}
      alt=""
      loading={lazy ? "lazy" : undefined}
      style={{ width: size, height: size, minWidth: size }}
      className={cn("aspect-square shrink-0 rounded-full bg-secondary object-cover", className)}
    />
  );
}

/**
 * Grid of Immich faces. Multi-select links faces to a contact; single-select is for
 * picking your own face. Matching names come first and are marked.
 */
export function FacePicker({
  contactId,
  firstName,
  multiple,
  exclude = [],
  onDone,
  onPick,
}: {
  contactId: string | null;
  firstName?: string;
  multiple: boolean;
  exclude?: string[];
  onDone: () => void;
  onPick?: (personId: string) => Promise<void>;
}) {
  const [faces, setFaces] = useState<FaceOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [rename, setRename] = useState(true);
  const [saving, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    listFaces(contactId).then((res) => {
      if (cancelled) return;
      setFaces(res.faces);
      setError(res.error ?? null);
      // Preselect a single full-name match so the common case is one click.
      const exact = res.faces.filter((f) => f.match === 2 && !f.linkedTo && !exclude.includes(f.id));
      if (multiple && exact.length === 1) setPicked(new Set([exact[0]!.id]));
    });
    return () => {
      cancelled = true;
    };
    // exclude is a fresh array each render; the picker only needs it on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId, multiple]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (faces ?? []).filter((f) => !exclude.includes(f.id) && (!q || f.name.toLowerCase().includes(q)));
  }, [faces, filter, exclude]);
  const suggested = shown.filter((f) => f.match > 0);
  const rest = shown.filter((f) => f.match === 0);
  const unnamedPicked = (faces ?? []).some((f) => picked.has(f.id) && !f.name);

  const choose = (f: FaceOption) => {
    if (!multiple) {
      start(async () => {
        await onPick?.(f.id);
        onDone();
      });
      return;
    }
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(f.id)) next.delete(f.id);
      else next.add(f.id);
      return next;
    });
  };

  const tile = (f: FaceOption) => {
    const on = picked.has(f.id);
    return (
      <li key={f.id}>
        <button
          type="button"
          aria-pressed={multiple ? on : undefined}
          disabled={saving}
          onClick={() => choose(f)}
          className={cn("grid w-full justify-items-center gap-1.5 rounded-2xl p-2 text-center hover:bg-muted", on && "bg-secondary")}
        >
          <span className="relative">
            <FaceThumb personId={f.id} size={60} lazy className={cn(on && "ring-3 ring-coral")} />
            {on && (
              <span className="absolute -top-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-coral text-white">
                <Check className="size-3.5" />
              </span>
            )}
          </span>
          <span className={cn("w-full truncate text-[13px]", !f.name && "text-muted-foreground italic")}>{f.name || "No name"}</span>
          {f.linkedTo && <span className="w-full truncate text-[11px] text-muted-foreground">Linked to {f.linkedTo.name}</span>}
        </button>
      </li>
    );
  };

  return (
    <div className="grid gap-4 rounded-3xl bg-card p-5 ring-1 ring-border">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">{multiple ? `Which faces are ${firstName ?? "them"}?` : "Which face is you?"}</p>
        <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onDone}>
          <X />
        </Button>
      </div>
      {faces && faces.length > 12 && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find by Immich name" aria-label="Find a face" className="pl-10" />
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!faces && !error && <p className="text-sm text-muted-foreground">Loading faces from Immich…</p>}
      {faces && shown.length === 0 && !error && <p className="text-sm text-muted-foreground">No faces found.</p>}

      <div className="grid max-h-[55vh] gap-4 overflow-y-auto">
        {suggested.length > 0 && (
          <div className="grid gap-1.5">
            <p className="text-[13px] text-muted-foreground">Name matches</p>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1">{suggested.map(tile)}</ul>
          </div>
        )}
        {rest.length > 0 && (
          <div className="grid gap-1.5">
            {suggested.length > 0 && <p className="text-[13px] text-muted-foreground">Everyone else</p>}
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1">{rest.map(tile)}</ul>
          </div>
        )}
      </div>

      {multiple && contactId && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          {unnamedPicked ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={rename} onChange={(e) => setRename(e.target.checked)} className="size-4 accent-foreground" />
              Name it {firstName} in Immich too
            </label>
          ) : (
            <span className="text-[13px] text-muted-foreground">Immich sometimes splits one person into a few faces. Pick all of them.</span>
          )}
          <Button
            disabled={picked.size === 0 || saving}
            onClick={() =>
              start(async () => {
                const res = await linkFacesTo(contactId, [...picked], unnamedPicked && rename);
                if (res.error) {
                  setError(res.error);
                  if (!res.error.startsWith("Linked")) return;
                }
                onDone();
              })
            }
          >
            {saving ? "Linking…" : picked.size > 1 ? `Link ${picked.size} faces` : "Link face"}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Profile card: linked faces, which one is the avatar, link more, unlink. */
export function FacesCard({
  contactId,
  firstName,
  faces,
  avatarRef,
}: {
  contactId: string;
  firstName: string;
  faces: { personId: string; immichName: string | null }[];
  avatarRef: string | null;
}) {
  const [picking, setPicking] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-4">
      {faces.length === 0 ? (
        <p className="text-sm text-muted-foreground">Link {firstName} to their face in Immich for their photo, photos of you two, and better photo picks on memories.</p>
      ) : (
        <ul className="flex flex-wrap gap-3">
          {faces.map((f) => {
            const isAvatar = avatarRef === immichAvatarRef(f.personId);
            return (
              <li key={f.personId} className="group relative grid justify-items-center gap-1">
                <FaceThumb personId={f.personId} size={56} className={cn(isAvatar && "ring-3 ring-foreground/80")} />
                <span className="max-w-16 truncate text-[11px] text-muted-foreground">{f.immichName || "No name"}</span>
                <div className="absolute -top-1 -right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  {!isAvatar && (
                    <IconDot label="Use as their photo" disabled={pending} onClick={() => start(() => setAvatarFace(contactId, f.personId))}>
                      <Star />
                    </IconDot>
                  )}
                  <IconDot label="Unlink face" disabled={pending} onClick={() => start(() => unlinkFaceFrom(contactId, f.personId))}>
                    <X />
                  </IconDot>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {picking ? (
        <FacePicker contactId={contactId} firstName={firstName} multiple exclude={faces.map((f) => f.personId)} onDone={() => setPicking(false)} />
      ) : (
        <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setPicking(true)}>
          <ScanFace />
          {faces.length ? "Link another face" : "Link face"}
        </Button>
      )}
      {avatarRef && faces.length > 0 && (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => setAvatarFace(contactId, null))}
          className="justify-self-start text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Use initials instead
        </button>
      )}
    </div>
  );
}

function IconDot({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-6 place-items-center rounded-full bg-card text-foreground shadow-sm ring-1 ring-border hover:bg-muted [&_svg]:size-3.5"
    >
      {children}
    </button>
  );
}

/** Settings: which Immich face is you, for your avatar and "photos together". */
export function SelfFace({ personId }: { personId: string | null }) {
  const [picking, setPicking] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {personId ? <FaceThumb personId={personId} size={48} /> : <span className="grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground"><ScanFace className="size-5" /></span>}
        <div className="grid flex-1 gap-0.5">
          <p className="text-sm font-medium">{personId ? "This is you" : "Which face is you?"}</p>
          <p className="text-[13px] text-muted-foreground">Your photo everywhere it says You, and photos of you with someone.</p>
        </div>
        {!picking && (
          <Button size="sm" variant="outline" onClick={() => setPicking(true)}>
            {personId ? "Change" : "Pick your face"}
          </Button>
        )}
        {personId && !picking && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => setError((await setSelfFace(null)).error))}>
            Clear
          </Button>
        )}
      </div>
      {picking && (
        <FacePicker
          contactId={null}
          multiple={false}
          onDone={() => setPicking(false)}
          onPick={async (id) => {
            setError((await setSelfFace(id)).error);
          }}
        />
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** Photos of someone, or of the two of you, straight from Immich. */
export function PersonPhotosPanel({ contactId, firstName, isSelf = false }: { contactId: string; firstName: string; isSelf?: boolean }) {
  // "You two" makes no sense on your own page.
  const [mode, setMode] = useState<"together" | "them">(isSelf ? "them" : "together");
  const [data, setData] = useState<Record<string, PersonPhotos>>({});
  const [open, setOpen] = useState<number | null>(null);
  const [more, startMore] = useTransition();
  const current = data[mode];

  useEffect(() => {
    if (data[mode]) return;
    let cancelled = false;
    personPhotos(contactId, mode).then((res) => {
      if (cancelled) return;
      setData((d) => ({ ...d, [mode]: res }));
      // Nothing together (or no face picked for you)? Show photos of them instead.
      if (mode === "together" && (res.assets.length === 0 || !res.canTogether) && !res.error) setMode("them");
    });
    return () => {
      cancelled = true;
    };
  }, [contactId, mode, data]);

  const tabs = [
    ["together", "You two"],
    ["them", `Of ${firstName}`],
  ] as const;

  return (
    <section className="grid gap-4 rounded-3xl bg-card p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="type-display text-[1.625rem]">Photos</h2>
        {!isSelf && (
          <div role="tablist" className="flex gap-1">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={mode === key}
                onClick={() => setMode(key)}
                className={cn("rounded-full px-3.5 py-1.5 text-sm text-muted-foreground hover:text-foreground", mode === key && "bg-secondary text-foreground")}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {!current && <p className="text-sm text-muted-foreground">Loading from Immich…</p>}
      {current?.error && <p className="text-sm text-destructive">{current.error}</p>}
      {current && !current.error && current.assets.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {mode === "together" && !current.canTogether ? (
            <>
              Pick your own face in{" "}
              <a href="/settings" className="underline underline-offset-4">
                Settings
              </a>{" "}
              to see photos of you two.
            </>
          ) : mode === "together" ? (
            "No photos of you two yet."
          ) : (
            "No photos found."
          )}
        </p>
      )}
      {current && current.assets.length > 0 && (
        <>
          <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
            {current.assets.map((a, i) => (
              <li key={a.id} className="relative aspect-square overflow-hidden rounded-xl bg-secondary">
                <button type="button" onClick={() => setOpen(i)} aria-label={`Open photo from ${a.localDateTime?.slice(0, 10) ?? "unknown date"}`} className="block size-full">
                  {/* eslint-disable-next-line @next/next/no-img-element -- proxied Immich thumbnail */}
                  <img src={thumbUrl(a.id)} alt="" loading="lazy" className="size-full object-cover" />
                </button>
                {a.type === "VIDEO" && <Play className="pointer-events-none absolute bottom-1.5 left-1.5 size-4 fill-white text-white drop-shadow" />}
              </li>
            ))}
          </ul>
          {current.nextPage && (
            <Button
              variant="ghost"
              className="justify-self-center"
              disabled={more}
              onClick={() =>
                startMore(async () => {
                  const res = await personPhotos(contactId, mode, current.nextPage!);
                  setData((d) => ({ ...d, [mode]: { ...res, assets: [...current.assets, ...res.assets.filter((a) => !current.assets.some((c) => c.id === a.id))] } }));
                })
              }
            >
              {more ? "Loading…" : "More"}
            </Button>
          )}
        </>
      )}
      <Lightbox assetIds={current?.assets.map((a) => a.id) ?? []} index={open} onChange={setOpen} />
    </section>
  );
}

