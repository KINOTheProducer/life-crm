"use client";

import { contactMethodKinds, contactMethodLabels, type ContactMethodKind } from "@life-crm/core";
import { AtSign, Globe, Mail, MapPin, MessageCircle, Phone, Plus, Star, X, type LucideIcon } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  addContactAddress,
  addContactMethod,
  makePrimary,
  removeContactAddress,
  removeContactMethod,
  updateWork,
  type ContactFormState,
} from "@/app/(app)/people/[id]/contact-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContactInfo } from "@/lib/data/contact-info";
import { selectClass } from "@/lib/forms";
import { submitKeepingValues } from "@/lib/submit";
import { cn } from "@/lib/utils";

const icons: Record<ContactMethodKind, LucideIcon> = { phone: Phone, email: Mail, social: AtSign, website: Globe, messaging: MessageCircle };
const kindNames: Record<ContactMethodKind, string> = { phone: "Phone", email: "Email", social: "Social", website: "Website", messaging: "Messaging" };
const labelName = (l: string) => (l === "x" ? "X" : l === "linkedin" ? "LinkedIn" : l === "tiktok" ? "TikTok" : l === "github" ? "GitHub" : l.charAt(0).toUpperCase() + l.slice(1));

function useReset(state: ContactFormState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);
  return ref;
}

export function ContactCard({
  contactId,
  info,
  company,
  jobTitle,
}: {
  contactId: string;
  info: ContactInfo;
  company: string | null;
  jobTitle: string | null;
}) {
  const [adding, setAdding] = useState<"method" | "address" | "work" | null>(null);
  const [kind, setKind] = useState<ContactMethodKind>("phone");
  const [pending, start] = useTransition();
  const [methodState, methodAction, methodPending] = useActionState(addContactMethod.bind(null, contactId), {});
  // Saving an address or work details closes its form.
  const closing = (fn: (id: string, prev: ContactFormState, form: FormData) => Promise<ContactFormState>) => async (prev: ContactFormState, form: FormData) => {
    const next = await fn(contactId, prev, form);
    if (next.ok) setAdding(null);
    return next;
  };
  const [addrState, addrAction, addrPending] = useActionState(closing(addContactAddress), {});
  const [workState, workAction, workPending] = useActionState(closing(updateWork), {});
  const methodForm = useReset(methodState);

  const empty = info.methods.length === 0 && info.addresses.length === 0 && !company && !jobTitle;

  return (
    <div className="grid gap-4 text-sm">
      {empty && !adding && <p className="text-muted-foreground">No phone, email or address yet.</p>}

      {(company || jobTitle) && adding !== "work" && (
        <button type="button" onClick={() => setAdding("work")} className="text-left hover:underline">
          {[jobTitle, company].filter(Boolean).join(" at ")}
        </button>
      )}

      {info.methods.length > 0 && (
        <ul className="grid gap-1.5">
          {info.methods.map((m) => {
            const Icon = icons[m.kind];
            return (
              <li key={m.id} className="group flex items-center gap-2.5">
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {m.href ? (
                    <a href={m.href} target={m.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="hover:underline">
                      {m.display}
                    </a>
                  ) : (
                    m.display
                  )}
                  <span className="ml-1.5 text-[12px] text-muted-foreground">{labelName(m.label)}</span>
                </span>
                {(m.kind === "phone" || m.kind === "email") &&
                  (m.isPrimary ? (
                    <Star className="size-3.5 fill-current text-muted-foreground" aria-label="Main" />
                  ) : (
                    <button
                      type="button"
                      title="Make main"
                      aria-label={`Make ${m.display} the main ${m.kind}`}
                      disabled={pending}
                      onClick={() => start(() => makePrimary(contactId, m.id))}
                      className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
                    >
                      <Star className="size-3.5" />
                    </button>
                  ))}
                <button
                  type="button"
                  aria-label={`Remove ${m.display}`}
                  disabled={pending}
                  onClick={() => start(() => removeContactMethod(contactId, m.id))}
                  className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {info.addresses.length > 0 && (
        <ul className="grid gap-2">
          {info.addresses.map((a) => (
            <li key={a.id} className="group flex items-start gap-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <a
                href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(a.oneLine)}`}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 whitespace-pre-line hover:underline"
              >
                {a.lines}
                <span className="ml-1.5 text-[12px] text-muted-foreground">{labelName(a.label)}</span>
              </a>
              <button
                type="button"
                aria-label="Remove address"
                disabled={pending}
                onClick={() => start(() => removeContactAddress(contactId, a.id))}
                className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding === "method" && (
        <form ref={methodForm} onSubmit={submitKeepingValues(methodAction)} className="grid gap-2 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-2">
            <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as ContactMethodKind)} aria-label="Type" className={selectClass}>
              {contactMethodKinds.map((k) => (
                <option key={k} value={k}>
                  {kindNames[k]}
                </option>
              ))}
            </select>
            <select key={kind} name="label" aria-label="Label" defaultValue={contactMethodLabels[kind][0]} className={selectClass}>
              {contactMethodLabels[kind].map((l) => (
                <option key={l} value={l}>
                  {labelName(l)}
                </option>
              ))}
            </select>
          </div>
          <Input
            name="value"
            required
            maxLength={300}
            autoFocus
            inputMode={kind === "phone" || kind === "messaging" ? "tel" : kind === "email" ? "email" : "text"}
            placeholder={kind === "phone" ? "416 555 0123" : kind === "email" ? "name@example.com" : kind === "social" ? "@handle or link" : kind === "website" ? "example.com" : "Number or username"}
            aria-label="Value"
          />
          {methodState.error && <p className="text-destructive">{methodState.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={methodPending}>
              Add
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(null)}>
              Done
            </Button>
          </div>
        </form>
      )}

      {adding === "address" && (
        <form onSubmit={submitKeepingValues(addrAction)} className="grid gap-2 border-t border-border pt-4">
          <select name="label" aria-label="Label" defaultValue="home" className={selectClass}>
            {["home", "work", "cottage", "other"].map((l) => (
              <option key={l} value={l}>
                {labelName(l)}
              </option>
            ))}
          </select>
          <Input name="street" placeholder="Street" aria-label="Street" maxLength={200} autoComplete="off" autoFocus />
          <Input name="line2" placeholder="Apt, unit (optional)" aria-label="Apartment or unit" maxLength={200} autoComplete="off" />
          <div className="grid grid-cols-2 gap-2">
            <Input name="city" placeholder="City" aria-label="City" maxLength={200} autoComplete="off" />
            <Input name="region" placeholder="Province or state" aria-label="Province or state" maxLength={200} autoComplete="off" />
            <Input name="postalCode" placeholder="Postal code" aria-label="Postal code" maxLength={20} autoComplete="off" />
            <Input name="country" placeholder="Country" aria-label="Country" defaultValue="Canada" maxLength={200} autoComplete="off" />
          </div>
          {addrState.error && <p className="text-destructive">{addrState.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={addrPending}>
              Save address
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {adding === "work" && (
        <form onSubmit={submitKeepingValues(workAction)} className="grid gap-2 border-t border-border pt-4">
          <Input name="jobTitle" placeholder="Job title" aria-label="Job title" defaultValue={jobTitle ?? ""} maxLength={200} autoFocus />
          <Input name="company" placeholder="Company" aria-label="Company" defaultValue={company ?? ""} maxLength={200} />
          {workState.error && <p className="text-destructive">{workState.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={workPending}>
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {!adding && (
        <div className="flex flex-wrap gap-1.5">
          {[
            ["method", "Phone, email…"],
            ["address", "Address"],
            ...(company || jobTitle ? [] : [["work", "Work"]]),
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setAdding(key as "method" | "address" | "work")}
              className={cn("inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground")}
            >
              <Plus className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
