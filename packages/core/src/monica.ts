import { z } from "zod";
import { isValidPartialDate } from "./dates";
import type { LifeEventType } from "./vocab";

// Monica 4.x "Export to JSON" (Settings > Export data). The file is big and nested; this turns
// it into a flat list of people with everything we can use, small enough to send to the server.

const isoDay = /^\d{4}-\d{2}-\d{2}/;
const day = (v: unknown) => (typeof v === "string" && isoDay.test(v) ? v.slice(0, 10) : null);
const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^-?\d+$/.test(v) ? Number(v) : null);

export const monicaPersonSchema = z.object({
  key: z.string().max(64),
  firstName: z.string().max(100),
  lastName: z.string().max(100).nullable(),
  nickname: z.string().max(100).nullable(),
  description: z.string().max(5000).nullable(),
  isDead: z.boolean(),
  deathYear: z.number().int().nullable(),
  job: z.string().max(200).nullable(),
  company: z.string().max(200).nullable(),
  food: z.string().max(1000).nullable(),
  stayInTouchDays: z.number().int().positive().max(3650).nullable(),
  tags: z.array(z.string().max(100)).max(50),
  gender: z.string().max(40).nullable(),
  birthday: z.object({ year: z.number().int().nullable(), month: z.number().int(), day: z.number().int() }).nullable(),
  met: z.object({ year: z.number().int(), month: z.number().int().nullable() }).nullable(),
  metThrough: z.string().max(64).nullable(),
  phones: z.array(z.object({ label: z.string(), value: z.string().max(100) })).max(50),
  emails: z.array(z.object({ label: z.string(), value: z.string().max(200) })).max(50),
  socials: z.array(z.object({ service: z.string().max(40), value: z.string().max(200) })).max(50),
  addresses: z
    .array(
      z.object({
        label: z.string().max(40),
        street: z.string().max(200).nullable(),
        line2: z.null(),
        city: z.string().max(100).nullable(),
        region: z.string().max(100).nullable(),
        postalCode: z.string().max(20).nullable(),
        country: z.string().max(100).nullable(),
      }),
    )
    .max(20),
  notes: z.array(z.object({ body: z.string().max(20000), date: z.string().nullable() })).max(2000),
  pets: z.array(z.object({ name: z.string().max(100).nullable(), category: z.string().max(40).nullable() })).max(50),
  lifeEvents: z.array(z.object({ kind: z.string().max(60).nullable(), title: z.string().max(200).nullable(), note: z.string().max(5000).nullable(), date: z.string() })).max(500),
  gifts: z
    .array(
      z.object({
        name: z.string().max(300),
        comment: z.string().max(2000).nullable(),
        url: z.string().max(2000).nullable(),
        amountCents: z.number().int().nullable(),
        status: z.enum(["idea", "offered", "received"]),
        date: z.string().nullable(),
      }),
    )
    .max(500),
  debts: z.array(z.object({ amountCents: z.number().int().positive(), currency: z.string().length(3), iOwe: z.boolean(), settled: z.boolean(), reason: z.string().max(500).nullable(), date: z.string() })).max(500),
  tasks: z.array(z.object({ title: z.string().max(300), description: z.string().max(2000).nullable(), done: z.boolean() })).max(500),
  calls: z.array(z.object({ date: z.string(), content: z.string().max(5000).nullable() })).max(2000),
  activities: z.array(z.string().max(64)).max(5000),
});
export type MonicaPerson = z.infer<typeof monicaPersonSchema>;

export const monicaImportSchema = z.object({
  kind: z.literal("monica"),
  people: z.array(monicaPersonSchema),
  activities: z.array(z.object({ key: z.string().max(64), summary: z.string().max(1000).nullable(), description: z.string().max(10000).nullable(), date: z.string() })).max(20000),
  relationships: z.array(z.object({ type: z.string().max(40), is: z.string().max(64), of: z.string().max(64) })).max(20000),
});
export type MonicaImport = z.infer<typeof monicaImportSchema>;

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const props = (v: unknown) => obj(obj(v).properties);

/** The values of a `{ count, type, values }` block inside a `data` array. */
function section(data: unknown, type: string): unknown[] {
  const block = arr(data).find((b) => obj(b).type === type);
  return arr(obj(block).values);
}

function specialDate(v: unknown): { year: number | null; month: number; day: number } | null {
  const d = obj(v);
  const iso = day(d.date);
  if (!iso) return null;
  const [y, m, dd] = iso.split("-").map(Number) as [number, number, number];
  const out = { year: d.is_year_unknown || d.is_age_based ? null : y, month: m, day: dd };
  return isValidPartialDate(out) ? out : null;
}

/** Monica's life event types, by their built-in key, onto ours. Anything else is "other". */
const lifeEventKinds: Record<string, LifeEventType> = {
  new_job: "new_job",
  volunteer_work: "new_job",
  military_service: "new_job",
  retirement: "retired",
  new_school: "graduated",
  study_abroad: "graduated",
  engagement: "engaged",
  marriage: "married",
  new_child: "baby",
  expecting_a_baby: "baby",
  new_pet: "new_pet",
  moved: "moved",
  bought_a_home: "moved",
  loss_of_a_loved_one: "loss",
  overcame_an_illness: "illness",
  surgery: "illness",
  broken_bone: "illness",
  travel_experiences: "big_trip",
  holidays: "big_trip",
};

export function lifeEventKindFor(key: string | null): LifeEventType {
  return (key && lifeEventKinds[key]) || "other";
}

const socialServices: Record<string, string> = {
  facebook: "facebook",
  twitter: "x",
  x: "x",
  whatsapp: "whatsapp",
  telegram: "telegram",
  linkedin: "linkedin",
  instagram: "instagram",
  signal: "signal",
};

/** Read a Monica JSON export. Throws if it doesn't look like one. */
export function parseMonicaExport(json: unknown): MonicaImport {
  const root = obj(json);
  const account = obj(root.account);
  if (!root.app_version && !root.version) throw new Error("This isn't a Monica export.");
  if (!Array.isArray(account.data)) throw new Error("This Monica export has no account data.");

  const instance = obj(account.instance);
  const fieldTypes = new Map(arr(instance.contact_field_types).map((t) => [obj(t).uuid as string, props(t)]));
  const eventTypes = new Map(arr(instance.life_event_types).map((t) => [obj(t).uuid as string, props(t)]));
  const genders = new Map(arr(instance.genders).map((t) => [obj(t).uuid as string, props(t)]));

  const people: MonicaPerson[] = [];
  for (const raw of section(account.data, "contact")) {
    const c = obj(raw);
    const p = props(c);
    const key = str(c.uuid);
    const firstName = str(p.first_name);
    // Partial contacts are Monica's stand-ins for relatives with no page of their own; they still get one here.
    if (!key || !firstName) continue;
    const data = c.data;

    const phones: MonicaPerson["phones"] = [];
    const emails: MonicaPerson["emails"] = [];
    const socials: MonicaPerson["socials"] = [];
    for (const f of section(data, "contact_field")) {
      const fp = props(f);
      const value = str(fp.data);
      if (!value) continue;
      const type = fieldTypes.get(fp.type as string) ?? {};
      const name = (str(type.name) ?? "").toLowerCase();
      if (type.type === "email" || name === "email") emails.push({ label: "personal", value });
      else if (type.type === "phone" || name === "phone") phones.push({ label: "other", value });
      else if (socialServices[name]) socials.push({ service: socialServices[name]!, value });
      else if (name) socials.push({ service: name.slice(0, 40), value });
    }

    const deceased = specialDate(p.deceased_date);
    const met = specialDate(p.first_met_date);
    const gender = genders.get(p.gender as string);

    people.push({
      key,
      firstName: [firstName, str(p.middle_name)].filter(Boolean).join(" ").slice(0, 100),
      lastName: str(p.last_name)?.slice(0, 100) ?? null,
      nickname: str(p.nickname)?.slice(0, 100) ?? null,
      description: str(p.description)?.slice(0, 5000) ?? null,
      isDead: p.is_dead === true || p.is_dead === 1,
      deathYear: deceased?.year ?? null,
      job: str(p.job)?.slice(0, 200) ?? null,
      company: str(p.company)?.slice(0, 200) ?? null,
      food: str(p.food_preferences)?.slice(0, 1000) ?? null,
      stayInTouchDays: (() => {
        const n = num(p.stay_in_touch_frequency);
        return n && n > 0 && n <= 3650 ? n : null;
      })(),
      tags: arr(p.tags).map(str).filter((t): t is string => !!t).slice(0, 50).map((t) => t.slice(0, 100)),
      gender: str(gender?.type) ?? str(gender?.name),
      birthday: specialDate(p.birthdate),
      met: met?.year ? { year: met.year, month: met.month } : null,
      metThrough: str(p.first_met_through),
      phones,
      emails,
      socials,
      addresses: section(data, "address")
        .map((a) => {
          const ap = props(a);
          return {
            label: (str(ap.name) ?? "home").toLowerCase().slice(0, 40),
            street: str(ap.street)?.slice(0, 200) ?? null,
            line2: null,
            city: str(ap.city)?.slice(0, 100) ?? null,
            region: str(ap.province)?.slice(0, 100) ?? null,
            postalCode: str(ap.postal_code)?.slice(0, 20) ?? null,
            country: str(ap.country)?.slice(0, 100) ?? null,
          };
        })
        .filter((a) => a.street || a.city),
      notes: section(data, "note")
        .map((n) => ({ body: str(props(n).body)?.slice(0, 20000) ?? "", date: day(obj(n).created_at) }))
        .filter((n) => n.body),
      pets: section(data, "pet").map((x) => ({ name: str(props(x).name), category: str(props(x).category) })),
      lifeEvents: section(data, "life_event").flatMap((e) => {
        const ep = props(e);
        const date = day(ep.happened_at);
        if (!date) return [];
        const type = eventTypes.get(ep.type as string) ?? {};
        return [{ kind: str(type.translation_key), title: str(ep.name) ?? str(type.name), note: str(ep.note)?.slice(0, 5000) ?? null, date }];
      }),
      gifts: section(data, "gift").flatMap((g) => {
        const gp = props(g);
        const name = str(gp.name);
        const status = gp.status === "offered" || gp.status === "received" ? gp.status : "idea";
        if (!name) return [];
        return [{ name: name.slice(0, 300), comment: str(gp.comment)?.slice(0, 2000) ?? null, url: str(gp.url), amountCents: num(gp.amount), status, date: day(gp.date) } as const];
      }),
      debts: section(data, "debt").flatMap((d) => {
        const dp = props(d);
        const amount = num(dp.amount);
        const date = day(obj(d).created_at);
        if (!amount || amount <= 0 || !date) return [];
        const cur = str(dp.currency) ?? str(obj(dp.currency).iso);
        return [{ amountCents: amount, currency: cur && /^[A-Za-z]{3}$/.test(cur) ? cur.toUpperCase() : "CAD", iOwe: dp.in_debt === true, settled: dp.status === "complete", reason: str(dp.reason)?.slice(0, 500) ?? null, date }];
      }),
      tasks: section(data, "task").flatMap((t) => {
        const tp = props(t);
        const title = str(tp.title);
        return title ? [{ title: title.slice(0, 300), description: str(tp.description)?.slice(0, 2000) ?? null, done: tp.completed === true || tp.completed === 1 }] : [];
      }),
      calls: section(data, "call").flatMap((x) => {
        const date = day(props(x).called_at);
        return date ? [{ date, content: str(props(x).content)?.slice(0, 5000) ?? null }] : [];
      }),
      activities: section(data, "activity").filter((a): a is string => typeof a === "string"),
    });
  }

  const activities = section(account.data, "activity").flatMap((a) => {
    const ap = props(a);
    const key = str(obj(a).uuid);
    const date = day(ap.happened_at);
    return key && date ? [{ key, summary: str(ap.summary)?.slice(0, 1000) ?? null, description: str(ap.description)?.slice(0, 10000) ?? null, date }] : [];
  });

  const relationships = section(account.data, "relationship").flatMap((r) => {
    const rp = props(r);
    const type = str(rp.type);
    const is = str(rp.contact_is);
    const of = str(rp.of_contact);
    return type && is && of ? [{ type, is, of }] : [];
  });

  return { kind: "monica", people, activities, relationships };
}

export type MonicaTie =
  | { kind: "partner"; a: string; b: string; status: "married" | "partners" | "divorced" }
  | { kind: "child"; parent: string; child: string }
  | { kind: "sibling"; a: string; b: string }
  | { kind: "friend"; a: string; b: string }
  | { kind: "note"; about: string; other: string; label: string };

const partnerStatus: Record<string, "married" | "partners" | "divorced"> = { spouse: "married", partner: "partners", date: "partners", lover: "partners", ex: "divorced" };
const noteLabels: Record<string, string> = {
  grandparent: "Grandparent",
  grandchild: "Grandchild",
  uncle: "Aunt or uncle",
  nephew: "Niece or nephew",
  cousin: "Cousin",
  godfather: "Godparent",
  godson: "Godchild",
  colleague: "Colleague",
  boss: "Boss",
  subordinate: "Reports to them",
  mentor: "Mentor",
  protege: "Mentee",
};

/**
 * Monica stores each relationship both ways ("A is parent of B" and "B is child of A"), where
 * `of` is the `type` of `is`. Collapse them into one tie each, in terms the tree understands.
 * Relatives it can't place without the people in between (grandparents, cousins) become notes.
 */
export function monicaTies(relationships: MonicaImport["relationships"]): MonicaTie[] {
  const seen = new Set<string>();
  const out: MonicaTie[] = [];
  const once = (key: string, tie: MonicaTie) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push(tie);
  };
  const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const r of relationships) {
    if (r.is === r.of) continue;
    if (partnerStatus[r.type]) once(`partner:${pair(r.is, r.of)}`, { kind: "partner", a: r.is, b: r.of, status: partnerStatus[r.type]! });
    else if (r.type === "child") once(`child:${r.is}>${r.of}`, { kind: "child", parent: r.is, child: r.of });
    else if (r.type === "parent") once(`child:${r.of}>${r.is}`, { kind: "child", parent: r.of, child: r.is });
    else if (r.type === "sibling") once(`sibling:${pair(r.is, r.of)}`, { kind: "sibling", a: r.is, b: r.of });
    else if (r.type === "friend" || r.type === "bestfriend") once(`friend:${pair(r.is, r.of)}`, { kind: "friend", a: r.is, b: r.of });
    else if (noteLabels[r.type]) once(`note:${r.is}>${r.of}`, { kind: "note", about: r.is, other: r.of, label: noteLabels[r.type]! });
  }
  return out;
}
