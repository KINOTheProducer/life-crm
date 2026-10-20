"use client";

import {
  partneredStatuses,
  partnerLabelSuggestions,
  relationshipStatuses,
  relationshipStatusLabels,
  type RelationshipStatus,
} from "@life-crm/core";
import { Plus } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { PartialDateFields } from "@/components/partial-date-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { finishOnboarding, saveFamily, savePartner, savePeople, saveRelationship, saveYou, type StepState } from "./actions";

function Submit({ pending, children, ...props }: { pending: boolean; children: React.ReactNode } & React.ComponentProps<typeof Button>) {
  return (
    <Button type="submit" size="lg" disabled={pending} {...props}>
      {pending ? "Saving…" : children}
    </Button>
  );
}

function ErrorText({ state }: { state: StepState }) {
  return state.error ? <p className="text-sm text-destructive">{state.error}</p> : null;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">{label}</p>
      {children}
      {hint && <p className="text-[13px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function YouForm({ name, timeZone, timeZones, suggestBrowserZone }: { name: string; timeZone: string; timeZones: string[]; suggestBrowserZone: boolean }) {
  const [state, action, pending] = useActionState(saveYou, {});
  const zone = useRef<HTMLSelectElement>(null);
  // Prefill the browser's zone on first setup. Done on the element so the server render still matches.
  useEffect(() => {
    if (!suggestBrowserZone || !zone.current) return;
    const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timeZones.includes(browser)) zone.current.value = browser;
  }, [suggestBrowserZone, timeZones]);

  return (
    <form action={action} className="grid gap-5">
      <label className="grid gap-2 text-sm font-medium">
        What should we call you?
        <Input name="name" defaultValue={name} required maxLength={100} autoFocus />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Time zone
        <select ref={zone} name="timeZone" defaultValue={timeZone} className={selectClass}>
          {timeZones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <span className="text-[13px] font-normal text-muted-foreground">So reminders land in your morning, not someone else&apos;s.</span>
      </label>
      <ErrorText state={state} />
      <Submit pending={pending} className="justify-self-start">
        Continue
      </Submit>
    </form>
  );
}

export function RelationshipForm({ status, polyamorous }: { status: RelationshipStatus | null; polyamorous: boolean }) {
  const [state, action, pending] = useActionState(saveRelationship, {});
  const [picked, setPicked] = useState<RelationshipStatus | null>(status);
  const partnered = picked != null && partneredStatuses.includes(picked);

  return (
    <form action={action} className="grid gap-5">
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">Relationship status</legend>
        {relationshipStatuses.map((s) => (
          <label
            key={s}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-2xl border border-border px-4 py-3.5 text-[15px] transition-colors hover:bg-muted",
              picked === s && "border-foreground bg-secondary",
            )}
          >
            <input type="radio" name="status" value={s} checked={picked === s} onChange={() => setPicked(s)} className="size-4 accent-foreground" />
            {relationshipStatusLabels[s]}
          </label>
        ))}
      </fieldset>
      {partnered && (
        <label className="flex items-start gap-3 rounded-2xl bg-secondary px-4 py-3.5 text-sm">
          <input type="checkbox" name="polyamorous" defaultChecked={polyamorous} className="mt-0.5 size-4 accent-foreground" />
          <span>
            I have more than one partner
            <span className="block text-[13px] text-muted-foreground">Each partner gets their own anniversaries, date nights and profile. You can change this later in Settings.</span>
          </span>
        </label>
      )}
      <ErrorText state={state} />
      <Submit pending={pending} className="justify-self-start" disabled={pending || !picked}>
        Continue
      </Submit>
    </form>
  );
}

export function PartnerForm({ polyamorous, married, hasPartners }: { polyamorous: boolean; married: boolean; hasPartners: boolean }) {
  const [state, action, pending] = useActionState(savePartner, {});
  return (
    <form action={action} className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          First name
          <Input name="firstName" required maxLength={100} autoFocus />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Last name
          <Input name="lastName" maxLength={100} />
        </label>
      </div>
      <label className="grid gap-2 text-sm font-medium">
        What you call them
        <Input name="label" list="onboarding-partner-labels" defaultValue={married ? "Spouse" : "Partner"} required maxLength={50} />
        <datalist id="onboarding-partner-labels">
          {partnerLabelSuggestions.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </label>
      <Field label="Their birthday">
        <PartialDateFields prefix="birthday" label="Birthday" />
      </Field>
      <Field label="When you got together" hint="We'll remind you before your anniversary every year.">
        <PartialDateFields prefix="official" label="Got together" yearPlaceholder="Year" />
      </Field>
      {married && (
        <Field label="Wedding date">
          <PartialDateFields prefix="married" label="Wedding" yearPlaceholder="Year" />
        </Field>
      )}
      {polyamorous && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isNesting" className="size-4 accent-foreground" />
          We live together (nesting partner)
        </label>
      )}
      <ErrorText state={state} />
      <div className="flex flex-wrap gap-2">
        {polyamorous && (
          <Button type="submit" size="lg" variant="outline" name="another" value="1" disabled={pending}>
            Save and add another
          </Button>
        )}
        <Submit pending={pending}>{hasPartners ? "Save and continue" : "Continue"}</Submit>
      </div>
    </form>
  );
}

const familyLabels = ["Mom", "Dad", "Sister", "Brother", "Daughter", "Son", "Grandma", "Grandpa", "Aunt", "Uncle", "Cousin", "Stepmom", "Stepdad"];

export function FamilyForm() {
  const [state, action, pending] = useActionState(saveFamily, {});
  const [rows, setRows] = useState(3);
  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="rowCount" value={rows} />
      <datalist id="family-labels">
        {familyLabels.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
      <div className="grid gap-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="grid gap-2 rounded-2xl bg-secondary p-4">
            <div className="grid gap-2 sm:grid-cols-[1fr_1.2fr_1.2fr]">
              <Input name={`rows.${i}.relationship`} list="family-labels" placeholder="Mom, brother…" aria-label="Who they are to you" maxLength={50} />
              <Input name={`rows.${i}.firstName`} placeholder="First name" aria-label="First name" maxLength={100} />
              <Input name={`rows.${i}.lastName`} placeholder="Last name" aria-label="Last name" maxLength={100} />
            </div>
            <PartialDateFields prefix={`rows.${i}.birthday`} label="Birthday" yearPlaceholder="Birth year" />
          </div>
        ))}
      </div>
      {rows < 30 && (
        <Button type="button" variant="ghost" className="justify-self-start" onClick={() => setRows((n) => n + 1)}>
          <Plus />
          Add someone
        </Button>
      )}
      <ErrorText state={state} />
      <Submit pending={pending} className="justify-self-start">
        Continue
      </Submit>
    </form>
  );
}

const cadences = [
  [7, "Every week"],
  [14, "Every two weeks"],
  [30, "Every month"],
  [90, "Every few months"],
] as const;

export function PeopleForm() {
  const [state, action, pending] = useActionState(savePeople, {});
  return (
    <form action={action} className="grid gap-5">
      <div className="grid gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="grid grid-cols-[1.6fr_1fr] gap-2">
            <Input name={`rows.${i}.name`} placeholder={["Your best friend", "Someone you miss", "An old roommate", "A work friend", "Anyone"][i]} aria-label={`Person ${i + 1}`} maxLength={200} />
            <select name={`rows.${i}.cadence`} defaultValue={30} aria-label={`How often for person ${i + 1}`} className={selectClass}>
              {cadences.map(([d, l]) => (
                <option key={d} value={d}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <ErrorText state={state} />
      <Submit pending={pending} className="justify-self-start">
        Continue
      </Submit>
    </form>
  );
}

function hourLabel(h: number) {
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "am" : "pm"}`;
}

export function RemindersForm({ digestHour, emailDigest }: { digestHour: number; emailDigest: boolean }) {
  const [state, action, pending] = useActionState(finishOnboarding, {});
  return (
    <form action={action} className="grid gap-5">
      <label className="grid max-w-xs gap-2 text-sm font-medium">
        Send reminders at
        <select name="digestHour" defaultValue={digestHour} className={selectClass}>
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {hourLabel(h)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="emailDigest" defaultChecked={emailDigest} className="size-4 accent-foreground" />
        Email me a daily digest when something&apos;s coming up
      </label>
      <p className="text-[13px] text-muted-foreground">Browser notifications and the calendar feed are in Settings.</p>
      <ErrorText state={state} />
      <Submit pending={pending} className="justify-self-start">
        Finish
      </Submit>
    </form>
  );
}
