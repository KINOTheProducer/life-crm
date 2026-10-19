"use client";

import { useState, useTransition } from "react";
import { disableCalendarFeed, rotateCalendarFeed } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** The feed URL is only shown right after it's created; we store a hash, not the token. */
export function CalendarFeed({ enabled }: { enabled: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-3 text-sm">
      {url ? (
        <>
          <p>Add this URL to Apple Calendar, Google Calendar or Outlook as a subscription. Keep it private.</p>
          <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <Button variant="outline" size="sm" className="justify-self-start" onClick={() => navigator.clipboard.writeText(url)}>
            Copy
          </Button>
        </>
      ) : (
        <p className="text-muted-foreground">
          {enabled
            ? "Your feed is on. For security the address is only shown once; make a new one if you need it again."
            : "Subscribe to birthdays, dates and reminders from your calendar app."}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          variant={enabled ? "outline" : "accent"}
          size="sm"
          disabled={pending}
          onClick={() => start(async () => setUrl(await rotateCalendarFeed()))}
        >
          {enabled ? "Make a new address" : "Create calendar feed"}
        </Button>
        {enabled && (
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => (await disableCalendarFeed(), setUrl(null)))}>
            Turn off
          </Button>
        )}
      </div>
    </div>
  );
}
