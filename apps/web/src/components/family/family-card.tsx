"use client";

import { Network, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { removeFromFamily, setDeceased } from "@/app/(app)/family/actions";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Relation } from "@/lib/data/family";
import { avatarSrc } from "@/lib/immich-urls";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function FamilyCard({
  contactId,
  firstName,
  relations,
  isSelf,
  isDeceased,
  deathYear,
}: {
  contactId: string;
  firstName: string;
  relations: Relation[];
  isSelf: boolean;
  isDeceased: boolean;
  deathYear: number | null;
}) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [year, setYear] = useState(deathYear ? String(deathYear) : "");

  return (
    <div className="grid gap-4">
      {relations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No family added for {firstName} yet.</p>
      ) : (
        <ul className="grid gap-1">
          {relations.map((r) => (
            <li key={r.id} className="group flex items-center gap-3 py-1">
              <Avatar id={r.id} name={r.name} src={avatarSrc(r.avatarRef)} size={30} />
              <Link href={`/people/${r.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                {r.name}
              </Link>
              <span className="text-[13px] text-muted-foreground">{capitalize(r.term)}</span>
              {r.familyId && (
                <button
                  type="button"
                  aria-label={`Remove ${r.name} as ${firstName}'s ${r.term}`}
                  title="Remove from the tree"
                  disabled={pending}
                  onClick={() => start(() => removeFromFamily(r.familyId!, r.id))}
                  className="rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Link
        href={`/family?focus=${contactId}`}
        className="inline-flex items-center gap-1.5 justify-self-start rounded-full border border-border px-3 py-1.5 text-[13px] hover:bg-muted"
      >
        <Network className="size-3.5" />
        {relations.length ? "See in the tree" : "Add family in the tree"}
      </Link>
      {!isSelf &&
        (editing ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Input value={year} onChange={(e) => setYear(e.target.value)} type="number" min={1500} max={2200} placeholder="Year (optional)" aria-label="Year they died" className="w-36" />
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await setDeceased(contactId, true, year ? Number(year) : null);
                  setEditing(false);
                })
              }
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        ) : isDeceased ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(() => setDeceased(contactId, false, null))}
            className="justify-self-start text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Marked as passed away{deathYear ? ` in ${deathYear}` : ""}. Undo
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="justify-self-start text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {firstName} has passed away
          </button>
        ))}
    </div>
  );
}
