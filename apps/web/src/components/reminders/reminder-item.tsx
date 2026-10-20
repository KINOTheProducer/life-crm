"use client";

import { Cake, Check, Clock, HeartHandshake, X, type LucideIcon, Bell } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { dismiss, markDone, snooze } from "@/app/(app)/reminders/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const icons: Record<string, LucideIcon> = { date: Cake, checkin: HeartHandshake, custom: Bell };

export interface ReminderItemData {
  id: string;
  kind: "date" | "checkin" | "custom";
  title: string;
  body: string | null;
  contactId: string | null;
  overdue: boolean;
  today: boolean;
}

export function ReminderItem({ item, compact = false }: { item: ReminderItemData; compact?: boolean }) {
  const [pending, start] = useTransition();
  const Icon = icons[item.kind] ?? Bell;

  return (
    <li className={cn("flex items-start gap-4 py-4", pending && "opacity-50")}>
      <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", item.today ? "bg-accent text-accent-foreground" : "bg-secondary")}>
        <Icon className="size-4" />
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        {item.contactId ? (
          <Link href={`/people/${item.contactId}`} className="font-medium hover:underline">
            {item.title}
          </Link>
        ) : (
          <p className="font-medium">{item.title}</p>
        )}
        {item.body && <p className="text-sm text-muted-foreground">{item.body}</p>}
        {!compact && (
          <div className="flex flex-wrap gap-1.5 pt-2">
            {item.kind === "checkin" && item.contactId ? (
              <Link href={`/people/${item.contactId}#catch-up`} className={buttonVariants({ size: "sm" })}>
                Log catch-up
              </Link>
            ) : (
              <Button size="sm" disabled={pending} onClick={() => start(() => markDone(item.id))}>
                <Check />
                Done
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={pending} onClick={() => start(() => snooze(item.id, 1))}>
              <Clock />
              Tomorrow
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => start(() => snooze(item.id, 7))}>
              Next week
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} aria-label="Dismiss" onClick={() => start(() => dismiss(item.id))}>
              <X />
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}
