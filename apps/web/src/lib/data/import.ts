import "server-only";
import type { Extraction, Extractor } from "@life-crm/ai";
import { birthdayInText, type FactCategory, type PartialDate } from "@life-crm/core";
import { and, eq, isNull, schema, type Tx } from "@life-crm/db";
import {
  itemDuplicate,
  itemProblem,
  type Destination,
  type ExistingProfile,
  type ImportItem,
} from "@/lib/import-items";
import { birthdayOf, setBirthday } from "./contacts";
import { insertFact, insertInteraction, insertNote } from "./entries";
import { recordTimeline } from "./timeline";

const { contacts, facts } = schema;

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
  return { ...contact, birthday: birthday && { year: birthday.year, month: birthday.month, day: birthday.day }, facts: known };
}

let counter = 0;
function item(destination: Destination, fields: Partial<ImportItem>, today: string): ImportItem {
  return {
    id: `i${++counter}`,
    destination,
    text: "",
    label: "",
    category: "interest",
    date: null,
    on: today,
    type: "in_person",
    ...fields,
  };
}

/** Turn an extraction into items for the one person being imported into. */
function itemsFromExtraction(extraction: Extraction, contactId: string, today: string) {
  const person = extraction.people.find((p) => p.existingContactId === contactId) ?? extraction.people[0];
  if (!person) return { items: [] as ImportItem[], nameInFile: null, others: [] as string[] };
  const items: ImportItem[] = [];
  if (person.birthday) items.push(item("birthday", { date: person.birthday, text: "" }, today));
  if (person.nickname) items.push(item("nickname", { text: person.nickname }, today));
  if (person.pronouns) items.push(item("pronouns", { text: person.pronouns }, today));
  if (person.howMet) items.push(item("howMet", { text: person.howMet }, today));
  for (const f of person.facts) items.push(item("fact", { label: f.label, text: f.value, category: f.category }, today));
  if (person.note) items.push(item("note", { text: person.note }, today));
  const ix = extraction.interaction;
  if (ix && ix.participantRefs.includes(person.ref)) {
    items.push(item("catchup", { text: ix.summary, on: ix.date > today ? today : ix.date, type: ix.type }, today));
  }
  const name = [person.firstName, person.lastName].filter(Boolean).join(" ");
  return {
    items,
    nameInFile: person.existingContactId === contactId ? null : name,
    others: extraction.people.filter((p) => p !== person).map((p) => [p.firstName, p.lastName].filter(Boolean).join(" ")),
  };
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

function fromLabel(label: string, value: string, today: string): ImportItem {
  const l = label.toLowerCase().trim();
  if (/^(birthday|bday|b-day|born|dob|date of birth)$/.test(l)) {
    return item("birthday", { date: birthdayInText(`birthday ${value}`), text: value }, today);
  }
  if (/^(nickname|nick|goes by)$/.test(l)) return item("nickname", { text: value }, today);
  if (/^pronouns?$/.test(l)) return item("pronouns", { text: value }, today);
  if (/^how (we|i) met$|^met$/.test(l)) return item("howMet", { text: value }, today);
  return item("fact", { label: label.trim(), text: value, category: guessCategory(label) }, today);
}

/**
 * Sort a file without AI: "Label: value" lines and short lines under a heading become fields
 * or facts, everything else becomes notes.
 */
export function itemsFromRules(text: string, today: string): ImportItem[] {
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
      items.push(fromLabel(label, body, today));
      return;
    }
    const birthday = birthdayInText(body);
    items.push(birthday ? item("birthday", { date: birthday, text: body }, today) : item("note", { text: body }, today));
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
      items.push(fromLabel(kv[1]!, kv[2]!.trim(), today));
      continue;
    }
    paragraph.push(line.replace(/^[-*•]\s+/, ""));
  }
  flush();
  return items;
}

export interface ImportPreview {
  items: ImportItem[];
  /** The name the file seems to be about, when it isn't this person. */
  nameInFile: string | null;
  /** Other people the file mentions, which this import leaves out. */
  others: string[];
  sortedBy: "ai" | "rules";
}

/** `extractor` is null when AI is off for this user; the rules below still run. */
export async function readImport(
  text: string,
  contact: { id: string; name: string; nickname: string | null },
  today: string,
  timeZone: string,
  extractor: Extractor | null,
): Promise<ImportPreview> {
  if (extractor) {
    try {
      const known = { id: contact.id, name: contact.name, nickname: contact.nickname };
      const extraction = await extractor.extract({ transcript: text, today, timeZone, knownPeople: [known], contextPerson: known });
      const result = itemsFromExtraction(extraction, contact.id, today);
      if (result.items.length > 0) return { ...result, sortedBy: "ai" };
    } catch (error) {
      // AI failed. Simple rules still get most structured notes right.
      console.warn("Import extraction failed, using rules", error);
    }
  }
  return { items: itemsFromRules(text, today), nameInFile: null, others: [], sortedBy: "rules" };
}

const single: Destination[] = ["birthday", "nickname", "pronouns", "howMet"];

/** Check the reviewed items, or say what's wrong with them. */
export function importProblem(items: ImportItem[], today: string): string | null {
  for (const d of single) {
    if (items.filter((i) => i.destination === d).length > 1) return `Only one item can go to ${d === "howMet" ? "How you met" : d}`;
  }
  for (const i of items) {
    const problem = itemProblem(i, today);
    if (problem) return problem;
  }
  return null;
}

/** Save what the person approved. Replaces single fields that differ; skips facts already saved. */
export async function commitImport(tx: Tx, tenantId: string, contactId: string, items: ImportItem[], existing: ExistingProfile) {
  let saved = 0;
  const fields: { nickname?: string; pronouns?: string; howMet?: string } = {};
  for (const i of items) {
    if (i.destination === "skip" || itemDuplicate(i, existing)) continue;
    switch (i.destination) {
      case "birthday":
        await setBirthday(tx, tenantId, contactId, i.date as PartialDate);
        break;
      case "nickname":
      case "pronouns":
      case "howMet":
        fields[i.destination] = i.text;
        break;
      case "fact":
        await insertFact(tx, tenantId, contactId, { category: i.category, label: i.label, value: i.text.slice(0, 500) });
        break;
      case "note":
        await insertNote(tx, tenantId, contactId, i.text);
        break;
      case "catchup":
        await insertInteraction(tx, tenantId, contactId, { type: i.type, date: i.on, location: null, summary: i.text.slice(0, 2000) });
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
