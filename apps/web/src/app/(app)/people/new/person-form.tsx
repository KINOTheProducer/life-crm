"use client";

import { closenessTiers } from "@life-crm/core";
import { useActionState } from "react";
import { PartialDateFields } from "@/components/partial-date-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nameInputProps, selectClass, textareaClass } from "@/lib/forms";
import { createPerson } from "../actions";

export function PersonForm() {
  const [state, action, pending] = useActionState(createPerson, {});

  return (
    <form action={action} className="grid max-w-xl gap-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" name="firstName" required maxLength={100} autoFocus {...nameInputProps} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" name="lastName" maxLength={100} {...nameInputProps} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="nickname">Nickname</Label>
          <Input id="nickname" name="nickname" maxLength={100} {...nameInputProps} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pronouns">Pronouns</Label>
          <Input id="pronouns" name="pronouns" placeholder="e.g. she/her" maxLength={50} />
        </div>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Birthday</legend>
        <PartialDateFields prefix="birthday" label="Birthday" />
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
          maxLength={2000}
          className={textareaClass}
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
