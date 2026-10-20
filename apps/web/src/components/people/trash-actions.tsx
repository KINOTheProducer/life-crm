"use client";

import { useState, useTransition } from "react";
import { deleteForever, restorePerson, trashPerson } from "@/app/(app)/people/trash/actions";
import { Button } from "@/components/ui/button";

export function TrashActions({ contactId, name }: { contactId: string; name: string }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => start(() => restorePerson(contactId))}>
        Restore
      </Button>
      {confirm ? (
        <Button size="sm" variant="destructive" disabled={pending} onClick={() => start(() => deleteForever(contactId))} aria-label={`Delete ${name} for good`}>
          Delete for good
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
          Delete
        </Button>
      )}
    </div>
  );
}

/** The profile's delete button. Moves to the trash; nothing is lost for 30 days. */
export function TrashPersonButton({ contactId, firstName }: { contactId: string; firstName: string }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  if (!confirm)
    return (
      <button type="button" onClick={() => setConfirm(true)} className="justify-self-start text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        Delete {firstName}
      </button>
    );
  return (
    <div className="grid gap-2">
      <p className="text-[13px] text-muted-foreground">{firstName} goes to the trash with everything about them, and can be restored for 30 days.</p>
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" disabled={pending} onClick={() => start(() => trashPerson(contactId))}>
          Move to trash
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
