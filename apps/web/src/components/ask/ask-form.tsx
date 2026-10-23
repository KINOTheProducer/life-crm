"use client";

import { ArrowUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AskEvent } from "@/app/api/ask/route";
import { Button } from "@/components/ui/button";
import { WorkingSteps } from "@/components/working-steps";
import type { AskResult } from "@/lib/data/assistant";

const examples = ["Who do I know that's into climbing?", "What's Ryan's wife's name?", "When did I last see Grandpa?", "Who lives in Vancouver?"];

const kindLabels = { person: "Profile", fact: "Fact", note: "Note", interaction: "Catch-up", life_event: "Life event" } as const;

const isoDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

interface AskState {
  question?: string;
  result?: AskResult;
  error?: string;
}

/** One question at a time; the answer cites the notes it came from. Says what it's doing while it works. */
export function AskForm({ initial }: { initial: string }) {
  const [state, setState] = useState<AskState>({});
  const [pending, setPending] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const input = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const autoSent = useRef(false);

  async function ask(question: string) {
    setPending(true);
    setSteps([]);
    const next: AskState = { question };
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        next.error = body.error ?? "Something went wrong. Please try again.";
      } else {
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines.filter(Boolean)) {
            const event = JSON.parse(line) as AskEvent;
            if ("step" in event) setSteps((s) => [...s, event.step]);
            else if ("result" in event) next.result = event.result;
            else next.error = event.error;
          }
        }
        if (!next.result && !next.error) next.error = "The answer got cut off. Please try again.";
      }
    } catch {
      next.error = "Couldn't reach the server. Check your connection and try again.";
    }
    setState(next);
    setPending(false);
  }

  // A question passed in the URL (from the command palette) is asked straight away.
  useEffect(() => {
    if (initial && !autoSent.current) {
      autoSent.current = true;
      form.current?.requestSubmit();
    }
  }, [initial]);

  return (
    <div className="grid gap-6">
      <form
        ref={form}
        onSubmit={(e) => {
          e.preventDefault();
          const question = new FormData(e.currentTarget).get("question");
          if (!pending && typeof question === "string") void ask(question);
        }}
        className="relative"
      >
        <textarea
          ref={input}
          name="question"
          defaultValue={state.question ?? initial}
          rows={2}
          maxLength={500}
          placeholder="Who do I know in Montreal? What does Priya's son play?"
          aria-label="Your question"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          className="w-full resize-none rounded-3xl border border-input bg-card px-5 py-4 pr-16 text-[15px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button type="submit" size="icon" disabled={pending} aria-label="Ask" className="absolute right-3 bottom-4 rounded-full">
          <ArrowUp />
        </Button>
      </form>

      {!state.result && !state.error && !pending && (
        <div className="flex flex-wrap gap-2">
          {examples.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                if (input.current) input.current.value = e;
                form.current?.requestSubmit();
              }}
              className="rounded-full border border-border px-3.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {pending && <WorkingSteps lines={steps.length ? steps : ["Looking through your notes"]} />}
      {state.error && !pending && <p className="text-sm text-destructive">{state.error}</p>}

      {state.result && !pending && (
        <div className="grid gap-5 rounded-3xl bg-card p-5 md:p-6">
          <p className="text-[17px] leading-relaxed whitespace-pre-line">{state.result.answer}</p>
          {state.result.citations.length > 0 && (
            <div className="grid gap-2">
              <p className="type-meta text-muted-foreground">From your notes</p>
              <ol className="grid gap-2">
                {state.result.citations.map((c, i) => (
                  <li key={c.ref} className="flex gap-3 text-sm">
                    <span className="w-5 shrink-0 text-muted-foreground tabular-nums">{i + 1}.</span>
                    <span className="min-w-0">
                      <Link href={`/people/${c.contactId}`} className="font-medium underline-offset-4 hover:underline">
                        {c.contactName}
                      </Link>
                      <span className="text-muted-foreground">
                        {" "}
                        · {kindLabels[c.kind]}
                        {c.date && c.kind !== "person" && ` · ${isoDay(c.date)}`}
                      </span>
                      <span className="mt-0.5 block text-muted-foreground">{c.text.length > 240 ? `${c.text.slice(0, 240)}…` : c.text}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
