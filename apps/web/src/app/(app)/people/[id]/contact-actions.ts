"use server";

import { ContactInfoError, contactMethodKinds } from "@life-crm/core";
import { and, eq, schema } from "@life-crm/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addAddress as insertAddress, addMethods } from "@/lib/data/contact-info";
import { contactInTenant, householdOf } from "@/lib/data/family";
import { tenantQuery } from "@/lib/session";

export interface ContactFormState {
  error?: string;
  ok?: number;
  message?: string;
}

const { addresses, contactMethods, contacts } = schema;
const uuid = z.uuid();

const methodSchema = z.object({
  kind: z.enum(contactMethodKinds),
  label: z.string().trim().max(40),
  value: z.string().trim().min(1, "Add a value").max(300),
});

export async function addContactMethod(contactId: string, _prev: ContactFormState, form: FormData): Promise<ContactFormState> {
  if (!uuid.safeParse(contactId).success) return { error: "Person not found" };
  const parsed = methodSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    const added = await tenantQuery(async (tx, user) => {
      if (!(await contactInTenant(tx, contactId))) return -1;
      return addMethods(tx, user.tenantId, contactId, [parsed.data]);
    });
    if (added === -1) return { error: "Person not found" };
    if (added === 0) return { error: "Already there" };
  } catch (err) {
    if (err instanceof ContactInfoError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/people/${contactId}`);
  return { ok: Date.now() };
}

export async function removeContactMethod(contactId: string, methodId: string) {
  if (!uuid.safeParse(methodId).success) return;
  await tenantQuery(async (tx) => {
    const [gone] = await tx
      .delete(contactMethods)
      .where(and(eq(contactMethods.id, methodId), eq(contactMethods.contactId, contactId)))
      .returning();
    // Keep a primary phone and email when there's another to promote.
    if (gone?.isPrimary) {
      const [next] = await tx
        .select({ id: contactMethods.id })
        .from(contactMethods)
        .where(and(eq(contactMethods.contactId, contactId), eq(contactMethods.kind, gone.kind)))
        .limit(1);
      if (next) await tx.update(contactMethods).set({ isPrimary: true }).where(eq(contactMethods.id, next.id));
    }
  });
  revalidatePath(`/people/${contactId}`);
}

export async function makePrimary(contactId: string, methodId: string) {
  if (!uuid.safeParse(methodId).success) return;
  await tenantQuery(async (tx) => {
    const [m] = await tx
      .select()
      .from(contactMethods)
      .where(and(eq(contactMethods.id, methodId), eq(contactMethods.contactId, contactId)));
    if (!m) return;
    await tx
      .update(contactMethods)
      .set({ isPrimary: false })
      .where(and(eq(contactMethods.contactId, contactId), eq(contactMethods.kind, m.kind)));
    await tx.update(contactMethods).set({ isPrimary: true }).where(eq(contactMethods.id, methodId));
  });
  revalidatePath(`/people/${contactId}`);
}

const field = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => v ?? "");

const addressSchema = z.object({
  label: z.string().trim().max(40).optional(),
  street: field,
  line2: field,
  city: field,
  region: field,
  postalCode: field,
  country: field,
});

export async function addContactAddress(contactId: string, _prev: ContactFormState, form: FormData): Promise<ContactFormState> {
  if (!uuid.safeParse(contactId).success) return { error: "Person not found" };
  const parsed = addressSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Something in that address is too long" };
  const alsoFor = form.getAll("alsoFor").map(String);
  const result = await tenantQuery(async (tx, user) => {
    if (!(await contactInTenant(tx, contactId))) return null;
    if (!(await insertAddress(tx, user.tenantId, contactId, parsed.data))) return false;
    // Only people who are actually in their household, whatever the form sent.
    const household = (await householdOf(tx, contactId)).filter((m) => alsoFor.includes(m.id));
    for (const m of household) await insertAddress(tx, user.tenantId, m.id, parsed.data);
    return household;
  });
  if (result === null) return { error: "Person not found" };
  if (!result) return { error: "Add at least a city, or it's already there" };
  revalidatePath(`/people/${contactId}`);
  for (const m of result) revalidatePath(`/people/${m.id}`);
  return { ok: Date.now(), message: result.length ? `Also added for ${result.map((m) => m.name).join(", ")}.` : undefined };
}

export async function removeContactAddress(contactId: string, addressId: string) {
  if (!uuid.safeParse(addressId).success) return;
  await tenantQuery((tx) => tx.delete(addresses).where(and(eq(addresses.id, addressId), eq(addresses.contactId, contactId))));
  revalidatePath(`/people/${contactId}`);
}

export async function updateWork(contactId: string, _prev: ContactFormState, form: FormData): Promise<ContactFormState> {
  if (!uuid.safeParse(contactId).success) return { error: "Person not found" };
  const parsed = z.object({ company: field, jobTitle: field }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "That's too long" };
  await tenantQuery((tx) =>
    tx
      .update(contacts)
      .set({ company: parsed.data.company || null, jobTitle: parsed.data.jobTitle || null })
      .where(eq(contacts.id, contactId)),
  );
  revalidatePath(`/people/${contactId}`);
  return { ok: Date.now() };
}
