"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { previewResort, saveResort } from "@/app/(app)/people/[id]/import/actions";
import { Button } from "@/components/ui/button";
import { useSteps, WorkingSteps } from "@/components/working-steps";
import { describeTarget, type ResortSuggestion } from "@/lib/resort-items";
import { cn } from "@/lib/utils";

/** Suggested moves for saved items, each one ticked to apply. */
export function ResortList({
  suggestions,
  accepted,
  onToggle,
}: {
  suggestions: ResortSuggestion[];
  accepted: Set<string>;
  onToggle: (key: string, on: boolean) => void;
}) {
  return (
    <ul className="grid gap-3">
      {suggestions.map((s) => {
        const on = accepted.has(s.key);
        return (
          <li key={s.key} className={cn("rounded-2xl border border-border bg-card p-4", !on && "opacity-60")}>
            <label className="grid cursor-pointer grid-cols-[auto_1fr] gap-3">
              <input type="checkbox" checked={on} onChange={(e) => onToggle(s.key, e.target.checked)} className="mt-1 size-4 accent-foreground" />
              <span className="grid gap-2 text-sm">
                <span className={cn("text-muted-foreground", on && "line-through")}>{s.source.text}</span>
                {s.duplicateOf ? (
                  <span className="flex items-start gap-2">
                    <ArrowRight className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      Remove. Already saved as <span className="font-medium">{s.duplicateOf.text}</span>
                    </span>
                  </span>
                ) : (
                  s.into.map((t, i) => (
                    <span key={i} className="flex items-start gap-2">
                      <ArrowRight className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        {s.person && <span className="font-medium">{s.person.name}: </span>}
                        {describeTarget(t)}
                      </span>
                    </span>
                  ))
                )}
                {s.reason && <span className="text-[13px] text-muted-foreground">{s.reason}</span>}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/** Look again at everything saved about someone, without a file. */
export function ResortPanel({ contactId, firstName }: { contactId: string; firstName: string }) {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<ResortSuggestion[] | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [checking, startChecking] = useTransition();
  const [saving, startSaving] = useTransition();
  const steps = useSteps([`Reading everything saved about ${firstName}`, "Checking each item has the right home", "Looking for anything saved twice"], checking);

  function check() {
    setError(null);
    setDone(null);
    startChecking(async () => {
      const result = await previewResort(contactId);
      if ("error" in result) return setError(result.error);
      setSuggestions(result.suggestions);
      setAccepted(new Set(result.suggestions.map((s) => s.key)));
    });
  }

  function apply() {
    const chosen = (suggestions ?? []).filter((s) => accepted.has(s.key));
    startSaving(async () => {
      const result = await saveResort(contactId, chosen);
      if ("error" in result) return setError(result.error);
      setSuggestions(null);
      setDone(`Moved ${chosen.length} ${chosen.length === 1 ? "item" : "items"}.`);
      router.refresh();
    });
  }

  return (
    <div className="grid max-w-3xl gap-4">
      {suggestions == null ? (
        <>
          <Button type="button" variant="outline" className="justify-self-start" disabled={checking} onClick={check}>
            {checking ? "Checking…" : `Re-sort what's saved about ${firstName}`}
          </Button>
          <WorkingSteps lines={steps} />
        </>
      ) : suggestions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Everything about {firstName} is where it should be.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Each change moves or rewrites the item. Nothing is copied, so the old version goes away.</p>
          <ResortList suggestions={suggestions} accepted={accepted} onToggle={(key, on) => setAccepted((all) => toggled(all, key, on))} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={saving || accepted.size === 0} onClick={apply}>
              {saving ? "Moving…" : `Apply ${accepted.size} ${accepted.size === 1 ? "change" : "changes"}`}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSuggestions(null)}>
              Cancel
            </Button>
          </div>
        </>
      )}
      {done && <p className="text-sm text-muted-foreground">{done}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function toggled(all: Set<string>, key: string, on: boolean) {
  const next = new Set(all);
  if (on) next.add(key);
  else next.delete(key);
  return next;
}
