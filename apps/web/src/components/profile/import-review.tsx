"use client";

import { birthdayInText, interactionTypeLabels, interactionTypes, type FactCategory, type InteractionType, type PartialDate } from "@life-crm/core";
import { AlertTriangle, FileText } from "lucide-react";
import { useState, useTransition } from "react";
import { previewImport, saveImport } from "@/app/(app)/people/[id]/import/actions";
import { PartialDateFields } from "@/components/partial-date-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ImportPreview } from "@/lib/data/import";
import { monthNames, selectClass, textareaClass } from "@/lib/forms";
import {
  categoryOptions,
  destinationLabels,
  destinations,
  itemConflict,
  itemDuplicate,
  itemProblem,
  type Destination,
  type ExistingProfile,
  type ImportItem,
} from "@/lib/import-items";
import { cn } from "@/lib/utils";

const maxBytes = 200_000;
const single: Destination[] = ["birthday", "nickname", "pronouns", "howMet"];

function formatDate(d: PartialDate) {
  return `${monthNames[d.month - 1]} ${d.day}${d.year ? `, ${d.year}` : ""}`;
}

/** Moving an item keeps its content: text becomes a date for birthdays and the other way round. */
function moveTo(item: ImportItem, destination: Destination): ImportItem {
  const next = { ...item, destination };
  if (destination === "birthday" && !next.date) next.date = birthdayInText(`birthday ${item.text}`);
  if (destination !== "birthday" && !next.text && item.date) next.text = formatDate(item.date);
  return next;
}

/** Upload or paste a file, check where each piece goes, then save it to the person's profile. */
export function ImportReview({ contactId, firstName, existing, today }: { contactId: string; firstName: string; existing: ExistingProfile; today: string }) {
  const [preview, setPreview] = useState<Omit<ImportPreview, "items"> | null>(null);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [pasted, setPasted] = useState("");
  const [dragging, setDragging] = useState(false);
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();

  function read(text: string) {
    setError(null);
    startReading(async () => {
      const result = await previewImport(contactId, text);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      const { items: found, ...rest } = result;
      if (found.length === 0) {
        setError("Couldn't find anything to import in that file.");
        return;
      }
      setPreview(rest);
      // Things already on the profile word for word start out skipped.
      setItems(found.map((i) => (itemDuplicate(i, existing) ? { ...i, destination: "skip" } : i)));
      setShowProblems(false);
    });
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > maxBytes) return setError("That file is too big. Try one under 200 KB.");
    if (!/\.(txt|md|markdown|text)$/i.test(file.name) && !file.type.startsWith("text/")) {
      return setError("Import a text or Markdown file (.txt or .md).");
    }
    read(await file.text());
  }

  const update = (id: string, change: Partial<ImportItem>) => setItems((all) => all.map((i) => (i.id === id ? { ...i, ...change } : i)));

  if (!preview) {
    return (
      <div className="grid max-w-2xl gap-5">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void readFile(e.dataTransfer.files[0]);
          }}
          className={cn(
            "grid cursor-pointer place-items-center gap-2 rounded-3xl border-2 border-dashed border-border bg-card px-6 py-12 text-center transition-colors hover:bg-muted",
            dragging && "border-foreground bg-muted",
          )}
        >
          <FileText className="size-6 text-muted-foreground" />
          <span className="text-[15px] font-medium">{reading ? "Reading…" : "Choose a file or drop it here"}</span>
          <span className="text-[13px] text-muted-foreground">.txt or .md, up to 200 KB</span>
          <input
            type="file"
            accept=".txt,.md,.markdown,.text,text/plain,text/markdown"
            className="sr-only"
            disabled={reading}
            onChange={(e) => {
              void readFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <div className="grid gap-2">
          <p className="text-sm font-medium">Or paste it</p>
          <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={6} maxLength={50_000} placeholder={`Anything you know about ${firstName}…`} className={textareaClass} />
          <Button type="button" variant="outline" className="justify-self-start" disabled={reading || !pasted.trim()} onClick={() => read(pasted)}>
            {reading ? "Reading…" : "Read it"}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  const active = items.filter((i) => i.destination !== "skip");
  const conflicts = active.filter((i) => itemConflict(i, existing)).length;
  const taken = (d: Destination, id: string) => single.includes(d) && items.some((i) => i.id !== id && i.destination === d);
  // A file can mention two birthdays. Only the first one can be imported as is.
  const problemFor = (item: ImportItem) => {
    if (item.destination === "skip") return null;
    const first = items.find((i) => i.destination === item.destination);
    if (single.includes(item.destination) && first?.id !== item.id) return `Only one item can go to ${destinationLabels[item.destination]}. Move or skip one.`;
    return itemProblem(item, today);
  };

  function save() {
    setShowProblems(true);
    if (active.some(problemFor)) return setError("Fix the items marked below first.");
    setError(null);
    startSaving(async () => {
      const result = await saveImport(contactId, items);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="grid max-w-3xl gap-5">
      {(preview.nameInFile || conflicts > 0) && (
        <div className="flex gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3.5 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="grid gap-1">
            {preview.nameInFile && (
              <p>
                This file looks like it&apos;s about <strong>{preview.nameInFile}</strong>, not {firstName}. Make sure you&apos;re on the right person.
              </p>
            )}
            {conflicts > 0 && (
              <p>
                {conflicts === 1 ? "1 item doesn't" : `${conflicts} items don't`} match what&apos;s saved for {firstName}, marked in red. It may be the wrong file.
                Importing replaces the saved {conflicts === 1 ? "value" : "values"}, so skip anything that&apos;s wrong.
              </p>
            )}
          </div>
        </div>
      )}
      {preview.sortedBy === "rules" && <p className="text-sm text-muted-foreground">Sorted with simple rules since AI isn&apos;t set up. Check where everything landed.</p>}
      {preview.others.length > 0 && <p className="text-sm text-muted-foreground">Also mentions {preview.others.join(", ")}. That isn&apos;t imported here.</p>}

      <ul className="grid gap-3">
        {items.map((item) => {
          const conflict = item.destination === "skip" ? null : itemConflict(item, existing);
          const duplicate = itemDuplicate(item, existing);
          const problem = showProblems ? problemFor(item) : null;
          return (
            <li
              key={item.id}
              className={cn(
                "grid gap-3 rounded-2xl border border-border bg-card p-4",
                (conflict || problem) && "border-destructive bg-destructive/5",
                item.destination === "skip" && "opacity-60",
              )}
            >
              <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
                <select
                  aria-label="Where this goes"
                  value={item.destination}
                  onChange={(e) => setItems((all) => all.map((i) => (i.id === item.id ? moveTo(i, e.target.value as Destination) : i)))}
                  className={selectClass}
                >
                  {destinations.map((d) => (
                    <option key={d} value={d} disabled={taken(d, item.id)}>
                      {destinationLabels[d]}
                    </option>
                  ))}
                </select>
                {item.destination === "fact" && (
                  <div className="grid grid-cols-[1fr_1fr] gap-2">
                    <select aria-label="Category" value={item.category} onChange={(e) => update(item.id, { category: e.target.value as FactCategory })} className={selectClass}>
                      {categoryOptions.map(([c, l]) => (
                        <option key={c} value={c}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <Input aria-label="Label" placeholder="Label, e.g. Cat" value={item.label} maxLength={100} onChange={(e) => update(item.id, { label: e.target.value })} />
                  </div>
                )}
                {item.destination === "catchup" && (
                  <div className="grid grid-cols-[1fr_1fr] gap-2">
                    <select aria-label="Type" value={item.type} onChange={(e) => update(item.id, { type: e.target.value as InteractionType })} className={selectClass}>
                      {interactionTypes.map((t) => (
                        <option key={t} value={t}>
                          {interactionTypeLabels[t]}
                        </option>
                      ))}
                    </select>
                    <Input type="date" aria-label="Date" value={item.on} max={today} onChange={(e) => update(item.id, { on: e.target.value })} />
                  </div>
                )}
              </div>

              {item.destination === "birthday" ? (
                <PartialDateFields key={`${item.id}-date`} prefix={`${item.id}Birthday`} label="Birthday" defaultValue={item.date} onChange={(date) => update(item.id, { date })} />
              ) : item.destination === "note" || item.destination === "catchup" || item.destination === "howMet" || item.destination === "skip" ? (
                <textarea
                  aria-label="Text"
                  value={item.text || (item.date ? formatDate(item.date) : "")}
                  onChange={(e) => update(item.id, { text: e.target.value })}
                  rows={Math.min(6, Math.max(2, Math.ceil(item.text.length / 90)))}
                  maxLength={5000}
                  disabled={item.destination === "skip"}
                  className={textareaClass}
                />
              ) : (
                <Input aria-label="Value" value={item.text} maxLength={item.destination === "fact" ? 500 : 100} onChange={(e) => update(item.id, { text: e.target.value })} />
              )}

              {conflict && <p className="text-[13px] text-destructive">{conflict}</p>}
              {!conflict && duplicate && <p className="text-[13px] text-muted-foreground">Already saved for {firstName}.</p>}
              {problem && <p className="text-[13px] text-destructive">{problem}</p>}
            </li>
          );
        })}
      </ul>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="lg" variant={conflicts > 0 ? "destructive" : "default"} disabled={saving || active.length === 0} onClick={save}>
          {saving ? "Importing…" : conflicts > 0 ? `Import ${active.length} and replace ${conflicts}` : `Import ${active.length} ${active.length === 1 ? "item" : "items"}`}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="ghost"
          onClick={() => {
            setPreview(null);
            setItems([]);
            setError(null);
          }}
        >
          Start over
        </Button>
      </div>
    </div>
  );
}
