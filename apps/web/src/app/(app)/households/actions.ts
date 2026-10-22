"use server";

import { and, eq, inArray, isNull, schema, type Tx } from "@life-crm/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createHousehold, joinHousehold, leaveHousehold } from "@/lib/data/households";
import { tenantQuery } from "@/lib/session";

const { contacts, households } = schema;
const uuid = z.uuid();

export interface HouseholdFormState {
  error?: string;
  ok?: number;
}

async function liveContacts(tx: Tx, ids: string[]) {
  const valid = ids.filter((id) => uuid.safeParse(id).success);
  if (valid.length === 0) return [];
  const rows = await tx.select({ id: contacts.id }).from(contacts).where(and(inArray(contacts.id, valid), isNull(contacts.deletedAt)));
  return rows.map((r) => r.id);
}

/** Row-level security hides other tenants' households, so this also checks ownership. */
async function ownHousehold(tx: Tx, id: string) {
  if (!uuid.safeParse(id).success) return false;
  const [row] = await tx.select({ id: households.id }).from(households).where(eq(households.id, id));
  return !!row;
}

function refresh(contactIds: string[] = []) {
  revalidatePath("/households");
  for (const id of contactIds) revalidatePath(`/people/${id}`);
}

export async function createHouseholdFrom(ids: string[]) {
  const id = await tenantQuery(async (tx, user) => {
    const live = await liveContacts(tx, ids);
    return live.length ? createHousehold(tx, user.tenantId, live) : null;
  });
  refresh(ids);
  return id;
}

/** From someone's page: start a household with just them and go fill it in. */
export async function startHouseholdWith(contactId: string) {
  const id = await createHouseholdFrom([contactId]);
  if (id) redirect(`/households/${id}`);
}

export async function joinHouseholdAction(contactId: string, householdId: string) {
  await tenantQuery(async (tx) => {
    if (!(await ownHousehold(tx, householdId)) || (await liveContacts(tx, [contactId])).length === 0) return;
    await joinHousehold(tx, contactId, householdId);
  });
  refresh([contactId]);
  revalidatePath(`/households/${householdId}`);
}

export async function leaveHouseholdAction(contactId: string, householdId?: string) {
  if (!uuid.safeParse(contactId).success) return;
  await tenantQuery((tx) => leaveHousehold(tx, contactId));
  refresh([contactId]);
  if (householdId) revalidatePath(`/households/${householdId}`);
}

export async function addHouseholdMembers(householdId: string, _prev: HouseholdFormState, form: FormData): Promise<HouseholdFormState> {
  const ids = form.getAll("people").map(String);
  if (ids.length === 0) return { error: "Pick someone first" };
  await tenantQuery(async (tx) => {
    if (!(await ownHousehold(tx, householdId))) return;
    for (const id of await liveContacts(tx, ids)) await joinHousehold(tx, id, householdId);
  });
  refresh(ids);
  revalidatePath(`/households/${householdId}`);
  return { ok: Date.now() };
}

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const householdSchema = z.object({
  name: text(200),
  street: text(200),
  line2: text(200),
  city: text(100),
  region: text(100),
  postalCode: text(20),
  country: text(100),
  notes: text(2000),
  sendCard: z.boolean(),
});

export async function updateHousehold(id: string, _prev: HouseholdFormState, form: FormData): Promise<HouseholdFormState> {
  const field = (n: string) => String(form.get(n) ?? "");
  const parsed = householdSchema.safeParse({
    name: field("name"),
    street: field("street"),
    line2: field("line2"),
    city: field("city"),
    region: field("region"),
    postalCode: field("postalCode"),
    country: field("country"),
    notes: field("notes"),
    sendCard: form.get("sendCard") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const done = await tenantQuery(async (tx) => {
    if (!(await ownHousehold(tx, id))) return false;
    await tx.update(households).set(parsed.data).where(eq(households.id, id));
    return true;
  });
  if (!done) return { error: "Household not found" };
  refresh();
  revalidatePath(`/households/${id}`);
  return { ok: Date.now() };
}

export async function setSendCard(id: string, sendCard: boolean) {
  await tenantQuery(async (tx) => {
    if (await ownHousehold(tx, id)) await tx.update(households).set({ sendCard }).where(eq(households.id, id));
  });
  refresh();
}

/** Break up a household; the people stay, they just aren't grouped anymore. */
export async function deleteHousehold(id: string) {
  await tenantQuery(async (tx) => {
    if (!(await ownHousehold(tx, id))) return;
    await tx.update(contacts).set({ householdId: null }).where(eq(contacts.householdId, id));
    await tx.delete(households).where(eq(households.id, id));
  });
  refresh();
  redirect("/households");
}

export async function newHousehold(_prev: HouseholdFormState, form: FormData): Promise<HouseholdFormState> {
  const ids = form.getAll("people").map(String);
  if (ids.length === 0) return { error: "Pick who lives there" };
  const id = await createHouseholdFrom(ids);
  if (!id) return { error: "Those people weren't found" };
  redirect(`/households/${id}`);
}
