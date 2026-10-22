"use server";

import { formatIsoDate, monicaImportSchema, nameMatch, normalizeMethod, todayIn, type MonicaImport } from "@life-crm/core";
import { cardsFromCsv, parseVcards, type Card } from "@life-crm/dav";
import { and, eq, isNull, schema, type Tx } from "@life-crm/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createFromCard, mergeCard } from "@/lib/data/cards";
import { contactsWithMethods } from "@/lib/data/contact-info";
import { fullName } from "@/lib/data/contacts";
import { formatPartialDate } from "@/lib/data/dates";
import { applyMonicaLinks, applyMonicaPerson, circleIdsByName, monicaCard } from "@/lib/data/monica";
import { tenantQuery } from "@/lib/session";

const { contacts } = schema;

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_CARDS = 5000;

export type ImportAction = "create" | "merge" | "skip";

export interface PreviewRow {
  index: number;
  name: string;
  details: string[];
  match: { contactId: string; name: string; reason: string } | null;
  action: ImportAction;
}

/** Monica exports are read in the browser and arrive here already slimmed down to this shape. */
function parseMonica(text: string): { cards: Card[]; monica?: MonicaImport; error?: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { cards: [], error: "That file isn't valid JSON." };
  }
  const parsed = monicaImportSchema.safeParse(json);
  if (!parsed.success) return { cards: [], error: "That doesn't look like a Monica export." };
  const monica = parsed.data;
  if (monica.people.length === 0) return { cards: [], error: "No people found in that Monica export." };
  if (monica.people.length > MAX_CARDS) return { cards: [], error: `That's ${monica.people.length} people; import up to ${MAX_CARDS} at a time.` };
  return { cards: monica.people.map(monicaCard), monica };
}

function parse(text: string, filename: string): { cards: Card[]; monica?: MonicaImport; error?: string } {
  if (/\.json$/i.test(filename)) return parseMonica(text);
  if (text.length > MAX_BYTES) return { cards: [], error: "That file is over 5 MB. Split it up and import it in parts." };
  const isCsv = /\.csv$/i.test(filename) || (!/BEGIN:VCARD/i.test(text) && text.includes(","));
  const cards = isCsv ? cardsFromCsv(text).cards : parseVcards(text);
  if (cards.length === 0) return { cards, error: isCsv ? "No contacts found. The first row should be column names like First Name, Phone, Email." : "No contacts found in that file." };
  if (cards.length > MAX_CARDS) return { cards: [], error: `That's ${cards.length} contacts; import up to ${MAX_CARDS} at a time.` };
  return { cards };
}

const normalized = (card: Card) =>
  [
    ...card.phones.map((p) => ({ kind: "phone" as const, label: p.label, value: p.value })),
    ...card.emails.map((e) => ({ kind: "email" as const, label: e.label, value: e.value })),
  ].flatMap((m) => {
    try {
      return [{ kind: m.kind, value: normalizeMethod(m.kind, m.label, m.value).value }];
    } catch {
      return [];
    }
  });

/** Find who each card already is, by phone or email first and full name second. */
async function matchCards(tx: Tx, cards: Card[]) {
  const all = cards.flatMap(normalized);
  const byMethod = await contactsWithMethods(tx, all);
  const people = await tx
    .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, nickname: contacts.nickname })
    .from(contacts)
    .where(and(isNull(contacts.deletedAt), eq(contacts.isSelf, false)));
  const names = new Map(people.map((p) => [p.id, fullName(p)]));
  return cards.map((card) => {
    for (const m of normalized(card)) {
      const id = byMethod.get(`${m.kind}:${m.value}`);
      if (id && names.has(id)) return { contactId: id, name: names.get(id)!, reason: `same ${m.kind === "phone" ? "phone" : "email"}` };
    }
    const full = [card.firstName, card.lastName].filter(Boolean).join(" ");
    const same = people.filter((p) => nameMatch(full, p) === 2);
    if (same.length === 1) return { contactId: same[0]!.id, name: fullName(same[0]!), reason: "same name" };
    return null;
  });
}

const plural = (n: number, word: string) => (n ? `${n} ${word}${n === 1 ? "" : "s"}` : null);

/** "4 notes, 2 calls": what else comes across with a Monica person. */
function monicaExtras(p: MonicaImport["people"][number]) {
  return (
    [plural(p.notes.length, "note"), plural(p.calls.length + p.activities.length, "catch-up"), plural(p.lifeEvents.length, "life event"), plural(p.gifts.length, "gift")]
      .filter(Boolean)
      .join(", ") || null
  );
}

export async function previewImport(text: string, filename: string): Promise<{ rows: PreviewRow[]; error?: string }> {
  const { cards, monica, error } = parse(text, filename);
  if (error) return { rows: [], error };
  const matches = await tenantQuery((tx) => matchCards(tx, cards));
  return {
    rows: cards.map((card, index) => {
      const match = matches[index] ?? null;
      return {
        index,
        name: [card.firstName, card.lastName].filter(Boolean).join(" "),
        details: [
          card.phones[0]?.value,
          card.emails[0]?.value,
          card.birthday ? `Birthday ${formatPartialDate(card.birthday)}` : null,
          [card.jobTitle, card.company].filter(Boolean).join(", ") || null,
          monica ? monicaExtras(monica.people[index]!) : null,
        ].filter((d): d is string => !!d),
        match,
        action: match ? "merge" : "create",
      };
    }),
  };
}

const decisionsSchema = z.array(z.enum(["create", "merge", "skip"])).max(MAX_CARDS);

/**
 * Apply the import. The file is parsed again here rather than trusting card data from
 * the browser; only the per-row choices come from the preview.
 */
export async function runImport(text: string, filename: string, decisions: ImportAction[]): Promise<{ created: number; merged: number; error?: string }> {
  const parsed = decisionsSchema.safeParse(decisions);
  if (!parsed.success) return { created: 0, merged: 0, error: "Something went wrong with the choices. Try again." };
  const { cards, monica, error } = parse(text, filename);
  if (error) return { created: 0, merged: 0, error };
  if (cards.length !== parsed.data.length) return { created: 0, merged: 0, error: "The file changed since the preview. Try again." };

  const source = monica ? "Monica" : filename.replace(/^.*[\\/]/, "").slice(0, 80) || "import";
  const result = await tenantQuery(async (tx, user) => {
    const matches = await matchCards(tx, cards);
    // Duplicates inside the same file merge into whoever was created first.
    const seenInFile = new Map<string, string>();
    const monicaIds = new Map<string, string>();
    const today = formatIsoDate(todayIn(user.timeZone));
    const circleIds = monica ? await circleIdsByName(tx) : new Map<string, string>();
    let created = 0;
    let merged = 0;
    for (const [i, card] of cards.entries()) {
      const action = parsed.data[i]!;
      if (action === "skip") continue;
      const keys = normalized(card).map((m) => `${m.kind}:${m.value}`);
      const earlier = keys.map((k) => seenInFile.get(k)).find(Boolean);
      const target = action === "merge" ? (matches[i]?.contactId ?? earlier) : earlier;
      let id: string;
      if (target) {
        await mergeCard(tx, user.tenantId, target, card, source);
        id = target;
        merged++;
      } else {
        id = await createFromCard(tx, user.tenantId, card, { source });
        created++;
      }
      for (const k of keys) if (!seenInFile.has(k)) seenInFile.set(k, id);
      const person = monica?.people[i];
      if (person) {
        monicaIds.set(person.key, id);
        await applyMonicaPerson(tx, user, id, person, { today, circleIds });
      }
    }
    if (monica) await applyMonicaLinks(tx, user.tenantId, monica, monicaIds, today);
    return { created, merged };
  });
  revalidatePath("/people");
  revalidatePath("/dashboard");
  return result;
}
