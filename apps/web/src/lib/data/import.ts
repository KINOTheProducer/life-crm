import "server-only";
import type { DocumentExtraction, Extractor, KnownPerson } from "@life-crm/ai";
import { birthdayInText, partnerPrompts, type FactCategory, type PartialDate } from "@life-crm/core";
import { and, eq, inArray, isNull, ne, schema, type Tx } from "@life-crm/db";
import {
  itemDuplicate,
  SUBJECT,
  type Destination,
  type ExistingProfile,
  type ImportInput,
  type ImportItem,
  type ImportPerson,
} from "@/lib/import-items";
import type { ResortSuggestion } from "@/lib/resort-items";
import { birthdayOf, insertContact, setBirthday } from "./contacts";
import { formatPartialDate } from "./dates";
import { insertFact, insertInteraction, insertNote } from "./entries";
import { connectFriends, connectRelative, type RelativeRole } from "./family";
import { addMilestone, partnershipFor } from "./partners";
import { savedAbout, savedLines, suggestResort } from "./resort";
import { recordTimeline } from "./timeline";

const { contacts, facts, importantDates, partnershipMilestones } = schema;

export const MAX_IMPORT_CHARS = 50_000;

export async function existingProfile(tx: Tx, contactId: string): Promise<ExistingProfile | null> {
  const [contact] = await tx
    .select({ firstName: contacts.firstName, nickname: contacts.nickname, pronouns: contacts.pronouns, howMet: contacts.howMet })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)));
  if (!contact) return null;
  const birthday = await birthdayOf(tx, contactId);
  const known = await tx
    .select({ category: facts.category, label: facts.label, value: facts.value })
    .from(facts)
    .where(and(eq(facts.contactId, contactId), isNull(facts.archivedAt)));
  const dates = await tx
    .select({ type: importantDates.type, label: importantDates.label, month: importantDates.month, day: importantDates.day })
    .from(importantDates)
    .where(and(eq(importantDates.contactId, contactId), ne(importantDates.type, "birthday")));
  const partnership = await partnershipFor(tx, contactId);
  const current = partnership?.status === "current" ? partnership : null;
  const milestones = current
    ? await tx
        .select({ kind: partnershipMilestones.kind, month: partnershipMilestones.month, day: partnershipMilestones.day })
        .from(partnershipMilestones)
        .where(eq(partnershipMilestones.partnershipId, current.id))
    : [];
  return {
    ...contact,
    birthday: birthday && { year: birthday.year, month: birthday.month, day: birthday.day },
    facts: known,
    dates,
    milestones,
    partnerLabel: current?.label ?? null,
  };
}

/** Everyone else, to match names in a file against. */
export async function knownPeople(tx: Tx, exceptId: string): Promise<KnownPerson[]> {
  const rows = await tx
    .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, nickname: contacts.nickname })
    .from(contacts)
    .where(and(isNull(contacts.deletedAt), eq(contacts.isSelf, false), ne(contacts.id, exceptId)))
    .limit(1000);
  return rows.map((r) => ({ id: r.id, name: [r.firstName, r.lastName].filter(Boolean).join(" "), nickname: r.nickname }));
}

let counter = 0;
function item(person: string, destination: Destination, fields: Partial<ImportItem>, today: string): ImportItem {
  return {
    id: `i${++counter}`,
    person,
    destination,
    text: "",
    label: "",
    category: "interest",
    date: null,
    dateKind: "custom",
    milestone: "custom",
    on: today,
    type: "in_person",
    ...fields,
  };
}

const toDate = (d: { month: number; day: number; year: number | null }): PartialDate => ({ month: d.month, day: d.day, year: d.year });

/** Turn what the model read into items, for the subject and for each person the file mentions. */
export function itemsFromDocument(doc: DocumentExtraction, today: string) {
  const items: ImportItem[] = [];
  const s = doc.subject;
  if (s.birthday) items.push(item(SUBJECT, "birthday", { date: toDate(s.birthday) }, today));
  if (s.nickname) items.push(item(SUBJECT, "nickname", { text: s.nickname }, today));
  if (s.pronouns) items.push(item(SUBJECT, "pronouns", { text: s.pronouns }, today));
  if (s.howMet) items.push(item(SUBJECT, "howMet", { text: s.howMet }, today));
  for (const m of s.milestones) items.push(item(SUBJECT, "milestone", { milestone: m.kind, label: m.label ?? "", date: toDate(m) }, today));
  for (const d of s.dates) items.push(item(SUBJECT, "date", { dateKind: d.kind, label: d.label, date: toDate(d) }, today));
  for (const f of s.facts) items.push(item(SUBJECT, "fact", { label: f.label, text: f.value, category: f.category }, today));
  for (const n of s.notes) items.push(item(SUBJECT, "note", { text: n }, today));
  for (const c of s.catchups) items.push(item(SUBJECT, "catchup", { text: c.summary, on: c.date, type: c.type }, today));

  const people: ImportPerson[] = [];
  for (const o of doc.others) {
    people.push({
      ref: o.ref,
      firstName: o.firstName,
      lastName: o.lastName ?? "",
      contactId: o.existingContactId,
      skip: false,
      relation: o.relation,
      relationLabel: o.relationLabel ?? "",
    });
    if (o.birthday) items.push(item(o.ref, "birthday", { date: toDate(o.birthday) }, today));
    for (const d of o.dates) items.push(item(o.ref, "date", { dateKind: d.kind, label: d.label, date: toDate(d) }, today));
    for (const f of o.facts) items.push(item(o.ref, "fact", { label: f.label, text: f.value, category: f.category }, today));
    if (o.note) items.push(item(o.ref, "note", { text: o.note }, today));
  }
  return { items, people };
}

const categoryWords: [RegExp, FactCategory][] = [
  [/job|work|employ|career|company|office/, "work"],
  [/cat|dog|pet|puppy|kitten|fish|bird/, "pets"],
  [/wife|husband|partner|kid|son|daughter|mom|dad|mother|father|sister|brother|family/, "family"],
  [/allerg|vegan|vegetarian|diet|food|eat|drink/, "dietary"],
  [/size|shoe|ring|shirt|pants|dress/, "sizes"],
  [/favou?rite|fav\b/, "favourites"],
  [/health|medical|surgery|condition/, "health"],
  [/lives?|address|home|city|neighbou?rhood/, "home"],
  [/ask about|follow.?up|next time/, "follow_up"],
  [/wants?|wishlist|gift/, "wishlist"],
  [/likes?|dislikes?|hates?|loves?|prefer/, "preference"],
];

function guessCategory(label: string): FactCategory {
  const l = label.toLowerCase();
  return categoryWords.find(([re]) => re.test(l))?.[1] ?? "interest";
}

function fromLabel(label: string, value: string, today: string, isPartner: boolean): ImportItem {
  const l = label.toLowerCase().trim();
  if (/^(birthday|bday|b-day|born|dob|date of birth)$/.test(l)) {
    return item(SUBJECT, "birthday", { date: birthdayInText(`birthday ${value}`), text: value }, today);
  }
  if (/anniversary|started dating|got together/.test(l)) {
    const date = birthdayInText(`birthday ${value}`);
    return isPartner
      ? item(SUBJECT, "milestone", { milestone: "official", date, text: value }, today)
      : item(SUBJECT, "date", { dateKind: "anniversary", label: label.trim(), date, text: value }, today);
  }
  if (/^(nickname|nick|goes by)$/.test(l)) return item(SUBJECT, "nickname", { text: value }, today);
  if (/^pronouns?$/.test(l)) return item(SUBJECT, "pronouns", { text: value }, today);
  if (/^how (we|i) met$|^met$/.test(l)) return item(SUBJECT, "howMet", { text: value }, today);
  return item(SUBJECT, "fact", { label: label.trim(), text: value, category: guessCategory(label) }, today);
}

/**
 * Sort a file without AI: "Label: value" lines and short lines under a heading become fields
 * or facts, everything else becomes notes.
 */
export function itemsFromRules(text: string, today: string, isPartner = false): ImportItem[] {
  const items: ImportItem[] = [];
  let section: string | null = null;
  let paragraph: string[] = [];

  const flush = () => {
    const body = paragraph.join("\n").trim();
    paragraph = [];
    if (!body) return;
    // A heading only labels the line right under it, like "## Birthday" then "August 8".
    const label = section;
    section = null;
    if (label && !body.includes("\n") && body.length <= 120) {
      items.push(fromLabel(label, body, today, isPartner));
      return;
    }
    const birthday = birthdayInText(body);
    items.push(birthday ? item(SUBJECT, "birthday", { date: birthday, text: body }, today) : item(SUBJECT, "note", { text: body }, today));
  };

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      section = heading[1]!.replace(/[:*_]+$/g, "").trim();
      continue;
    }
    if (!line) {
      flush();
      continue;
    }
    const kv = /^(?:[-*•]\s*)?\**([^:]{1,40}?)\**\s*:\s*(.+)$/.exec(line);
    if (kv && !/^https?$/i.test(kv[1]!)) {
      flush();
      items.push(fromLabel(kv[1]!, kv[2]!.trim(), today, isPartner));
      continue;
    }
    paragraph.push(line.replace(/^[-*•]\s+/, ""));
  }
  flush();
  return items;
}

export interface ImportPreview {
  items: ImportItem[];
  /** Better homes for what's already saved, offered alongside the file. */
  resort: ResortSuggestion[];
  /** Everyone else the file mentions. */
  people: ImportPerson[];
  /** The name the file seems to be about, when it isn't this person. */
  nameInFile: string | null;
  sortedBy: "ai" | "rules";
}

/** Whether a name in the file plausibly refers to this contact. */
function sameName(nameInFile: string, contact: { name: string; nickname: string | null }) {
  const words = (s: string) => s.toLowerCase().split(/[^\p{L}'-]+/u).filter(Boolean);
  const theirs = new Set([...words(contact.name), ...words(contact.nickname ?? "")]);
  return words(nameInFile).some((w) => theirs.has(w));
}

/** `extractor` is null when AI is off for this user; the rules below still run. */
export async function readImport(
  text: string,
  contact: { id: string; name: string; nickname: string | null; partnerLabel: string | null },
  others: KnownPerson[],
  saved: Awaited<ReturnType<typeof savedAbout>>,
  today: string,
  timeZone: string,
  extractor: Extractor | null,
): Promise<ImportPreview> {
  if (extractor) {
    const subject = { id: contact.id, name: contact.name, nickname: contact.nickname, partnerLabel: contact.partnerLabel };
    // A re-import also looks again at what's saved, so the file and the profile end up sorted the same way.
    const resorting = suggestResort(extractor, saved, subject, others, today).catch((error) => {
      console.warn("Re-sort during import failed", error);
      return [];
    });
    try {
      const doc = await extractor.readDocument({ text, today, timeZone, subject, knownPeople: others, partnerPrompts, alreadySaved: savedLines(saved) });
      const result = itemsFromDocument(doc, today);
      const resort = await resorting;
      if (result.items.length > 0 || result.people.length > 0 || resort.length > 0) {
        const nameInFile = doc.nameInFile && !sameName(doc.nameInFile, contact) ? doc.nameInFile : null;
        return { ...result, resort, nameInFile, sortedBy: "ai" };
      }
    } catch (error) {
      // AI failed. Simple rules still get most structured notes right.
      console.warn("Import extraction failed, using rules", error);
    }
  }
  return { items: itemsFromRules(text, today, !!contact.partnerLabel), people: [], resort: [], nameInFile: null, sortedBy: "rules" };
}

const treeRoles: Partial<Record<ImportPerson["relation"], RelativeRole>> = { parent: "parent", child: "child", sibling: "sibling", partner: "partner" };

/** Find or create each mentioned person and link them to the subject. Returns their contact ids by ref. */
async function resolvePeople(tx: Tx, tenantId: string, subjectId: string, subjectFirstName: string, people: ImportPerson[]) {
  const ids = new Map<string, string>();
  const chosen = people.filter((p) => !p.skip && p.contactId && p.contactId !== subjectId).map((p) => p.contactId!);
  if (chosen.length) {
    // Checked before writing anything, so a stale page can't leave half an import behind.
    const found = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(inArray(contacts.id, chosen), isNull(contacts.deletedAt)));
    if (found.length !== new Set(chosen).size) throw new ImportError("One of the people in the file no longer exists. Reload and try again.");
  }
  for (const p of people) {
    if (p.skip || p.contactId === subjectId) continue;
    if (p.contactId) {
      ids.set(p.ref, p.contactId);
      // People already in the tree keep their links; only friendships are safe to add twice.
      if (p.relation === "friend") await connectFriends(tx, tenantId, subjectId, p.contactId);
      continue;
    }
    const id = await insertContact(tx, tenantId, {
      firstName: p.firstName,
      lastName: p.lastName || null,
      // Like other imports, new people don't start nudging you.
      closeness: "acquaintance",
      keepInTouchDays: null,
    });
    ids.set(p.ref, id);
    const role = treeRoles[p.relation];
    if (role) await connectRelative(tx, tenantId, { anchorId: subjectId, personId: id, role });
    else if (p.relation === "friend") await connectFriends(tx, tenantId, subjectId, id);
    // Coworkers and anyone the tree can't place still say how they're connected.
    if (!role && p.relation !== "friend") {
      const label = p.relationLabel || (p.relation === "coworker" ? "coworker" : "connection");
      await insertFact(tx, tenantId, id, { category: p.relation === "coworker" ? "work" : "other", label: "Connected through", value: `${subjectFirstName}'s ${label.toLowerCase()}` });
    }
  }
  return ids;
}

/** An error whose message is safe to show. */
export class ImportError extends Error {}

/**
 * Save what the user approved. On the subject, single fields that differ are replaced; on other
 * people, birthdays and fields only fill blanks. Facts, dates and milestones already saved are skipped.
 */
export async function commitImport(tx: Tx, tenantId: string, contactId: string, input: ImportInput, existing: ExistingProfile) {
  const ids = await resolvePeople(tx, tenantId, contactId, existing.firstName, input.people);
  ids.set(SUBJECT, contactId);
  const partnership = existing.partnerLabel ? await partnershipFor(tx, contactId) : null;

  let saved = 0;
  const fields: { nickname?: string; pronouns?: string; howMet?: string } = {};
  for (const i of input.items) {
    const target = ids.get(i.person);
    if (!target || i.destination === "skip" || itemDuplicate(i, existing)) continue;
    const isSubject = i.person === SUBJECT;
    switch (i.destination) {
      case "birthday":
        if (isSubject || !(await birthdayOf(tx, target))) await setBirthday(tx, tenantId, target, i.date as PartialDate);
        break;
      case "nickname":
      case "pronouns":
      case "howMet":
        if (isSubject) fields[i.destination] = i.text;
        break;
      case "fact": {
        if (!isSubject) {
          const [dupe] = await tx
            .select({ id: facts.id })
            .from(facts)
            .where(and(eq(facts.contactId, target), eq(facts.category, i.category), eq(facts.value, i.text), isNull(facts.archivedAt)));
          if (dupe) continue;
        }
        await insertFact(tx, tenantId, target, { category: i.category, label: i.label, value: i.text.slice(0, 500) });
        break;
      }
      case "date": {
        const d = i.date as PartialDate;
        const [dupe] = await tx
          .select({ id: importantDates.id })
          .from(importantDates)
          .where(and(eq(importantDates.contactId, target), eq(importantDates.type, i.dateKind), eq(importantDates.month, d.month), eq(importantDates.day, d.day)));
        if (dupe) continue;
        const [row] = await tx
          .insert(importantDates)
          .values({ tenantId, contactId: target, type: i.dateKind, label: i.label, year: d.year ?? null, month: d.month, day: d.day })
          .returning({ id: importantDates.id });
        await recordTimeline(tx, [{ tenantId, contactId: target, kind: "date", occurredAt: new Date(), title: `${i.label} added`, body: formatPartialDate(d), refId: row!.id }]);
        break;
      }
      case "milestone":
        if (!isSubject || !partnership) continue;
        await addMilestone(tx, { tenantId, partnershipId: partnership.id, contactId }, { kind: i.milestone, label: i.milestone === "custom" ? i.label || null : null, date: i.date as PartialDate });
        break;
      case "note":
        await insertNote(tx, tenantId, target, i.text);
        break;
      case "catchup":
        if (!isSubject) continue;
        await insertInteraction(tx, tenantId, target, { type: i.type, date: i.on, location: null, summary: i.text.slice(0, 2000) });
        break;
    }
    saved++;
  }
  if (Object.keys(fields).length > 0) {
    await tx.update(contacts).set(fields).where(eq(contacts.id, contactId));
    const titles = { nickname: "Nickname", pronouns: "Pronouns", howMet: "How you met" };
    await recordTimeline(
      tx,
      Object.entries(fields).map(([k, v]) => ({ tenantId, contactId, kind: "fact" as const, occurredAt: new Date(), title: titles[k as keyof typeof titles], body: v })),
    );
  }
  return saved;
}
