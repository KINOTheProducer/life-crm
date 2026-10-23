"use client";

import { interactionTypeLabels, interactionTypes, lifeEventTypeLabels, lifeEventTypes, sensitiveLifeEvents, type LifeEventType } from "@life-crm/core";
import { useActionState, useEffect, useRef, useState } from "react";
import { addNote, logInteraction, type FormState } from "@/app/(app)/people/[id]/actions";
import { addLifeEvent } from "@/app/(app)/people/[id]/practical-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { nameInputProps, selectClass } from "@/lib/forms";
import { cn } from "@/lib/utils";

const fieldClass =
  "w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Tab = "note" | "interaction" | "event";
const hashes: Record<string, Tab> = { "#note": "note", "#catch-up": "interaction", "#life-event": "event" };

function clearHash() {
  // So the header button opens it again next time.
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

/**
 * Add a note, log a catch-up or record a life event above a person's timeline. Closed until
 * opened with a `#note`, `#catch-up` or `#life-event` link, so the page leads with the timeline.
 */
export function Composer({ contactId, firstName, today }: { contactId: string; firstName: string; today: string }) {
  const [tab, setTab] = useState<Tab | null>(null);
  const close = () => {
    setTab(null);
    clearHash();
  };
  // Close once something is saved.
  const [noteState, noteAction, notePending] = useActionState(async (prev: FormState, form: FormData) => {
    const state = await addNote(contactId, prev, form);
    if (state.ok) close();
    return state;
  }, {});
  const [ixState, ixAction, ixPending] = useActionState(async (prev: FormState, form: FormData) => {
    const state = await logInteraction(contactId, prev, form);
    if (state.ok) close();
    return state;
  }, {});
  const [eventState, eventAction, eventPending] = useActionState(async (prev: FormState, form: FormData) => {
    const state = await addLifeEvent(contactId, prev, form);
    if (state.ok) close();
    return state;
  }, {});
  const [eventType, setEventType] = useState<LifeEventType>("new_job");
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const open = () => {
      const next = hashes[window.location.hash];
      if (!next) return;
      setTab(next);
      requestAnimationFrame(() => {
        root.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        root.current?.querySelector("textarea")?.focus({ preventScroll: true });
      });
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);

  if (!tab) {
    // Something saving did besides the obvious, like setting a birthday or a check-in reminder.
    const message = (noteState.ok ?? 0) > (eventState.ok ?? 0) ? noteState.message : eventState.message;
    return message ? <p className="text-sm text-muted-foreground">{message}</p> : null;
  }

  return (
    <section ref={root} aria-label="Add to timeline" className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <div role="tablist" className="flex gap-1">
          {(
            [
              ["note", "Note"],
              ["interaction", "Log a catch-up"],
              ["event", "Life event"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
                tab === key && "bg-secondary text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={close}
        >
          Cancel
        </Button>
      </div>

      {tab === "note" ? (
        <form action={noteAction} className="grid gap-3">
          <textarea
            name="body"
            rows={3}
            required
            maxLength={5000}
            placeholder={`Something to remember about ${firstName}…`}
            className={fieldClass}
          />
          {noteState.error && <p className="text-sm text-destructive">{noteState.error}</p>}
          <Button type="submit" className="justify-self-start" disabled={notePending}>
            {notePending ? "Saving…" : "Add note"}
          </Button>
        </form>
      ) : tab === "event" ? (
        <form action={eventAction} className="grid gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_2fr] max-sm:[&>:last-child]:col-span-2">
            <select
              name="type"
              aria-label="What happened"
              value={eventType}
              onChange={(e) => setEventType(e.target.value as LifeEventType)}
              className={selectClass}
            >
              {lifeEventTypes.map((t) => (
                <option key={t} value={t}>
                  {lifeEventTypeLabels[t]}
                </option>
              ))}
            </select>
            <Input name="date" type="date" aria-label="When" defaultValue={today} required />
            <Input name="title" placeholder={eventPlaceholders[eventType]} maxLength={200} />
          </div>
          {eventType === "baby" && (
            <Input name="babyName" placeholder="Baby's first name, to add them to the tree (optional)" maxLength={100} {...nameInputProps} />
          )}
          <textarea name="notes" rows={2} maxLength={2000} placeholder="Anything to remember (optional)" className={fieldClass} />
          {sensitiveLifeEvents.includes(eventType) && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="checkIn" defaultChecked className="size-4 accent-foreground" />
              Remind me to check in on {firstName} every week
            </label>
          )}
          {eventState.error && <p className="text-sm text-destructive">{eventState.error}</p>}
          <Button type="submit" className="justify-self-start" disabled={eventPending}>
            {eventPending ? "Saving…" : "Save"}
          </Button>
        </form>
      ) : (
        <form action={ixAction} className="grid gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_2fr] max-sm:[&>:last-child]:col-span-2">
            <select name="type" aria-label="Type" defaultValue="in_person" className={selectClass}>
              {interactionTypes.map((t) => (
                <option key={t} value={t}>
                  {interactionTypeLabels[t]}
                </option>
              ))}
            </select>
            <Input name="date" type="date" aria-label="Date" defaultValue={today} max={today} required />
            <Input name="location" placeholder="Where (optional)" maxLength={200} />
          </div>
          <textarea name="summary" rows={2} required maxLength={2000} placeholder="What did you get up to?" className={fieldClass} />
          {ixState.error && <p className="text-sm text-destructive">{ixState.error}</p>}
          <Button type="submit" className="justify-self-start" disabled={ixPending}>
            {ixPending ? "Saving…" : "Log catch-up"}
          </Button>
        </form>
      )}
    </section>
  );
}

const eventPlaceholders: Record<LifeEventType, string> = {
  new_job: "Where, e.g. Started at Shopify",
  moved: "Where to, e.g. Moved to Vancouver",
  engaged: "Details (optional)",
  married: "Details (optional)",
  baby: "Details (optional)",
  graduated: "From what (optional)",
  new_pet: "Name and kind (optional)",
  loss: "Who, e.g. Lost her dad",
  illness: "What (optional)",
  retired: "From what (optional)",
  big_trip: "Where to (optional)",
  other: "What happened",
};
