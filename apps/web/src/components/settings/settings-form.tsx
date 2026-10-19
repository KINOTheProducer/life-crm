"use client";

import { useActionState } from "react";
import { saveSettings } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const leadOptions = [
  [30, "A month before"],
  [14, "Two weeks before"],
  [7, "A week before"],
  [3, "Three days before"],
  [1, "The day before"],
  [0, "On the day"],
] as const;

const selectClass = "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm";

function hourLabel(h: number) {
  const suffix = h < 12 ? "am" : "pm";
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${suffix}`;
}

export function SettingsForm({
  timeZone,
  timeZones,
  digestHour,
  emailDigest,
  leadDays,
  emailConfigured,
}: {
  timeZone: string;
  timeZones: string[];
  digestHour: number;
  emailDigest: boolean;
  leadDays: number[];
  emailConfigured: boolean;
}) {
  const [state, action, pending] = useActionState(saveSettings, {});

  return (
    <form action={action} className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Time zone
          <select name="timeZone" defaultValue={timeZone} className={selectClass}>
            {timeZones.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Daily reminders at
          <select name="digestHour" defaultValue={digestHour} className={selectClass}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Remind me about birthdays and dates</legend>
        <div className="flex flex-wrap gap-2">
          {leadOptions.map(([days, label]) => (
            <label key={days} className="cursor-pointer">
              <input type="checkbox" name="leadDays" value={days} defaultChecked={leadDays.includes(days)} className="peer sr-only" />
              <span
                className={cn(
                  "inline-block rounded-full border border-foreground/25 px-3 py-1.5 text-sm transition-colors",
                  "peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
                )}
              >
                {label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="emailDigest" defaultChecked={emailDigest} className="mt-0.5 size-4 accent-[var(--accent)]" />
        <span>
          <span className="font-medium">Email me a daily digest</span>
          {!emailConfigured && (
            <span className="block text-muted-foreground">Email isn&apos;t set up on this server yet (SMTP_URL).</span>
          )}
        </span>
      </label>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && !pending && <p className="text-sm text-muted-foreground">Saved.</p>}
      <Button type="submit" variant="accent" className="justify-self-start" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
