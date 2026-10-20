"use client";

import { interactionTypeLabels, interactionTypes } from "@life-crm/core";
import { useActionState, useEffect, useRef, useState } from "react";
import { addNote, logInteraction, type FormState } from "@/app/(app)/people/[id]/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const fieldClass =
  "w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function useResetOnSuccess(state: FormState) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state.ok]);
  return form;
}

/** Add a note or log a catch-up from the top of a person's timeline. */
export function Composer({ contactId, firstName, today }: { contactId: string; firstName: string; today: string }) {
  const [tab, setTab] = useState<"note" | "interaction">("note");
  const [noteState, noteAction, notePending] = useActionState(addNote.bind(null, contactId), {});
  const [ixState, ixAction, ixPending] = useActionState(logInteraction.bind(null, contactId), {});
  const noteForm = useResetOnSuccess(noteState);
  const ixForm = useResetOnSuccess(ixState);

  return (
    <Card id="compose">
      <CardContent className="grid gap-4">
        <div role="tablist" className="flex gap-1">
          {(
            [
              ["note", "Note"],
              ["interaction", "Log a catch-up"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
                tab === key && "bg-secondary text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "note" ? (
          <form ref={noteForm} action={noteAction} className="grid gap-3">
            <textarea
              name="body"
              rows={3}
              required
              placeholder={`Something to remember about ${firstName}…`}
              className={fieldClass}
            />
            {noteState.error && <p className="text-sm text-destructive">{noteState.error}</p>}
            <Button type="submit" className="justify-self-start" disabled={notePending}>
              {notePending ? "Saving…" : "Add note"}
            </Button>
          </form>
        ) : (
          <form ref={ixForm} action={ixAction} className="grid gap-3">
            <div className="grid grid-cols-[1fr_1fr_2fr] gap-2">
              <select name="type" aria-label="Type" defaultValue="in_person" className="h-10 rounded-xl border border-input bg-card px-3 text-sm">
                {interactionTypes.map((t) => (
                  <option key={t} value={t}>
                    {interactionTypeLabels[t]}
                  </option>
                ))}
              </select>
              <Input name="date" type="date" aria-label="Date" defaultValue={today} max={today} required />
              <Input name="location" placeholder="Where (optional)" />
            </div>
            <textarea name="summary" rows={2} required placeholder="What did you get up to?" className={fieldClass} />
            {ixState.error && <p className="text-sm text-destructive">{ixState.error}</p>}
            <Button type="submit" className="justify-self-start" disabled={ixPending}>
              {ixPending ? "Saving…" : "Log catch-up"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
