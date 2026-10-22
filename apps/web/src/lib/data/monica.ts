import "server-only";
import { circleTones, lifeEventKindFor, monicaTies, type MonicaImport, type MonicaPerson } from "@life-crm/core";
import type { Card } from "@life-crm/dav";
import { and, eq, inArray, schema, sql, type Tx } from "@life-crm/db";
import { insertGroupInteraction, addMember } from "./circles";
import { fullName } from "./contacts";
import { dateToInstant, parseIsoDate } from "./dates";
import { insertFact, insertInteraction } from "./entries";
import { connectFriends, connectRelative } from "./family";
import { periodsOf, setPeriods } from "./periods";
import { insertGift, insertLifeEvent } from "./practical";
import { recordTimeline } from "./timeline";

const { circles, contacts, debts, facts, interactions, interactionPeople, lifeEvents, notes, tasks } = schema;

/** The vCard-shaped part of a Monica person, for matching and the usual create/merge. */
export function monicaCard(p: MonicaPerson): Card {
  return {
    uid: null,
    firstName: p.firstName,
    lastName: p.lastName,
    fullName: null,
    nickname: p.nickname,
    birthday: p.birthday,
    phones: p.phones,
    emails: p.emails,
    urls: [],
    socials: p.socials,
    addresses: p.addresses,
    company: p.company,
    jobTitle: p.job,
    note: null,
  };
}

const pronounsFor = (gender: string | null) => (gender === "M" ? "he/him" : gender === "F" ? "she/her" : null);

/** Things already on someone, so merging the same export twice doesn't double them up. */
async function existing(tx: Tx, contactId: string) {
  const noteRows = await tx.select({ body: notes.body }).from(notes).where(eq(notes.contactId, contactId));
  const callRows = await tx
    .select({ summary: interactions.summary, occurredAt: interactions.occurredAt })
    .from(interactions)
    .innerJoin(interactionPeople, eq(interactionPeople.interactionId, interactions.id))
    .where(eq(interactionPeople.contactId, contactId));
  const eventRows = await tx.select({ occurredOn: lifeEvents.occurredOn, type: lifeEvents.type }).from(lifeEvents).where(eq(lifeEvents.contactId, contactId));
  const taskRows = await tx.select({ title: tasks.title }).from(tasks).where(eq(tasks.contactId, contactId));
  const debtRows = await tx.select({ amountCents: debts.amountCents, occurredOn: debts.occurredOn }).from(debts).where(eq(debts.contactId, contactId));
  const factRows = await tx.select({ value: facts.value }).from(facts).where(eq(facts.contactId, contactId));
  return {
    facts: new Set(factRows.map((f) => f.value)),
    notes: new Set(noteRows.map((n) => n.body)),
    calls: new Set(callRows.map((c) => `${c.occurredAt.toISOString().slice(0, 10)}|${c.summary}`)),
    events: new Set(eventRows.map((e) => `${e.occurredOn}|${e.type}`)),
    tasks: new Set(taskRows.map((t) => t.title)),
    debts: new Set(debtRows.map((d) => `${d.occurredOn}|${d.amountCents}`)),
  };
}

/**
 * Everything Monica knew about one person beyond their contact card: notes, calls, life events,
 * gifts, money, to-dos, pets, food, tags (as circles) and the profile bits a vCard lacks.
 * Blanks are filled; nothing already there is overwritten.
 */
export async function applyMonicaPerson(
  tx: Tx,
  user: { id: string; tenantId: string },
  contactId: string,
  p: MonicaPerson,
  ctx: { today: string; circleIds: Map<string, string> },
) {
  const { tenantId } = user;
  const [c] = await tx.select().from(contacts).where(eq(contacts.id, contactId));
  if (!c) return;
  await tx
    .update(contacts)
    .set({
      pronouns: c.pronouns ?? pronounsFor(p.gender),
      isDeceased: c.isDeceased || p.isDead,
      deathYear: c.deathYear ?? p.deathYear,
      // Someone you chose a cadence for in Monica is someone you want nudges about here too.
      keepInTouchDays: c.keepInTouchDays ?? p.stayInTouchDays,
      closeness: c.keepInTouchDays == null && p.stayInTouchDays && c.closeness === "acquaintance" ? "friend" : c.closeness,
    })
    .where(eq(contacts.id, contactId));

  // When you met, unless you've already said when you've known them.
  if (p.met?.year && (await periodsOf(tx, contactId)).length === 0) {
    await setPeriods(tx, tenantId, contactId, [{ startYear: p.met.year, startMonth: p.met.month ?? null, endYear: null, endMonth: null }]);
  }

  const have = await existing(tx, contactId);
  const firstName = c.firstName;

  const addNote = async (body: string, date: string | null) => {
    if (have.notes.has(body)) return;
    have.notes.add(body);
    const at = date ? dateToInstant(parseIsoDate(date)) : new Date();
    const [row] = await tx.insert(notes).values({ tenantId, contactId, body, createdAt: at }).returning({ id: notes.id });
    await recordTimeline(tx, [{ tenantId, contactId, kind: "note", occurredAt: at, title: "Note from Monica", body, refId: row!.id }]);
  };
  if (p.description) await addNote(p.description, null);
  for (const n of p.notes) await addNote(n.body, n.date);

  const addFact = async (fact: Parameters<typeof insertFact>[3]) => {
    if (!fact.value || have.facts.has(fact.value)) return;
    have.facts.add(fact.value);
    await insertFact(tx, tenantId, contactId, fact);
  };
  if (p.food) await addFact({ category: "dietary", label: "Food", value: p.food });
  for (const pet of p.pets) await addFact({ category: "pets", label: "Pet", value: [pet.name, pet.category && `(${pet.category})`].filter(Boolean).join(" ") });

  for (const call of p.calls) {
    const summary = call.content ?? "Phone call";
    if (call.date > ctx.today || have.calls.has(`${call.date}|${summary}`)) continue;
    have.calls.add(`${call.date}|${summary}`);
    await insertInteraction(tx, tenantId, contactId, { type: "call", date: call.date, location: null, summary });
  }

  for (const e of p.lifeEvents) {
    const type = lifeEventKindFor(e.kind);
    if (have.events.has(`${e.date}|${type}`)) continue;
    have.events.add(`${e.date}|${type}`);
    await insertLifeEvent(tx, user, { id: contactId, firstName }, { type, title: e.title, date: e.date, notes: e.note, checkIn: false, babyName: null }, ctx.today);
  }

  for (const g of p.gifts) {
    if (g.status === "idea") {
      await addFact({ category: "wishlist", label: "Gift idea", value: [g.name, g.comment].filter(Boolean).join(": ").slice(0, 500) });
      continue;
    }
    await insertGift(tx, tenantId, contactId, {
      direction: g.status === "received" ? "received" : "given",
      title: g.name,
      occasion: g.comment,
      date: g.date ?? ctx.today,
      priceCents: g.amountCents,
      url: g.url && /^https?:\/\//.test(g.url) ? g.url : null,
    });
  }

  for (const d of p.debts) {
    if (have.debts.has(`${d.date}|${d.amountCents}`)) continue;
    await tx.insert(debts).values({
      tenantId,
      contactId,
      direction: d.iOwe ? "i_owe" : "they_owe",
      amountCents: d.amountCents,
      currency: d.currency,
      reason: d.reason,
      occurredOn: d.date,
      settledAt: d.settled ? new Date() : null,
    });
  }

  // Finished to-dos from years ago are noise; only open ones come across.
  for (const t of p.tasks) {
    if (t.done || have.tasks.has(t.title)) continue;
    have.tasks.add(t.title);
    await tx.insert(tasks).values({ tenantId, contactId, title: t.title });
  }

  for (const tag of p.tags) {
    let id = ctx.circleIds.get(tag.toLowerCase());
    if (!id) {
      const [row] = await tx
        .insert(circles)
        .values({ tenantId, name: tag, tone: circleTones[ctx.circleIds.size % circleTones.length]!, notes: null })
        .onConflictDoNothing()
        .returning({ id: circles.id });
      id = row?.id ?? (await tx.select({ id: circles.id }).from(circles).where(sql`lower(${circles.name}) = ${tag.toLowerCase()}`))[0]?.id;
      if (!id) continue;
      ctx.circleIds.set(tag.toLowerCase(), id);
    }
    await addMember(tx, tenantId, id, contactId);
  }
}

/** Existing circles by lowercase name, so tags join them instead of making duplicates. */
export async function circleIdsByName(tx: Tx) {
  const rows = await tx.select({ id: circles.id, name: circles.name }).from(circles);
  return new Map(rows.map((r) => [r.name.toLowerCase(), r.id]));
}

/**
 * What spans people: shared activities become one catch-up with everyone who was there,
 * relationships go into the family tree and friend links, and "met through" fills how you met.
 * `ids` maps Monica keys to contacts for everyone who was imported (not skipped).
 */
export async function applyMonicaLinks(tx: Tx, tenantId: string, data: MonicaImport, ids: Map<string, string>, today: string) {
  const byKey = new Map(data.people.map((p) => [p.key, p]));
  const name = (key: string) => {
    const p = byKey.get(key);
    return p ? fullName(p) : null;
  };

  for (const a of data.activities) {
    if (a.date > today) continue;
    const people = [...new Set(data.people.filter((p) => p.activities.includes(a.key)).map((p) => ids.get(p.key)).filter((id): id is string => !!id))];
    if (people.length === 0) continue;
    const summary = [a.summary, a.description].filter(Boolean).join(". ").slice(0, 5000) || "Spent time together";
    // Already brought in by an earlier import of the same file.
    const [dupe] = await tx
      .select({ id: interactions.id })
      .from(interactions)
      .innerJoin(interactionPeople, eq(interactionPeople.interactionId, interactions.id))
      .where(and(eq(interactions.summary, summary), sql`${interactions.occurredAt}::date = ${a.date}::date`, inArray(interactionPeople.contactId, people)))
      .limit(1);
    if (dupe) continue;
    await insertGroupInteraction(tx, tenantId, people, { type: "in_person", date: a.date, location: null, summary });
  }

  const ties = monicaTies(data.relationships).filter((t) => {
    const keys = t.kind === "child" ? [t.parent, t.child] : t.kind === "note" ? [t.about] : [t.a, t.b];
    return keys.every((k) => ids.has(k));
  });

  const couples = new Set<string>();
  for (const t of ties) {
    if (t.kind !== "partner") continue;
    couples.add([t.a, t.b].sort().join("|"));
    await connectRelative(tx, tenantId, { anchorId: ids.get(t.a)!, personId: ids.get(t.b)!, role: "partner", status: t.status });
  }

  // A child with both parents in the file goes under the couple, not two single-parent families.
  const parentsOf = new Map<string, string[]>();
  for (const t of ties) if (t.kind === "child") parentsOf.set(t.child, [...(parentsOf.get(t.child) ?? []), t.parent]);
  for (const [child, parents] of parentsOf) {
    const [p1, p2] = parents;
    if (p2 && !couples.has([p1!, p2].sort().join("|"))) {
      couples.add([p1!, p2].sort().join("|"));
      await connectRelative(tx, tenantId, { anchorId: ids.get(p1!)!, personId: ids.get(p2)!, role: "partner", status: "unknown" });
    }
    await connectRelative(tx, tenantId, { anchorId: ids.get(p1!)!, personId: ids.get(child)!, role: "child", otherParentId: p2 ? ids.get(p2)! : null });
  }

  for (const t of ties) {
    if (t.kind === "sibling") await connectRelative(tx, tenantId, { anchorId: ids.get(t.a)!, personId: ids.get(t.b)!, role: "sibling" });
    else if (t.kind === "friend") await connectFriends(tx, tenantId, ids.get(t.a)!, ids.get(t.b)!);
    else if (t.kind === "note") {
      const other = name(t.other);
      const about = ids.get(t.about)!;
      if (!other) continue;
      const [dupe] = await tx.select({ id: facts.id }).from(facts).where(and(eq(facts.contactId, about), eq(facts.value, other), eq(facts.label, t.label)));
      if (!dupe) await insertFact(tx, tenantId, about, { category: "family", label: t.label, value: other });
    }
  }

  for (const p of data.people) {
    const id = ids.get(p.key);
    const through = p.metThrough && name(p.metThrough);
    if (id && through) await tx.update(contacts).set({ howMet: sql`coalesce(${contacts.howMet}, ${`Through ${through}`})` }).where(eq(contacts.id, id));
  }
}
