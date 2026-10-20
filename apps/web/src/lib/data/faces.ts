import "server-only";
import type { ImmichPerson } from "@life-crm/immich";
import { and, asc, eq, inArray, isNull, schema, type Tx } from "@life-crm/db";
import { immichAvatarRef } from "@/lib/immich-urls";
import { fullName } from "./contacts";

const { contactFaces, contacts } = schema;

export async function facesFor(tx: Tx, contactIds: string[]) {
  const out = new Map<string, { personId: string; immichName: string | null }[]>();
  if (contactIds.length === 0) return out;
  const rows = await tx
    .select()
    .from(contactFaces)
    .where(inArray(contactFaces.contactId, contactIds))
    .orderBy(asc(contactFaces.linkedAt));
  for (const r of rows) out.set(r.contactId, [...(out.get(r.contactId) ?? []), { personId: r.personId, immichName: r.immichName }]);
  return out;
}

/** Every linked face in the tenant, keyed by Immich person id. */
export async function linkedFaces(tx: Tx) {
  const rows = await tx
    .select({ personId: contactFaces.personId, contactId: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
    .from(contactFaces)
    .innerJoin(contacts, eq(contacts.id, contactFaces.contactId))
    .where(isNull(contacts.deletedAt));
  return new Map(rows.map((r) => [r.personId, { contactId: r.contactId, name: fullName(r) }]));
}

/**
 * Link Immich people to a contact. A face already linked to someone else is moved, since
 * one face cluster can only be one person. The first face becomes the avatar if there isn't one.
 */
export async function linkFaces(tx: Tx, tenantId: string, contactId: string, people: Pick<ImmichPerson, "id" | "name">[]) {
  if (people.length === 0) return;
  const ids = people.map((p) => p.id);
  const moved = await tx
    .delete(contactFaces)
    .where(inArray(contactFaces.personId, ids))
    .returning({ contactId: contactFaces.contactId, personId: contactFaces.personId });
  await tx
    .insert(contactFaces)
    .values(people.map((p) => ({ tenantId, contactId, personId: p.id, immichName: p.name || null })))
    .onConflictDoNothing();
  for (const m of moved.filter((m) => m.contactId !== contactId)) await refreshAvatar(tx, m.contactId, m.personId);
  await tx
    .update(contacts)
    .set({ avatarRef: immichAvatarRef(ids[0]!) })
    .where(and(eq(contacts.id, contactId), isNull(contacts.avatarRef)));
}

export async function unlinkFace(tx: Tx, contactId: string, personId: string) {
  await tx.delete(contactFaces).where(and(eq(contactFaces.contactId, contactId), eq(contactFaces.personId, personId)));
  await refreshAvatar(tx, contactId, personId);
}

/** If the avatar was the face that just went, fall back to another linked face or to initials. */
async function refreshAvatar(tx: Tx, contactId: string, removedPersonId: string) {
  const [c] = await tx.select({ avatarRef: contacts.avatarRef }).from(contacts).where(eq(contacts.id, contactId));
  if (c?.avatarRef !== immichAvatarRef(removedPersonId)) return;
  const [next] = await tx.select({ personId: contactFaces.personId }).from(contactFaces).where(eq(contactFaces.contactId, contactId)).limit(1);
  await tx
    .update(contacts)
    .set({ avatarRef: next ? immichAvatarRef(next.personId) : null })
    .where(eq(contacts.id, contactId));
}
