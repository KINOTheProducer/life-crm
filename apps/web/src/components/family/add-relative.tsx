"use client";

import { childKinds, familyStatuses, type ChildKind, type FamilyStatus } from "@life-crm/core";
import { useActionState, useEffect, useMemo, useState } from "react";
import { addRelative, type AddRole, type RelativeState } from "@/app/(app)/family/actions";
import { PartialDateFields } from "@/components/partial-date-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { nameInputProps, selectClass } from "@/lib/forms";
import { submitKeepingValues } from "@/lib/submit";
import { cn } from "@/lib/utils";

const kindLabels: Record<ChildKind, string> = {
  biological: "Birth",
  adoptive: "Adoptive",
  foster: "Foster",
  step: "Step",
  guardian: "Guardian",
};

const statusLabels: Record<FamilyStatus, string> = {
  married: "Married",
  partners: "Together",
  engaged: "Engaged",
  separated: "Separated",
  divorced: "Divorced",
  widowed: "Widowed",
  unknown: "Not sure",
};

const roleWords: Record<AddRole, string> = { parent: "parent", partner: "partner", child: "child", sibling: "sibling", friend: "friend" };

export function AddRelativeForm({
  anchor,
  role,
  people,
  anchorPartners,
  hasSoloChildren,
  onDone,
}: {
  anchor: { id: string; firstName: string; isSelf: boolean };
  role: AddRole;
  people: { id: string; name: string }[];
  anchorPartners: { id: string; name: string }[];
  hasSoloChildren: boolean;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<RelativeState, FormData>(addRelative.bind(null, anchor.id, role), {});
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [filter, setFilter] = useState("");
  const [deceased, setDeceased] = useState(false);
  const whose = anchor.isSelf ? "your" : `${anchor.firstName}'s`;

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return people.filter((p) => p.id !== anchor.id && (!q || p.name.toLowerCase().includes(q))).slice(0, 50);
  }, [people, filter, anchor.id]);

  return (
    <form onSubmit={submitKeepingValues(action)} className="grid gap-4">
      <p className="font-medium">Add {whose} {roleWords[role]}</p>
      <input type="hidden" name="mode" value={mode} />
      <div role="tablist" className="flex gap-1">
        {(
          [
            ["new", "Someone new"],
            ["existing", "From your people"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={cn("rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground", mode === key && "bg-secondary text-foreground")}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "new" ? (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Input name="firstName" placeholder="First name" aria-label="First name" required maxLength={100} autoFocus {...nameInputProps} />
            <Input name="lastName" placeholder="Last name" aria-label="Last name" maxLength={100} {...nameInputProps} />
          </div>
          <select name="pronouns" aria-label="Pronouns" defaultValue="" className={selectClass}>
            <option value="">{role === "friend" ? "Pronouns" : "Pronouns (for words like aunt or uncle)"}</option>
            <option value="she/her">she/her</option>
            <option value="he/him">he/him</option>
            <option value="they/them">they/them</option>
          </select>
          <div className="grid gap-1.5">
            <p className="text-[13px] text-muted-foreground">Birthday</p>
            <PartialDateFields prefix="birthday" label="Birthday" yearPlaceholder="Year" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="deceased" checked={deceased} onChange={(e) => setDeceased(e.target.checked)} className="size-4 accent-foreground" />
            Has passed away
          </label>
          {deceased && <Input name="deathYear" type="number" min={1500} max={2200} placeholder="Year they died (optional)" aria-label="Year they died" />}
        </div>
      ) : (
        <div className="grid gap-2">
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find someone" aria-label="Find someone" />
          <select name="existingId" size={6} required aria-label="Person" className="w-full rounded-xl border border-input bg-card p-1.5 text-sm">
            {shown.map((p) => (
              <option key={p.id} value={p.id} className="rounded-lg px-2 py-1.5">
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {(role === "parent" || role === "child") && (
        <label className="grid gap-1.5 text-[13px] text-muted-foreground">
          {role === "parent" ? "Parent by" : "Child by"}
          <select name="kind" defaultValue="biological" className={selectClass}>
            {childKinds.map((k) => (
              <option key={k} value={k}>
                {kindLabels[k]}
              </option>
            ))}
          </select>
        </label>
      )}

      {role === "child" && anchorPartners.length > 0 && (
        <label className="grid gap-1.5 text-[13px] text-muted-foreground">
          Other parent
          <select name="otherParentId" defaultValue={anchorPartners[0]!.id} className={selectClass}>
            {anchorPartners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="">Someone else, or not known</option>
          </select>
        </label>
      )}

      {role === "partner" && (
        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <select name="status" defaultValue="married" aria-label="Status" className={selectClass}>
              {familyStatuses.map((s) => (
                <option key={s} value={s}>
                  {statusLabels[s]}
                </option>
              ))}
            </select>
            <Input name="startYear" type="number" min={1800} max={2200} placeholder="Since (year)" aria-label="Since year" />
          </div>
          {hasSoloChildren && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="coParent" defaultChecked className="size-4 accent-foreground" />
              Also the other parent of {whose} children
            </label>
          )}
        </div>
      )}

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
