"use client";

import type { ClosenessTier } from "@life-crm/core";
import { useActionState } from "react";
import { updateBasics, type FormState } from "@/app/(app)/people/[id]/actions";
import { CadenceInputs } from "@/components/profile/cadence-field";
import { ClosenessSelect } from "@/components/profile/closeness-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { nameInputProps } from "@/lib/forms";
import { submitKeepingValues } from "@/lib/submit";

export interface EditablePerson {
  id: string;
  firstName: string;
  lastName: string | null;
  nickname: string | null;
  pronouns: string | null;
  closeness: ClosenessTier;
  keepInTouchDays: number | null;
  isSelf: boolean;
}

/** Name, pronouns, closeness and cadence, edited from the tree. */
export function EditPersonForm({ person, onDone }: { person: EditablePerson; onDone: () => void }) {
  const [state, action, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const next = await updateBasics(person.id, prev, form);
    if (next.ok) onDone();
    return next;
  }, {});

  return (
    <form onSubmit={submitKeepingValues(action)} className="grid gap-3">
      <p className="font-medium">Edit {person.isSelf ? "yourself" : person.firstName}</p>
      <div className="grid grid-cols-2 gap-2">
        <Input name="firstName" placeholder="First name" aria-label="First name" required maxLength={100} autoFocus defaultValue={person.firstName} {...nameInputProps} />
        <Input name="lastName" placeholder="Last name" aria-label="Last name" maxLength={100} defaultValue={person.lastName ?? ""} {...nameInputProps} />
        <Input name="nickname" placeholder="Nickname" aria-label="Nickname" maxLength={100} defaultValue={person.nickname ?? ""} {...nameInputProps} />
        <Input name="pronouns" placeholder="Pronouns" aria-label="Pronouns" maxLength={50} defaultValue={person.pronouns ?? ""} />
      </div>
      {person.isSelf ? (
        <>
          <input type="hidden" name="closeness" value={person.closeness} />
          <input type="hidden" name="cadence" value={person.keepInTouchDays ?? 0} />
        </>
      ) : (
        <>
          <label className="grid gap-1.5 text-[13px] text-muted-foreground">
            Closeness
            <ClosenessSelect value={person.closeness} />
          </label>
          <div className="grid gap-1.5 text-[13px] text-muted-foreground">
            Catch up
            <CadenceInputs days={person.keepInTouchDays} />
          </div>
        </>
      )}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
