"use server";

import { AiError, type CardExtraction } from "@life-crm/ai";
import { normalizeMethod } from "@life-crm/core";
import { emptyCard, type Card } from "@life-crm/dav";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cardReaderForUser } from "@/lib/ai";
import { createFromCard, mergeCard } from "@/lib/data/cards";
import { contactsWithMethods } from "@/lib/data/contact-info";
import { contactInTenant } from "@/lib/data/family";
import { fullName } from "@/lib/data/contacts";
import { tenantQuery } from "@/lib/session";
import { schema, eq } from "@life-crm/db";

const MAX_IMAGE = 6 * 1024 * 1024;

export interface ReadResult {
  card?: CardExtraction;
  match?: { id: string; name: string } | null;
  error?: string;
}

/** Read one card, front and optionally back, and say if we already know this person. */
export async function readCard(form: FormData): Promise<ReadResult> {
  const files = form.getAll("image").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 2);
  if (files.length === 0) return { error: "Add a photo of the card" };
  for (const f of files) {
    if (!f.type.startsWith("image/")) return { error: "That isn't an image" };
    if (f.size > MAX_IMAGE) return { error: "That photo is too big. Try a smaller one." };
  }
  const images = await Promise.all(files.map(async (f) => ({ data: new Uint8Array(await f.arrayBuffer()), mimeType: f.type })));

  return tenantQuery(async (tx, user) => {
    let card: CardExtraction;
    try {
      card = await (await cardReaderForUser(tx, user.id)).read(images);
    } catch (err) {
      if (!(err instanceof AiError)) console.error("card read failed", err);
      return { error: err instanceof AiError ? err.message : "Couldn't read the card" };
    }
    // Phones and emails we already have point at an existing person.
    const methods = [
      ...card.phones.filter((p) => p.label !== "fax").map((p) => ({ kind: "phone" as const, raw: p.value })),
      ...card.emails.map((e) => ({ kind: "email" as const, raw: e })),
    ].flatMap((m) => {
      try {
        return [{ kind: m.kind, value: normalizeMethod(m.kind, "other", m.raw).value }];
      } catch {
        return [];
      }
    });
    const hits = await contactsWithMethods(tx, methods);
    const id = [...hits.values()][0];
    let match = null;
    if (id) {
      const [c] = await tx.select().from(schema.contacts).where(eq(schema.contacts.id, id));
      if (c && !c.deletedAt) match = { id, name: fullName(c) };
    }
    return { card, match };
  });
}

const list = (v: FormDataEntryValue[]) => v.map((x) => String(x).trim()).filter(Boolean).slice(0, 10);
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const saveSchema = z.object({
  firstName: z.string().trim().min(1, "Add a first name").max(100),
  lastName: text(100),
  jobTitle: text(200),
  company: text(200),
  street: text(200),
  city: text(200),
  region: text(200),
  postalCode: text(20),
  country: text(200),
  howMet: text(2000),
  other: text(2000),
});

/** Save the reviewed card as a new person, or into the person it matched. */
export async function saveCard(form: FormData): Promise<{ error?: string }> {
  const parsed = saveSchema.safeParse(Object.fromEntries(["firstName", "lastName", "jobTitle", "company", "street", "city", "region", "postalCode", "country", "howMet", "other"].map((k) => [k, form.get(k) ?? ""])));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const mergeInto = String(form.get("mergeInto") ?? "");
  const card: Card = {
    ...emptyCard(),
    firstName: d.firstName,
    lastName: d.lastName,
    jobTitle: d.jobTitle,
    company: d.company,
    phones: list(form.getAll("phone")).map((value, i) => ({ label: String(form.getAll("phoneLabel")[i] ?? "work"), value })),
    emails: list(form.getAll("email")).map((value) => ({ label: "work", value })),
    urls: list(form.getAll("website")).map((value) => ({ label: "website", value })),
    socials: list(form.getAll("social")).map((v) => {
      const [service, ...handle] = v.split(":");
      return { service: service!, value: handle.join(":") };
    }),
    addresses: d.street || d.city ? [{ label: "work", street: d.street, line2: null, city: d.city, region: d.region, postalCode: d.postalCode, country: d.country }] : [],
    note: d.other,
  };

  const id = await tenantQuery(async (tx, user) => {
    if (mergeInto && (await contactInTenant(tx, mergeInto))) {
      await mergeCard(tx, user.tenantId, mergeInto, card, "business card");
      return mergeInto;
    }
    const id = await createFromCard(tx, user.tenantId, card, { source: "business card" });
    if (d.howMet) await tx.update(schema.contacts).set({ howMet: d.howMet }).where(eq(schema.contacts.id, id));
    return id;
  });
  revalidatePath("/people");
  redirect(`/people/${id}`);
}
