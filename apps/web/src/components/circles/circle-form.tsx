"use client";

import { circleTones, type CircleTone } from "@life-crm/core";
import { useActionState } from "react";
import type { FormState } from "@/app/(app)/people/[id]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { textareaClass } from "@/lib/forms";
import { submitKeepingValues } from "@/lib/submit";
import { cn } from "@/lib/utils";
import { toneClass } from "./tones";

/** Name, colour and shared notes for a circle. Used to create one and to edit it. */
export function CircleForm({
  action: serverAction,
  values,
  submitLabel,
  onCancel,
  onSaved,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  values?: { name: string; tone: CircleTone; notes: string | null };
  submitLabel: string;
  onCancel?: () => void;
  onSaved?: () => void;
}) {
  const [state, action, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const next = await serverAction(prev, form);
    if (next.ok) onSaved?.();
    return next;
  }, {});

  return (
    <form onSubmit={submitKeepingValues(action)} className="grid gap-3">
      <Input name="name" required maxLength={60} defaultValue={values?.name} placeholder="Uni crew, Climbing, Mom's side" aria-label="Circle name" autoFocus={!values} />
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Colour</legend>
        {circleTones.map((t) => (
          <label key={t} className="cursor-pointer">
            <input type="radio" name="tone" value={t} defaultChecked={(values?.tone ?? "sage") === t} className="peer sr-only" />
            <span
              title={t}
              className={cn("block size-7 rounded-full ring-offset-2 ring-offset-card peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring", toneClass[t])}
            />
            <span className="sr-only">{t}</span>
          </label>
        ))}
      </fieldset>
      <textarea
        name="notes"
        rows={3}
        maxLength={2000}
        defaultValue={values?.notes ?? ""}
        placeholder="Shared context: where the group chat is, traditions, the cottage trip every July"
        aria-label="Notes"
        className={textareaClass}
      />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
