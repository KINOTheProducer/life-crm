"use client";

import { eraKindLabels, eraKinds } from "@life-crm/core";
import { Plus, X } from "lucide-react";
import { useActionState, useRef, useState, useTransition } from "react";
import type { FormState } from "@/app/(app)/people/[id]/actions";
import { addEra, deleteEra } from "@/app/(app)/people/timeline/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/lib/forms";
import { submitKeepingValues } from "@/lib/submit";

export function EraList({ eras }: { eras: { id: string; label: string; kind: string; years: string }[] }) {
  const [busy, start] = useTransition();
  if (eras.length === 0) return null;
  return (
    <ul className="grid gap-2">
      {eras.map((e) => (
        <li key={e.id} className="group flex items-start justify-between gap-2 text-sm">
          <span>
            {e.label}
            <span className="block text-[13px] text-muted-foreground">
              {e.kind} · {e.years}
            </span>
          </span>
          <button
            type="button"
            aria-label={`Delete ${e.label}`}
            disabled={busy}
            onClick={() => start(() => deleteEra(e.id))}
            className="rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
          >
            <X className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function EraForm({ currentYear }: { currentYear: number }) {
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: FormState, data: FormData) => {
    const next = await addEra(prev, data);
    if (next.ok) form.current?.reset();
    return next;
  }, {});

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setOpen(true)}>
        <Plus />
        Add an era
      </Button>
    );
  }
  return (
    <form ref={form} onSubmit={submitKeepingValues(action)} className="grid gap-2 border-t border-border pt-4">
      <Input name="label" placeholder="Waterloo, Lived in Montreal, Shopify" required maxLength={80} autoFocus />
      <select name="kind" aria-label="Kind" defaultValue="school" className={selectClass}>
        {eraKinds.map((k) => (
          <option key={k} value={k}>
            {eraKindLabels[k]}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <Input name="startYear" inputMode="numeric" placeholder="From" aria-label="From year" required maxLength={4} />
        <Input name="endYear" inputMode="numeric" placeholder={`To (blank if now)`} aria-label="To year" maxLength={4} max={currentYear} />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          Add
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Done
        </Button>
      </div>
    </form>
  );
}
