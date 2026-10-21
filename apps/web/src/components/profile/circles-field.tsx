"use client";

import type { CircleTone } from "@life-crm/core";
import { X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { createCircleWith, joinCircle, leaveCircle } from "@/app/(app)/circles/actions";
import { CircleForm } from "@/components/circles/circle-form";
import { toneClass } from "@/components/circles/tones";
import { selectClass } from "@/lib/forms";
import { cn } from "@/lib/utils";

interface Circle {
  id: string;
  name: string;
  tone: CircleTone;
}

/** The circles someone's in, with a picker to add them to another or start a new one. */
export function CirclesField({ contactId, circles, all }: { contactId: string; circles: Circle[]; all: Circle[] }) {
  const [creating, setCreating] = useState(false);
  const [busy, start] = useTransition();
  const joined = new Set(circles.map((c) => c.id));
  const others = all.filter((c) => !joined.has(c.id));

  return (
    <div className="grid gap-2">
      <p className="text-[13px] text-muted-foreground">Circles</p>
      {circles.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {circles.map((c) => (
            <li key={c.id} className="group flex items-center gap-1.5 rounded-full bg-secondary py-1 pr-1.5 pl-2.5 text-[13px]">
              <span className={cn("size-2.5 rounded-full ring-1 ring-foreground/15", toneClass[c.tone])} />
              <Link href={`/circles/${c.id}`} className="hover:underline">
                {c.name}
              </Link>
              <button
                type="button"
                aria-label={`Take out of ${c.name}`}
                disabled={busy}
                onClick={() => start(() => leaveCircle(contactId, c.id))}
                className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {creating ? (
        <CircleForm action={createCircleWith.bind(null, contactId)} submitLabel="Create and add" onCancel={() => setCreating(false)} onSaved={() => setCreating(false)} />
      ) : (
        <select
          aria-label="Add to a circle"
          value=""
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "new") setCreating(true);
            else if (v) start(() => joinCircle(contactId, v));
          }}
          className={cn(selectClass, "h-9 text-[13px]")}
        >
          <option value="">Add to a circle…</option>
          {others.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="new">New circle…</option>
        </select>
      )}
    </div>
  );
}
