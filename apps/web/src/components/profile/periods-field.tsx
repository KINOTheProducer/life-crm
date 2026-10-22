"use client";

import { periodLabel, periodsProblem, type Period } from "@life-crm/core";
import { Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { updatePeriods } from "@/app/(app)/people/[id]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { monthNames, selectClass } from "@/lib/forms";
import { cn } from "@/lib/utils";

interface Row {
  startMonth: string;
  startYear: string;
  endMonth: string;
  endYear: string;
}

const toRow = (p: Period): Row => ({
  startMonth: p.startMonth ? String(p.startMonth) : "",
  startYear: p.startYear ? String(p.startYear) : "",
  endMonth: p.endMonth ? String(p.endMonth) : "",
  endYear: p.endYear ? String(p.endYear) : "",
});

const num = (v: string) => (v.trim() && /^\d+$/.test(v.trim()) ? Number(v.trim()) : null);
const toPeriod = (r: Row): Period => ({ startYear: num(r.startYear), startMonth: num(r.startMonth), endYear: num(r.endYear), endMonth: num(r.endMonth) });
const blank: Row = { startMonth: "", startYear: "", endMonth: "", endYear: "" };

/** "Since May 2014", or "2005 to 2012 · 2020 to now" when you drifted apart and caught back up. */
function summary(periods: Period[]) {
  if (periods.length === 1 && periods[0]!.endYear == null && periods[0]!.startYear != null) {
    const p = periods[0]!;
    return `Since ${p.startMonth ? `${monthNames[p.startMonth - 1]} ` : ""}${p.startYear}`;
  }
  return periods.map(periodLabel).join(" · ");
}

/**
 * When you've known someone, as one or more periods. Each has a start and, unless it's still
 * going, an end. Gaps between them show as breaks on the life timeline.
 */
export function PeriodsField({ contactId, periods, today }: { contactId: string; periods: Period[]; today: string }) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => (periods.length ? periods.map(toRow) : [blank]));
  const [error, setError] = useState<{ index?: number; message: string } | null>(null);
  const [pending, start] = useTransition();
  const [year, month] = today.split("-").map(Number) as [number, number];

  const update = (i: number, patch: Partial<Row>) => {
    setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setError(null);
  };

  function save() {
    // Rows left completely empty are dropped rather than complained about.
    const filled = rows.filter((r) => Object.values(r).some((v) => v.trim()));
    const badYear = filled.findIndex((r) => [r.startYear, r.endYear].some((v) => v.trim() && num(v) == null));
    if (badYear >= 0) return setError({ index: rows.indexOf(filled[badYear]!), message: "Years are numbers, like 2014" });
    const next = filled.map(toPeriod);
    const problem = periodsProblem(next, { year, month });
    if (problem) return setError({ index: rows.indexOf(filled[problem.index]!), message: problem.message });
    start(async () => {
      const result = await updatePeriods(contactId, next);
      if (result.error) return setError({ index: result.index != null ? rows.indexOf(filled[result.index]!) : undefined, message: result.error });
      setEditing(false);
    });
  }

  function cancel() {
    setRows(periods.length ? periods.map(toRow) : [blank]);
    setError(null);
    setEditing(false);
  }

  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">Known</p>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {periods.length ? "Edit" : "Add"}
          </button>
        )}
      </div>
      {!editing ? (
        <p className={periods.length ? undefined : "text-muted-foreground"}>{periods.length ? summary(periods) : "Unknown"}</p>
      ) : (
        <div className="grid gap-3">
          {rows.map((r, i) => (
            <fieldset key={i} className={cn("grid gap-2", error?.index === i && "border-l-2 border-destructive pl-2.5")}>
              <legend className="sr-only">Period {i + 1}</legend>
              <div className="grid grid-cols-[2.5rem_1fr_5.5rem] items-center gap-2">
                <span className="text-[13px] text-muted-foreground">From</span>
                <select aria-label="Start month" value={r.startMonth} onChange={(e) => update(i, { startMonth: e.target.value })} className={selectClass}>
                  <option value="">Month</option>
                  {monthNames.map((m, k) => (
                    <option key={m} value={k + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                <Input inputMode="numeric" placeholder="Year" aria-label="Start year" value={r.startYear} maxLength={4} onChange={(e) => update(i, { startYear: e.target.value })} />
              </div>
              <div className="grid grid-cols-[2.5rem_1fr_5.5rem] items-center gap-2">
                <span className="text-[13px] text-muted-foreground">To</span>
                <select aria-label="End month" value={r.endMonth} onChange={(e) => update(i, { endMonth: e.target.value })} className={selectClass}>
                  <option value="">Month</option>
                  {monthNames.map((m, k) => (
                    <option key={m} value={k + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                <Input inputMode="numeric" placeholder="Now" aria-label="End year, blank for now" value={r.endYear} maxLength={4} onChange={(e) => update(i, { endYear: e.target.value })} />
              </div>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => (setRows((all) => all.filter((_, j) => j !== i)), setError(null))}
                  className="flex items-center gap-1 justify-self-end text-[13px] text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                  Remove
                </button>
              )}
              {error?.index === i && <p className="text-sm text-destructive">{error.message}</p>}
            </fieldset>
          ))}
          <button
            type="button"
            onClick={() => setRows((all) => [...all, blank])}
            className="flex items-center gap-1 justify-self-start text-[13px] text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-3.5" />
            Add another period
          </button>
          <p className="text-[13px] text-muted-foreground">Leave the end blank if you&apos;re still in touch.</p>
          {error && error.index == null && <p className="text-sm text-destructive">{error.message}</p>}
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={save}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
