"use client";

import { useState, useTransition } from "react";
import { placeFromLabels } from "@/app/(app)/family/actions";
import { Button } from "@/components/ui/button";

/** "Linda (Mom) and Jess (Sister) aren't in your tree yet." One click puts them there. */
export function PlaceFromLabels({ people }: { people: { id: string; name: string; label: string }[] }) {
  const [pending, start] = useTransition();
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const list = people.slice(0, 4).map((p) => `${p.name} (${p.label})`);
  const more = people.length - list.length;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-butter px-6 py-4">
      <p className="text-[15px]">
        {list.join(", ")}
        {more > 0 && ` and ${more} more`} {people.length === 1 ? "isn't" : "aren't"} in your tree yet.
      </p>
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => start(async () => void (await placeFromLabels(people.map((p) => p.id))))}>
          {pending ? "Adding…" : "Add them"}
        </Button>
        <Button variant="ghost" onClick={() => setHidden(true)}>
          Not now
        </Button>
      </div>
    </div>
  );
}
