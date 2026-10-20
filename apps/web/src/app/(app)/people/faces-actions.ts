"use server";

import { nameMatch } from "@life-crm/core";
import { ImmichError, type ImmichAsset } from "@life-crm/immich";
import { and, eq, isNull, schema } from "@life-crm/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { facesFor, linkFaces, linkedFaces, unlinkFace } from "@/lib/data/faces";
import { immichConnection, immichFor } from "@/lib/immich";
import { immichAvatarRef } from "@/lib/immich-urls";
import { tenantQuery } from "@/lib/session";

const { contacts, immichConnections } = schema;
const uuid = z.uuid();

export interface FaceOption {
  id: string;
  name: string;
  birthDate: string | null;
  /** Who it's linked to now, if anyone. */
  linkedTo: { contactId: string; name: string } | null;
  /** 2 full-name match, 1 first-name match, 0 none. */
  match: 0 | 1 | 2;
}

/**
 * Immich faces to pick from. With a contact, faces whose Immich name matches theirs come
 * first; without one (the "this is me" picker) they're in Immich's own order.
 */
export async function listFaces(contactId: string | null): Promise<{ faces: FaceOption[]; error?: string }> {
  if (contactId && !uuid.safeParse(contactId).success) return { faces: [], error: "Person not found" };
  return tenantQuery(async (tx, user) => {
    const immich = await immichFor(tx, user.id);
    if (!immich) return { faces: [], error: "Connect Immich in Settings first" };
    const [contact] = contactId
      ? await tx
          .select({ firstName: contacts.firstName, lastName: contacts.lastName, nickname: contacts.nickname })
          .from(contacts)
          .where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)))
      : [];
    if (contactId && !contact) return { faces: [], error: "Person not found" };
    try {
      const { people } = await immich.people();
      const linked = await linkedFaces(tx);
      // Your own face isn't one of your people.
      const self = contactId ? (await immichConnection(tx, user.id))?.selfPersonId : null;
      const faces = people.filter((p) => p.id !== self).map((p, i) => ({
        option: {
          id: p.id,
          name: p.name,
          birthDate: p.birthDate,
          linkedTo: linked.get(p.id) ?? null,
          match: contact ? nameMatch(p.name, contact) : 0,
        } satisfies FaceOption,
        i,
      }));
      // Best name match first, then Immich's order (most photographed).
      faces.sort((a, b) => b.option.match - a.option.match || a.i - b.i);
      return { faces: faces.map((f) => f.option) };
    } catch (err) {
      return { faces: [], error: err instanceof ImmichError ? err.message : "Couldn't load faces from Immich" };
    }
  });
}

function revalidatePerson(contactId: string) {
  revalidatePath(`/people/${contactId}`);
  revalidatePath("/people");
}

export async function linkFacesTo(contactId: string, personIds: string[], renameInImmich: boolean): Promise<{ error?: string }> {
  if (!uuid.safeParse(contactId).success) return { error: "Person not found" };
  const ids = z.array(z.uuid()).min(1).max(20).safeParse([...new Set(personIds)]);
  if (!ids.success) return { error: "Pick at least one face" };

  const result = await tenantQuery(async (tx, user) => {
    const immich = await immichFor(tx, user.id);
    if (!immich) return { error: "Connect Immich in Settings first" };
    const [contact] = await tx
      .select({ firstName: contacts.firstName, lastName: contacts.lastName })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)));
    if (!contact) return { error: "Person not found" };

    // Check the faces exist in this user's Immich rather than trusting the ids.
    let people;
    try {
      people = await Promise.all(ids.data.map((id) => immich.person(id)));
    } catch (err) {
      return { error: err instanceof ImmichError && err.status === 404 ? "That face is gone from Immich" : "Couldn't reach Immich" };
    }
    await linkFaces(tx, user.tenantId, contactId, people);

    let warning: string | undefined;
    if (renameInImmich) {
      const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
      const unnamed = people.filter((p) => !p.name);
      try {
        for (const p of unnamed) await immich.renamePerson(p.id, name);
      } catch {
        warning = "Linked, but Immich didn't let us name the face. The API key needs permission to update people.";
      }
    }
    return { error: warning };
  });
  revalidatePerson(contactId);
  return result;
}

export async function unlinkFaceFrom(contactId: string, personId: string) {
  if (!uuid.safeParse(contactId).success || !uuid.safeParse(personId).success) return;
  await tenantQuery((tx) => unlinkFace(tx, contactId, personId));
  revalidatePerson(contactId);
}

/** Use one of the linked faces as the avatar, or null for initials. */
export async function setAvatarFace(contactId: string, personId: string | null) {
  if (!uuid.safeParse(contactId).success || (personId && !uuid.safeParse(personId).success)) return;
  await tenantQuery(async (tx) => {
    if (personId) {
      const faces = (await facesFor(tx, [contactId])).get(contactId) ?? [];
      if (!faces.some((f) => f.personId === personId)) return;
    }
    await tx
      .update(contacts)
      .set({ avatarRef: personId ? immichAvatarRef(personId) : null })
      .where(eq(contacts.id, contactId));
  });
  revalidatePerson(contactId);
}

export async function setSelfFace(personId: string | null): Promise<{ error?: string }> {
  if (personId && !uuid.safeParse(personId).success) return { error: "Unknown face" };
  await tenantQuery(async (tx, user) => {
    await tx.update(immichConnections).set({ selfPersonId: personId }).where(eq(immichConnections.userId, user.id));
  });
  revalidatePath("/settings");
  return {};
}

export interface PersonPhotos {
  assets: Pick<ImmichAsset, "id" | "type" | "localDateTime">[];
  nextPage: number | null;
  /** Whether "together" is possible: the user has picked their own face. */
  canTogether: boolean;
  error?: string;
}

/**
 * Photos of someone, or of the two of you together. With several faces linked, each is
 * searched and the results merged, since Immich treats several ids as "all of them".
 */
export async function personPhotos(contactId: string, mode: "together" | "them", page = 1): Promise<PersonPhotos> {
  if (!uuid.safeParse(contactId).success) return { assets: [], nextPage: null, canTogether: false, error: "Person not found" };
  return tenantQuery(async (tx, user) => {
    const conn = await immichConnection(tx, user.id);
    const immich = await immichFor(tx, user.id);
    if (!conn || !immich) return { assets: [], nextPage: null, canTogether: false, error: "Connect Immich in Settings first" };
    const faces = (await facesFor(tx, [contactId])).get(contactId) ?? [];
    const canTogether = Boolean(conn.selfPersonId);
    if (faces.length === 0) return { assets: [], nextPage: null, canTogether };
    if (mode === "together" && !conn.selfPersonId) return { assets: [], nextPage: null, canTogether };

    try {
      const pages = await Promise.all(
        faces.map((f) => immich.withPeople(mode === "together" ? [f.personId, conn.selfPersonId!] : [f.personId], { page, size: 24 })),
      );
      const seen = new Set<string>();
      const assets = pages
        .flatMap((p) => p.assets)
        .filter((a) => !seen.has(a.id) && seen.add(a.id))
        .sort((a, b) => (b.localDateTime ?? "").localeCompare(a.localDateTime ?? ""))
        .map(({ id, type, localDateTime }) => ({ id, type, localDateTime }));
      return { assets, nextPage: pages.some((p) => p.nextPage) ? page + 1 : null, canTogether };
    } catch (err) {
      return { assets: [], nextPage: null, canTogether, error: err instanceof ImmichError ? err.message : "Couldn't load photos" };
    }
  });
}

export interface FaceMatchRow {
  id: string;
  name: string;
  linkedTo: { contactId: string; name: string } | null;
  /** Best contact for this face when there's exactly one strong match. */
  suggestion: string | null;
}

/** Every Immich face with a suggested person, for matching faces in bulk. */
export async function faceMatches(): Promise<{ rows: FaceMatchRow[]; people: { id: string; name: string }[]; error?: string }> {
  return tenantQuery(async (tx, user) => {
    const immich = await immichFor(tx, user.id);
    if (!immich) return { rows: [], people: [], error: "Connect Immich in Settings first" };
    const all = await tx
      .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, nickname: contacts.nickname })
      .from(contacts)
      .where(isNull(contacts.deletedAt));
    const people = all
      .map((c) => ({ id: c.id, name: [c.firstName, c.lastName].filter(Boolean).join(" ") }))
      .sort((a, b) => a.name.localeCompare(b.name));
    try {
      const { people: faces } = await immich.people();
      const linked = await linkedFaces(tx);
      const rows = faces.map((f) => {
        const scored = all.map((c) => ({ id: c.id, score: nameMatch(f.name, c) })).filter((s) => s.score > 0);
        const best = Math.max(0, ...scored.map((s) => s.score));
        const top = scored.filter((s) => s.score === best);
        return { id: f.id, name: f.name, linkedTo: linked.get(f.id) ?? null, suggestion: top.length === 1 ? top[0]!.id : null };
      });
      return { rows, people };
    } catch (err) {
      return { rows: [], people, error: err instanceof ImmichError ? err.message : "Couldn't load faces from Immich" };
    }
  });
}

/** Link many faces at once: pairs of Immich person id and contact id. */
export async function linkMany(pairs: { personId: string; contactId: string }[]): Promise<{ linked: number; error?: string }> {
  const parsed = z.array(z.object({ personId: z.uuid(), contactId: z.uuid() })).min(1).max(500).safeParse(pairs);
  if (!parsed.success) return { linked: 0, error: "Nothing to link" };
  const result = await tenantQuery(async (tx, user) => {
    const immich = await immichFor(tx, user.id);
    if (!immich) return { linked: 0, error: "Connect Immich in Settings first" };
    const { people } = await immich.people();
    const byId = new Map(people.map((p) => [p.id, p]));
    const valid = new Set(
      (
        await tx
          .select({ id: contacts.id })
          .from(contacts)
          .where(isNull(contacts.deletedAt))
      ).map((c) => c.id),
    );
    let linked = 0;
    for (const { personId, contactId } of parsed.data) {
      const person = byId.get(personId);
      if (!person || !valid.has(contactId)) continue;
      await linkFaces(tx, user.tenantId, contactId, [person]);
      linked += 1;
    }
    return { linked };
  });
  revalidatePath("/people");
  return result;
}
