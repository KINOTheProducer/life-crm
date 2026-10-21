"use client";

import { formatMoney } from "@life-crm/core";
import { Check, Gift, Plus, X } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { archiveFact } from "@/app/(app)/people/[id]/actions";
import { addGift, addGiftIdea, deleteGift, setThanked } from "@/app/(app)/people/[id]/practical-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/lib/forms";
import { submitKeepingValues } from "@/lib/submit";
import { cn } from "@/lib/utils";

interface Idea {
  id: string;
  value: string;
}

interface GiftRow {
  id: string;
  direction: "given" | "received";
  title: string;
  occasion: string | null;
  givenOn: string;
  priceCents: number | null;
  currency: string;
  url: string | null;
  thanked: boolean;
}

const fmt = new Intl.DateTimeFormat("en-CA", { month: "short", year: "numeric", timeZone: "UTC" });
const SHOWN = 5;

type Mode = { kind: "idea" } | { kind: "gift"; idea?: Idea } | null;

/** Gift ideas (wishlist facts) and gifts given and received, with a nudge when an idea repeats an old gift. */
export function GiftsCard({
  contactId,
  firstName,
  ideas,
  gifts,
  repeats,
  today,
}: {
  contactId: string;
  firstName: string;
  ideas: Idea[];
  gifts: GiftRow[];
  /** Idea id to the year a similar gift was given. */
  repeats: Record<string, string>;
  today: string;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [all, setAll] = useState(false);
  const [busy, start] = useTransition();
  const shown = all ? gifts : gifts.slice(0, SHOWN);

  return (
    <div className="grid gap-5">
      {ideas.length === 0 && gifts.length === 0 && !mode && (
        <p className="text-sm text-muted-foreground">Note what {firstName} mentions wanting, and what you give each other.</p>
      )}

      {ideas.length > 0 && (
        <div className="grid gap-1.5">
          <p className="text-[13px] text-muted-foreground">Ideas</p>
          <ul className="grid gap-1.5">
            {ideas.map((idea) => (
              <li key={idea.id} className="group flex items-start justify-between gap-2 text-sm">
                <span>
                  {idea.value}
                  {repeats[idea.id] && <span className="block text-[13px] text-accent-ink">You gave something like this in {repeats[idea.id]}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setMode({ kind: "gift", idea })}
                    className="rounded-full px-2 py-0.5 text-[13px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    Gave it
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove idea ${idea.value}`}
                    disabled={busy}
                    onClick={() => start(() => archiveFact(contactId, idea.id))}
                    className="rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {gifts.length > 0 && (
        <div className="grid gap-1.5">
          <p className="text-[13px] text-muted-foreground">Given and received</p>
          <ul className="grid gap-2">
            {shown.map((g) => (
              <li key={g.id} className="group flex items-start justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="text-muted-foreground">{g.direction === "given" ? "Gave " : "Got "}</span>
                  {g.url ? (
                    <a href={g.url} target="_blank" rel="noreferrer noopener" className="underline-offset-4 hover:underline">
                      {g.title}
                    </a>
                  ) : (
                    g.title
                  )}
                  <span className="block text-[13px] text-muted-foreground">
                    {[g.occasion, fmt.format(new Date(`${g.givenOn}T00:00:00Z`)), g.priceCents != null && formatMoney(g.priceCents, g.currency)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {g.direction === "received" && (
                    <button
                      type="button"
                      disabled={busy}
                      aria-pressed={g.thanked}
                      onClick={() => start(() => setThanked(contactId, g.id, !g.thanked))}
                      className={cn(
                        "flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px]",
                        g.thanked ? "text-muted-foreground" : "bg-butter text-accent-ink",
                      )}
                    >
                      {g.thanked && <Check className="size-3" />}
                      {g.thanked ? "Thanked" : "Say thanks"}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Delete ${g.title}`}
                    disabled={busy}
                    onClick={() => start(() => deleteGift(contactId, g.id))}
                    className="rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {gifts.length > SHOWN && (
            <button type="button" onClick={() => setAll(!all)} className="justify-self-start text-[13px] text-muted-foreground hover:text-foreground">
              {all ? "Show fewer" : `Show all ${gifts.length}`}
            </button>
          )}
        </div>
      )}

      {mode?.kind === "idea" && <IdeaForm contactId={contactId} firstName={firstName} onDone={() => setMode(null)} />}
      {mode?.kind === "gift" && (
        <GiftForm key={mode.idea?.id ?? "new"} contactId={contactId} idea={mode.idea} today={today} onDone={() => setMode(null)} />
      )}

      {!mode && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setMode({ kind: "idea" })}>
            <Plus />
            Gift idea
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMode({ kind: "gift" })}>
            <Gift />
            Log a gift
          </Button>
        </div>
      )}
    </div>
  );
}

function IdeaForm({ contactId, firstName, onDone }: { contactId: string; firstName: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(addGiftIdea.bind(null, contactId), {});
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);
  return (
    <form onSubmit={submitKeepingValues(action)} className="grid gap-2 border-t border-border pt-4">
      <Input name="idea" placeholder={`Something ${firstName} would love`} required maxLength={500} autoFocus />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function GiftForm({ contactId, idea, today, onDone }: { contactId: string; idea?: Idea; today: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(addGift.bind(null, contactId), {});
  // A repeat warning is worth reading before the form goes away.
  const warning = state.ok ? state.message : undefined;
  useEffect(() => {
    if (state.ok && !state.message) onDone();
  }, [state.ok, state.message, onDone]);

  if (warning) {
    return (
      <div className="grid gap-2 rounded-2xl bg-butter p-4 text-sm">
        <p className="text-accent-ink">Saved. {warning}</p>
        <Button size="sm" variant="outline" className="justify-self-start" onClick={onDone}>
          OK
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submitKeepingValues(action)} className="grid gap-2 border-t border-border pt-4">
      {idea && <input type="hidden" name="fromIdea" value={idea.id} />}
      <div className="grid grid-cols-2 gap-2">
        <select name="direction" aria-label="Given or received" defaultValue="given" className={selectClass}>
          <option value="given">I gave</option>
          <option value="received">They gave me</option>
        </select>
        <Input name="date" type="date" aria-label="Date" defaultValue={today} max={today} required />
      </div>
      <Input name="title" placeholder="What, e.g. Chemex" defaultValue={idea?.value} required maxLength={200} autoFocus={!idea} />
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <Input name="occasion" placeholder="Occasion (optional)" maxLength={100} />
        <Input name="price" inputMode="decimal" placeholder="$ CAD" aria-label="Price in CAD" maxLength={12} />
      </div>
      <Input name="url" type="url" placeholder="Link (optional)" maxLength={2000} />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save gift"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
