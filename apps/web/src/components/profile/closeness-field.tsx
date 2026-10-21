"use client";

import { closenessLabels, closenessTiers, type ClosenessTier } from "@life-crm/core";
import { useActionState, useState } from "react";
import { updateCloseness, type FormState } from "@/app/(app)/people/[id]/actions";
import { Button } from "@/components/ui/button";
import { selectClass } from "@/lib/forms";
import { submitKeepingValues } from "@/lib/submit";

export function ClosenessSelect({ value }: { value: ClosenessTier }) {
  return (
    <select name="closeness" aria-label="How close you are" defaultValue={value} className={selectClass}>
      {closenessTiers.map((t) => (
        <option key={t} value={t}>
          {closenessLabels[t]}
        </option>
      ))}
    </select>
  );
}

/** The closeness row in a person's details, editable in place. */
export function ClosenessField({ contactId, closeness }: { contactId: string; closeness: ClosenessTier }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const next = await updateCloseness(contactId, prev, form);
    if (next.ok) setEditing(false);
    return next;
  }, {});

  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">Closeness</p>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <form onSubmit={submitKeepingValues(action)} className="grid gap-2">
          <ClosenessSelect value={closeness} />
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <p>{closenessLabels[closeness]}</p>
      )}
    </div>
  );
}
