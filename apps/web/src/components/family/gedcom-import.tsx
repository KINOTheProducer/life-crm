"use client";

import { FileUp } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { importGedcomFile, previewGedcomFile, type ImportResult, type PreviewResult } from "@/app/(app)/family/gedcom-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { selectClass } from "@/lib/forms";

/** Pick a .ged file, see what it holds and who matches, say which one is you, then bring it in. */
export function GedcomImport() {
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [self, setSelf] = useState("");
  const [pending, start] = useTransition();

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setResult(null);
    setFileName(file.name);
    const body = await file.text();
    setText(body);
    start(async () => {
      const p = await previewGedcomFile(body);
      setPreview(p);
      if (!("error" in p)) setSelf(p.selfGuess ?? "");
    });
  };

  if (result && !("error" in result)) {
    return (
      <div className="grid gap-3">
        <p className="type-display text-3xl">Done.</p>
        <p className="text-muted-foreground">
          {result.created} new {result.created === 1 ? "person" : "people"}, {result.linked} matched to people you already had, {result.families}{" "}
          {result.families === 1 ? "family" : "families"} added.
        </p>
        <Link href="/family" className={buttonVariants({ className: "justify-self-start" })}>
          See the tree
        </Link>
      </div>
    );
  }

  const ok = preview && !("error" in preview) ? preview : null;

  return (
    <div className="grid gap-5">
      <label className="grid cursor-pointer place-items-center gap-2 rounded-3xl border border-dashed border-border bg-background/50 p-10 text-center hover:bg-secondary/40">
        <FileUp className="size-6 text-muted-foreground" />
        <span className="font-medium">{fileName || "Choose a .ged file"}</span>
        <span className="text-sm text-muted-foreground">From Ancestry, FamilySearch, MyHeritage, Gramps or webtrees</span>
        <input type="file" accept=".ged,.gedcom,text/plain" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
      </label>

      {pending && !ok && <p className="text-sm text-muted-foreground">Reading…</p>}
      {preview && "error" in preview && <p className="text-sm text-destructive">{preview.error}</p>}

      {ok && (
        <div className="grid gap-4">
          <p className="text-[15px]">
            {ok.people} {ok.people === 1 ? "person" : "people"} in {ok.families} {ok.families === 1 ? "family" : "families"}.
            {ok.matched.length > 0 && ` ${ok.matched.length} already ${ok.matched.length === 1 ? "matches someone" : "match people"} you have, so they won't be added twice.`}
          </p>
          {ok.tooBig && <p className="text-sm text-destructive">That&apos;s more people than we can bring in at once. Export just your branch and try again.</p>}
          <label className="grid gap-2 text-sm font-medium">
            Which one is you?
            <select value={self} onChange={(e) => setSelf(e.target.value)} className={selectClass}>
              <option value="">I&apos;m not in this tree</option>
              {ok.choices.map((c) => (
                <option key={c.xref} value={c.xref}>
                  {c.label}
                </option>
              ))}
            </select>
            <span className="font-normal text-muted-foreground">So the tree connects to you instead of adding a second you.</span>
          </label>
          {ok.matched.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Who matched</summary>
              <p className="mt-2">{ok.matched.map((m) => m.name).join(", ")}</p>
            </details>
          )}
          {result && "error" in result && <p className="text-sm text-destructive">{result.error}</p>}
          <Button
            className="justify-self-start"
            disabled={pending || ok.tooBig || !text}
            onClick={() => start(async () => setResult(await importGedcomFile(text!, self || null)))}
          >
            {pending ? "Importing…" : "Import"}
          </Button>
        </div>
      )}
    </div>
  );
}
