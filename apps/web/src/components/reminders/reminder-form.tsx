"use client";

import { useActionState, useEffect, useRef } from "react";
import { createReminder } from "@/app/(app)/reminders/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const selectClass = "h-10 rounded-xl border border-input bg-card px-3 text-sm";

/** New reminder. Pass `contactId` to tie it to a person, or `people` to let the user pick. */
export function ReminderForm({
  today,
  contactId,
  people,
  placeholder = "Ask how the interview went",
}: {
  today: string;
  contactId?: string;
  people?: { id: string; name: string }[];
  placeholder?: string;
}) {
  const [state, action, pending] = useActionState(createReminder, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state.ok]);

  return (
    <form ref={form} action={action} className="grid gap-2">
      <Input name="title" placeholder={placeholder} required maxLength={200} />
      <div className="grid grid-cols-2 gap-2">
        <Input name="dueOn" type="date" aria-label="Date" min={today} defaultValue={today} required />
        <select name="repeat" aria-label="Repeat" defaultValue="none" className={selectClass}>
          <option value="none">Once</option>
          <option value="weekly">Every week</option>
          <option value="monthly">Every month</option>
          <option value="yearly">Every year</option>
        </select>
      </div>
      {contactId ? (
        <input type="hidden" name="contactId" value={contactId} />
      ) : (
        people && (
          <select name="contactId" aria-label="Person" defaultValue="" className={selectClass}>
            <option value="">Not about anyone in particular</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                About {p.name}
              </option>
            ))}
          </select>
        )
      )}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="sm" variant="outline" className="justify-self-start" disabled={pending}>
        {pending ? "Saving…" : "Remind me"}
      </Button>
    </form>
  );
}
