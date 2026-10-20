"use client";

import type { PartialDate } from "@life-crm/core";
import { useActionState, useState } from "react";
import { updateBirthday, type FormState } from "@/app/(app)/people/[id]/actions";
import { PartialDateFields } from "@/components/partial-date-fields";
import { Button } from "@/components/ui/button";
import { submitKeepingValues } from "@/lib/submit";

/** The birthday row in a person's details, editable in place. */
export function BirthdayField({ contactId, birthday, children }: { contactId: string; birthday: PartialDate | null; children: React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const next = await updateBirthday(contactId, prev, form);
    if (next.ok) setEditing(false);
    return next;
  }, {});

  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">Birthday</p>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {birthday ? "Edit" : "Add"}
          </button>
        )}
      </div>
      {editing ? (
        <form onSubmit={submitKeepingValues(action)} className="grid gap-2">
          <PartialDateFields prefix="birthday" label="Birthday" defaultValue={birthday} />
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            {birthday && (
              <Button type="submit" size="sm" variant="ghost" name="remove" value="1" formNoValidate className="ml-auto text-muted-foreground" disabled={pending}>
                Remove
              </Button>
            )}
          </div>
        </form>
      ) : (
        children
      )}
    </div>
  );
}
