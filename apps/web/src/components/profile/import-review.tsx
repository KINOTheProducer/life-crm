"use client";

import {
  birthdayInText,
  importantDateKindLabels,
  importantDateKinds,
  interactionTypeLabels,
  interactionTypes,
  milestoneKinds,
  milestoneLabels,
  personRelationLabels,
  personRelations,
  type FactCategory,
  type ImportantDateKind,
  type InteractionType,
  type MilestoneKind,
  type PersonRelation,
} from "@life-crm/core";
import { AlertTriangle, FileText } from "lucide-react";
import { useState, useTransition } from "react";
import { previewImport, saveImport } from "@/app/(app)/people/[id]/import/actions";
import { PartialDateFields } from "@/components/partial-date-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSteps, WorkingSteps } from "@/components/working-steps";
import type { ImportPreview } from "@/lib/data/import";
import { selectClass, textareaClass } from "@/lib/forms";
import {
  categoryOptions,
  destinationLabels,
  destinations,
  formatDate,
  itemConflict,
  itemDuplicate,
  itemProblem,
  otherDestinations,
  personProblem,
  singleDestinations,
  SUBJECT,
  type Destination,
  type ExistingProfile,
  type ImportItem,
  type ImportPerson,
} from "@/lib/import-items";
import { cn } from "@/lib/utils";

const maxBytes = 200_000;
const dated: Destination[] = ["birthday", "date", "milestone"];

/** Moving an item keeps its content: text becomes a date for dated destinations and the other way round. */
function moveTo(item: ImportItem, destination: Destination): ImportItem {
  const next = { ...item, destination };
  if (dated.includes(destination) && !next.date) next.date = birthdayInText(`birthday ${item.text}`);
  if (destination === "date" && !next.label) next.label = item.text.slice(0, 100);
  if (!dated.includes(destination) && !next.text && item.date) next.text = formatDate(item.date);
  return next;
}

/** Upload or paste a file, check where each piece goes and who it's about, then save it. */
export function ImportReview({
  contactId,
  firstName,
  existing,
  today,
  people: contacts,
}: {
  contactId: string;
  firstName: string;
  existing: ExistingProfile;
  today: string;
  /** Everyone else, to add a mentioned person to. */
  people: { id: string; name: string }[];
}) {
  const [preview, setPreview] = useState<Pick<ImportPreview, "nameInFile" | "sortedBy"> | null>(null);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [people, setPeople] = useState<ImportPerson[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [pasted, setPasted] = useState("");
  const [dragging, setDragging] = useState(false);
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();
  const [lineCount, setLineCount] = useState(0);
  const isPartner = !!existing.partnerLabel;
  const steps = useSteps(
    [
      `Reading ${lineCount} ${lineCount === 1 ? "line" : "lines"} about ${firstName}`,
      `Sorting it into facts, dates and catch-ups with ${firstName}`,
      "Picking out anyone else it mentions",
    ],
    reading,
  );

  function read(text: string) {
    setError(null);
    setLineCount(text.split("\n").filter((l) => l.trim()).length);
    startReading(async () => {
      const result = await previewImport(contactId, text);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (result.items.length === 0) {
        setError("Couldn't find anything to import in that file.");
        return;
      }
      setPreview({ nameInFile: result.nameInFile, sortedBy: result.sortedBy });
      // Things already on the profile word for word start out skipped.
      setItems(result.items.map((i) => (itemDuplicate(i, existing) ? { ...i, destination: "skip" } : i)));
      setPeople(result.people);
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
  const updatePerson = (ref: string, change: Partial<ImportPerson>) => setPeople((all) => all.map((p) => (p.ref === ref ? { ...p, ...change } : p)));

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
        <WorkingSteps lines={steps} />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  const skipped = new Set(people.filter((p) => p.skip).map((p) => p.ref));
  const counts = (i: ImportItem) => i.destination !== "skip" && !skipped.has(i.person);
  const active = items.filter(counts);
  const conflicts = active.filter((i) => itemConflict(i, existing)).length;
  const taken = (item: ImportItem, d: Destination) => singleDestinations.includes(d) && items.some((i) => i.id !== item.id && i.person === item.person && i.destination === d);
  const allowed = (person: string) =>
    person === SUBJECT ? destinations.filter((d) => d !== "milestone" || isPartner) : destinations.filter((d) => otherDestinations.includes(d));
  // A file can mention two birthdays for someone. Only the first one can be imported as is.
  const problemFor = (item: ImportItem) => {
    if (!counts(item)) return null;
    const first = items.find((i) => i.person === item.person && i.destination === item.destination);
    if (singleDestinations.includes(item.destination) && first?.id !== item.id) return `Only one item can go to ${destinationLabels[item.destination]}. Move or skip one.`;
    return itemProblem(item, today);
  };
  const nameOf = (p: ImportPerson) => (p.contactId ? (contacts.find((c) => c.id === p.contactId)?.name ?? p.firstName) : [p.firstName, p.lastName].filter(Boolean).join(" "));
  const owners = [{ ref: SUBJECT, name: firstName }, ...people.filter((p) => !p.skip).map((p) => ({ ref: p.ref, name: nameOf(p) }))];

  function moveToPerson(item: ImportItem, person: string) {
    const next = { ...item, person };
    if (!allowed(person).includes(next.destination)) return moveTo(next, next.text ? "note" : "skip");
    return next;
  }

  function save() {
    setShowProblems(true);
    if (active.some(problemFor) || people.some(personProblem)) return setError("Fix the items marked below first.");
    setError(null);
    startSaving(async () => {
      const result = await saveImport(contactId, { items, people });
      if (result?.error) setError(result.error);
    });
  }

  const row = (item: ImportItem) => {
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
            {allowed(item.person).map((d) => (
              <option key={d} value={d} disabled={taken(item, d)}>
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
          {item.destination === "date" && (
            <div className="grid grid-cols-[1fr_1fr] gap-2">
              <select aria-label="Kind" value={item.dateKind} onChange={(e) => update(item.id, { dateKind: e.target.value as ImportantDateKind })} className={selectClass}>
                {importantDateKinds.map((k) => (
                  <option key={k} value={k}>
                    {importantDateKindLabels[k]}
                  </option>
                ))}
              </select>
              <Input aria-label="Label" placeholder="e.g. Dad's death anniversary" value={item.label} maxLength={100} onChange={(e) => update(item.id, { label: e.target.value })} />
            </div>
          )}
          {item.destination === "milestone" && (
            <div className="grid grid-cols-[1fr_1fr] gap-2">
              <select aria-label="Milestone" value={item.milestone} onChange={(e) => update(item.id, { milestone: e.target.value as MilestoneKind })} className={selectClass}>
                {milestoneKinds.map((k) => (
                  <option key={k} value={k}>
                    {milestoneLabels[k]}
                  </option>
                ))}
              </select>
              {item.milestone === "custom" && (
                <Input aria-label="Label" placeholder="e.g. First trip together" value={item.label} maxLength={100} onChange={(e) => update(item.id, { label: e.target.value })} />
              )}
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

        {dated.includes(item.destination) ? (
          <PartialDateFields
            key={`${item.id}-${item.destination}`}
            prefix={`${item.id}Date`}
            label={item.destination === "birthday" ? "Birthday" : "Date"}
            defaultValue={item.date}
            onChange={(date) => update(item.id, { date })}
          />
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

        {owners.length > 1 && item.destination !== "skip" && (
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            About
            <select aria-label="About" value={item.person} onChange={(e) => setItems((all) => all.map((i) => (i.id === item.id ? moveToPerson(i, e.target.value) : i)))} className={cn(selectClass, "h-8 w-auto")}>
              {owners.map((o) => (
                <option key={o.ref} value={o.ref}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {conflict && <p className="text-[13px] text-destructive">{conflict}</p>}
        {!conflict && duplicate && <p className="text-[13px] text-muted-foreground">Already saved for {firstName}.</p>}
        {problem && <p className="text-[13px] text-destructive">{problem}</p>}
      </li>
    );
  };

  const subjectItems = items.filter((i) => i.person === SUBJECT);

  return (
    <div className="grid max-w-3xl gap-6">
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

      <section className="grid gap-3">
        <h2 className="type-display text-[1.625rem]">{firstName}</h2>
        {subjectItems.length === 0 ? <p className="text-sm text-muted-foreground">Nothing about {firstName} directly.</p> : <ul className="grid gap-3">{subjectItems.map(row)}</ul>}
      </section>

      {people.map((p) => {
        const theirs = items.filter((i) => i.person === p.ref);
        const problem = showProblems ? personProblem(p) : null;
        return (
          <section key={p.ref} className={cn("grid gap-3", p.skip && "opacity-60")}>
            <div className="grid gap-3 rounded-2xl bg-muted/60 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="type-display text-[1.625rem]">{nameOf(p) || "Someone"}</h2>
                <span className="text-[13px] text-muted-foreground">
                  {firstName}&apos;s {(p.relationLabel || personRelationLabels[p.relation]).toLowerCase()}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  aria-label="Who this is"
                  value={p.skip ? "skip" : (p.contactId ?? "new")}
                  onChange={(e) => {
                    const v = e.target.value;
                    updatePerson(p.ref, v === "skip" ? { skip: true } : { skip: false, contactId: v === "new" ? null : v });
                  }}
                  className={selectClass}
                >
                  <option value="new">Add as a new person</option>
                  <option value="skip">Don&apos;t import them</option>
                  <optgroup label="Add to someone you have">
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <div className="grid grid-cols-[1fr_1fr] gap-2">
                  <select aria-label="Relation" value={p.relation} disabled={p.skip} onChange={(e) => updatePerson(p.ref, { relation: e.target.value as PersonRelation })} className={selectClass}>
                    {personRelations.map((r) => (
                      <option key={r} value={r}>
                        {personRelationLabels[r]}
                      </option>
                    ))}
                  </select>
                  <Input aria-label="Relation in words" placeholder="e.g. Older sister" value={p.relationLabel} maxLength={100} disabled={p.skip} onChange={(e) => updatePerson(p.ref, { relationLabel: e.target.value })} />
                </div>
                {!p.skip && !p.contactId && (
                  <>
                    <Input aria-label="First name" placeholder="First name" value={p.firstName} maxLength={100} onChange={(e) => updatePerson(p.ref, { firstName: e.target.value })} />
                    <Input aria-label="Last name" placeholder="Last name" value={p.lastName} maxLength={100} onChange={(e) => updatePerson(p.ref, { lastName: e.target.value })} />
                  </>
                )}
              </div>
              {!p.skip && !p.contactId && ["parent", "child", "sibling", "partner"].includes(p.relation) && (
                <p className="text-[13px] text-muted-foreground">Goes in the family tree as {firstName}&apos;s {personRelationLabels[p.relation].toLowerCase()}.</p>
              )}
              {problem && <p className="text-[13px] text-destructive">{problem}</p>}
            </div>
            {!p.skip && theirs.length > 0 && <ul className="grid gap-3">{theirs.map(row)}</ul>}
          </section>
        );
      })}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="lg" variant={conflicts > 0 ? "destructive" : "default"} disabled={saving || (active.length === 0 && people.every((p) => p.skip))} onClick={save}>
          {saving ? "Importing…" : conflicts > 0 ? `Import ${active.length} and replace ${conflicts}` : `Import ${active.length} ${active.length === 1 ? "item" : "items"}`}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="ghost"
          onClick={() => {
            setPreview(null);
            setItems([]);
            setPeople([]);
            setError(null);
          }}
        >
          Start over
        </Button>
      </div>
    </div>
  );
}
