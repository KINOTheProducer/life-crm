"use client";

import { factCategories, factCategoryLabels, type FactCategory } from "@life-crm/core";
import { Plus, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addFact, archiveFact } from "@/app/(app)/people/[id]/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface Fact {
  id: string;
  category: FactCategory;
  label: string;
  value: string;
}

export function FactsPanel({ contactId, firstName, facts }: { contactId: string; firstName: string; facts: Fact[] }) {
  const [adding, setAdding] = useState(false);
  const [state, action, pending] = useActionState(addFact.bind(null, contactId), {});
  const [removing, startRemove] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state.ok]);

  const grouped = factCategories
    .map((c) => ({ category: c, items: facts.filter((f) => f.category === c) }))
    .filter((g) => g.items.length > 0);
  const followUps = grouped.find((g) => g.category === "follow_up");
  const rest = grouped.filter((g) => g.category !== "follow_up");

  return (
    <Card>
      <CardHeader>
        <CardTitle>About {firstName}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        {followUps && (
          <div className="grid gap-2 rounded-2xl bg-butter p-4">
            <p className="text-[13px] font-medium text-accent-ink">Ask them about</p>
            <ul className="grid gap-1.5">
              {followUps.items.map((f) => (
                <li key={f.id} className="group flex items-start justify-between gap-2 text-sm">
                  <span>{f.value}</span>
                  <RemoveButton disabled={removing} onClick={() => startRemove(() => archiveFact(contactId, f.id))} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {rest.length === 0 && !followUps && (
          <p className="text-sm text-muted-foreground">Nothing yet. Record a voice note or add something below.</p>
        )}

        {rest.map((g) => (
          <div key={g.category} className="grid gap-1.5">
            <p className="text-[13px] text-muted-foreground">{factCategoryLabels[g.category]}</p>
            <ul className="grid gap-1">
              {g.items.map((f) => (
                <li key={f.id} className="group flex items-start justify-between gap-2 text-sm">
                  <span>
                    <span className="text-muted-foreground">{f.label}: </span>
                    {f.value}
                  </span>
                  <RemoveButton disabled={removing} onClick={() => startRemove(() => archiveFact(contactId, f.id))} />
                </li>
              ))}
            </ul>
          </div>
        ))}

        {adding ? (
          <form ref={form} action={action} className="grid gap-2 border-t border-border pt-4">
            <select name="category" aria-label="Category" defaultValue="interest" className="h-10 rounded-xl border border-input bg-card px-3 text-sm">
              {factCategories.map((c) => (
                <option key={c} value={c}>
                  {factCategoryLabels[c]}
                </option>
              ))}
            </select>
            <Input name="label" placeholder="Label, e.g. Dog" required />
            <Input name="value" placeholder="e.g. Biscuit, golden retriever" required />
            {state.error && <p className="text-sm text-destructive">{state.error}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                Save
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Done
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setAdding(true)}>
            <Plus />
            Add something
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function RemoveButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      aria-label="Remove"
      disabled={disabled}
      onClick={onClick}
      className="shrink-0 rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
    >
      <X className="size-3.5" />
    </button>
  );
}
