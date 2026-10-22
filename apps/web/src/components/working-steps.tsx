"use client";

import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * What a slow job is doing or has found, one line each, newest last. With `working`, the
 * last line is the step in progress; without, every line is something already found.
 */
export function WorkingSteps({ lines, working = true, className }: { lines: string[]; working?: boolean; className?: string }) {
  if (lines.length === 0) return null;
  return (
    <ol aria-live="polite" className={cn("grid gap-1.5 text-left text-sm", className)}>
      {lines.map((line, i) => {
        const active = working && i === lines.length - 1;
        return (
          <li key={i} className="flex animate-in items-start gap-2.5 duration-300 fade-in slide-in-from-bottom-1">
            {active ? (
              <Loader2 aria-hidden className="mt-0.5 size-4 shrink-0 animate-spin text-accent-ink" />
            ) : (
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <span className={active ? "text-foreground" : "text-muted-foreground"}>{line}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * For jobs that can't report back as they go: walk through what they're doing, one step every
 * few seconds while `running`, and hold on the last. Starts over each time it runs.
 */
export function useSteps(steps: string[], running: boolean, everyMs = 3500) {
  const [shown, setShown] = useState(1);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setShown((n) => n + 1), everyMs);
    return () => {
      clearInterval(timer);
      setShown(1);
    };
  }, [running, everyMs]);
  return running ? steps.slice(0, Math.min(shown, steps.length)) : [];
}
