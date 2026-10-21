"use client";

import { memoryKindLabels, memoryKinds, type MemoryKind } from "@life-crm/core";
import { useActionState, useState } from "react";
import { saveMemory } from "@/app/(app)/memories/actions";
import { PeoplePicker, type PickerPerson } from "@/components/people-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass, textareaClass } from "@/lib/forms";
import { submitKeepingValues } from "@/lib/submit";

export interface MemoryFormValues {
  title: string;
  kind: MemoryKind;
  reason: string | null;
  startedOn: string;
  endedOn: string | null;
  location: string | null;
  story: string | null;
  people: string[];
}

export function MemoryForm({
  memoryId,
  values,
  people,
  today,
  onDone,
}: {
  memoryId: string | null;
  values?: MemoryFormValues;
  people: PickerPerson[];
  today: string;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof saveMemory>>, form: FormData) => {
    const next = await saveMemory(memoryId, prev, form);
    if (next.ok) onDone?.();
    return next;
  }, {});
  const [kind, setKind] = useState<MemoryKind>(values?.kind ?? "trip");

  return (
    <form onSubmit={submitKeepingValues(action)} className="grid gap-5">
      <label className="grid gap-2 text-sm font-medium">
        What was it?
        <Input name="title" required maxLength={120} defaultValue={values?.title} placeholder="Jamaica with Holly" autoFocus={!memoryId} />
      </label>

      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <label className="grid gap-2 text-sm font-medium">
          Kind
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as MemoryKind)} className={selectClass}>
            {memoryKinds.map((k) => (
              <option key={k} value={k}>
                {memoryKindLabels[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Why
          <Input
            name="reason"
            maxLength={200}
            defaultValue={values?.reason ?? ""}
            placeholder={kind === "trip" ? "Just a vacation, Holly's 30th, a friend's wedding…" : "What it was for"}
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="grid gap-2 text-sm font-medium">
          {kind === "trip" ? "First day" : "Date"}
          <Input name="startedOn" type="date" required defaultValue={values?.startedOn ?? today} />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Last day
          <Input name="endedOn" type="date" defaultValue={values?.endedOn ?? ""} />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Where
          <Input name="location" maxLength={200} defaultValue={values?.location ?? ""} placeholder="Negril, Jamaica" />
        </label>
      </div>

      <PeoplePicker people={people} initial={values?.people} legend="Who was there" empty="Add people first, then tag them here." />

      <label className="grid gap-2 text-sm font-medium">
        The story
        <textarea
          name="story"
          rows={5}
          maxLength={10_000}
          defaultValue={values?.story ?? ""}
          placeholder="What you did, what you'll want to remember in ten years"
          className={textareaClass}
        />
      </label>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : memoryId ? "Save" : "Save memory"}
        </Button>
        {onDone && (
          <Button type="button" size="lg" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
