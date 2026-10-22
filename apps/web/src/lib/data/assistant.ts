import "server-only";
import { createHash } from "node:crypto";
import { listNames, type Answer, type Source } from "@life-crm/ai";
import { closenessLabels, formatIsoDate, kinWords, lifeEventTypeLabels, questionKeywords, stem, todayIn, type LifeEventType } from "@life-crm/core";
import type { AskAboutItem } from "@life-crm/db/schema";
import { and, asc, desc, eq, ilike, inArray, isNull, or, schema, sql, type Column, type Tx } from "@life-crm/db";
import { assistantForUser } from "@/lib/ai";
import type { CurrentUser } from "@/lib/session";
import { fullName } from "./contacts";
import { formatPartialDate } from "./dates";
import { ensureSelf, loadFamily, relationsOf, type FamilyData } from "./family";

const { addresses, contactSummaries, contacts, facts, importantDates, interactionPeople, interactions, lifeEvents, notes } = schema;

/** What a source ref points at, so answers and follow-ups can link back. */
export interface SourceInfo {
  kind: "person" | "fact" | "note" | "interaction" | "life_event";
  id: string;
  contactId: string;
  contactName: string;
}

export interface Citation extends SourceInfo {
  ref: string;
  date: string | null;
  text: string;
}

/** Numbers sources per kind ("F1", "N2") as they're added and remembers what each one is. */
class SourceList {
  readonly sources: Source[] = [];
  readonly info = new Map<string, SourceInfo>();
  private readonly seen = new Set<string>();
  private readonly counts: Record<string, number> = {};

  add(prefix: string, info: SourceInfo, source: Omit<Source, "ref">) {
    const key = `${info.kind}:${info.id}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.counts[prefix] = (this.counts[prefix] ?? 0) + 1;
    const ref = `${prefix}${this.counts[prefix]}`;
    this.sources.push({ ref, ...source });
    this.info.set(ref, info);
  }

  citation(ref: string): Citation | null {
    const info = this.info.get(ref);
    const source = this.sources.find((s) => s.ref === ref);
    return info && source ? { ...info, ref, date: source.date ?? null, text: source.text } : null;
  }
}

const isoIn = (d: Date, timeZone: string) => d.toLocaleDateString("en-CA", { timeZone });

type PersonRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  nickname: string | null;
  relationship: string | null;
  closeness: keyof typeof closenessLabels;
  company: string | null;
  jobTitle: string | null;
  howMet: string | null;
  isDeceased: boolean;
  lastInteractionAt: Date | null;
};

const personColumns = {
  id: contacts.id,
  firstName: contacts.firstName,
  lastName: contacts.lastName,
  nickname: contacts.nickname,
  relationship: contacts.relationship,
  closeness: contacts.closeness,
  company: contacts.company,
  jobTitle: contacts.jobTitle,
  howMet: contacts.howMet,
  isDeceased: contacts.isDeceased,
  lastInteractionAt: contacts.lastInteractionAt,
};

/**
 * One line about a person: what they are to you, where they live and work, birthday,
 * immediate family and when you last caught up. Detailed lines are for the people a
 * question or summary is about; short ones fill in the directory.
 */
async function personLines(tx: Tx, people: PersonRow[], family: FamilyData, timeZone: string, detailed: Set<string>) {
  if (people.length === 0) return new Map<string, string>();
  const ids = people.map((p) => p.id);
  const cities = await tx
    .select({ contactId: addresses.contactId, city: addresses.city })
    .from(addresses)
    .where(and(inArray(addresses.contactId, ids), sql`${addresses.city} is not null`));
  const births = await tx
    .select({ contactId: importantDates.contactId, year: importantDates.year, month: importantDates.month, day: importantDates.day })
    .from(importantDates)
    .where(and(inArray(importantDates.contactId, ids), eq(importantDates.type, "birthday")));

  const lines = new Map<string, string>();
  for (const p of people) {
    const term = family.termFor(p.id);
    const toYou = (term && term !== "you" ? `your ${term}` : null) ?? p.relationship;
    const parts = [
      toYou,
      closenessLabels[p.closeness].toLowerCase(),
      p.isDeceased ? "passed away" : null,
      cities.filter((c) => c.contactId === p.id).map((c) => `lives in ${c.city}`)[0],
      p.jobTitle || p.company ? `works${p.jobTitle ? ` as ${p.jobTitle}` : ""}${p.company ? ` at ${p.company}` : ""}` : null,
      p.lastInteractionAt ? `last caught up ${isoIn(p.lastInteractionAt, timeZone)}` : "no catch-ups logged",
      p.howMet ? `how you met: ${p.howMet}` : null,
    ];
    if (detailed.has(p.id)) {
      const b = births.find((x) => x.contactId === p.id);
      if (b) parts.push(`birthday ${formatPartialDate(b)}`);
      const rel = relationsOf(family, p.id).relations.filter((r) => r.name !== "You");
      if (rel.length) parts.push(`family: ${rel.map((r) => `${r.term} ${r.name}`).join(", ")}`);
    }
    const name = `${fullName(p)}${p.nickname ? ` ("${p.nickname}")` : ""}`;
    lines.set(p.id, `${name}: ${parts.filter(Boolean).join("; ")}`);
  }
  return lines;
}

/** Facts, notes, catch-ups and life events for some people, newest first, as sources. */
async function addDetails(
  tx: Tx,
  list: SourceList,
  names: Map<string, string>,
  timeZone: string,
  where: { contactIds?: string[]; match?: string[] },
  limits = { facts: 200, notes: 20, interactions: 20, events: 20 },
) {
  const { contactIds, match } = where;
  const anyLike = (...cols: Column[]) => or(...cols.flatMap((c) => (match ?? []).map((m) => ilike(c, `%${m}%`))));
  const scope = (col: Column) => (contactIds ? inArray(col, contactIds) : undefined);

  const factRows = await tx
    .select({ id: facts.id, contactId: facts.contactId, label: facts.label, value: facts.value, createdAt: facts.createdAt })
    .from(facts)
    .innerJoin(contacts, eq(contacts.id, facts.contactId))
    .where(and(isNull(facts.archivedAt), isNull(contacts.deletedAt), scope(facts.contactId), match ? anyLike(facts.value, facts.label) : undefined))
    .orderBy(desc(facts.createdAt))
    .limit(limits.facts);
  for (const f of factRows) {
    const name = names.get(f.contactId) ?? "";
    list.add("F", { kind: "fact", id: f.id, contactId: f.contactId, contactName: name }, { person: name, date: isoIn(f.createdAt, timeZone), text: `${f.label}: ${f.value}` });
  }

  const noteRows = await tx
    .select({ id: notes.id, contactId: notes.contactId, body: notes.body, createdAt: notes.createdAt })
    .from(notes)
    .innerJoin(contacts, eq(contacts.id, notes.contactId))
    .where(and(isNull(notes.deletedAt), isNull(contacts.deletedAt), scope(notes.contactId), match ? anyLike(notes.body) : undefined))
    .orderBy(desc(notes.createdAt))
    .limit(limits.notes);
  for (const n of noteRows) {
    const name = names.get(n.contactId) ?? "";
    // Long imported notes are trimmed; the first part is usually what matters.
    list.add("N", { kind: "note", id: n.id, contactId: n.contactId, contactName: name }, { person: name, date: isoIn(n.createdAt, timeZone), text: n.body.slice(0, 1500) });
  }

  const interactionRows = await tx
    .selectDistinctOn([interactions.occurredAt, interactions.id], {
      id: interactions.id,
      summary: interactions.summary,
      location: interactions.location,
      occurredAt: interactions.occurredAt,
    })
    .from(interactions)
    .innerJoin(interactionPeople, eq(interactionPeople.interactionId, interactions.id))
    .where(
      and(
        contactIds ? inArray(interactionPeople.contactId, contactIds) : undefined,
        match ? anyLike(interactions.summary, interactions.location) : undefined,
      ),
    )
    .orderBy(desc(interactions.occurredAt), interactions.id)
    .limit(limits.interactions);
  if (interactionRows.length) {
    const who = await tx
      .select({ interactionId: interactionPeople.interactionId, contactId: interactionPeople.contactId, firstName: contacts.firstName, lastName: contacts.lastName })
      .from(interactionPeople)
      .innerJoin(contacts, eq(contacts.id, interactionPeople.contactId))
      .where(inArray(interactionPeople.interactionId, interactionRows.map((i) => i.id)));
    for (const i of interactionRows) {
      const people = who.filter((w) => w.interactionId === i.id);
      const main = people.find((p) => contactIds?.includes(p.contactId)) ?? people[0];
      if (!main) continue;
      const withNames = people.map((p) => fullName(p)).join(", ");
      list.add(
        "I",
        { kind: "interaction", id: i.id, contactId: main.contactId, contactName: fullName(main) },
        { person: withNames, date: isoIn(i.occurredAt, timeZone), text: `Caught up${i.location ? ` at ${i.location}` : ""}. ${i.summary}` },
      );
    }
  }

  const eventRows = await tx
    .select({ id: lifeEvents.id, contactId: lifeEvents.contactId, type: lifeEvents.type, title: lifeEvents.title, notes: lifeEvents.notes, occurredOn: lifeEvents.occurredOn })
    .from(lifeEvents)
    .innerJoin(contacts, eq(contacts.id, lifeEvents.contactId))
    .where(and(isNull(contacts.deletedAt), scope(lifeEvents.contactId), match ? anyLike(lifeEvents.title, lifeEvents.notes) : undefined))
    .orderBy(desc(lifeEvents.occurredOn))
    .limit(limits.events);
  for (const e of eventRows) {
    const name = names.get(e.contactId) ?? "";
    const text = [lifeEventTypeLabels[e.type as LifeEventType], e.title, e.notes].filter(Boolean).join(". ");
    list.add("E", { kind: "life_event", id: e.id, contactId: e.contactId, contactName: name }, { person: name, date: e.occurredOn, text });
  }
}

async function namesFor(tx: Tx, ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const rows = await tx.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName }).from(contacts).where(inArray(contacts.id, ids));
  return new Map(rows.map((r) => [r.id, fullName(r)]));
}

/* Person summary */

async function summarySources(tx: Tx, user: CurrentUser, contactId: string) {
  const [person] = await tx
    .select(personColumns)
    .from(contacts)
    .where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)));
  if (!person) return null;
  const family = await loadFamily(tx, await ensureSelf(tx, user));
  const line = (await personLines(tx, [person], family, user.timeZone, new Set([contactId]))).get(contactId)!;
  const list = new SourceList();
  await addDetails(tx, list, new Map([[contactId, fullName(person)]]), user.timeZone, { contactIds: [contactId] }, { facts: 200, notes: 20, interactions: 25, events: 20 });
  // Sizes and gift ideas don't say anything about who someone is.
  const sources = list.sources.filter((s) => !/^(Size|Gift idea)/i.test(s.text));
  const key = createHash("sha256").update(JSON.stringify([line, sources])).digest("hex");
  return { person, line, list, sources, key };
}

export interface PersonSummaryView {
  summary: string;
  askAbout: (AskAboutItem & { contactId: string })[];
  generatedAt: Date;
  stale: boolean;
}

/** The stored summary card, if any, and whether notes have changed since it was written. */
export async function summaryFor(tx: Tx, user: CurrentUser, contactId: string): Promise<{ view: PersonSummaryView | null; sourceCount: number }> {
  const [row] = await tx.select().from(contactSummaries).where(eq(contactSummaries.contactId, contactId));
  const built = await summarySources(tx, user, contactId);
  const sourceCount = built?.sources.length ?? 0;
  if (!row || !built) return { view: null, sourceCount };
  return {
    view: {
      summary: row.summary,
      askAbout: row.askAbout.map((a) => ({ ...a, contactId })),
      generatedAt: row.generatedAt,
      stale: row.sourceKey !== built.key,
    },
    sourceCount,
  };
}

/** Write (or rewrite) someone's summary card from everything noted about them. */
export async function refreshSummary(tx: Tx, user: CurrentUser, contactId: string) {
  const built = await summarySources(tx, user, contactId);
  if (!built) throw new Error("Person not found");
  const assistant = await assistantForUser(tx, user.id);
  const out = await assistant.summarize({ person: built.line, sources: built.sources, today: formatIsoDate(todayIn(user.timeZone)) });
  const askAbout: AskAboutItem[] = out.askAbout.map((a) => {
    const info = a.ref ? built.list.info.get(a.ref) : null;
    return { text: a.text, source: info ? `${info.kind}:${info.id}` : null };
  });
  const values = { tenantId: user.tenantId, contactId, summary: out.summary, askAbout, sourceKey: built.key, generatedAt: new Date() };
  await tx.insert(contactSummaries).values(values).onConflictDoUpdate({ target: contactSummaries.contactId, set: values });
}

/* Ask */

const DIRECTORY_LIMIT = 300;
const NAMED_LIMIT = 4;

/**
 * Gather what might answer a question: a one-line directory of everyone, full detail on
 * anyone the question names (by name, nickname, or "grandpa"), and anything else whose
 * words match. Plain word matching for now; embeddings would slot in here.
 */
export async function askSources(tx: Tx, user: CurrentUser, question: string, onStep: (line: string) => void = () => {}) {
  const words = questionKeywords(question);
  const family = await loadFamily(tx, await ensureSelf(tx, user));

  const people = await tx
    .select(personColumns)
    .from(contacts)
    .where(and(isNull(contacts.deletedAt), eq(contacts.isSelf, false)))
    .orderBy(sql`case ${contacts.closeness} when 'inner' then 0 when 'close' then 1 when 'friend' then 2 else 3 end`, desc(contacts.lastInteractionAt), asc(contacts.firstName))
    .limit(DIRECTORY_LIMIT);

  const named = new Set<string>();
  const kin = words.map((w) => kinWords[w]).filter(Boolean);
  for (const p of people) {
    const own = [p.firstName, p.lastName, p.nickname, p.relationship].filter(Boolean).map((s) => s!.toLowerCase());
    const term = family.termFor(p.id);
    if (words.some((w) => own.some((o) => o === w || o.split(/\s+/).includes(w))) || (term && kin.some((k) => term.includes(k!)))) named.add(p.id);
    if (named.size >= NAMED_LIMIT) break;
  }

  const topical = words.filter((w) => !kinWords[w] && !people.some((p) => named.has(p.id) && [p.firstName, p.lastName, p.nickname].some((n) => n?.toLowerCase() === w)));
  const namedPeople = people.filter((p) => named.has(p.id));
  if (namedPeople.length) onStep(`Looking at what you know about ${listNames(namedPeople.map((p) => p.firstName))}`);
  if (topical.length) onStep(`Searching your notes for ${listNames(topical.slice(0, 3).map((w) => `"${w}"`))}`);
  if (!namedPeople.length && !topical.length) onStep(`Going through the ${people.length} people you know`);

  const lines = await personLines(tx, people, family, user.timeZone, named);
  const names = new Map(people.map((p) => [p.id, fullName(p)]));
  const list = new SourceList();
  for (const p of people) list.add("P", { kind: "person", id: p.id, contactId: p.id, contactName: fullName(p) }, { text: lines.get(p.id)! });

  if (named.size) await addDetails(tx, list, names, user.timeZone, { contactIds: [...named] }, { facts: 100, notes: 10, interactions: 10, events: 10 });
  // Words that aren't someone's name: look for them in everyone's notes.
  if (topical.length) {
    const before = list.sources.length;
    await addDetails(tx, list, names, user.timeZone, { match: topical.map(stem) }, { facts: 60, notes: 20, interactions: 20, events: 15 });
    // People beyond the directory limit can still match; name them.
    const missing = [...new Set(list.sources.slice(before).map((s) => list.info.get(s.ref)!.contactId))].filter((id) => !names.has(id));
    const extra = await namesFor(tx, missing);
    for (const s of list.sources.slice(before)) {
      const info = list.info.get(s.ref)!;
      if (!s.person && extra.has(info.contactId)) {
        s.person = extra.get(info.contactId)!;
        info.contactName = s.person;
      }
    }
  }
  const notes = list.sources.filter((s) => !s.ref.startsWith("P"));
  const about = [...new Set(notes.map((s) => list.info.get(s.ref)!.contactName.split(" ")[0]!))];
  onStep(
    notes.length
      ? `Reading ${notes.length} ${notes.length === 1 ? "note" : "notes"}${about.length ? ` about ${listNames(about)}` : ""}`
      : "No notes match, so going by everyone's profiles",
  );
  return list;
}

export interface AskResult {
  answer: string;
  citations: Citation[];
}

/** `onStep` hears what's happening along the way: who it's looking at, what it's reading. */
export async function answerQuestion(tx: Tx, user: CurrentUser, question: string, onStep?: (line: string) => void): Promise<AskResult> {
  const assistant = await assistantForUser(tx, user.id);
  const list = await askSources(tx, user, question, onStep);
  onStep?.("Writing your answer");
  const out: Answer = await assistant.ask({ question, sources: list.sources, today: formatIsoDate(todayIn(user.timeZone)) });
  return { answer: out.answer, citations: out.refs.map((r) => list.citation(r)).filter((c): c is Citation => c !== null) };
}
