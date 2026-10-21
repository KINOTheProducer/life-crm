"use client";

import { useActionState, useState } from "react";
import { updateCadence, type FormState } from "@/app/(app)/people/[id]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/lib/forms";
import { submitKeepingValues } from "@/lib/submit";

const options = [
  [7, "Every week"],
  [14, "Every two weeks"],
  [21, "Every three weeks"],
  [30, "Every month"],
  [60, "Every two months"],
  [90, "Every three months"],
  [180, "Every six months"],
  [365, "Once a year"],
] as const;

export function cadenceText(days: number | null) {
  if (!days) return "Off";
  return options.find(([d]) => d === days)?.[1] ?? `Every ${days} days`;
}

/** The keep-in-touch row in a person's details, editable in place. */
export function CadenceField({ contactId, days }: { contactId: string; days: number | null }) {
  const [editing, setEditing] = useState(false);
  const known = !days || options.some(([d]) => d === days);
  const [choice, setChoice] = useState(known ? String(days ?? 0) : "custom");
  const [state, action, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const next = await updateCadence(contactId, prev, form);
    if (next.ok) setEditing(false);
    return next;
  }, {});

  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">Catch up</p>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {days ? "Edit" : "Set"}
          </button>
        )}
      </div>
      {editing ? (
        <form onSubmit={submitKeepingValues(action)} className="grid gap-2">
          <select name="cadence" aria-label="How often to catch up" value={choice} onChange={(e) => setChoice(e.target.value)} className={selectClass}>
            <option value="0">No reminders</option>
            {options.map(([d, l]) => (
              <option key={d} value={d}>
                {l}
              </option>
            ))}
            <option value="custom">Custom…</option>
          </select>
          {choice === "custom" && (
            <label className="flex items-center gap-2 text-sm">
              Every
              <Input name="customDays" type="number" inputMode="numeric" min={1} max={3650} required defaultValue={known ? "" : String(days)} className="w-24" autoFocus />
              days
            </label>
          )}
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
        <p className={days ? undefined : "text-muted-foreground"}>{cadenceText(days)}</p>
      )}
    </div>
  );
}
