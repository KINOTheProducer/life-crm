"use client";

import { useEffect, useState, useTransition } from "react";
import { faceMatches, linkMany, type FaceMatchRow } from "@/app/(app)/people/faces-actions";
import { Button } from "@/components/ui/button";
import { selectClass } from "@/lib/forms";
import { personThumbUrl } from "@/lib/immich-urls";
import { cn } from "@/lib/utils";

const UNNAMED_SHOWN = 40;

/** Bulk face matching: one row per Immich face, with a person picked when the names match. */
export function FaceMatcher() {
  const [rows, setRows] = useState<FaceMatchRow[] | null>(null);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showLinked, setShowLinked] = useState(false);
  const [saving, start] = useTransition();

  const load = () =>
    faceMatches().then((res) => {
      setRows(res.rows);
      setPeople(res.people);
      setError(res.error ?? null);
      setChoice(Object.fromEntries(res.rows.filter((r) => !r.linkedTo && r.suggestion).map((r) => [r.id, r.suggestion!])));
    });

  useEffect(() => {
    let cancelled = false;
    faceMatches().then((res) => {
      if (cancelled) return;
      setRows(res.rows);
      setPeople(res.people);
      setError(res.error ?? null);
      setChoice(Object.fromEntries(res.rows.filter((r) => !r.linkedTo && r.suggestion).map((r) => [r.id, r.suggestion!])));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!rows) return <p className="text-muted-foreground">{error ?? "Loading faces from Immich…"}</p>;

  const open = rows.filter((r) => !r.linkedTo);
  const named = open.filter((r) => r.name);
  const unnamed = open.filter((r) => !r.name).slice(0, UNNAMED_SHOWN);
  const linked = rows.filter((r) => r.linkedTo);
  const pending = Object.entries(choice).filter(([, c]) => c);

  const save = () =>
    start(async () => {
      const res = await linkMany(pending.map(([personId, contactId]) => ({ personId, contactId })));
      setError(res.error ?? null);
      setNotice(res.linked ? `Linked ${res.linked} ${res.linked === 1 ? "face" : "faces"}.` : null);
      await load();
    });

  const row = (r: FaceMatchRow) => (
    <li key={r.id} className="flex items-center gap-4 py-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- proxied Immich face */}
      <img src={personThumbUrl(r.id)} alt="" loading="lazy" className="size-12 shrink-0 rounded-full bg-secondary object-cover" />
      <span className={cn("min-w-0 flex-1 truncate", !r.name && "text-muted-foreground italic")}>{r.name || "No name in Immich"}</span>
      {r.linkedTo ? (
        <a href={`/people/${r.linkedTo.contactId}`} className="text-sm underline-offset-4 hover:underline">
          {r.linkedTo.name}
        </a>
      ) : (
        <select
          aria-label={`Who is ${r.name || "this"}?`}
          value={choice[r.id] ?? ""}
          onChange={(e) => setChoice((c) => ({ ...c, [r.id]: e.target.value }))}
          className={cn(selectClass, "w-60", choice[r.id] && r.suggestion === choice[r.id] && "border-foreground/40")}
        >
          <option value="">Not linked</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.id === r.suggestion ? " (name match)" : ""}
            </option>
          ))}
        </select>
      )}
    </li>
  );

  return (
    <div className="grid max-w-3xl gap-6">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-card p-4 shadow-sm">
        <p className="text-sm text-muted-foreground">
          {pending.length ? `${pending.length} ready to link` : "Pick a person next to a face to link it."}
          {notice && <span className="ml-2 text-foreground">{notice}</span>}
        </p>
        <Button disabled={pending.length === 0 || saving} onClick={save}>
          {saving ? "Linking…" : `Link ${pending.length || ""}`.trim()}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {named.length > 0 && (
        <section className="rounded-3xl bg-card px-6 py-3">
          <h2 className="pt-3 text-sm text-muted-foreground">Named in Immich</h2>
          <ul className="divide-y divide-border">{named.map(row)}</ul>
        </section>
      )}
      {unnamed.length > 0 && (
        <section className="rounded-3xl bg-card px-6 py-3">
          <h2 className="pt-3 text-sm text-muted-foreground">Not named yet, most photographed first</h2>
          <ul className="divide-y divide-border">{unnamed.map(row)}</ul>
        </section>
      )}
      {open.length === 0 && <p className="text-muted-foreground">Every face Immich found is linked.</p>}
      {linked.length > 0 && (
        <section className="grid gap-2">
          <button type="button" onClick={() => setShowLinked((v) => !v)} className="justify-self-start text-sm text-muted-foreground hover:text-foreground">
            {showLinked ? "Hide" : "Show"} {linked.length} linked
          </button>
          {showLinked && (
            <div className="rounded-3xl bg-card px-6 py-3">
              <ul className="divide-y divide-border">{linked.map(row)}</ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
