"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { refreshPersonSummary } from "@/app/(app)/people/[id]/assistant-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSteps, WorkingSteps } from "@/components/working-steps";

interface SummaryView {
  summary: string;
  askAbout: { text: string }[];
  stale: boolean;
}

/**
 * "Who this person is to you" plus open threads to ask about. Written on request the first
 * time; after that it rewrites itself when new notes have landed since.
 */
export function SummaryCard({
  contactId,
  firstName,
  view,
  sourceCount,
  aiEnabled,
  showAskAbout = true,
}: {
  contactId: string;
  firstName: string;
  view: SummaryView | null;
  sourceCount: number;
  aiEnabled: boolean;
  /** Off where the follow-ups are listed elsewhere, like the brief. */
  showAskAbout?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const tried = useRef(false);
  const steps = useSteps(
    [
      `Reading ${sourceCount} ${sourceCount === 1 ? "thing" : "things"} you've noted about ${firstName}`,
      `Looking for what's still open with ${firstName}`,
      view ? `Rewriting ${firstName}'s card` : `Writing ${firstName}'s card`,
    ],
    pending,
  );

  const refresh = () =>
    start(async () => {
      setError(null);
      const res = await refreshPersonSummary(contactId);
      if (res.error) setError(res.error);
    });

  // Once someone has a summary, keep it current without a click. One try per page view.
  useEffect(() => {
    if (view?.stale && aiEnabled && !tried.current) {
      tried.current = true;
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.stale, aiEnabled]);

  if (!view && (!aiEnabled || sourceCount < 2)) return null;

  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto] items-center">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" />
          {firstName}, in short
        </CardTitle>
        {view && aiEnabled && (
          <Button variant="ghost" size="icon" onClick={refresh} disabled={pending} aria-label="Rewrite summary" title="Rewrite from your notes">
            <RefreshCw className={pending ? "animate-spin" : undefined} />
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        {view ? (
          <>
            <p className={pending ? "text-[15px] leading-relaxed opacity-60" : "text-[15px] leading-relaxed"}>{view.summary}</p>
            {showAskAbout && view.askAbout.length > 0 && (
              <div className="grid gap-1.5">
                <p className="text-[13px] text-muted-foreground">Ask {firstName} about</p>
                <ul className="grid gap-1 pl-4 text-sm marker:text-muted-foreground [list-style:disc]">
                  {view.askAbout.map((a, i) => (
                    <li key={i}>{a.text}</li>
                  ))}
                </ul>
              </div>
            )}
            {view.stale && !pending && <p className="text-[13px] text-muted-foreground">New notes since this was written.</p>}
            <WorkingSteps lines={steps} />
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">A few lines on who {firstName} is to you and what to ask next time, from your notes.</p>
            <Button variant="outline" onClick={refresh} disabled={pending}>
              {pending ? "Reading your notes…" : "Summarize"}
            </Button>
            <WorkingSteps lines={steps} className="basis-full" />
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
