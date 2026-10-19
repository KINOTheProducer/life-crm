"use client";

import { X } from "lucide-react";
import { useTransition } from "react";
import { deleteReminder } from "@/app/(app)/reminders/actions";

const repeatLabel = { none: "", weekly: "every week", monthly: "every month", yearly: "every year" } as const;
const fmt = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });

export function CustomReminderList({
  items,
  showPerson = false,
}: {
  items: { id: string; title: string; dueOn: string; repeat: keyof typeof repeatLabel; contactName: string | null }[];
  showPerson?: boolean;
}) {
  const [pending, start] = useTransition();
  if (items.length === 0) return null;
  return (
    <ul className="grid gap-2">
      {items.map((r) => (
        <li key={r.id} className="group flex items-start justify-between gap-2 text-sm">
          <span>
            {r.title}
            <span className="text-muted-foreground">
              {" · "}
              {fmt.format(new Date(`${r.dueOn}T00:00:00Z`))}
              {r.repeat !== "none" && `, ${repeatLabel[r.repeat]}`}
              {showPerson && r.contactName && ` · ${r.contactName}`}
            </span>
          </span>
          <button
            type="button"
            aria-label={`Delete reminder ${r.title}`}
            disabled={pending}
            onClick={() => start(() => deleteReminder(r.id))}
            className="rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
          >
            <X className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}
