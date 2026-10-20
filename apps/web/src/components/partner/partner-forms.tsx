"use client";

import {
  loveLanguageLabels,
  loveLanguages,
  milestoneKinds,
  milestoneLabels,
  defaultAnniversary,
  partnerLabelSuggestions,
  partnerPrompts,
  type LoveLanguage,
  type MilestoneKind,
  type PartnerPromptSection,
} from "@life-crm/core";
import { ArrowDown, ArrowUp, Plus, Star, X } from "lucide-react";
import { useActionState, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { addFact, archiveFact } from "@/app/(app)/people/[id]/actions";
import {
  addMilestone,
  endPartnership,
  logDateNight,
  makePartner,
  removeMilestone,
  savePrompts,
  setLoveLanguages,
  updatePartnership,
  type FormState,
} from "@/app/(app)/people/[id]/partner/actions";
import { PartialDateFields } from "@/components/partial-date-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass, textareaClass } from "@/lib/forms";
import { cn } from "@/lib/utils";

function useResetOnSuccess(state: FormState) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state.ok]);
  return form;
}

function Status({ state, saved }: { state: FormState; saved?: string }) {
  if (state.error) return <p className="text-sm text-destructive">{state.error}</p>;
  if (saved && state.ok) return <p className="text-sm text-muted-foreground">{saved}</p>;
  return null;
}

function LabelInput({ defaultValue }: { defaultValue?: string }) {
  return (
    <>
      <Input name="label" list="partner-labels" defaultValue={defaultValue ?? "Partner"} required maxLength={50} aria-label="What you call them" />
      <datalist id="partner-labels">
        {partnerLabelSuggestions.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
    </>
  );
}

export function MakePartnerForm({ contactId, polyamorous }: { contactId: string; polyamorous: boolean }) {
  const [state, action, pending] = useActionState(makePartner.bind(null, contactId), {});
  return (
    <form action={action} className="grid max-w-md gap-3">
      <label className="grid gap-2 text-sm font-medium">
        What you call them
        <LabelInput />
      </label>
      {polyamorous && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isNesting" className="size-4 accent-foreground" />
          We live together (nesting partner)
        </label>
      )}
      <Status state={state} />
      <Button type="submit" className="justify-self-start" disabled={pending}>
        {pending ? "Saving…" : "Make partner"}
      </Button>
    </form>
  );
}

const cadenceOptions = [
  [0, "No goal"],
  [7, "Every week"],
  [14, "Every two weeks"],
  [30, "Every month"],
  [60, "Every two months"],
] as const;

export function PartnershipDetailsForm({
  contactId,
  label,
  isNesting,
  dateCadenceDays,
  agreements,
  polyamorous,
}: {
  contactId: string;
  label: string;
  isNesting: boolean;
  dateCadenceDays: number | null;
  agreements: string | null;
  polyamorous: boolean;
}) {
  const [state, action, pending] = useActionState(updatePartnership.bind(null, contactId), {});
  const cadence = dateCadenceDays ?? 0;
  const known = cadenceOptions.some(([d]) => d === cadence);
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          What you call them
          <LabelInput defaultValue={label} />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Time together, just the two of you
          <select name="dateCadenceDays" defaultValue={cadence} className={selectClass}>
            {!known && <option value={cadence}>Every {cadence} days</option>}
            {cadenceOptions.map(([d, l]) => (
              <option key={d} value={d}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      {(polyamorous || isNesting) && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isNesting" defaultChecked={isNesting} className="size-4 accent-foreground" />
          We live together (nesting partner)
        </label>
      )}
      {(polyamorous || agreements) && (
        <label className="grid gap-2 text-sm font-medium">
          Agreements
          <textarea
            name="agreements"
            rows={4}
            defaultValue={agreements ?? ""}
            placeholder="What you've agreed on together: time, overnights, telling each other about new people…"
            className={textareaClass}
          />
        </label>
      )}
      <Status state={state} saved="Saved" />
      <Button type="submit" size="sm" variant="outline" className="justify-self-start" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

/** Rank love languages. Ones not picked are left out. */
export function LoveLanguages({ contactId, ranked }: { contactId: string; ranked: string[] }) {
  const [pending, start] = useTransition();
  const [order, setOrder] = useOptimistic(ranked.filter((l): l is LoveLanguage => (loveLanguages as readonly string[]).includes(l)));
  const rest = loveLanguages.filter((l) => !order.includes(l));

  const save = (next: LoveLanguage[]) =>
    start(async () => {
      setOrder(next);
      await setLoveLanguages(contactId, next);
    });
  const move = (i: number, by: number) => {
    const next = [...order];
    const [item] = next.splice(i, 1);
    next.splice(i + by, 0, item!);
    save(next);
  };

  return (
    <div className="grid gap-3" aria-busy={pending}>
      {order.length > 0 ? (
        <ol className="grid gap-1.5">
          {order.map((l, i) => (
            <li key={l} className="flex items-center gap-3 rounded-2xl bg-secondary px-3.5 py-2.5 text-sm">
              <span className="type-display w-5 text-lg text-muted-foreground">{i + 1}</span>
              <span className="flex-1">{loveLanguageLabels[l]}</span>
              <IconButton label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp />
              </IconButton>
              <IconButton label="Move down" disabled={i === order.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown />
              </IconButton>
              <IconButton label="Remove" onClick={() => save(order.filter((x) => x !== l))}>
                <X />
              </IconButton>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">Add them in order, the one that matters most first.</p>
      )}
      {rest.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {rest.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => save([...order, l])}
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Plus className="size-3.5" />
              {loveLanguageLabels[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-full p-1 text-muted-foreground hover:bg-card hover:text-foreground disabled:opacity-30 [&_svg]:size-3.5"
    >
      {children}
    </button>
  );
}

export function PromptsForm({
  contactId,
  section,
  answers,
}: {
  contactId: string;
  section: PartnerPromptSection;
  answers: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(savePrompts.bind(null, contactId, section), {});
  const labels = partnerPrompts[section];
  const wide = section === "love";
  return (
    <form action={action} className="grid gap-4">
      <div className={cn("grid gap-3", !wide && "sm:grid-cols-2")}>
        {labels.map((label, i) => (
          <label key={label} className="grid gap-1.5 text-[13px] text-muted-foreground">
            {label}
            {wide ? (
              <textarea name={`p${i}`} rows={2} defaultValue={answers[label] ?? ""} maxLength={500} className={cn(textareaClass, "text-foreground")} />
            ) : (
              <Input name={`p${i}`} defaultValue={answers[label] ?? ""} maxLength={500} className="text-foreground" />
            )}
          </label>
        ))}
      </div>
      <Status state={state} saved="Saved" />
      <Button type="submit" size="sm" variant="outline" className="justify-self-start" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

/** A simple list of facts in one category, e.g. gift ideas or things to ask about. */
export function FactList({
  contactId,
  category,
  items,
  placeholder,
  empty,
}: {
  contactId: string;
  category: "wishlist" | "follow_up";
  items: { id: string; value: string }[];
  placeholder: string;
  empty: string;
}) {
  const [state, action, pending] = useActionState(addFact.bind(null, contactId), {});
  const [removing, startRemove] = useTransition();
  const form = useResetOnSuccess(state);
  return (
    <div className="grid gap-3">
      {items.length > 0 ? (
        <ul className="grid gap-1.5">
          {items.map((f) => (
            <li key={f.id} className="group flex items-start justify-between gap-2 text-sm">
              <span>{f.value}</span>
              <button
                type="button"
                aria-label="Remove"
                disabled={removing}
                onClick={() => startRemove(() => archiveFact(contactId, f.id))}
                className="shrink-0 rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
      <form ref={form} action={action} className="flex gap-2">
        <input type="hidden" name="category" value={category} />
        <input type="hidden" name="label" value={category === "wishlist" ? "Gift idea" : "Ask about"} />
        <Input name="value" placeholder={placeholder} required maxLength={500} />
        <Button type="submit" size="icon" variant="outline" aria-label="Add" disabled={pending}>
          <Plus />
        </Button>
      </form>
      <Status state={state} />
    </div>
  );
}

export function MilestoneForm({ contactId }: { contactId: string }) {
  const [state, action, pending] = useActionState(addMilestone.bind(null, contactId), {});
  const [kind, setKind] = useState<MilestoneKind>("official");
  const form = useResetOnSuccess(state);
  return (
    <form ref={form} action={action} className="grid gap-3 border-t border-border pt-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <select name="kind" aria-label="Milestone" value={kind} onChange={(e) => setKind(e.target.value as MilestoneKind)} className={selectClass}>
          {milestoneKinds.map((k) => (
            <option key={k} value={k}>
              {k === "custom" ? "Something else" : milestoneLabels[k]}
            </option>
          ))}
        </select>
        {kind === "custom" && <Input name="label" placeholder="e.g. First trip together" required maxLength={80} />}
      </div>
      <PartialDateFields prefix="date" label="Milestone" />
      {/* Keyed so the default follows the milestone type. */}
      <label key={kind} className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="anniversary" defaultChecked={defaultAnniversary[kind]} className="size-4 accent-foreground" />
        Remind me every year
      </label>
      <Status state={state} />
      <Button type="submit" size="sm" className="justify-self-start" disabled={pending}>
        {pending ? "Saving…" : "Add milestone"}
      </Button>
    </form>
  );
}

export function RemoveMilestoneButton({ contactId, milestoneId }: { contactId: string; milestoneId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label="Remove milestone"
      disabled={pending}
      onClick={() => start(() => removeMilestone(contactId, milestoneId))}
      className="shrink-0 rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
    >
      <X className="size-3.5" />
    </button>
  );
}

export function DateNightForm({ contactId, today }: { contactId: string; today: string }) {
  const [state, action, pending] = useActionState(logDateNight.bind(null, contactId), {});
  const form = useResetOnSuccess(state);
  return (
    <form ref={form} action={action} className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_2fr_1fr]">
        <Input name="date" type="date" aria-label="Date" defaultValue={today} max={today} required />
        <Input name="place" placeholder="Where" maxLength={200} />
        <Input name="cost" inputMode="decimal" placeholder="Cost (CAD)" aria-label="Cost in CAD" />
      </div>
      <textarea name="notes" rows={2} placeholder="What you did, what was good" maxLength={2000} className={textareaClass} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Keyed on the last save so the stars clear with the rest of the form. */}
        <Rating key={state.ok ?? 0} />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Log date"}
        </Button>
      </div>
      <Status state={state} />
    </form>
  );
}

function Rating() {
  const [rating, setRating] = useState(0);
  return (
    <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Rating">
      <input type="hidden" name="rating" value={rating} />
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={rating === n}
          aria-label={`${n} of 5`}
          onClick={() => setRating(rating === n ? 0 : n)}
          className="p-0.5 text-muted-foreground hover:text-foreground"
        >
          <Star className={cn("size-4", n <= rating && "fill-coral text-coral")} />
        </button>
      ))}
    </div>
  );
}

export function EndPartnershipForm({ contactId, firstName, today }: { contactId: string; firstName: string; today: string }) {
  const [state, action, pending] = useActionState(endPartnership.bind(null, contactId), {});
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="justify-self-start text-sm text-muted-foreground underline-offset-4 hover:underline">
        We broke up
      </button>
    );
  return (
    <form action={action} className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        {firstName} stays in your people with everything you&apos;ve saved. Anniversary reminders stop.
      </p>
      <div className="flex flex-wrap gap-2">
        <Input name="endedOn" type="date" defaultValue={today} max={today} aria-label="When it ended" className="w-auto" required />
        <Button type="submit" variant="destructive" disabled={pending}>
          End relationship
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <Status state={state} />
    </form>
  );
}
