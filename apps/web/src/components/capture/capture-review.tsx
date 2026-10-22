"use client";

import type { Extraction } from "@life-crm/ai";
import {
  factCategoryLabels,
  interactionTypeLabels,
  interactionTypes,
  type FactCategory,
  type InteractionType,
  type PartialDate,
} from "@life-crm/core";
import { Check, RotateCcw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { discardCapture, reprocessCapture, retryCapture, saveCapture } from "@/app/(app)/capture/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { WorkingSteps } from "@/components/working-steps";
import { formatPartialDate } from "@/lib/data/dates";
import { cn } from "@/lib/utils";

export interface ReviewContact {
  id: string;
  name: string;
  birthday: PartialDate | null;
}

interface CaptureView {
  id: string;
  status: "transcribing" | "extracting" | "ready" | "committed" | "failed" | "discarded";
  transcript: string | null;
  extraction: Extraction | null;
  /** What processing has found so far. */
  progress: string[];
  error: string | null;
  durationMs: number | null;
  /** Saved before, so saving again replaces what it added. */
  rereading: boolean;
  /** Who was on screen when the note was recorded. */
  contextName: string | null;
}

interface FactDraft {
  include: boolean;
  category: FactCategory;
  label: string;
  value: string;
}

interface PersonDraft {
  ref: string;
  include: boolean;
  contactId: string | null;
  firstName: string;
  lastName: string;
  nickname: string | null;
  pronouns: string | null;
  birthday: PartialDate | null;
  includeBirthday: boolean;
  howMet: string | null;
  includeHowMet: boolean;
  facts: FactDraft[];
  note: string;
  includeNote: boolean;
}

interface InteractionDraft {
  include: boolean;
  type: InteractionType;
  date: string;
  location: string;
  summary: string;
  participantRefs: string[];
}

function toDrafts(extraction: Extraction): { people: PersonDraft[]; interaction: InteractionDraft | null } {
  return {
    people: extraction.people.map((p) => ({
      ref: p.ref,
      include: true,
      contactId: p.existingContactId,
      firstName: p.firstName,
      lastName: p.lastName ?? "",
      nickname: p.nickname,
      pronouns: p.pronouns,
      birthday: p.birthday,
      includeBirthday: !!p.birthday,
      howMet: p.howMet,
      includeHowMet: !!p.howMet,
      facts: p.facts.map((f) => ({ ...f, include: true })),
      note: p.note ?? "",
      includeNote: !!p.note,
    })),
    interaction: extraction.interaction
      ? { include: true, ...extraction.interaction, location: extraction.interaction.location ?? "" }
      : null,
  };
}

function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const fieldClass =
  "w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-md border transition-colors",
        checked ? "border-foreground bg-foreground text-background" : "border-input bg-card",
      )}
    >
      {checked && <Check className="size-3.5" strokeWidth={3} />}
    </button>
  );
}

function Row({
  checked,
  onToggle,
  label,
  children,
}: {
  checked: boolean;
  onToggle: (v: boolean) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-start gap-3 py-2.5", !checked && "opacity-50")}>
      <div className="pt-0.5">
        <Toggle checked={checked} onChange={onToggle} label={`Include ${label}`} />
      </div>
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="text-[13px] text-muted-foreground">{label}</p>
        {children}
      </div>
    </div>
  );
}

export function CaptureReview({ capture, contacts }: { capture: CaptureView; contacts: ReviewContact[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState(capture.transcript ?? "");
  const [drafts, setDrafts] = useState(() => (capture.extraction ? toDrafts(capture.extraction) : null));
  const [progress, setProgress] = useState(capture.progress);
  const processing = capture.status === "transcribing" || capture.status === "extracting";

  // Poll while the server works, showing what it's found so far, then pick up the fresh extraction.
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/captures/${capture.id}`, { cache: "no-store" });
      const body = (await res.json()) as { status: string; progress?: string[] };
      if (body.status !== capture.status) router.refresh();
      else if (body.progress) setProgress(body.progress);
    }, 1500);
    return () => clearInterval(timer);
  }, [processing, capture.id, capture.status, router]);

  const contactById = new Map(contacts.map((c) => [c.id, c]));

  function updatePerson(ref: string, patch: Partial<PersonDraft>) {
    setDrafts((d) => d && { ...d, people: d.people.map((p) => (p.ref === ref ? { ...p, ...patch } : p)) });
  }

  function updateFact(ref: string, index: number, patch: Partial<FactDraft>) {
    setDrafts(
      (d) =>
        d && {
          ...d,
          people: d.people.map((p) =>
            p.ref === ref ? { ...p, facts: p.facts.map((f, i) => (i === index ? { ...f, ...patch } : f)) } : p,
          ),
        },
    );
  }

  function updateInteraction(patch: Partial<InteractionDraft>) {
    setDrafts((d) => d && d.interaction && { ...d, interaction: { ...d.interaction, ...patch } });
  }

  function save() {
    if (!drafts) return;
    const people = drafts.people
      .filter((p) => p.include && p.firstName.trim())
      .map((p) => ({
        ref: p.ref,
        contactId: p.contactId,
        firstName: p.firstName.trim(),
        lastName: p.lastName.trim() || null,
        nickname: p.nickname,
        pronouns: p.pronouns,
        birthday: p.includeBirthday ? p.birthday : null,
        howMet: p.includeHowMet ? p.howMet : null,
        facts: p.facts.filter((f) => f.include && f.value.trim()).map(({ category, label, value }) => ({ category, label, value })),
        note: p.includeNote && p.note.trim() ? p.note.trim() : null,
      }));
    const included = new Set(people.map((p) => p.ref));
    const ix = drafts.interaction;
    const participantRefs = ix?.participantRefs.filter((r) => included.has(r)) ?? [];
    const interaction =
      ix?.include && participantRefs.length > 0 && ix.summary.trim()
        ? { type: ix.type, date: ix.date, location: ix.location.trim() || null, summary: ix.summary.trim(), participantRefs }
        : null;

    setError(null);
    startTransition(async () => {
      const result = await saveCapture(capture.id, { people, interaction });
      if (result?.error) setError(result.error);
    });
  }

  if (processing) {
    return (
      <Card>
        <CardContent className="grid justify-items-center gap-4 py-16 text-center">
          <Sparkles className="size-8 animate-pulse text-accent-ink" />
          <p className="type-display text-3xl">
            {capture.status === "transcribing" ? "Listening back to your note…" : "Picking out the details…"}
          </p>
          <p className="type-meta text-muted-foreground">
            {capture.status === "transcribing" ? "Step 1 of 2 · Transcribing" : "Step 2 of 2 · Extracting"}
          </p>
          {capture.status === "transcribing" ? (
            <WorkingSteps
              lines={[
                `Turning your ${capture.durationMs ? `${formatDuration(capture.durationMs)} ` : ""}note${capture.contextName ? ` about ${capture.contextName}` : ""} into text`,
              ]}
            />
          ) : (
            <WorkingSteps lines={progress} working={progress.length <= 1} className="mt-2 w-full max-w-md" />
          )}
        </CardContent>
      </Card>
    );
  }

  if (capture.status === "failed") {
    return (
      <Card>
        <CardContent className="grid gap-4">
          <p className="type-display text-3xl">That didn&apos;t work</p>
          <p className="text-destructive">{capture.error}</p>
          <div className="flex gap-2">
            <Button disabled={pending} onClick={() => startTransition(() => retryCapture(capture.id).then(() => router.refresh()))}>
              <RotateCcw />
              Try again
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => startTransition(() => discardCapture(capture.id))}>
              Discard
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (capture.status === "discarded") {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground">This note was discarded.</p>
        </CardContent>
      </Card>
    );
  }

  if (capture.status === "committed") {
    return (
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Transcript</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <textarea rows={10} className={fieldClass} value={transcript} onChange={(e) => setTranscript(e.target.value)} />
          <Button
            className="justify-self-start"
            disabled={pending || !transcript.trim()}
            onClick={() => startTransition(() => reprocessCapture(capture.id, transcript).then(() => router.refresh()))}
          >
            <RotateCcw />
            Read it again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="grid content-start gap-6">
        {drafts?.people.length === 0 && (
          <Card>
            <CardContent>
              <p className="text-muted-foreground">
                No people were found in this note. Edit the transcript to add names, then run it again.
              </p>
            </CardContent>
          </Card>
        )}

        {drafts?.people.map((p) => {
          const matched = p.contactId ? contactById.get(p.contactId) : null;
          return (
            <Card key={p.ref} className={cn(!p.include && "opacity-60")}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Toggle checked={p.include} onChange={(v) => updatePerson(p.ref, { include: v })} label={`Include ${p.firstName}`} />
                    <Badge variant="secondary" className={matched ? undefined : "bg-peach"}>{matched ? "Existing person" : "New person"}</Badge>
                  </div>
                  <select
                    aria-label="Save to"
                    value={p.contactId ?? ""}
                    onChange={(e) => updatePerson(p.ref, { contactId: e.target.value || null })}
                    className="h-9 max-w-56 rounded-full border border-input bg-card px-3 text-sm"
                  >
                    <option value="">Create new person</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        Add to {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                {matched ? (
                  <CardTitle className="pt-2 text-3xl">{matched.name}</CardTitle>
                ) : (
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <Input aria-label="First name" value={p.firstName} onChange={(e) => updatePerson(p.ref, { firstName: e.target.value })} />
                    <Input aria-label="Last name" placeholder="Last name" value={p.lastName} onChange={(e) => updatePerson(p.ref, { lastName: e.target.value })} />
                  </div>
                )}
              </CardHeader>
              <CardContent className="divide-y divide-border">
                {p.birthday && (
                  <Row checked={p.includeBirthday} onToggle={(v) => updatePerson(p.ref, { includeBirthday: v })} label="Birthday">
                    <p>
                      {formatPartialDate(p.birthday)}
                      {matched?.birthday && (
                        <span className="text-sm text-muted-foreground"> · replaces {formatPartialDate(matched.birthday)}</span>
                      )}
                    </p>
                  </Row>
                )}
                {p.howMet && (
                  <Row checked={p.includeHowMet} onToggle={(v) => updatePerson(p.ref, { includeHowMet: v })} label="How you met">
                    <p>{p.howMet}</p>
                  </Row>
                )}
                {p.facts.map((f, i) => (
                  <Row
                    key={i}
                    checked={f.include}
                    onToggle={(v) => updateFact(p.ref, i, { include: v })}
                    label={`${factCategoryLabels[f.category]} · ${f.label}`}
                  >
                    <Input value={f.value} onChange={(e) => updateFact(p.ref, i, { value: e.target.value })} />
                  </Row>
                ))}
                {(p.note || p.includeNote) && (
                  <Row checked={p.includeNote} onToggle={(v) => updatePerson(p.ref, { includeNote: v })} label="Note">
                    <textarea rows={3} className={fieldClass} value={p.note} onChange={(e) => updatePerson(p.ref, { note: e.target.value })} />
                  </Row>
                )}
                {!p.birthday && !p.howMet && p.facts.length === 0 && !p.note && (
                  <p className="py-2.5 text-sm text-muted-foreground">Only the name was mentioned.</p>
                )}
              </CardContent>
            </Card>
          );
        })}

        {drafts?.interaction && (
          <Card className={cn(!drafts.interaction.include && "opacity-60")}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Toggle
                  checked={drafts.interaction.include}
                  onChange={(v) => updateInteraction({ include: v })}
                  label="Include interaction"
                />
                <p className="text-sm text-muted-foreground">Log a catch-up</p>
              </div>
              <CardTitle className="pt-2">
                With {drafts.people.filter((p) => drafts.interaction!.participantRefs.includes(p.ref)).map((p) => p.firstName).join(", ")}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid grid-cols-2 gap-2">
                <select
                  aria-label="Type"
                  value={drafts.interaction.type}
                  onChange={(e) => updateInteraction({ type: e.target.value as InteractionType })}
                  className="h-10 rounded-xl border border-input bg-card px-3 text-sm"
                >
                  {interactionTypes.map((t) => (
                    <option key={t} value={t}>
                      {interactionTypeLabels[t]}
                    </option>
                  ))}
                </select>
                <Input type="date" aria-label="Date" value={drafts.interaction.date} onChange={(e) => updateInteraction({ date: e.target.value })} />
              </div>
              <Input placeholder="Where (optional)" value={drafts.interaction.location} onChange={(e) => updateInteraction({ location: e.target.value })} />
              <textarea rows={2} className={fieldClass} value={drafts.interaction.summary} onChange={(e) => updateInteraction({ summary: e.target.value })} />
            </CardContent>
          </Card>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {capture.rereading && (
          <p className="text-sm text-muted-foreground">
            Saving replaces the facts, notes and catch-up this note added before. Anything you added by hand stays.
          </p>
        )}
        <div className="flex gap-2">
          <Button size="lg" disabled={pending || !drafts?.people.some((p) => p.include)} onClick={save}>
            {pending ? "Saving…" : capture.rereading ? "Replace on timeline" : "Save to timeline"}
          </Button>
          <Button variant="outline" size="lg" disabled={pending} onClick={() => startTransition(() => discardCapture(capture.id))}>
            {capture.rereading ? "Keep the old version" : "Discard"}
          </Button>
        </div>
      </div>

      <Card className="h-fit lg:sticky lg:top-12">
        <CardHeader>
          <CardTitle>Transcript</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <textarea rows={10} className={fieldClass} value={transcript} onChange={(e) => setTranscript(e.target.value)} />
          <Button
            variant="outline"
            size="sm"
            className="justify-self-start"
            disabled={pending || transcript.trim() === (capture.transcript ?? "").trim()}
            onClick={() => startTransition(() => reprocessCapture(capture.id, transcript).then(() => router.refresh()))}
          >
            <RotateCcw />
            Re-read edited transcript
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
