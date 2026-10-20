"use server";

import {
  partneredStatuses,
  relationshipStatuses,
  roleFromLabel,
  type ClosenessTier,
  type MilestoneKind,
  type PartialDate,
} from "@life-crm/core";
import { eq, schema } from "@life-crm/db";
import { redirect } from "next/navigation";
import { z } from "zod";
import { insertContact } from "@/lib/data/contacts";
import { connectRelative, ensureSelf } from "@/lib/data/family";
import { addMilestone, createPartnership, monogamyConflict, userPrefs } from "@/lib/data/partners";
import { db } from "@/lib/db";
import { dateProblemText, partialDateFrom, personName } from "@/lib/forms";
import { requireUser, tenantQuery } from "@/lib/session";
import { nextStep, type Step } from "./steps";

export interface StepState {
  error?: string;
}

const { user } = schema;

function go(from: Step, opts: { partnered?: boolean } = {}): never {
  redirect(`/onboarding?step=${nextStep(from, opts)}`);
}

const name = (max: number) => z.string().trim().max(max);

export async function saveYou(_prev: StepState, form: FormData): Promise<StepState> {
  const parsed = z
    .object({
      name: personName(100).min(1, "Add your name"),
      timeZone: z.string().refine((tz) => tz === "UTC" || Intl.supportedValuesOf("timeZone").includes(tz), "Unknown time zone"),
    })
    .safeParse({ name: form.get("name"), timeZone: form.get("timeZone") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const me = await requireUser();
  await db.update(user).set(parsed.data).where(eq(user.id, me.id));
  go("you");
}

export async function saveRelationship(_prev: StepState, form: FormData): Promise<StepState> {
  const status = z.enum(relationshipStatuses).safeParse(form.get("status"));
  if (!status.success) return { error: "Pick one, or prefer not to say" };
  const partnered = partneredStatuses.includes(status.data);
  const me = await requireUser();
  await db
    .update(user)
    .set({
      relationshipStatus: status.data,
      relationshipStyle: partnered && form.get("polyamorous") === "on" ? "polyamorous" : "monogamous",
    })
    .where(eq(user.id, me.id));
  go("relationship", { partnered });
}

export async function savePartner(_prev: StepState, form: FormData): Promise<StepState> {
  const parsed = z
    .object({
      firstName: personName(100).min(1, "Add their first name"),
      lastName: personName(100).transform((v) => v || null),
      label: name(50).min(1, "Add what you call them"),
    })
    .safeParse({ firstName: form.get("firstName"), lastName: form.get("lastName") ?? "", label: form.get("label") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const dates: Record<string, PartialDate | null> = {};
  for (const [prefix, label] of [
    ["birthday", "Their birthday"],
    ["official", "When you got together"],
    ["married", "Your wedding date"],
  ] as const) {
    const d = partialDateFrom(form, prefix);
    if (typeof d === "string") return { error: dateProblemText(label, d) };
    dates[prefix] = d;
  }

  const error = await tenantQuery(async (tx, me) => {
    const prefs = await userPrefs(tx, me.id);
    // A brand new contact, so any existing current partner counts.
    const conflict = await monogamyConflict(tx, prefs.relationshipStyle, "");
    if (conflict) return conflict;
    const contactId = await insertContact(tx, me.tenantId, {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      closeness: "inner",
      relationship: parsed.data.label,
      birthday: dates.birthday,
    });
    const partnershipId = await createPartnership(tx, me.tenantId, contactId, {
      label: parsed.data.label,
      isNesting: form.get("isNesting") === "on",
    });
    for (const kind of ["official", "married"] as MilestoneKind[]) {
      const date = dates[kind];
      if (date) await addMilestone(tx, { tenantId: me.tenantId, partnershipId, contactId }, { kind, label: null, date });
    }
    return null;
  });
  if (error) return { error };

  // Polyamorous users can add more than one before moving on.
  if (form.get("another") === "1") redirect("/onboarding?step=partners");
  go("partners");
}

const familyRow = z.object({
  relationship: name(50),
  firstName: personName(100),
  lastName: personName(100),
});

/** Rows named like `rows.0.firstName`, `rows.0.birthdayMonth`. Empty rows are skipped. */
function readRows(form: FormData, count: number) {
  return Array.from({ length: count }, (_, i) => i).map((i) => ({
    index: i,
    get: (field: string) => String(form.get(`rows.${i}.${field}`) ?? ""),
  }));
}

export async function saveFamily(_prev: StepState, form: FormData): Promise<StepState> {
  const count = Math.min(Number(form.get("rowCount")) || 0, 30);
  const people: { relationship: string | null; firstName: string; lastName: string | null; birthday: PartialDate | null }[] = [];
  for (const row of readRows(form, count)) {
    const parsed = familyRow.safeParse({ relationship: row.get("relationship"), firstName: row.get("firstName"), lastName: row.get("lastName") });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message };
    const birthday = partialDateFrom(form, `rows.${row.index}.birthday`);
    if (!parsed.data.firstName) {
      if (!parsed.data.relationship && !parsed.data.lastName && !birthday) continue;
      return { error: parsed.data.relationship ? `Add your ${parsed.data.relationship.toLowerCase()}'s first name` : "Add a first name for everyone you filled in" };
    }
    if (typeof birthday === "string") return { error: dateProblemText(`${parsed.data.firstName}'s birthday`, birthday) };
    people.push({
      relationship: parsed.data.relationship || null,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName || null,
      birthday,
    });
  }
  if (people.length) {
    await tenantQuery(async (tx, me) => {
      const selfId = await ensureSelf(tx, me);
      // Parents first, so siblings land in the same family as you.
      const placed = people
        .map((p) => ({ ...p, role: roleFromLabel(p.relationship) }))
        .sort((a, b) => Number(a.role?.role !== "parent") - Number(b.role?.role !== "parent"));
      for (const { role, ...p } of placed) {
        const id = await insertContact(tx, me.tenantId, {
          ...p,
          closeness: "inner",
          pronouns: role?.gender === "female" ? "she/her" : role?.gender === "male" ? "he/him" : null,
        });
        // "Mom", "Brother", "Son" go straight into the family tree; anything else waits to be placed.
        if (role && role.role !== "partner") await connectRelative(tx, me.tenantId, { anchorId: selfId, personId: id, role: role.role, kind: role.kind });
      }
    });
  }
  go("family");
}

const cadenceTier: Record<number, ClosenessTier> = { 7: "inner", 14: "inner", 30: "close", 90: "friend" };

export async function savePeople(_prev: StepState, form: FormData): Promise<StepState> {
  const people: { firstName: string; lastName: string | null; cadence: number }[] = [];
  for (const row of readRows(form, 5)) {
    const full = row.get("name").trim();
    if (!full) continue;
    const valid = personName(200).safeParse(full);
    if (!valid.success) return { error: valid.error.issues[0]?.message };
    const [firstName, ...rest] = full.split(/\s+/);
    const cadence = Number(row.get("cadence"));
    if (!(cadence in cadenceTier)) return { error: "Pick how often for each person" };
    people.push({ firstName: firstName!, lastName: rest.join(" ") || null, cadence });
  }
  if (people.length) {
    await tenantQuery(async (tx, me) => {
      for (const p of people)
        await insertContact(tx, me.tenantId, {
          firstName: p.firstName,
          lastName: p.lastName,
          closeness: cadenceTier[p.cadence]!,
          keepInTouchDays: p.cadence,
        });
    });
  }
  go("people");
}

export async function finishOnboarding(_prev: StepState, form: FormData): Promise<StepState> {
  const hour = z.coerce.number().int().min(0).max(23).safeParse(form.get("digestHour"));
  if (!hour.success) return { error: "Pick a time" };
  const me = await requireUser();
  await db
    .update(user)
    .set({ digestHour: hour.data, emailDigest: form.get("emailDigest") === "on", onboardedAt: new Date() })
    .where(eq(user.id, me.id));
  redirect("/dashboard");
}

export async function skipOnboarding() {
  const me = await requireUser();
  await db.update(user).set({ onboardedAt: new Date() }).where(eq(user.id, me.id));
  redirect("/dashboard");
}
