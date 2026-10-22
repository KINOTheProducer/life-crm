import "server-only";
import type { Extractor, KnownPerson, Resort, SavedItem } from "@life-crm/ai";
import { factCategoryLabels, importantDateKindLabels, partnerPrompts, type ImportantDateKind, type PartialDate } from "@life-crm/core";
import { and, asc, eq, inArray, isNull, ne, schema, type Tx } from "@life-crm/db";
import { newPersonKey, type ResortDestination, type ResortSuggestion, type ResortTarget, type SavedKind } from "@/lib/resort-items";
import { formatPartialDate } from "./dates";
import { addRelatedPerson } from "./family";
import { addMilestone, partnershipFor } from "./partners";
import { recordTimeline } from "./timeline";

const { contacts, facts, importantDates, notes, partnershipMilestones, timelineEntries } = schema;

/** An error whose message is safe to show. */
export class ResortError extends Error {}

interface Saved {
  kind: SavedKind;
  id: string;
  /** Shown to the user. */
  text: string;
  /** Sent to the model. */
  prompt: string;
}

/** Everything saved about someone that a re-sort can move: live facts, notes and dates other than the birthday. */
export async function savedAbout(tx: Tx, contactId: string): Promise<Saved[]> {
  const factRows = await tx
    .select({ id: facts.id, category: facts.category, label: facts.label, value: facts.value })
    .from(facts)
    .where(and(eq(facts.contactId, contactId), isNull(facts.archivedAt)))
    .orderBy(asc(facts.createdAt));
  const noteRows = await tx
    .select({ id: notes.id, body: notes.body })
    .from(notes)
    .where(and(eq(notes.contactId, contactId), isNull(notes.deletedAt)))
    .orderBy(asc(notes.createdAt));
  const dateRows = await tx
    .select({ id: importantDates.id, type: importantDates.type, label: importantDates.label, year: importantDates.year, month: importantDates.month, day: importantDates.day })
    .from(importantDates)
    .where(and(eq(importantDates.contactId, contactId), ne(importantDates.type, "birthday")));
  return [
    ...factRows.map((f) => ({ kind: "fact" as const, id: f.id, text: `${factCategoryLabels[f.category]} · ${f.label}: ${f.value}`, prompt: `${f.category} / ${f.label}: ${f.value}` })),
    ...noteRows.map((n) => ({ kind: "note" as const, id: n.id, text: `Note: ${n.body}`, prompt: `Note: ${n.body}` })),
    ...dateRows.map((d) => {
      const when = formatPartialDate({ year: d.year, month: d.month, day: d.day });
      const kind = d.type as ImportantDateKind;
      return { kind: "date" as const, id: d.id, text: `${importantDateKindLabels[kind]} · ${d.label ?? ""}, ${when}`, prompt: `${d.type} / ${d.label ?? ""}: ${when}` };
    }),
  ];
}

/** One line per saved item, so a file read can leave out what's already there. */
export const savedLines = (saved: Saved[]) => saved.map((s) => s.prompt);

const shortId = { fact: "f", note: "n", date: "d" } as const;

type ModelTarget = Resort["changes"][number]["into"][number];

function toTarget(t: ModelTarget): ResortTarget | null {
  const date = t.month != null && t.day != null ? { month: t.month, day: t.day, year: t.year } : null;
  switch (t.kind) {
    case "fact":
      return t.category && t.label && t.value ? { kind: "fact", category: t.category, label: t.label.slice(0, 100), value: t.value.slice(0, 500) } : null;
    case "note":
      return t.value ? { kind: "note", value: t.value.slice(0, 5000) } : null;
    case "date":
      return date && t.dateKind && t.label ? { kind: "date", dateKind: t.dateKind, label: t.label.slice(0, 100), date } : null;
    case "milestone":
      return date && t.milestone ? { kind: "milestone", milestone: t.milestone, label: t.milestone === "custom" ? (t.label?.slice(0, 100) ?? null) : null, date } : null;
  }
}

/** Ask the model where saved items would sit better. Saves nothing. */
export async function suggestResort(
  extractor: Extractor,
  saved: Saved[],
  subject: { id: string; name: string; nickname: string | null; partnerLabel: string | null },
  others: KnownPerson[],
  today: string,
): Promise<ResortSuggestion[]> {
  if (saved.length === 0) return [];
  const counts = { fact: 0, note: 0, date: 0 };
  const byShort = new Map<string, Saved>();
  const items: SavedItem[] = saved.map((s) => {
    const id = `${shortId[s.kind]}${++counts[s.kind]}`;
    byShort.set(id, s);
    return { id, kind: s.kind, text: s.prompt };
  });
  const result = await extractor.resort({ today, subject, items, knownPeople: others, partnerPrompts });
  const names = new Map(others.map((p) => [p.id, p.name]));
  const destination = (t: ModelTarget): ResortDestination => {
    if (t.personId) return { kind: "person", id: t.personId, name: names.get(t.personId) ?? "Someone else" };
    if (t.newPerson) {
      const p = t.newPerson;
      return { kind: "new", firstName: p.firstName.trim().slice(0, 100), lastName: p.lastName?.trim().slice(0, 100) || null, relation: p.relation, relationLabel: p.relationLabel?.trim().slice(0, 100) || null };
    }
    return { kind: "subject" };
  };
  const ref = (s: Saved) => ({ kind: s.kind, id: s.id, text: s.text });

  return result.changes.flatMap((c, i) => {
    const source = byShort.get(c.id);
    if (!source) return [];
    const dupe = c.duplicateOf ? byShort.get(c.duplicateOf) : null;
    const into = c.into.flatMap((t) => {
      const target = toTarget(t);
      return target ? [{ target, to: destination(t) }] : [];
    });
    if (!dupe && into.length === 0) return [];
    return [
      {
        key: `r${i}`,
        source: ref(source),
        reason: c.reason,
        duplicateOf: dupe ? ref(dupe) : null,
        into: dupe ? [] : into,
      },
    ];
  });
}

const tables = { fact: facts, note: notes, date: importantDates } as const;

/** The saved row, if it's still live on this person. */
async function liveRow(tx: Tx, kind: SavedKind, id: string, contactId: string) {
  if (kind === "fact") {
    const [r] = await tx.select({ id: facts.id, createdAt: facts.createdAt }).from(facts).where(and(eq(facts.id, id), eq(facts.contactId, contactId), isNull(facts.archivedAt)));
    return r ?? null;
  }
  if (kind === "note") {
    const [r] = await tx.select({ id: notes.id, createdAt: notes.createdAt }).from(notes).where(and(eq(notes.id, id), eq(notes.contactId, contactId), isNull(notes.deletedAt)));
    return r ?? null;
  }
  const [r] = await tx
    .select({ id: importantDates.id, createdAt: importantDates.createdAt })
    .from(importantDates)
    .where(and(eq(importantDates.id, id), eq(importantDates.contactId, contactId), ne(importantDates.type, "birthday")));
  return r ?? null;
}

/** Take a saved item out entirely, along with the timeline entry that describes it. */
async function removeSaved(tx: Tx, kind: SavedKind, id: string) {
  await tx.delete(timelineEntries).where(eq(timelineEntries.refId, id));
  const table = tables[kind];
  await tx.delete(table).where(eq(table.id, id));
}

function timelineFor(t: ResortTarget): { kind: "fact" | "note" | "date"; title: string; body: string; data?: unknown } {
  switch (t.kind) {
    case "fact":
      return { kind: "fact", title: t.label, body: t.value, data: { category: t.category } };
    case "note":
      return { kind: "note", title: "Note", body: t.value };
    case "date":
      return { kind: "date", title: `${t.label} added`, body: formatPartialDate(t.date) };
    case "milestone":
      return { kind: "date", title: "", body: "" };
  }
}

/** Rewrite a saved item in place when it keeps its kind and its person. */
async function rewrite(tx: Tx, kind: SavedKind, id: string, t: ResortTarget) {
  if (kind === "fact" && t.kind === "fact") await tx.update(facts).set({ category: t.category, label: t.label, value: t.value }).where(eq(facts.id, id));
  else if (kind === "note" && t.kind === "note") await tx.update(notes).set({ body: t.value }).where(eq(notes.id, id));
  else if (kind === "date" && t.kind === "date") {
    const d = t.date as PartialDate;
    await tx.update(importantDates).set({ type: t.dateKind, label: t.label, year: d.year ?? null, month: d.month, day: d.day }).where(eq(importantDates.id, id));
  } else return false;
  const entry = timelineFor(t);
  await tx.update(timelineEntries).set({ title: entry.title, body: entry.body, ...(entry.data ? { data: entry.data } : {}) }).where(eq(timelineEntries.refId, id));
  return true;
}

/** Create a target on someone, unless they already have the same thing. Timeline keeps the original's time. */
async function create(tx: Tx, tenantId: string, contactId: string, t: ResortTarget, occurredAt: Date) {
  if (t.kind === "milestone") {
    const partnership = await partnershipFor(tx, contactId);
    if (!partnership || partnership.status !== "current") throw new ResortError("Milestones can only go on a current partner.");
    const [same] = await tx
      .select({ id: partnershipMilestones.id })
      .from(partnershipMilestones)
      .where(and(eq(partnershipMilestones.partnershipId, partnership.id), eq(partnershipMilestones.kind, t.milestone), eq(partnershipMilestones.month, t.date.month), eq(partnershipMilestones.day, t.date.day)));
    if (!same) await addMilestone(tx, { tenantId, partnershipId: partnership.id, contactId }, { kind: t.milestone, label: t.label, date: t.date });
    return;
  }
  let refId: string;
  if (t.kind === "fact") {
    const [same] = await tx
      .select({ id: facts.id })
      .from(facts)
      .where(and(eq(facts.contactId, contactId), eq(facts.category, t.category), eq(facts.value, t.value), isNull(facts.archivedAt)));
    if (same) return;
    const [row] = await tx.insert(facts).values({ tenantId, contactId, category: t.category, label: t.label, value: t.value }).returning({ id: facts.id });
    refId = row!.id;
  } else if (t.kind === "note") {
    const [row] = await tx.insert(notes).values({ tenantId, contactId, body: t.value }).returning({ id: notes.id });
    refId = row!.id;
  } else {
    const [same] = await tx
      .select({ id: importantDates.id })
      .from(importantDates)
      .where(and(eq(importantDates.contactId, contactId), eq(importantDates.type, t.dateKind), eq(importantDates.month, t.date.month), eq(importantDates.day, t.date.day)));
    if (same) return;
    const [row] = await tx
      .insert(importantDates)
      .values({ tenantId, contactId, type: t.dateKind, label: t.label, year: t.date.year ?? null, month: t.date.month, day: t.date.day })
      .returning({ id: importantDates.id });
    refId = row!.id;
  }
  const entry = timelineFor(t);
  await recordTimeline(tx, [{ tenantId, contactId, kind: entry.kind, occurredAt, title: entry.title, body: entry.body, refId, data: entry.data }]);
}

/**
 * Apply accepted suggestions. Every one either rewrites the saved item in place or creates
 * where it goes and deletes the original, so there's only ever one copy. Anything that changed
 * since the suggestion was made stops the whole thing.
 */
export async function applyResort(tx: Tx, tenantId: string, contactId: string, accepted: ResortSuggestion[]) {
  const sources = new Set<string>();
  for (const s of accepted) {
    if (sources.has(s.source.id)) throw new ResortError("The same item was changed twice. Reload and try again.");
    sources.add(s.source.id);
  }
  // Check everything first so a stale suggestion can't apply halfway.
  const rows = new Map<string, { createdAt: Date }>();
  for (const s of accepted) {
    const row = await liveRow(tx, s.source.kind, s.source.id, contactId);
    if (!row) throw new ResortError("Something changed since these suggestions were made. Run it again.");
    rows.set(s.source.id, row);
    if (s.duplicateOf) {
      if (sources.has(s.duplicateOf.id) && accepted.find((x) => x.source.id === s.duplicateOf!.id)?.duplicateOf) {
        throw new ResortError("Two items were each marked as a copy of the other. Keep one of them.");
      }
      if (!(await liveRow(tx, s.duplicateOf.kind, s.duplicateOf.id, contactId))) throw new ResortError("Something changed since these suggestions were made. Run it again.");
    }
  }
  const moves = accepted.flatMap((s) => s.into);
  const ids = [...new Set(moves.flatMap((m) => (m.to.kind === "person" ? [m.to.id] : [])))];
  if (ids.length) {
    const found = await tx.select({ id: contacts.id }).from(contacts).where(and(inArray(contacts.id, ids), isNull(contacts.deletedAt)));
    if (found.length !== ids.length || ids.includes(contactId)) throw new ResortError("One of the people no longer exists. Run it again.");
  }
  if (moves.some((m) => m.target.kind === "milestone" && m.to.kind !== "subject")) throw new ResortError("Milestones can only go on your partner.");

  // People the items name who aren't saved yet, added once each and linked to the subject.
  const created = new Map<string, string>();
  const newPeople = moves.flatMap((m) => (m.to.kind === "new" ? [m.to] : []));
  if (newPeople.length) {
    const [subject] = await tx.select({ firstName: contacts.firstName }).from(contacts).where(eq(contacts.id, contactId));
    for (const p of newPeople) {
      const key = newPersonKey(p);
      if (!created.has(key)) created.set(key, await addRelatedPerson(tx, tenantId, contactId, subject!.firstName, p));
    }
  }
  const destinationId = (to: ResortDestination) => (to.kind === "subject" ? contactId : to.kind === "person" ? to.id : created.get(newPersonKey(to))!);

  for (const s of accepted) {
    const { kind, id } = s.source;
    if (s.duplicateOf) {
      await removeSaved(tx, kind, id);
      continue;
    }
    const only = s.into.length === 1 ? s.into[0]! : null;
    if (only && only.to.kind === "subject" && (await rewrite(tx, kind, id, only.target))) continue;
    for (const m of s.into) await create(tx, tenantId, destinationId(m.to), m.target, rows.get(id)!.createdAt);
    await removeSaved(tx, kind, id);
  }
}
