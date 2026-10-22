import "server-only";
import { addressKey, householdLabel } from "@life-crm/core";
import { and, asc, eq, inArray, isNull, schema, sql, type Tx } from "@life-crm/db";
import { fullName } from "./contacts";

const { addresses, contacts, families, familyChildren, households } = schema;

export interface HouseholdMemberView {
  id: string;
  name: string;
  firstName: string;
  lastName: string | null;
  avatarRef: string | null;
  isChild: boolean;
}

export type Household = typeof households.$inferSelect & { label: string; members: HouseholdMemberView[] };

/** Members whose parent lives with them count as kids, so the card says "Ryan & Mia Park". */
async function childrenAmong(tx: Tx, memberIds: string[]) {
  if (memberIds.length === 0) return new Set<string>();
  const rows = await tx
    .select({ childId: familyChildren.childId, p1: families.partner1Id, p2: families.partner2Id })
    .from(familyChildren)
    .innerJoin(families, eq(families.id, familyChildren.familyId))
    .where(inArray(familyChildren.childId, memberIds));
  const live = new Set(memberIds);
  return new Set(rows.filter((r) => (r.p1 && live.has(r.p1)) || (r.p2 && live.has(r.p2))).map((r) => r.childId));
}

async function withMembers(tx: Tx, rows: (typeof households.$inferSelect)[]): Promise<Household[]> {
  if (rows.length === 0) return [];
  const people = await tx
    .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, avatarRef: contacts.avatarRef, householdId: contacts.householdId })
    .from(contacts)
    .where(and(inArray(contacts.householdId, rows.map((r) => r.id)), isNull(contacts.deletedAt)))
    .orderBy(asc(contacts.firstName));
  const kids = await childrenAmong(tx, people.map((p) => p.id));
  return rows.map((h) => {
    const members = people
      .filter((p) => p.householdId === h.id)
      .map((p) => ({ id: p.id, name: fullName(p), firstName: p.firstName, lastName: p.lastName, avatarRef: p.avatarRef, isChild: kids.has(p.id) }))
      // Grown-ups first, then kids.
      .sort((a, b) => Number(a.isChild) - Number(b.isChild));
    return { ...h, members, label: h.name || householdLabel(members) };
  });
}

export async function listHouseholds(tx: Tx) {
  const rows = await tx.select().from(households);
  return (await withMembers(tx, rows)).filter((h) => h.members.length > 0).sort((a, b) => a.label.localeCompare(b.label));
}

export async function getHousehold(tx: Tx, id: string) {
  const [row] = await tx.select().from(households).where(eq(households.id, id));
  return row ? ((await withMembers(tx, [row]))[0] ?? null) : null;
}

export async function householdOf(tx: Tx, contactId: string) {
  const [c] = await tx.select({ householdId: contacts.householdId }).from(contacts).where(eq(contacts.id, contactId));
  return c?.householdId ? getHousehold(tx, c.householdId) : null;
}

export async function householdOptions(tx: Tx) {
  return (await listHouseholds(tx)).map((h) => ({ id: h.id, label: h.label }));
}

/**
 * Start a household. The address comes from the first member who has one; anyone already in
 * another household moves over.
 */
export async function createHousehold(tx: Tx, tenantId: string, memberIds: string[], name: string | null = null) {
  const ids = [...new Set(memberIds)];
  const [addr] = ids.length
    ? await tx
        .select()
        .from(addresses)
        .where(and(inArray(addresses.contactId, ids), sql`(${addresses.street} is not null or ${addresses.city} is not null)`))
        .orderBy(sql`case ${addresses.label} when 'home' then 0 else 1 end`)
        .limit(1)
    : [];
  const [row] = await tx
    .insert(households)
    .values({
      tenantId,
      name,
      street: addr?.street ?? null,
      line2: addr?.line2 ?? null,
      city: addr?.city ?? null,
      region: addr?.region ?? null,
      postalCode: addr?.postalCode ?? null,
      country: addr?.country ?? null,
    })
    .returning({ id: households.id });
  const before = ids.length ? await tx.select({ householdId: contacts.householdId }).from(contacts).where(inArray(contacts.id, ids)) : [];
  if (ids.length) await tx.update(contacts).set({ householdId: row!.id }).where(inArray(contacts.id, ids));
  await dropEmpty(tx, before.map((b) => b.householdId));
  return row!.id;
}

export async function joinHousehold(tx: Tx, contactId: string, householdId: string) {
  const [c] = await tx.select({ householdId: contacts.householdId }).from(contacts).where(eq(contacts.id, contactId));
  await tx.update(contacts).set({ householdId }).where(eq(contacts.id, contactId));
  await dropEmpty(tx, [c?.householdId ?? null]);
}

export async function leaveHousehold(tx: Tx, contactId: string) {
  const [c] = await tx.select({ householdId: contacts.householdId }).from(contacts).where(eq(contacts.id, contactId));
  await tx.update(contacts).set({ householdId: null }).where(eq(contacts.id, contactId));
  await dropEmpty(tx, [c?.householdId ?? null]);
}

/** A household nobody lives in anymore goes away. */
async function dropEmpty(tx: Tx, ids: (string | null)[]) {
  for (const id of new Set(ids.filter((x): x is string => !!x))) {
    const [left] = await tx.select({ id: contacts.id }).from(contacts).where(eq(contacts.householdId, id)).limit(1);
    if (!left) await tx.delete(households).where(eq(households.id, id));
  }
}

export interface HouseholdSuggestion {
  key: string;
  reason: string;
  members: { id: string; name: string; avatarRef: string | null }[];
  label: string;
}

/**
 * Who probably lives together: people with the same street address, and couples from the
 * family tree (with any kids at the same address). Only people not in a household yet.
 */
export async function householdSuggestions(tx: Tx): Promise<HouseholdSuggestion[]> {
  const people = await tx
    .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, avatarRef: contacts.avatarRef })
    .from(contacts)
    .where(and(isNull(contacts.deletedAt), eq(contacts.isSelf, false), isNull(contacts.householdId), eq(contacts.isDeceased, false)));
  const byId = new Map(people.map((p) => [p.id, p]));
  if (byId.size < 2) return [];

  const addrRows = await tx
    .select({ contactId: addresses.contactId, street: addresses.street, city: addresses.city })
    .from(addresses)
    .where(and(inArray(addresses.contactId, [...byId.keys()]), sql`${addresses.label} <> 'work'`));
  const keyOf = new Map<string, string>();
  const atAddress = new Map<string, Set<string>>();
  for (const a of addrRows) {
    const k = addressKey(a);
    if (!k) continue;
    keyOf.set(a.contactId, k);
    atAddress.set(k, (atAddress.get(k) ?? new Set()).add(a.contactId));
  }

  const groups: { ids: Set<string>; reason: string }[] = [];
  const taken = new Set<string>();
  for (const [, ids] of atAddress) {
    if (ids.size < 2) continue;
    groups.push({ ids, reason: "Same address" });
    for (const id of ids) taken.add(id);
  }

  const fams = await tx.select({ id: families.id, p1: families.partner1Id, p2: families.partner2Id, status: families.status }).from(families);
  const kids = await tx.select({ familyId: familyChildren.familyId, childId: familyChildren.childId }).from(familyChildren);
  for (const f of fams) {
    if (!f.p1 || !f.p2 || !byId.has(f.p1) || !byId.has(f.p2) || taken.has(f.p1) || taken.has(f.p2)) continue;
    if (!["married", "partners", "engaged", "unknown"].includes(f.status)) continue;
    const ids = new Set([f.p1, f.p2]);
    // Kids come along when they live at the same address as a parent.
    for (const k of kids) if (k.familyId === f.id && byId.has(k.childId) && !taken.has(k.childId) && keyOf.get(k.childId) && keyOf.get(k.childId) === (keyOf.get(f.p1) ?? keyOf.get(f.p2))) ids.add(k.childId);
    groups.push({ ids, reason: f.status === "married" ? "Married" : "Partners" });
    for (const id of ids) taken.add(id);
  }

  const kidSet = new Set(kids.map((k) => k.childId));
  return groups.map((g) => {
    const members = [...g.ids].map((id) => byId.get(id)!);
    return {
      key: [...g.ids].sort().join(","),
      reason: g.reason,
      members: members.map((m) => ({ id: m.id, name: fullName(m), avatarRef: m.avatarRef })),
      label: householdLabel(members.map((m) => ({ ...m, isChild: g.ids.size > 2 && kidSet.has(m.id) }))),
    };
  });
}

/** Rows for the holiday card list: one per household on the list, plus its address. */
export async function cardListRows(tx: Tx) {
  const all = await listHouseholds(tx);
  return all
    .filter((h) => h.sendCard)
    .map((h) => [h.label, h.street, h.line2, h.city, h.region, h.postalCode, h.country, h.members.map((m) => m.name).join(", ")]);
}
