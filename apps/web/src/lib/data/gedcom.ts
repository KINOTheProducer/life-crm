import "server-only";
import {
  genderFromPronouns,
  type ChildKind,
  type GedDate,
  type GedFamily,
  type GedPerson,
  type GedTree,
  type PartialDate,
} from "@life-crm/core";
import { and, eq, inArray, isNull, or, schema, type Tx } from "@life-crm/db";
import { fullName, insertContact } from "./contacts";
import { insertNote } from "./entries";
import { ensureSelf } from "./family";

const { contacts, families, familyChildren, importantDates } = schema;

/** Most genealogy exports are a few thousand people; past this it's probably not a personal tree. */
export const GEDCOM_MAX_PEOPLE = 5000;

const xrefOf = (n: number, prefix: string) => `${prefix}${n}`;

/** The family tree as GEDCOM: everyone in a family, plus you. Notes, contact info and friends stay out. */
export async function familyAsGedcom(tx: Tx, user: { tenantId: string; name: string }): Promise<GedTree> {
  const selfId = await ensureSelf(tx, user);
  const famRows = await tx.select().from(families);
  const kidRows = await tx.select().from(familyChildren);
  const ids = new Set<string>([selfId]);
  for (const f of famRows) [f.partner1Id, f.partner2Id].forEach((p) => p && ids.add(p));
  for (const k of kidRows) ids.add(k.childId);

  const people = await tx
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      pronouns: contacts.pronouns,
      isDeceased: contacts.isDeceased,
      deathYear: contacts.deathYear,
    })
    .from(contacts)
    .where(and(inArray(contacts.id, [...ids]), isNull(contacts.deletedAt)));
  const dates = await tx
    .select({ contactId: importantDates.contactId, type: importantDates.type, year: importantDates.year, month: importantDates.month, day: importantDates.day })
    .from(importantDates)
    .where(and(inArray(importantDates.contactId, [...ids]), or(eq(importantDates.type, "birthday"), eq(importantDates.type, "memorial"))));

  const xref = new Map<string, string>();
  const ged: GedPerson[] = people.map((p, i) => {
    xref.set(p.id, xrefOf(i + 1, "I"));
    const birth = dates.find((d) => d.contactId === p.id && d.type === "birthday");
    const memorial = dates.find((d) => d.contactId === p.id && d.type === "memorial");
    const gender = genderFromPronouns(p.pronouns);
    const deathYear = p.deathYear ?? memorial?.year ?? null;
    return {
      xref: xref.get(p.id)!,
      firstName: p.firstName,
      lastName: p.lastName,
      sex: gender === "female" ? "F" : gender === "male" ? "M" : "U",
      birth: birth ? { year: birth.year, month: birth.month, day: birth.day, approx: false } : null,
      deceased: p.isDeceased || deathYear != null,
      death: memorial
        ? { year: memorial.year, month: memorial.month, day: memorial.day, approx: false }
        : deathYear
          ? { year: deathYear, month: null, day: null, approx: false }
          : null,
    };
  });

  const gedFamilies: GedFamily[] = [];
  famRows.forEach((f, i) => {
    const partners = [f.partner1Id, f.partner2Id].filter((p): p is string => !!p && xref.has(p)).map((p) => xref.get(p)!);
    const children = kidRows
      .filter((k) => k.familyId === f.id && xref.has(k.childId))
      .map((k) => ({ xref: xref.get(k.childId)!, kind: k.kind }));
    if (partners.length + children.length === 0) return;
    gedFamilies.push({ xref: xrefOf(i + 1, "F"), partners, status: f.status, startYear: f.startYear, endYear: f.endYear, children });
  });
  return { people: ged, families: gedFamilies };
}

/* Import */

const lower = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** A birthday we can store: needs a month and a day. Approximate years are dropped. */
function birthdayFrom(d: GedDate | null): PartialDate | null {
  if (!d?.month || !d.day) return null;
  return { year: d.approx ? null : d.year, month: d.month, day: d.day };
}

interface Existing {
  id: string;
  firstName: string;
  lastName: string | null;
  birthYear: number | null;
}

async function existingPeople(tx: Tx): Promise<Existing[]> {
  const rows = await tx
    .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, birthYear: importantDates.year })
    .from(contacts)
    .leftJoin(importantDates, and(eq(importantDates.contactId, contacts.id), eq(importantDates.type, "birthday")))
    .where(and(isNull(contacts.deletedAt), eq(contacts.isSelf, false)));
  return rows;
}

/** Same first and last name, and the same birth year when both know it. */
function matchPerson(p: GedPerson, existing: Existing[]): Existing | null {
  return (
    existing.find(
      (e) =>
        lower(e.firstName) === lower(p.firstName) &&
        lower(e.lastName) === lower(p.lastName) &&
        (e.birthYear == null || p.birth?.year == null || p.birth.approx || e.birthYear === p.birth.year),
    ) ?? null
  );
}

export interface GedcomPreview {
  people: number;
  families: number;
  matched: { xref: string; name: string }[];
  /** Everyone in the file, for the "which one is you" picker. */
  choices: { xref: string; label: string }[];
  /** Our guess at the user in the file, by name. */
  selfGuess: string | null;
  tooBig: boolean;
}

const label = (p: GedPerson) => {
  const name = [p.firstName, p.lastName].filter(Boolean).join(" ") || "(no name)";
  return p.birth?.year ? `${name}, b. ${p.birth.year}` : name;
};

export async function previewGedcom(tx: Tx, user: { tenantId: string; name: string }, tree: GedTree): Promise<GedcomPreview> {
  const existing = await existingPeople(tx);
  const selfId = await ensureSelf(tx, user);
  const [self] = await tx.select({ firstName: contacts.firstName, lastName: contacts.lastName }).from(contacts).where(eq(contacts.id, selfId));
  const guess = tree.people.find((p) => lower(p.firstName) === lower(self?.firstName) && lower(p.lastName) === lower(self?.lastName));
  return {
    people: tree.people.length,
    families: tree.families.length,
    matched: tree.people.flatMap((p) => {
      const m = matchPerson(p, existing);
      return m ? [{ xref: p.xref, name: fullName(m) }] : [];
    }),
    choices: tree.people.map((p) => ({ xref: p.xref, label: label(p) })).sort((a, b) => a.label.localeCompare(b.label)),
    selfGuess: guess?.xref ?? null,
    tooBig: tree.people.length > GEDCOM_MAX_PEOPLE,
  };
}

/**
 * Bring a GEDCOM tree in. People who match someone you already have (same name and birth year)
 * are linked rather than duplicated, and only their blanks get filled. `selfXref` is you.
 * Importing the same file twice adds nothing new.
 */
export async function importGedcom(tx: Tx, user: { tenantId: string; name: string }, tree: GedTree, selfXref: string | null) {
  const { tenantId } = user;
  const selfId = await ensureSelf(tx, user);
  const existing = await existingPeople(tx);
  const idOf = new Map<string, string>();
  let created = 0;
  let linked = 0;

  for (const p of tree.people) {
    if (p.xref === selfXref) {
      idOf.set(p.xref, selfId);
      if (p.sex !== "U") {
        await tx
          .update(contacts)
          .set({ pronouns: p.sex === "F" ? "she/her" : "he/him" })
          .where(and(eq(contacts.id, selfId), isNull(contacts.pronouns)));
      }
      continue;
    }
    const birthday = birthdayFrom(p.birth);
    const deathYear = p.death?.year ?? null;
    const match = matchPerson(p, existing);
    if (match) {
      idOf.set(p.xref, match.id);
      linked++;
      const [row] = await tx.select({ pronouns: contacts.pronouns, isDeceased: contacts.isDeceased, deathYear: contacts.deathYear }).from(contacts).where(eq(contacts.id, match.id));
      await tx
        .update(contacts)
        .set({
          pronouns: row?.pronouns ?? (p.sex === "F" ? "she/her" : p.sex === "M" ? "he/him" : null),
          isDeceased: row?.isDeceased || p.deceased,
          deathYear: row?.deathYear ?? deathYear,
        })
        .where(eq(contacts.id, match.id));
      if (birthday && match.birthYear == null) {
        const [has] = await tx.select({ id: importantDates.id }).from(importantDates).where(and(eq(importantDates.contactId, match.id), eq(importantDates.type, "birthday")));
        if (!has) await tx.insert(importantDates).values({ tenantId, contactId: match.id, type: "birthday", year: birthday.year ?? null, month: birthday.month, day: birthday.day });
      }
      continue;
    }

    const id = await insertContact(tx, tenantId, {
      firstName: p.firstName || "Unknown",
      lastName: p.lastName,
      pronouns: p.sex === "F" ? "she/her" : p.sex === "M" ? "he/him" : null,
      closeness: "acquaintance",
      keepInTouchDays: null,
      howMet: "Family tree import",
      birthday,
    });
    if (p.deceased) await tx.update(contacts).set({ isDeceased: true, deathYear }).where(eq(contacts.id, id));
    // A birth year alone has nowhere structured to go yet, so keep it as a note.
    if (!birthday && p.birth?.year) await insertNote(tx, tenantId, id, `Born ${p.birth.approx ? "about " : ""}${p.birth.year}`);
    idOf.set(p.xref, id);
    existing.push({ id, firstName: p.firstName, lastName: p.lastName, birthYear: birthday?.year ?? null });
    created++;
  }

  const famRows = await tx.select().from(families);
  const kidRows = await tx.select().from(familyChildren);
  let familiesAdded = 0;
  for (const f of tree.families) {
    const partners = [...new Set(f.partners.map((x) => idOf.get(x)).filter((x): x is string => !!x))];
    const children = f.children.flatMap((c) => (idOf.has(c.xref) ? [{ id: idOf.get(c.xref)!, kind: c.kind as ChildKind }] : []));
    const childIds = new Set(children.map((c) => c.id));
    // The same couple, or the same lone parent (or no parents) with one of the same children.
    const same = famRows.find((r) => {
      const rp = [r.partner1Id, r.partner2Id].filter(Boolean) as string[];
      if (partners.length === 2) return rp.length === 2 && partners.every((p) => rp.includes(p));
      const sharesChild = kidRows.some((k) => k.familyId === r.id && childIds.has(k.childId));
      return rp.length === partners.length && partners.every((p) => rp.includes(p)) && sharesChild;
    });
    let familyId = same?.id;
    if (same) {
      if (same.status === "unknown" && f.status !== "unknown") {
        await tx
          .update(families)
          .set({ status: f.status, startYear: same.startYear ?? f.startYear, endYear: same.endYear ?? f.endYear })
          .where(eq(families.id, same.id));
      }
    } else {
      const [row] = await tx
        .insert(families)
        .values({
          tenantId,
          partner1Id: partners[0] ?? null,
          partner2Id: partners[1] ?? null,
          status: partners.length === 2 && f.status === "unknown" ? "partners" : f.status,
          startYear: f.startYear,
          endYear: f.endYear,
        })
        .returning();
      famRows.push(row!);
      familyId = row!.id;
      familiesAdded++;
    }
    for (const c of children) {
      await tx.insert(familyChildren).values({ tenantId, familyId: familyId!, childId: c.id, kind: c.kind }).onConflictDoNothing();
      kidRows.push({ tenantId, familyId: familyId!, childId: c.id, kind: c.kind });
    }
  }

  return { created, linked, families: familiesAdded };
}
