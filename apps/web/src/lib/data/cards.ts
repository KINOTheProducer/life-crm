import "server-only";
import { emptyCard, type Card } from "@life-crm/dav";
import { and, eq, inArray, schema, type Tx } from "@life-crm/db";
import { addAddress, addMethods, type MethodInput } from "./contact-info";
import { insertContact } from "./contacts";
import { recordTimeline } from "./timeline";

const { addresses, contactMethods, contacts, importantDates, notes } = schema;

/** Contacts as vCard-shaped data, for export and CardDAV. */
export async function cardsFor(tx: Tx, contactIds: string[]) {
  if (contactIds.length === 0) return new Map<string, Card & { uid: string; rev: Date }>();
  const people = await tx.select().from(contacts).where(inArray(contacts.id, contactIds));
  const methods = await tx.select().from(contactMethods).where(inArray(contactMethods.contactId, contactIds));
  const places = await tx.select().from(addresses).where(inArray(addresses.contactId, contactIds));
  const birthdays = await tx
    .select()
    .from(importantDates)
    .where(and(inArray(importantDates.contactId, contactIds), eq(importantDates.type, "birthday")));

  const out = new Map<string, Card & { uid: string; rev: Date }>();
  for (const c of people) {
    const mine = methods.filter((m) => m.contactId === c.id).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
    const b = birthdays.find((d) => d.contactId === c.id);
    const card: Card & { uid: string; rev: Date } = {
      ...emptyCard(),
      uid: c.davUid ?? c.id,
      rev: c.updatedAt,
      firstName: c.firstName,
      lastName: c.lastName,
      nickname: c.nickname,
      company: c.company,
      jobTitle: c.jobTitle,
      birthday: b ? { year: b.year, month: b.month, day: b.day } : null,
      phones: mine.filter((m) => m.kind === "phone").map((m) => ({ label: m.label, value: m.value })),
      emails: mine.filter((m) => m.kind === "email").map((m) => ({ label: m.label, value: m.value })),
      urls: mine.filter((m) => m.kind === "website").map((m) => ({ label: m.label, value: m.value })),
      socials: mine.filter((m) => m.kind === "social").map((m) => ({ service: m.label, value: m.value })),
      addresses: places
        .filter((a) => a.contactId === c.id)
        .map((a) => ({ label: a.label, street: a.street, line2: a.line2, city: a.city, region: a.region, postalCode: a.postalCode, country: a.country })),
    };
    out.set(c.id, card);
  }
  return out;
}

function methodsOf(card: Card): MethodInput[] {
  return [
    ...card.phones.map((p) => ({ kind: "phone" as const, label: p.label, value: p.value })),
    ...card.emails.map((e) => ({ kind: "email" as const, label: e.label, value: e.value })),
    ...card.urls.map((u) => ({ kind: "website" as const, label: "website", value: u.value })),
    ...card.socials.map((s) => ({ kind: "social" as const, label: s.service, value: s.value })),
  ];
}

async function setBirthday(tx: Tx, tenantId: string, contactId: string, birthday: Card["birthday"], overwrite: boolean) {
  const [existing] = await tx
    .select()
    .from(importantDates)
    .where(and(eq(importantDates.contactId, contactId), eq(importantDates.type, "birthday")));
  if (existing && !overwrite) return;
  if (!birthday) {
    if (existing && overwrite) await tx.delete(importantDates).where(eq(importantDates.id, existing.id));
    return;
  }
  if (existing) await tx.update(importantDates).set({ year: birthday.year ?? null, month: birthday.month, day: birthday.day }).where(eq(importantDates.id, existing.id));
  else await tx.insert(importantDates).values({ tenantId, contactId, type: "birthday", year: birthday.year ?? null, month: birthday.month, day: birthday.day });
}

/** A new person from a card (import, card scan, or a contact created on a phone over CardDAV). */
export async function createFromCard(tx: Tx, tenantId: string, card: Card, options: { source: string; davUid?: string | null }) {
  const id = await insertContact(tx, tenantId, {
    firstName: card.firstName.slice(0, 100),
    lastName: card.lastName?.slice(0, 100) ?? null,
    nickname: card.nickname?.slice(0, 100) ?? null,
    // Imported address books are big; no catch-up nudges until you pick someone's cadence.
    closeness: "acquaintance",
    keepInTouchDays: null,
    howMet: null,
    birthday: card.birthday,
  });
  await tx
    .update(contacts)
    .set({ company: card.company?.slice(0, 200) ?? null, jobTitle: card.jobTitle?.slice(0, 200) ?? null, davUid: options.davUid ?? null })
    .where(eq(contacts.id, id));
  await addMethods(tx, tenantId, id, methodsOf(card), { skipInvalid: true });
  for (const a of card.addresses) await addAddress(tx, tenantId, id, a);
  if (card.note) await addNote(tx, tenantId, id, card.note, options.source);
  return id;
}

async function addNote(tx: Tx, tenantId: string, contactId: string, body: string, source: string) {
  const [note] = await tx
    .insert(notes)
    .values({ tenantId, contactId, body: body.slice(0, 5000) })
    .returning({ id: notes.id, createdAt: notes.createdAt });
  await recordTimeline(tx, [{ tenantId, contactId, kind: "note", occurredAt: note!.createdAt, title: `Note from ${source}`, body, refId: note!.id }]);
}

/** Fill in what's missing on an existing person: blanks get the card's value, new phones and emails are added. */
export async function mergeCard(tx: Tx, tenantId: string, contactId: string, card: Card, source: string) {
  const [c] = await tx.select().from(contacts).where(eq(contacts.id, contactId));
  if (!c) return;
  await tx
    .update(contacts)
    .set({
      lastName: c.lastName ?? card.lastName,
      nickname: c.nickname ?? card.nickname,
      company: c.company ?? card.company,
      jobTitle: c.jobTitle ?? card.jobTitle,
    })
    .where(eq(contacts.id, contactId));
  await setBirthday(tx, tenantId, contactId, card.birthday, false);
  await addMethods(tx, tenantId, contactId, methodsOf(card), { skipInvalid: true });
  for (const a of card.addresses) await addAddress(tx, tenantId, contactId, a);
  if (card.note) await addNote(tx, tenantId, contactId, card.note, source);
}

/**
 * Make a person match a card exactly, for edits made on a phone over CardDAV. Only the
 * fields a vCard carries are touched; notes, facts and the timeline stay.
 */
export async function replaceFromCard(tx: Tx, tenantId: string, contactId: string, card: Card) {
  await tx
    .update(contacts)
    .set({
      firstName: card.firstName.slice(0, 100),
      lastName: card.lastName?.slice(0, 100) ?? null,
      nickname: card.nickname?.slice(0, 100) ?? null,
      company: card.company?.slice(0, 200) ?? null,
      jobTitle: card.jobTitle?.slice(0, 200) ?? null,
    })
    .where(eq(contacts.id, contactId));
  await setBirthday(tx, tenantId, contactId, card.birthday, true);
  await tx.delete(contactMethods).where(eq(contactMethods.contactId, contactId));
  await addMethods(tx, tenantId, contactId, methodsOf(card), { skipInvalid: true });
  await tx.delete(addresses).where(eq(addresses.contactId, contactId));
  for (const a of card.addresses) await addAddress(tx, tenantId, contactId, a);
}
