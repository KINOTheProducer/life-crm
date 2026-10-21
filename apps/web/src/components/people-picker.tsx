"use client";

import { Check, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { avatarSrc } from "@/lib/immich-urls";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PickerPerson {
  id: string;
  name: string;
  nickname?: string | null;
  avatarRef?: string | null;
}

/**
 * Tap people to pick them. Submits one hidden `name` input per picked person, so it drops into
 * any form. Gets a search box once the list is long.
 */
export function PeoplePicker({
  people,
  initial = [],
  name = "people",
  legend,
  empty = "Add people first, then pick them here.",
}: {
  people: PickerPerson[];
  initial?: string[];
  name?: string;
  legend: string;
  empty?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  const [filter, setFilter] = useState("");

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const matches = q ? people.filter((p) => p.name.toLowerCase().includes(q) || p.nickname?.toLowerCase().includes(q)) : people;
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
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">
        {legend} {selected.size > 0 && <span className="font-normal text-muted-foreground">· {selected.size}</span>}
      </legend>
      {[...selected].map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      {people.length > 8 && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find someone" aria-label="Find someone" className="pl-10" />
        </div>
      )}
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
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
                  <Avatar id={p.id} name={p.name} src={avatarSrc(p.avatarRef)} size={30} />
                  <span className="flex-1 truncate">
                    {p.name}
                    {p.nickname && <span className="text-muted-foreground"> “{p.nickname}”</span>}
                  </span>
                  {on && <Check className="size-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
