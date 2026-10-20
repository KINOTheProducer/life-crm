"use client";

import { memoryKindLabels, memoryKinds, type MemoryKind } from "@life-crm/core";
import { Check, Search } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { saveMemory } from "@/app/(app)/memories/actions";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass, textareaClass } from "@/lib/forms";
import { cn } from "@/lib/utils";
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
  people: { id: string; name: string }[];
  today: string;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof saveMemory>>, form: FormData) => {
    const next = await saveMemory(memoryId, prev, form);
    if (next.ok) onDone?.();
    return next;
  }, {});
  const [kind, setKind] = useState<MemoryKind>(values?.kind ?? "trip");
  const [selected, setSelected] = useState<Set<string>>(new Set(values?.people ?? []));
  const [filter, setFilter] = useState("");

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const matches = q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
    // Picked people first so they stay visible while filtering a long list.
    return [...matches].sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)));
  }, [people, filter, selected]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">
          Who was there {selected.size > 0 && <span className="font-normal text-muted-foreground">· {selected.size}</span>}
        </legend>
        {[...selected].map((id) => (
          <input key={id} type="hidden" name="people" value={id} />
        ))}
        {people.length > 8 && (
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find someone" aria-label="Find someone" className="pl-10" />
          </div>
        )}
        {people.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add people first, then tag them here.</p>
        ) : (
          <ul className="grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2">
            {shown.map((p) => {
              const on = selected.has(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(p.id)}
                    className={cn("flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left text-sm hover:bg-muted", on && "bg-secondary")}
                  >
                    <Avatar id={p.id} name={p.name} size={30} />
                    <span className="flex-1 truncate">{p.name}</span>
                    {on && <Check className="size-4" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

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
