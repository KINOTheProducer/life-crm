"use client";

import { closenessTiers } from "@life-crm/core";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPerson } from "../actions";

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const selectClass =
  "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function PersonForm() {
  const [state, action, pending] = useActionState(createPerson, {});

  return (
    <form action={action} className="grid max-w-xl gap-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" name="firstName" required autoFocus />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" name="lastName" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="nickname">Nickname</Label>
          <Input id="nickname" name="nickname" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pronouns">Pronouns</Label>
          <Input id="pronouns" name="pronouns" placeholder="e.g. she/her" />
        </div>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Birthday</legend>
        <div className="grid grid-cols-[2fr_1fr_1fr] gap-2">
          <select name="birthdayMonth" aria-label="Month" className={selectClass} defaultValue="">
            <option value="">Month</option>
            {months.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <Input name="birthdayDay" type="number" min={1} max={31} placeholder="Day" aria-label="Day" />
          <Input name="birthdayYear" type="number" min={1900} max={2100} placeholder="Year (opt.)" aria-label="Year" />
        </div>
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor="closeness">Closeness</Label>
        <select id="closeness" name="closeness" className={selectClass} defaultValue="friend">
          {closenessTiers.map((t) => (
            <option key={t} value={t}>
              {t === "inner" ? "Inner circle" : t[0]!.toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="howMet">How you met</Label>
        <textarea
          id="howMet"
          name="howMet"
          rows={3}
          className="w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Save person"}
        </Button>
      </div>
    </form>
  );
}
