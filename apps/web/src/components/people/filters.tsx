"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { monthNames } from "@/lib/forms";
import { cn } from "@/lib/utils";

const chip = "h-9 rounded-full border border-input bg-card px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Circle, birthday month, city, interest and "due for a catch-up", kept in the URL. */
export function PeopleFilters({
  values,
  cities,
  interests,
  circles,
}: {
  values: { q: string; tier: string; month: string; city: string; interest: string; circle: string; overdue: boolean };
  cities: string[];
  interests: string[];
  circles: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [city, setCity] = useState(values.city);
  const [interest, setInterest] = useState(values.interest);

  const go = (patch: Partial<typeof values>) => {
    const next = { ...values, ...patch };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (k === "overdue") {
        if (v) sp.set(k, "1");
      } else if (v) sp.set(k, String(v));
    }
    router.push(`/people${sp.size ? `?${sp}` : ""}`);
  };
  const any = values.month || values.city || values.interest || values.circle || values.overdue;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {circles.length > 0 && (
        <select aria-label="Circle" value={values.circle} onChange={(e) => go({ circle: e.target.value })} className={cn(chip, values.circle && "border-foreground")}>
          <option value="">Any circle</option>
          {circles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <select aria-label="Birthday month" value={values.month} onChange={(e) => go({ month: e.target.value })} className={cn(chip, values.month && "border-foreground")}>
        <option value="">Birthday in…</option>
        {monthNames.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </select>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go({ city });
        }}
      >
        <input list="filter-cities" value={city} onChange={(e) => setCity(e.target.value)} onBlur={() => city !== values.city && go({ city })} placeholder="City" aria-label="City" className={cn(chip, "w-36", values.city && "border-foreground")} />
        <datalist id="filter-cities">
          {cities.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </form>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go({ interest });
        }}
      >
        <input
          list="filter-interests"
          value={interest}
          onChange={(e) => setInterest(e.target.value)}
          onBlur={() => interest !== values.interest && go({ interest })}
          placeholder="Interest"
          aria-label="Interest"
          className={cn(chip, "w-36", values.interest && "border-foreground")}
        />
        <datalist id="filter-interests">
          {interests.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </form>
      <label className={cn(chip, "flex cursor-pointer items-center gap-2", values.overdue && "border-foreground")}>
        <input type="checkbox" checked={values.overdue} onChange={(e) => go({ overdue: e.target.checked })} className="size-4 accent-foreground" />
        Due for a catch-up
      </label>
      {any && (
        <button
          type="button"
          onClick={() => {
            setCity("");
            setInterest("");
            go({ month: "", city: "", interest: "", circle: "", overdue: false });
          }}
          className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
          Clear filters
        </button>
      )}
    </div>
  );
}
