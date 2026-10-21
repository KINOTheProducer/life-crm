"use client";

import { Plus, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addTask, deleteTask, setTaskDone } from "@/app/(app)/people/[id]/practical-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitKeepingValues } from "@/lib/submit";
import { cn } from "@/lib/utils";

interface TaskRow {
  id: string;
  title: string;
  dueOn: string | null;
  doneAt: Date | null;
}

const fmt = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });

/** Small things to do for someone: return the drill, send the photos. */
export function TasksCard({ contactId, firstName, tasks, today }: { contactId: string; firstName: string; tasks: TaskRow[]; today: string }) {
  const [adding, setAdding] = useState(false);
  const [state, action, pending] = useActionState(addTask.bind(null, contactId), {});
  const [busy, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state.ok]);

  return (
    <div className="grid gap-4">
      {tasks.length === 0 && !adding && <p className="text-sm text-muted-foreground">Anything you owe {firstName}, or promised to do.</p>}
      {tasks.length > 0 && (
        <ul className="grid gap-2">
          {tasks.map((t) => {
            const done = t.doneAt != null;
            const late = !done && t.dueOn != null && t.dueOn < today;
            return (
              <li key={t.id} className="group flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={done}
                  disabled={busy}
                  aria-label={done ? `Mark ${t.title} not done` : `Mark ${t.title} done`}
                  onChange={() => start(() => setTaskDone(contactId, t.id, !done))}
                  className="mt-0.5 size-4 shrink-0 accent-foreground"
                />
                <span className={cn("min-w-0 flex-1", done && "text-muted-foreground line-through")}>
                  {t.title}
                  {t.dueOn && !done && (
                    <span className={cn("ml-1.5 text-[13px]", late ? "text-accent-ink" : "text-muted-foreground")}>
                      {t.dueOn === today ? "today" : `${late ? "was due " : "by "}${fmt.format(new Date(`${t.dueOn}T00:00:00Z`))}`}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  aria-label={`Delete ${t.title}`}
                  disabled={busy}
                  onClick={() => start(() => deleteTask(contactId, t.id))}
                  className="shrink-0 rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {adding ? (
        <form ref={form} onSubmit={submitKeepingValues(action)} className="grid gap-2">
          <Input name="title" placeholder={`Return ${firstName}'s drill`} required maxLength={300} autoFocus />
          <Input name="dueOn" type="date" aria-label="Due date (optional)" min={today} />
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              Add
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Done
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setAdding(true)}>
          <Plus />
          Add a to-do
        </Button>
      )}
    </div>
  );
}
