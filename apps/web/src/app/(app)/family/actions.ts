"use server";

import { childKinds, familyStatuses, roleFromLabel, type FamilyStatus } from "@life-crm/core";
import { and, eq, isNull, schema, type Tx } from "@life-crm/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { insertContact } from "@/lib/data/contacts";
import { connectRelative, contactInTenant, disconnect, ensureSelf, loadFamily, type RelativeRole } from "@/lib/data/family";
import { createPartnership, monogamyConflict, userPrefs } from "@/lib/data/partners";
import { intOrNull, partialDateFrom } from "@/lib/forms";
import { tenantQuery } from "@/lib/session";

export interface RelativeState {
  error?: string;
  ok?: number;
}

const { contacts } = schema;
const uuid = z.uuid();
const roles = ["parent", "partner", "child", "sibling"] as const;
const pronounsFor = { female: "she/her", male: "he/him" } as const;

function revalidateTree(...contactIds: string[]) {
  revalidatePath("/family");
  for (const id of contactIds) revalidatePath(`/people/${id}`);
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** After someone joins the tree, fill in "what they are to you" if it's empty. */
async function labelFromTree(tx: Tx, selfId: string, ids: string[]) {
  const family = await loadFamily(tx, selfId);
  for (const id of ids) {
    if (id === selfId) continue;
    const term = family.termFor(id);
    if (!term || term === "you") continue;
    await tx
      .update(contacts)
      .set({ relationship: capitalize(term) })
      .where(and(eq(contacts.id, id), isNull(contacts.relationship)));
  }
}

const newPersonSchema = z.object({
  firstName: z.string().trim().min(1, "Add their first name").max(100),
  lastName: z
    .string()
    .trim()
    .max(100)
    .transform((v) => v || null),
  pronouns: z.enum(["", "she/her", "he/him", "they/them"]).transform((v) => v || null),
});

/** Add a parent, partner, child or sibling to someone, picking an existing person or adding a new one. */
export async function addRelative(anchorId: string, role: RelativeRole, _prev: RelativeState, form: FormData): Promise<RelativeState> {
  if (!uuid.safeParse(anchorId).success || !(roles as readonly string[]).includes(role)) return { error: "Person not found" };
  const kind = z.enum(childKinds).catch("biological").parse(form.get("kind") ?? "biological");
  const status = z.enum(familyStatuses).catch("unknown").parse(form.get("status") ?? "unknown");
  const startYear = intOrNull(form.get("startYear"));
  if (startYear != null && (startYear < 1800 || startYear > 2200)) return { error: "That year doesn't look right" };
  const otherParent = String(form.get("otherParentId") ?? "");
  const otherParentId = uuid.safeParse(otherParent).success ? otherParent : null;
  const existing = String(form.get("existingId") ?? "");
  const mode = form.get("mode") === "existing" ? "existing" : "new";

  let person: z.infer<typeof newPersonSchema> | null = null;
  let birthday = null;
  const deceased = form.get("deceased") === "on";
  const deathYear = intOrNull(form.get("deathYear"));
  if (mode === "new") {
    const parsed = newPersonSchema.safeParse({
      firstName: form.get("firstName"),
      lastName: form.get("lastName") ?? "",
      pronouns: form.get("pronouns") ?? "",
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message };
    person = parsed.data;
    const b = partialDateFrom(form, "birthday");
    if (b === "invalid") return { error: "That birthday isn't a real date" };
    birthday = b;
    if (deathYear != null && (deathYear < 1500 || deathYear > 2200)) return { error: "That year doesn't look right" };
  } else if (!uuid.safeParse(existing).success) return { error: "Pick someone" };

  const result = await tenantQuery(async (tx, user) => {
    if (!(await contactInTenant(tx, anchorId))) return { error: "Person not found" };
    if (otherParentId && !(await contactInTenant(tx, otherParentId))) return { error: "Other parent not found" };
    const selfId = await ensureSelf(tx, user);

    // Partners of yours also get a partner profile, so monogamous setups stay one partner.
    const currentPartner = role === "partner" && anchorId === selfId && (["married", "partners", "engaged", "unknown"] as FamilyStatus[]).includes(status);
    if (currentPartner) {
      const conflict = await monogamyConflict(tx, (await userPrefs(tx, user.id)).relationshipStyle, mode === "existing" ? existing : "");
      if (conflict) return { error: conflict };
    }

    let personId: string;
    if (mode === "existing") {
      if (!(await contactInTenant(tx, existing))) return { error: "Person not found" };
      personId = existing;
    } else {
      personId = await insertContact(tx, user.tenantId, {
        firstName: person!.firstName,
        lastName: person!.lastName,
        pronouns: person!.pronouns,
        closeness: "close",
        // Relatives don't get catch-up nudges until you ask for them.
        keepInTouchDays: null,
        birthday,
      });
      if (deceased || deathYear) await tx.update(contacts).set({ isDeceased: true, deathYear }).where(eq(contacts.id, personId));
    }
    if (personId === anchorId) return { error: "Someone can't be their own relative" };

    await connectRelative(tx, user.tenantId, { anchorId, personId, role, kind, status, startYear, otherParentId, coParent: form.get("coParent") === "on" });
    if (currentPartner) await createPartnership(tx, user.tenantId, personId, { label: status === "married" ? "Spouse" : "Partner" });
    await labelFromTree(tx, selfId, [personId]);
    return { personId };
  });
  if ("error" in result) return { error: result.error };
  revalidateTree(anchorId, result.personId);
  return { ok: Date.now() };
}

export async function removeFromFamily(familyId: string, personId: string) {
  if (!uuid.safeParse(familyId).success || !uuid.safeParse(personId).success) return;
  await tenantQuery((tx) => disconnect(tx, familyId, personId));
  revalidateTree(personId);
}

export async function setDeceased(contactId: string, deceased: boolean, deathYear: number | null) {
  if (!uuid.safeParse(contactId).success) return;
  if (deathYear != null && (!Number.isInteger(deathYear) || deathYear < 1500 || deathYear > 2200)) return;
  await tenantQuery((tx) =>
    tx
      .update(contacts)
      .set({ isDeceased: deceased, deathYear: deceased ? deathYear : null })
      .where(and(eq(contacts.id, contactId), eq(contacts.isSelf, false))),
  );
  revalidateTree(contactId);
}

/**
 * People whose "to you" label already says where they go ("Mom", "Brother") but who
 * aren't in the tree yet.
 */
export async function placeableFromLabels(): Promise<{ id: string; name: string; label: string }[]> {
  return tenantQuery(async (tx, user) => {
    const selfId = await ensureSelf(tx, user);
    const family = await loadFamily(tx, selfId);
    const rows = await tx
      .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, relationship: contacts.relationship })
      .from(contacts)
      .where(and(isNull(contacts.deletedAt), eq(contacts.isSelf, false)));
    return rows
      .filter((r) => roleFromLabel(r.relationship) && !family.people.has(r.id))
      .map((r) => ({ id: r.id, name: [r.firstName, r.lastName].filter(Boolean).join(" "), label: r.relationship! }));
  });
}

/** Put people in the tree from their labels: Mom and Dad as your parents, and so on. */
export async function placeFromLabels(ids: string[]): Promise<{ placed: number }> {
  const parsed = z.array(z.uuid()).max(200).safeParse(ids);
  if (!parsed.success) return { placed: 0 };
  const placed = await tenantQuery(async (tx, user) => {
    const selfId = await ensureSelf(tx, user);
    const rows = await tx
      .select({ id: contacts.id, relationship: contacts.relationship, pronouns: contacts.pronouns })
      .from(contacts)
      .where(and(isNull(contacts.deletedAt), eq(contacts.isSelf, false)));
    let n = 0;
    // Parents first, so siblings land in the same family as you.
    const ordered = rows
      .filter((r) => parsed.data.includes(r.id))
      .map((r) => ({ ...r, role: roleFromLabel(r.relationship) }))
      .filter((r) => r.role)
      .sort((a, b) => roles.indexOf(a.role!.role) - roles.indexOf(b.role!.role));
    const prefs = await userPrefs(tx, user.id);
    for (const r of ordered) {
      const { role, gender, kind } = r.role!;
      if (role === "partner") {
        if (await monogamyConflict(tx, prefs.relationshipStyle, r.id)) continue;
        await createPartnership(tx, user.tenantId, r.id, { label: r.relationship! });
      } else await connectRelative(tx, user.tenantId, { anchorId: selfId, personId: r.id, role, kind });
      if (!r.pronouns && gender) await tx.update(contacts).set({ pronouns: pronounsFor[gender] }).where(eq(contacts.id, r.id));
      n++;
    }
    return n;
  });
  revalidateTree(...parsed.data);
  return { placed };
}
