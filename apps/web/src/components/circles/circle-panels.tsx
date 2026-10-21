"use client";

import { interactionTypeLabels, interactionTypes, type CircleTone } from "@life-crm/core";
import { Pencil, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { deleteCircle, logGroupCatchup, saveMembers, updateCircle } from "@/app/(app)/circles/actions";
import type { FormState } from "@/app/(app)/people/[id]/actions";
import { Avatar } from "@/components/avatar";
import { PeoplePicker, type PickerPerson } from "@/components/people-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass, textareaClass } from "@/lib/forms";
import { submitKeepingValues } from "@/lib/submit";
import { CircleForm } from "./circle-form";

/** The circle's notes, with an edit toggle and delete. */
export function CircleDetails({ circle }: { circle: { id: string; name: string; tone: CircleTone; notes: string | null } }) {
  const [editing, setEditing] = useState(false);
  const [deleting, startDelete] = useTransition();
  if (editing) {
    return (
      <CircleForm
        action={updateCircle.bind(null, circle.id)}
        values={circle}
        submitLabel="Save"
        onCancel={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    );
  }
  return (
    <div className="grid gap-4">
      {circle.notes ? <p className="whitespace-pre-line text-[15px] leading-relaxed">{circle.notes}</p> : <p className="text-sm text-muted-foreground">No notes yet.</p>}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil />
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={deleting}
          onClick={() => {
            if (confirm(`Delete ${circle.name}? The people in it stay.`)) startDelete(() => deleteCircle(circle.id));
          }}
        >
          <Trash2 />
          Delete circle
        </Button>
      </div>
    </div>
  );
}

/** Pick who's in the circle. */
export function MembersEditor({
  circleId,
  people,
  members,
  onDone,
}: {
  circleId: string;
  people: PickerPerson[];
  members: string[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const next = await saveMembers(circleId, prev, form);
    if (next.ok) onDone();
    return next;
  }, {});
  return (
    <form onSubmit={submitKeepingValues(action)} className="grid gap-4">
      <PeoplePicker people={people} initial={members} legend="Who's in it" />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save members"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Members list with an "edit members" toggle. */
export function CircleMembers({
  circleId,
  people,
  members,
  avatars,
}: {
  circleId: string;
  people: PickerPerson[];
  members: { id: string; name: string; detail: string; overdue: boolean }[];
  avatars: Record<string, string | null>;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) return <MembersEditor circleId={circleId} people={people} members={members.map((m) => m.id)} onDone={() => setEditing(false)} />;
  return (
    <div className="grid gap-3">
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one in this circle yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <li key={m.id}>
              <Link href={`/people/${m.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                <Avatar id={m.id} name={m.name} src={avatars[m.id]} size={34} />
                <span className="flex-1 font-medium">{m.name}</span>
                <span className={m.overdue ? "text-[13px] text-accent-ink" : "text-[13px] text-muted-foreground"}>{m.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setEditing(true)}>
        <Users />
        {members.length ? "Edit members" : "Add people"}
      </Button>
    </div>
  );
}

/** Log one catch-up with whoever from the circle was there. Everyone's ticked to start. */
export function GroupCatchup({ circleId, members, today }: { circleId: string; members: { id: string; name: string }[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const next = await logGroupCatchup(circleId, prev, form);
    if (next.ok) setOpen(false);
    return next;
  }, {});

  if (!open) {
    return (
      <div className="grid gap-2">
        {state.message && <p className="text-sm text-muted-foreground">{state.message}</p>}
        <Button className="justify-self-start" disabled={members.length === 0} onClick={() => setOpen(true)}>
          Log a group catch-up
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submitKeepingValues(action)} className="grid gap-3">
      <div className="grid grid-cols-[1fr_1fr_2fr] gap-2">
        <select name="type" aria-label="Type" defaultValue="in_person" className={selectClass}>
          {interactionTypes.map((t) => (
            <option key={t} value={t}>
              {interactionTypeLabels[t]}
            </option>
          ))}
        </select>
        <Input name="date" type="date" aria-label="Date" defaultValue={today} max={today} required />
        <Input name="location" placeholder="Where (optional)" maxLength={200} />
      </div>
      <textarea name="summary" rows={2} required maxLength={2000} placeholder="What did you get up to?" className={textareaClass} />
      <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
        <legend className="mb-2 text-sm font-medium">Who was there</legend>
        {members.map((m) => (
          <label key={m.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="people" value={m.id} defaultChecked className="size-4 accent-foreground" />
            {m.name}
          </label>
        ))}
      </fieldset>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Log catch-up"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
