"use client";

import { useActionState, useState } from "react";
import { updateSpan, type FormState } from "@/app/(app)/people/[id]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { monthNames, selectClass } from "@/lib/forms";
import { submitKeepingValues } from "@/lib/submit";

/** When you met and, if it happened, when you lost touch. Feeds the life timeline. */
export function SpanField({
  contactId,
  metYear,
  metMonth,
  lostTouchYear,
}: {
  contactId: string;
  metYear: number | null;
  metMonth: number | null;
  lostTouchYear: number | null;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const next = await updateSpan(contactId, prev, form);
    if (next.ok) setEditing(false);
    return next;
  }, {});
  const met = metYear ? `${metMonth ? `${monthNames[metMonth - 1]} ` : ""}${metYear}` : null;

  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">Met</p>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {met ? "Edit" : "Add"}
          </button>
        )}
      </div>
      {editing ? (
        <form onSubmit={submitKeepingValues(action)} className="grid gap-2">
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <select name="metMonth" aria-label="Month you met" defaultValue={metMonth ?? ""} className={selectClass}>
              <option value="">Month</option>
              {monthNames.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <Input name="metYear" inputMode="numeric" placeholder="Year" aria-label="Year you met" defaultValue={metYear ?? ""} maxLength={4} />
          </div>
          <Input name="lostTouchYear" inputMode="numeric" placeholder="Year you lost touch (if you did)" aria-label="Year you lost touch" defaultValue={lostTouchYear ?? ""} maxLength={4} />
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
        <p className={met ? undefined : "text-muted-foreground"}>
          {met ?? "Unknown"}
          {lostTouchYear && <span className="text-muted-foreground"> · lost touch {lostTouchYear}</span>}
        </p>
      )}
    </div>
  );
}
