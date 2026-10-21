import "server-only";
import {
  genderFromPronouns,
  indexFamilies,
  kinship,
  type ChildKind,
  type Family,
  type FamilyStatus,
  type PartialDate,
} from "@life-crm/core";
import { and, asc, eq, inArray, isNull, or, schema, sql, type Tx } from "@life-crm/db";
import { fullName, insertContact } from "./contacts";

const { connections, contacts, families, familyChildren, importantDates, partnerships } = schema;

/** The user's own contact row, created the first time the tree needs it. */
export async function ensureSelf(tx: Tx, user: { tenantId: string; name: string }): Promise<string> {
  const [self] = await tx.select({ id: contacts.id }).from(contacts).where(eq(contacts.isSelf, true));
  if (self) return self.id;
  const [firstName, ...rest] = user.name.trim().split(/\s+/);
  const id = await insertContact(tx, user.tenantId, {
    firstName: firstName || "Me",
    lastName: rest.join(" ") || null,
    closeness: "inner",
    keepInTouchDays: null,
  });
  await tx.update(contacts).set({ isSelf: true }).where(eq(contacts.id, id));
  return id;
}

export interface TreePerson {
  id: string;
  name: string;
  firstName: string;
  pronouns: string | null;
  avatarRef: string | null;
  isSelf: boolean;
  isDeceased: boolean;
  birth: PartialDate | null;
  /** From the person, or the year of their memorial date. */
  deathYear: number | null;
}

/**
 * Everyone in the tree and how they connect. Your partners from the partner profile are
 * added as families with you, so they show up without being entered twice.
 */
export async function loadFamily(tx: Tx, selfId: string) {
  const famRows = await tx.select().from(families);
  const childRows = await tx.select().from(familyChildren);
  const list: Family[] = famRows.map((f) => ({
    id: f.id,
    partners: [f.partner1Id, f.partner2Id].filter((p): p is string => !!p),
    status: f.status,
    children: childRows.filter((c) => c.familyId === f.id).map((c) => ({ id: c.childId, kind: c.kind })),
  }));

  const partnerRows = await tx
    .select({ contactId: partnerships.contactId, label: partnerships.label, status: partnerships.status })
    .from(partnerships);
  for (const p of partnerRows) {
    if (list.some((f) => f.partners.includes(selfId) && f.partners.includes(p.contactId))) continue;
    const married = /wife|husband|spouse/i.test(p.label);
    list.push({
      id: `partnership:${p.contactId}`,
      partners: [selfId, p.contactId],
      status: p.status === "past" ? (married ? "divorced" : "separated") : married ? "married" : "partners",
      children: [],
    });
  }

  const ids = new Set<string>([selfId]);
  for (const f of list) {
    f.partners.forEach((p) => ids.add(p));
    f.children.forEach((c) => ids.add(c.id));
  }
  const rows = await tx
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      pronouns: contacts.pronouns,
      avatarRef: contacts.avatarRef,
      isSelf: contacts.isSelf,
      isDeceased: contacts.isDeceased,
      deathYear: contacts.deathYear,
      deletedAt: contacts.deletedAt,
    })
    .from(contacts)
    .where(inArray(contacts.id, [...ids]));
  const dates = await tx
    .select({ contactId: importantDates.contactId, type: importantDates.type, year: importantDates.year, month: importantDates.month, day: importantDates.day })
    .from(importantDates)
    .where(and(inArray(importantDates.contactId, [...ids]), or(eq(importantDates.type, "birthday"), eq(importantDates.type, "memorial"))));

  const people = new Map<string, TreePerson>();
  for (const r of rows) {
    if (r.deletedAt) continue;
    const birth = dates.find((d) => d.contactId === r.id && d.type === "birthday");
    const death = dates.find((d) => d.contactId === r.id && d.type === "memorial");
    people.set(r.id, {
      id: r.id,
      name: fullName(r),
      firstName: r.firstName,
      pronouns: r.pronouns,
      avatarRef: r.avatarRef,
      isSelf: r.isSelf,
      isDeceased: r.isDeceased,
      birth: birth ? { year: birth.year, month: birth.month, day: birth.day } : null,
      deathYear: r.deathYear ?? death?.year ?? null,
    });
  }
  // Deleted people drop out of the graph entirely.
  const live = list
    .map((f) => ({ ...f, partners: f.partners.filter((p) => people.has(p)), children: f.children.filter((c) => people.has(c.id)) }))
    .filter((f) => f.partners.length + f.children.length > 0);

  const index = indexFamilies(live);
  const genderOf = (id: string) => genderFromPronouns(people.get(id)?.pronouns);
  const termFor = (id: string, ego = selfId) => kinship(index, ego, id, genderOf);
  return { selfId, index, people, termFor };
}

export type FamilyData = Awaited<ReturnType<typeof loadFamily>>;

/** Sort people oldest first by birth year, unknowns last, so siblings line up in order. */
export function birthOrder(people: Map<string, TreePerson>) {
  return (a: string, b: string) => {
    const ya = people.get(a)?.birth?.year ?? 9999;
    const yb = people.get(b)?.birth?.year ?? 9999;
    if (ya !== yb) return ya - yb;
    const pa = people.get(a)?.birth;
    const pb = people.get(b)?.birth;
    return (pa ? pa.month * 32 + pa.day : 999) - (pb ? pb.month * 32 + pb.day : 999);
  };
}

export type RelativeRole = "parent" | "partner" | "child" | "sibling";

async function familyRows(tx: Tx) {
  const fams = await tx.select().from(families);
  const kids = await tx.select().from(familyChildren);
  return fams.map((f) => ({
    ...f,
    partners: [f.partner1Id, f.partner2Id].filter((p): p is string => !!p),
    children: kids.filter((k) => k.familyId === f.id),
  }));
}

async function newFamily(tx: Tx, tenantId: string, partners: string[], status: FamilyStatus = "unknown", startYear: number | null = null) {
  const [row] = await tx
    .insert(families)
    .values({ tenantId, partner1Id: partners[0] ?? null, partner2Id: partners[1] ?? null, status, startYear })
    .returning({ id: families.id });
  return row!.id;
}

async function addChild(tx: Tx, tenantId: string, familyId: string, childId: string, kind: ChildKind) {
  await tx.insert(familyChildren).values({ tenantId, familyId, childId, kind }).onConflictDoUpdate({
    target: [familyChildren.familyId, familyChildren.childId],
    set: { kind },
  });
}

async function fillSlot(tx: Tx, familyId: string, partnerId: string) {
  await tx
    .update(families)
    .set({
      partner1Id: sql`coalesce(${families.partner1Id}, ${partnerId}::uuid)`,
      partner2Id: sql`case when ${families.partner1Id} is not null and ${families.partner2Id} is null then ${partnerId}::uuid else ${families.partner2Id} end`,
    })
    .where(eq(families.id, familyId));
}

/**
 * Connect two people in the tree. Fills an open slot in an existing family where it can
 * (adding a second parent, or a co-parent for children you already entered) and starts a
 * new family otherwise.
 */
export async function connectRelative(
  tx: Tx,
  tenantId: string,
  input: {
    anchorId: string;
    personId: string;
    role: RelativeRole;
    kind?: ChildKind;
    status?: FamilyStatus;
    startYear?: number | null;
    otherParentId?: string | null;
    coParent?: boolean;
  },
) {
  const { anchorId, personId, role } = input;
  if (anchorId === personId) throw new Error("Someone can't be their own relative");
  const kind = input.kind ?? "biological";
  const fams = await familyRows(tx);

  if (role === "parent") {
    const birth = fams.filter((f) => f.children.some((c) => c.childId === anchorId && c.kind === kind));
    if (birth.some((f) => f.partners.includes(personId))) return;
    const open = birth.find((f) => f.partners.length < 2);
    if (open) await fillSlot(tx, open.id, personId);
    else await addChild(tx, tenantId, await newFamily(tx, tenantId, [personId]), anchorId, kind);
    return;
  }

  if (role === "partner") {
    const status = input.status ?? "unknown";
    const together = fams.find((f) => f.partners.includes(anchorId) && f.partners.includes(personId));
    if (together) {
      await tx.update(families).set({ status, startYear: input.startYear ?? together.startYear }).where(eq(families.id, together.id));
      return;
    }
    // Make them the other parent of children entered with only you as parent.
    const single = input.coParent ? fams.find((f) => f.partners.length === 1 && f.partners[0] === anchorId) : null;
    if (single) {
      await fillSlot(tx, single.id, personId);
      await tx.update(families).set({ status, startYear: input.startYear ?? null }).where(eq(families.id, single.id));
    } else await newFamily(tx, tenantId, [anchorId, personId], status, input.startYear ?? null);
    return;
  }

  if (role === "child") {
    const other = input.otherParentId;
    const fam = other
      ? fams.find((f) => f.partners.length === 2 && f.partners.includes(anchorId) && f.partners.includes(other))
      : fams.find((f) => f.partners.length === 1 && f.partners[0] === anchorId);
    const familyId = fam?.id ?? (await newFamily(tx, tenantId, other ? [anchorId, other] : [anchorId]));
    await addChild(tx, tenantId, familyId, personId, kind);
    return;
  }

  // Sibling: join the anchor's birth family, starting one with no known parents if needed.
  const birth = fams.find((f) => f.children.some((c) => c.childId === anchorId && (c.kind === "biological" || c.kind === "adoptive")));
  const familyId = birth?.id ?? (await newFamily(tx, tenantId, []));
  if (!birth) await addChild(tx, tenantId, familyId, anchorId, "biological");
  await addChild(tx, tenantId, familyId, personId, "biological");
}

/** Take someone out of one family (as a partner or a child), and tidy up families left empty. */
export async function disconnect(tx: Tx, familyId: string, personId: string) {
  await tx.delete(familyChildren).where(and(eq(familyChildren.familyId, familyId), eq(familyChildren.childId, personId)));
  await tx.update(families).set({ partner1Id: null }).where(and(eq(families.id, familyId), eq(families.partner1Id, personId)));
  await tx.update(families).set({ partner2Id: null }).where(and(eq(families.id, familyId), eq(families.partner2Id, personId)));
  const [f] = await tx.select().from(families).where(eq(families.id, familyId));
  if (!f) return;
  const kids = await tx.select({ id: familyChildren.childId }).from(familyChildren).where(eq(familyChildren.familyId, familyId));
  const partners = [f.partner1Id, f.partner2Id].filter(Boolean).length;
  // A family with nobody left to connect isn't a family.
  if (partners + kids.length <= 1) await tx.delete(families).where(eq(families.id, familyId));
}

/** Families someone belongs to, for the "remove from tree" list on their profile. */
export async function familiesOf(tx: Tx, personId: string) {
  const fams = await familyRows(tx);
  return fams.filter((f) => f.partners.includes(personId) || f.children.some((c) => c.childId === personId));
}

export async function contactInTenant(tx: Tx, id: string) {
  const [row] = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, id), isNull(contacts.deletedAt)));
  return !!row;
}

export interface Relation {
  id: string;
  name: string;
  avatarRef: string | null;
  /** What they are to this person: "mother", "half-brother". */
  term: string;
  /** The family linking them, when it can be undone from here. */
  familyId: string | null;
}

/** Someone's immediate family for their profile card, and what they are to you. */
export function relationsOf(data: FamilyData, personId: string) {
  const { index, people } = data;
  const genderOf = (id: string) => genderFromPronouns(people.get(id)?.pronouns);
  const relation = (id: string, familyId: string | null): Relation | null => {
    const p = people.get(id);
    if (!p) return null;
    const term = kinship(index, personId, id, genderOf) ?? "relative";
    return { id, name: p.isSelf ? "You" : p.name, avatarRef: p.avatarRef, term, familyId: familyId?.startsWith("partnership:") ? null : familyId };
  };
  const out: Relation[] = [];
  const seen = new Set<string>([personId]);
  const add = (id: string, familyId: string | null) => {
    if (seen.has(id)) return;
    const r = relation(id, familyId);
    if (r) {
      seen.add(id);
      out.push(r);
    }
  };
  for (const f of index.birthFamilies.get(personId) ?? []) for (const p of f.partners) add(p, f.id);
  for (const f of index.ownFamilies.get(personId) ?? []) for (const p of f.partners) add(p, f.id);
  for (const f of index.birthFamilies.get(personId) ?? []) for (const c of f.children) add(c.id, f.id);
  for (const f of index.ownFamilies.get(personId) ?? []) for (const c of f.children) add(c.id, f.id);
  // Half-siblings through another of a parent's families.
  for (const f of index.birthFamilies.get(personId) ?? [])
    for (const parent of f.partners) for (const pf of index.ownFamilies.get(parent) ?? []) for (const c of pf.children) add(c.id, null);
  return { relations: out, toYou: data.termFor(personId) };
}

const pair = (a: string, b: string) => (a < b ? { personAId: a, personBId: b } : { personAId: b, personBId: a });

/** Mark two people as friends. */
export async function connectFriends(tx: Tx, tenantId: string, a: string, b: string) {
  if (a === b) throw new Error("Someone can't be their own friend");
  await tx.insert(connections).values({ tenantId, ...pair(a, b) }).onConflictDoNothing();
}

export async function disconnectFriends(tx: Tx, a: string, b: string) {
  const p = pair(a, b);
  await tx.delete(connections).where(and(eq(connections.personAId, p.personAId), eq(connections.personBId, p.personBId)));
}

/** Everyone's friend links, both ways round. */
export async function loadConnections(tx: Tx) {
  const rows = await tx.select({ a: connections.personAId, b: connections.personBId }).from(connections);
  const out = new Map<string, string[]>();
  for (const { a, b } of rows) {
    out.set(a, [...(out.get(a) ?? []), b]);
    out.set(b, [...(out.get(b) ?? []), a]);
  }
  return out;
}

/** Everyone you know, with what the tree's edit panel needs. */
export async function treeContacts(tx: Tx) {
  return tx
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      nickname: contacts.nickname,
      pronouns: contacts.pronouns,
      closeness: contacts.closeness,
      keepInTouchDays: contacts.keepInTouchDays,
      avatarRef: contacts.avatarRef,
      isSelf: contacts.isSelf,
      isDeceased: contacts.isDeceased,
    })
    .from(contacts)
    .where(isNull(contacts.deletedAt))
    .orderBy(asc(contacts.firstName), asc(contacts.lastName));
}

/** Who someone is a friend of, by name, for their profile. */
export async function friendOf(tx: Tx, personId: string) {
  const links = (await loadConnections(tx)).get(personId) ?? [];
  if (links.length === 0) return [];
  return tx
    .select({ id: contacts.id, firstName: contacts.firstName, isSelf: contacts.isSelf })
    .from(contacts)
    .where(and(inArray(contacts.id, links), isNull(contacts.deletedAt)));
}
