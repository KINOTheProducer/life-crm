"use client";

import { useState, useTransition } from "react";
import { checkRemindersNow } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";

export function CheckNow() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3 text-sm">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const { created } = await checkRemindersNow();
            setResult(created === 0 ? "Nothing new." : `${created} new ${created === 1 ? "reminder" : "reminders"}.`);
          })
        }
      >
        {pending ? "Checking…" : "Check now"}
      </Button>
      {result && <span className="text-muted-foreground">{result}</span>}
    </div>
  );
}
