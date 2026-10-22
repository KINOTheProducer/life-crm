"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { joinHouseholdAction, leaveHouseholdAction, startHouseholdWith } from "@/app/(app)/households/actions";
import { selectClass } from "@/lib/forms";
import { cn } from "@/lib/utils";

/** Who someone lives with, or a picker to put them in a household. */
export function HouseholdField({
  contactId,
  household,
  all,
}: {
  contactId: string;
  household: { id: string; label: string; others: string[] } | null;
  all: { id: string; label: string }[];
}) {
  const [busy, start] = useTransition();
  return (
    <div className="grid gap-2">
      <p className="text-[13px] text-muted-foreground">Household</p>
      {household ? (
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1">
            <Link href={`/households/${household.id}`} className="hover:underline">
              {household.label}
            </Link>
            {household.others.length > 0 && <span className="block text-[13px] text-muted-foreground">Lives with {household.others.join(", ")}</span>}
          </p>
          <button
            type="button"
            aria-label="Take out of this household"
            disabled={busy}
            onClick={() => start(() => leaveHouseholdAction(contactId, household.id))}
            className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <select
          aria-label="Add to a household"
          value=""
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "new") start(() => startHouseholdWith(contactId));
            else if (v) start(() => joinHouseholdAction(contactId, v));
          }}
          className={cn(selectClass, "h-9 text-[13px]")}
        >
          <option value="">Add to a household…</option>
          {all.map((h) => (
            <option key={h.id} value={h.id}>
              {h.label}
            </option>
          ))}
          <option value="new">New household…</option>
        </select>
      )}
    </div>
  );
}
