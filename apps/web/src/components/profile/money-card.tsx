"use client";

import { debtBalance, formatMoney } from "@life-crm/core";
import { Plus } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import type { FormState } from "@/app/(app)/people/[id]/actions";
import { addDebt, settleDebt } from "@/app/(app)/people/[id]/practical-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/lib/forms";
import { submitKeepingValues } from "@/lib/submit";

interface DebtRow {
  id: string;
  direction: "they_owe" | "i_owe";
  amountCents: number;
  currency: string;
  reason: string | null;
  occurredOn: string;
}

const fmt = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Money lent and borrowed, netted into one line. */
export function MoneyCard({
  contactId,
  firstName,
  debts,
  settled,
  today,
}: {
  contactId: string;
  firstName: string;
  debts: DebtRow[];
  settled: number;
  today: string;
}) {
  const [adding, setAdding] = useState(false);
  const [state, action, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const next = await addDebt(contactId, prev, form);
    if (next.ok) setAdding(false);
    return next;
  }, {});
  const [busy, start] = useTransition();
  const balance = debtBalance(debts);

  return (
    <div className="grid gap-4">
      {debts.length === 0 ? (
        !adding && <p className="text-sm text-muted-foreground">{settled > 0 ? "All square." : `Nothing owed either way with ${firstName}.`}</p>
      ) : (
        <>
          <p className="type-display text-2xl">
            {balance === 0 ? "All square" : balance > 0 ? `${firstName} owes you ${formatMoney(balance)}` : `You owe ${firstName} ${formatMoney(-balance)}`}
          </p>
          <ul className="grid gap-2">
            {debts.map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-2 text-sm">
                <span className="min-w-0">
                  {d.direction === "they_owe" ? "Lent " : "Borrowed "}
                  {formatMoney(d.amountCents, d.currency)}
                  {d.reason && <span className="text-muted-foreground"> for {d.reason}</span>}
                  <span className="block text-[13px] text-muted-foreground">{fmt.format(new Date(`${d.occurredOn}T00:00:00Z`))}</span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => start(() => settleDebt(contactId, d.id))}
                  className="shrink-0 rounded-full px-2 py-0.5 text-[13px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  Settled
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {adding ? (
        <form onSubmit={submitKeepingValues(action)} className="grid gap-2">
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <select name="direction" aria-label="Who owes" defaultValue="they_owe" className={selectClass}>
              <option value="they_owe">I lent {firstName}</option>
              <option value="i_owe">{firstName} lent me</option>
            </select>
            <Input name="amount" inputMode="decimal" placeholder="$ CAD" aria-label="Amount in CAD" required maxLength={12} autoFocus />
          </div>
          <Input name="reason" placeholder="For what (optional)" maxLength={200} />
          <Input name="date" type="date" aria-label="Date" defaultValue={today} max={today} required />
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setAdding(true)}>
          <Plus />
          Lent or borrowed
        </Button>
      )}
    </div>
  );
}
