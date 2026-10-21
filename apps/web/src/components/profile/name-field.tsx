"use client";

import { Pencil } from "lucide-react";
import { useActionState, useState } from "react";
import { updateName, type FormState } from "@/app/(app)/people/[id]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nameInputProps } from "@/lib/forms";
import { submitKeepingValues } from "@/lib/submit";

interface Name {
  firstName: string;
  lastName: string | null;
  nickname: string | null;
  pronouns: string | null;
}

/** The name heading on a person's page, editable in place. */
export function NameField({ contactId, name, children }: { contactId: string; name: Name; children: React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const next = await updateName(contactId, prev, form);
    if (next.ok) setEditing(false);
    return next;
  }, {});

  if (!editing) {
    return (
      <div className="group flex items-start gap-2">
        {children}
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit name"
          title="Edit name"
          className="mt-3 rounded-md p-1 text-muted-foreground opacity-60 hover:text-foreground hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Pencil className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submitKeepingValues(action)} className="grid max-w-xl gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" name="firstName" required maxLength={100} autoFocus defaultValue={name.firstName} {...nameInputProps} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" name="lastName" maxLength={100} defaultValue={name.lastName ?? ""} {...nameInputProps} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nickname">Nickname</Label>
          <Input id="nickname" name="nickname" maxLength={100} defaultValue={name.nickname ?? ""} {...nameInputProps} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pronouns">Pronouns</Label>
          <Input id="pronouns" name="pronouns" placeholder="e.g. she/her" maxLength={50} defaultValue={name.pronouns ?? ""} />
        </div>
      </div>
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
  );
}
