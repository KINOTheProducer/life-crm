"use client";

import { parseMonicaExport } from "@life-crm/core";
import { FileUp } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { previewImport, runImport, type ImportAction, type PreviewRow } from "@/app/(app)/people/import/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const actionLabels: Record<ImportAction, string> = { create: "Add new", merge: "Merge", skip: "Skip" };

export function Importer() {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ created: number; merged: number } | null>(null);
  const [pending, start] = useTransition();

  const choose = (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setDone(null);
    setRows(null);
    start(async () => {
      let text = await f.text();
      let name = f.name;
      // Monica's export is large and nested; read it here and send only what's used.
      if (/\.json$/i.test(name)) {
        try {
          text = JSON.stringify(parseMonicaExport(JSON.parse(text)));
          name = "monica.json";
        } catch (e) {
          setError(e instanceof SyntaxError ? "That file isn't valid JSON." : e instanceof Error ? e.message : "Couldn't read that file.");
          return;
        }
      }
      setFile({ name: f.name, text: text });
      const res = await previewImport(text, name);
      if (res.error) setError(res.error);
      else setRows(res.rows);
    });
  };

  const counts = { create: 0, merge: 0, skip: 0 };
  for (const r of rows ?? []) counts[r.action]++;

  if (done) {
    return (
      <div className="grid max-w-xl gap-3 rounded-3xl bg-card p-8">
        <p className="type-display text-3xl">
          {done.created} added{done.merged ? `, ${done.merged} merged` : ""}.
        </p>
        <p className="text-muted-foreground">Imported people have no catch-up nudges until you set how often you want to see them.</p>
        <Link href="/people" className="text-sm font-medium underline underline-offset-4">
          See your people
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          choose(e.dataTransfer.files[0]);
        }}
        className="grid cursor-pointer justify-items-center gap-2 rounded-3xl border-2 border-dashed border-border bg-card p-10 text-center hover:bg-muted"
      >
        <FileUp className="size-8 text-muted-foreground" />
        <span className="font-medium">{file ? file.name : "Choose a .vcf, .csv or .json file, or drop it here"}</span>
        <span className="max-w-xl text-sm text-muted-foreground">
          From iPhone or Mac Contacts (export vCard), Google Contacts (vCard or Google CSV), Outlook, LinkedIn (Connections.csv from Get a copy of your data), Monica (Export to JSON, with notes, activities, gifts and relationships), or any spreadsheet with name, phone and email columns.
        </span>
        <input type="file" accept=".vcf,.vcard,.csv,.json,text/vcard,text/csv,application/json" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
      </label>

      {pending && !rows && <p className="text-muted-foreground">Reading {file?.name ?? "the file"}…</p>}
      {error && <p className="text-destructive">{error}</p>}

      {rows && (
        <>
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-card p-4 shadow-sm">
            <p className="text-sm text-muted-foreground">
              {counts.create} new · {counts.merge} merged into people you have · {counts.skip} skipped
            </p>
            <div className="flex flex-wrap gap-2">
              {rows.some((r) => r.match) && (
                <Button variant="ghost" size="sm" onClick={() => setRows((all) => all?.map((x) => (x.match ? { ...x, action: "skip" } : x)) ?? null)}>
                  Skip all matches
                </Button>
              )}
              <Button
                disabled={pending || counts.create + counts.merge === 0}
                onClick={() =>
                  start(async () => {
                    const res = await runImport(
                      file!.text,
                      /\.json$/i.test(file!.name) ? "monica.json" : file!.name,
                      rows.map((r) => r.action),
                    );
                    if (res.error) setError(res.error);
                    else setDone(res);
                  })
                }
              >
                {pending ? "Importing…" : `Import ${counts.create + counts.merge}`}
              </Button>
            </div>
          </div>
          <ul className="divide-y divide-border rounded-3xl bg-card px-6">
            {rows.map((r) => (
              <li key={r.index} className={cn("flex flex-wrap items-center gap-4 py-3", r.action === "skip" && "opacity-50")}>
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="font-medium">{r.name}</span>
                  <span className="truncate text-[13px] text-muted-foreground">{r.details.join(" · ") || "Name only"}</span>
                  {r.match && (
                    <span className="text-[13px] text-accent-ink">
                      Looks like{" "}
                      <Link href={`/people/${r.match.contactId}`} target="_blank" className="underline underline-offset-2">
                        {r.match.name}
                      </Link>{" "}
                      ({r.match.reason})
                    </span>
                  )}
                </div>
                <div role="radiogroup" aria-label={`What to do with ${r.name}`} className="flex gap-1">
                  {(r.match ? (["merge", "create", "skip"] as const) : (["create", "skip"] as const)).map((a) => (
                    <button
                      key={a}
                      type="button"
                      role="radio"
                      aria-checked={r.action === a}
                      onClick={() => setRows((all) => all?.map((x) => (x.index === r.index ? { ...x, action: a } : x)) ?? null)}
                      className={cn("rounded-full px-3 py-1.5 text-[13px]", r.action === a ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-muted")}
                    >
                      {actionLabels[a]}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
