"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useTransition } from "react";
import {
  addHouseholdMembers,
  createHouseholdFrom,
  deleteHousehold,
  leaveHouseholdAction,
  newHousehold,
  setSendCard,
  updateHousehold,
  type HouseholdFormState,
} from "@/app/(app)/households/actions";
import { Avatar } from "@/components/avatar";
import { PeoplePicker, type PickerPerson } from "@/components/people-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { avatarSrc } from "@/lib/immich-urls";
import { textareaClass } from "@/lib/forms";
import { submitKeepingValues } from "@/lib/submit";

export function SendCardToggle({ id, sendCard }: { id: string; sendCard: boolean }) {
  const [busy, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <input type="checkbox" checked={sendCard} disabled={busy} onChange={(e) => start(() => setSendCard(id, e.target.checked))} className="size-4 accent-foreground" />
      Holiday card
    </label>
  );
}

export function MakeHouseholdButton({ ids }: { ids: string[] }) {
  const [busy, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={() =>
        start(async () => {
          await createHouseholdFrom(ids);
          router.refresh();
        })
      }
    >
      {busy ? "Making…" : "Make household"}
    </Button>
  );
}

export function NewHouseholdForm({ people }: { people: PickerPerson[] }) {
  const [state, action, pending] = useActionState<HouseholdFormState, FormData>(newHousehold, {});
  return (
    <form onSubmit={submitKeepingValues(action)} className="grid gap-3">
      <PeoplePicker people={people} legend="Who lives there" />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create household"}
      </Button>
    </form>
  );
}

export function MemberList({ householdId, members }: { householdId: string; members: { id: string; name: string; avatarRef: string | null; isChild: boolean }[] }) {
  const [busy, start] = useTransition();
  return (
    <ul className="grid gap-2">
      {members.map((m) => (
        <li key={m.id} className="group flex items-center gap-3">
          <Avatar id={m.id} name={m.name} src={avatarSrc(m.avatarRef)} size={34} />
          <Link href={`/people/${m.id}`} className="flex-1 text-sm hover:underline">
            {m.name}
            {m.isChild && <span className="text-muted-foreground"> · kid</span>}
          </Link>
          <button
            type="button"
            aria-label={`${m.name} doesn't live here`}
            disabled={busy}
            onClick={() => start(() => leaveHouseholdAction(m.id, householdId))}
            className="rounded-full p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
          >
            <X className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function AddMembersForm({ householdId, people }: { householdId: string; people: PickerPerson[] }) {
  const [state, action, pending] = useActionState<HouseholdFormState, FormData>(addHouseholdMembers.bind(null, householdId), {});
  return (
    <form key={state.ok} onSubmit={submitKeepingValues(action)} className="grid gap-3">
      <PeoplePicker people={people} legend="Add who else lives here" />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </Button>
    </form>
  );
}

interface HouseholdValues {
  name: string | null;
  label: string;
  street: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  notes: string | null;
  sendCard: boolean;
}

export function HouseholdForm({ id, values }: { id: string; values: HouseholdValues }) {
  const [state, action, pending] = useActionState<HouseholdFormState, FormData>(updateHousehold.bind(null, id), {});
  const [deleting, startDelete] = useTransition();
  const field = (name: keyof HouseholdValues, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <label className="grid gap-1.5 text-[13px] text-muted-foreground">
      {label}
      <Input name={name} defaultValue={(values[name] as string | null) ?? ""} {...props} />
    </label>
  );
  return (
    <form onSubmit={submitKeepingValues(action)} className="grid gap-4">
      {field("name", "Name on the card", { placeholder: values.label, maxLength: 200 })}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">{field("street", "Street")}</div>
        <div className="sm:col-span-2">{field("line2", "Apt, unit")}</div>
        {field("city", "City")}
        {field("region", "Province or state")}
        {field("postalCode", "Postal code")}
        {field("country", "Country")}
      </div>
      <label className="grid gap-1.5 text-[13px] text-muted-foreground">
        Notes
        <textarea name="notes" defaultValue={values.notes ?? ""} rows={3} maxLength={2000} placeholder="Buzzer 204, dog doesn't like the doorbell" className={textareaClass} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="sendCard" defaultChecked={values.sendCard} className="size-4 accent-foreground" />
        On the holiday card list
      </label>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && !pending && <p className="text-sm text-muted-foreground">Saved</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={deleting}
          onClick={() => {
            if (confirm("Break up this household? The people stay, they just aren't grouped anymore.")) startDelete(() => deleteHousehold(id));
          }}
        >
          Break up household
        </Button>
      </div>
    </form>
  );
}
