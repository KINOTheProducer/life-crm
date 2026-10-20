"use client";

import { partneredStatuses, relationshipStatuses, relationshipStatusLabels, type RelationshipStatus, type RelationshipStyle } from "@life-crm/core";
import Link from "next/link";
import { useActionState, useState } from "react";
import { saveRelationshipSettings } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { selectClass } from "@/lib/forms";

export function RelationshipSettingsForm({ status, style }: { status: RelationshipStatus | null; style: RelationshipStyle }) {
  const [state, action, pending] = useActionState(saveRelationshipSettings, {});
  const [picked, setPicked] = useState<string>(status ?? "");
  const partnered = partneredStatuses.includes(picked as RelationshipStatus);
  return (
    <form action={action} className="grid gap-5">
      <label className="grid max-w-xs gap-2 text-sm font-medium">
        Status
        <select name="status" value={picked} onChange={(e) => setPicked(e.target.value)} className={selectClass}>
          <option value="">Not set</option>
          {relationshipStatuses.map((s) => (
            <option key={s} value={s}>
              {relationshipStatusLabels[s]}
            </option>
          ))}
        </select>
      </label>
      {partnered && (
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="polyamorous" defaultChecked={style === "polyamorous"} className="mt-0.5 size-4 accent-foreground" />
          <span>
            I have more than one partner
            <span className="block text-[13px] text-muted-foreground">Turning this off keeps everyone you&apos;ve added. You just can&apos;t add another partner until there&apos;s only one.</span>
          </span>
        </label>
      )}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state.ok && <span className="text-sm text-muted-foreground">Saved</span>}
        <Link href="/onboarding?step=you" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Run setup again
        </Link>
      </div>
    </form>
  );
}
