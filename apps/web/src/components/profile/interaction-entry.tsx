"use client";

import { interactionTypeLabels, interactionTypes, type InteractionType } from "@life-crm/core";
import { Pencil } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { editInteraction, removeInteraction, type FormState } from "@/app/(app)/people/[id]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass, textareaClass } from "@/lib/forms";

/** A catch-up on the timeline, editable in place. */
export function InteractionEntry({
  interactionId,
  title,
  day,
  type,
  date,
  location,
  summary,
  today,
}: {
  interactionId: string;
  title: string;
  /** Display date, e.g. "Oct 21". */
  day: string;
  type: InteractionType;
  /** YYYY-MM-DD. */
  date: string;
  location: string | null;
  summary: string | null;
  today: string;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removing, startRemove] = useTransition();
  const [state, action, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const next = await editInteraction(interactionId, prev, form);
    if (next.ok) setEditing(false);
    return next;
  }, {});

  if (!editing) {
    return (
      <div className="group grid gap-1.5 rounded-2xl bg-card p-4">
        <div className="flex items-baseline justify-between gap-4">
          <p className="font-medium">{title}</p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit catch-up"
              className="grid size-6 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-secondary hover:text-foreground focus-visible:opacity-100 pointer-coarse:opacity-100"
            >
              <Pencil className="size-3.5" />
            </button>
            <p className="font-mono text-xs text-muted-foreground">{day}</p>
          </div>
        </div>
        {location && <p className="text-[13px] text-muted-foreground">{location}</p>}
        {summary && <p className="whitespace-pre-line text-[15px] leading-relaxed">{summary}</p>}
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-3 rounded-2xl bg-card p-4">
      <div className="grid grid-cols-[1fr_1fr_2fr] gap-2">
        <select name="type" aria-label="Type" defaultValue={type} className={selectClass}>
          {interactionTypes.map((t) => (
            <option key={t} value={t}>
              {interactionTypeLabels[t]}
            </option>
          ))}
        </select>
        <Input name="date" type="date" aria-label="Date" defaultValue={date} max={today} required />
        <Input name="location" placeholder="Where (optional)" defaultValue={location ?? ""} maxLength={200} />
      </div>
      <textarea name="summary" rows={3} required maxLength={2000} defaultValue={summary ?? ""} className={textareaClass} />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending || removing}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => (setEditing(false), setConfirming(false))}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto text-destructive"
          disabled={pending || removing}
          onClick={() => (confirming ? startRemove(() => removeInteraction(interactionId)) : setConfirming(true))}
        >
          {removing ? "Deleting…" : confirming ? "Delete for everyone who was there?" : "Delete"}
        </Button>
      </div>
    </form>
  );
}
