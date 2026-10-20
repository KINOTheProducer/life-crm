/**
 * Family graph and kinship terms. The graph follows GEDCOM's shape: a family is up to two
 * partners plus their children, so half-siblings, step-parents and adoption fall out of it.
 */

export const familyStatuses = ["married", "partners", "engaged", "separated", "divorced", "widowed", "unknown"] as const;
export type FamilyStatus = (typeof familyStatuses)[number];

export const childKinds = ["biological", "adoptive", "foster", "step", "guardian"] as const;
export type ChildKind = (typeof childKinds)[number];

export interface Family {
  id: string;
  partners: string[];
  status: FamilyStatus;
  children: { id: string; kind: ChildKind }[];
}

export type Gender = "female" | "male" | null;

/** Best guess from pronouns. Anything else gets neutral terms ("parent", "sibling"). */
export function genderFromPronouns(pronouns: string | null | undefined): Gender {
  const p = (pronouns ?? "").toLowerCase();
  if (/\bshe\b/.test(p)) return "female";
  if (/\bhe\b/.test(p)) return "male";
  return null;
}

export interface FamilyIndex {
  families: Map<string, Family>;
  /** Families where the person is a child. */
  birthFamilies: Map<string, Family[]>;
  /** Families where the person is a partner. */
  ownFamilies: Map<string, Family[]>;
}

export function indexFamilies(families: Family[]): FamilyIndex {
  const index: FamilyIndex = { families: new Map(), birthFamilies: new Map(), ownFamilies: new Map() };
  const push = (m: Map<string, Family[]>, k: string, f: Family) => m.set(k, [...(m.get(k) ?? []), f]);
  for (const f of families) {
    index.families.set(f.id, f);
    for (const p of f.partners) push(index.ownFamilies, p, f);
    for (const c of f.children) push(index.birthFamilies, c.id, f);
  }
  return index;
}

/** Parents by blood or adoption. Step and foster parents are relatives, not ancestors. */
const lineal = (k: ChildKind) => k === "biological" || k === "adoptive";

export function parentsOf(index: FamilyIndex, id: string, all = false): string[] {
  const out = new Set<string>();
  for (const f of index.birthFamilies.get(id) ?? []) {
    const kind = f.children.find((c) => c.id === id)!.kind;
    if (all || lineal(kind)) for (const p of f.partners) out.add(p);
  }
  return [...out];
}

export function childrenOf(index: FamilyIndex, id: string, all = false): string[] {
  const out = new Set<string>();
  for (const f of index.ownFamilies.get(id) ?? []) for (const c of f.children) if (all || lineal(c.kind)) out.add(c.id);
  return [...out];
}

export function partnersOf(index: FamilyIndex, id: string): { id: string; status: FamilyStatus }[] {
  const out: { id: string; status: FamilyStatus }[] = [];
  for (const f of index.ownFamilies.get(id) ?? []) for (const p of f.partners) if (p !== id) out.push({ id: p, status: f.status });
  return out;
}

/** Siblings share a birth family (or a parent, for half-siblings). */
export function siblingsOf(index: FamilyIndex, id: string): { id: string; half: boolean }[] {
  const mine = new Set(parentsOf(index, id));
  const out = new Map<string, boolean>();
  for (const f of index.birthFamilies.get(id) ?? []) for (const c of f.children) if (c.id !== id) out.set(c.id, false);
  for (const p of mine) {
    for (const c of childrenOf(index, p)) {
      if (c === id || out.has(c)) continue;
      out.set(c, true);
    }
  }
  // A sibling in the same family but with a different set of known parents is a half-sibling too.
  for (const [c, half] of out) {
    if (half) continue;
    const theirs = new Set(parentsOf(index, c));
    if (mine.size === 2 && theirs.size === 2 && [...mine].some((p) => !theirs.has(p))) out.set(c, true);
  }
  return [...out].map(([sid, half]) => ({ id: sid, half }));
}

/** Every lineal ancestor with how many generations up they are (1 = parent). */
function ancestors(index: FamilyIndex, id: string): Map<string, number> {
  const out = new Map<string, number>([[id, 0]]);
  let frontier = [id];
  for (let gen = 1; frontier.length && gen < 30; gen++) {
    const next: string[] = [];
    for (const f of frontier)
      for (const p of parentsOf(index, f)) {
        if (out.has(p)) continue;
        out.set(p, gen);
        next.push(p);
      }
    frontier = next;
  }
  return out;
}

/** Generations up from each person to their closest shared ancestor, if they're blood relatives. */
export function bloodDistance(index: FamilyIndex, a: string, b: string): { up: number; down: number } | null {
  const fromA = ancestors(index, a);
  const fromB = ancestors(index, b);
  let best: { up: number; down: number } | null = null;
  for (const [anc, ua] of fromA) {
    const ub = fromB.get(anc);
    if (ub == null) continue;
    if (!best || ua + ub < best.up + best.down) best = { up: ua, down: ub };
  }
  return best;
}

const ordinals = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

function pick(g: Gender, female: string, male: string, neutral: string) {
  return g === "female" ? female : g === "male" ? male : neutral;
}

/** "great-", "great-great-", then "3× great-" so names stay readable. */
function greats(n: number) {
  if (n <= 0) return "";
  if (n <= 2) return "great-".repeat(n);
  return `${n}× great-`;
}

/** The word for a blood relative `up` generations up and `down` back down from you. */
export function bloodTerm(up: number, down: number, g: Gender, half = false): string {
  if (up === 0 && down === 0) return "you";
  if (down === 0) {
    if (up === 1) return pick(g, "mother", "father", "parent");
    return greats(up - 2) + pick(g, "grandmother", "grandfather", "grandparent");
  }
  if (up === 0) {
    if (down === 1) return pick(g, "daughter", "son", "child");
    return greats(down - 2) + pick(g, "granddaughter", "grandson", "grandchild");
  }
  if (up === 1 && down === 1) return (half ? "half-" : "") + pick(g, "sister", "brother", "sibling");
  if (down === 1) return greats(up - 2) + pick(g, "aunt", "uncle", "aunt or uncle");
  if (up === 1) return greats(down - 2) + pick(g, "niece", "nephew", "niece or nephew");
  const degree = Math.min(up, down) - 1;
  const removed = Math.abs(up - down);
  const base = `${ordinals[degree - 1] ?? `${degree}th`} cousin`;
  return removed ? `${base} ${times(removed)} removed` : base;
}

function partnerTerm(status: FamilyStatus, g: Gender) {
  switch (status) {
    case "married":
      return pick(g, "wife", "husband", "spouse");
    case "engaged":
      return pick(g, "fiancée", "fiancé", "fiancé");
    case "divorced":
      return pick(g, "ex-wife", "ex-husband", "ex-partner");
    case "separated":
      return "ex-partner";
    case "widowed":
      return pick(g, "late wife", "late husband", "late partner");
    default:
      return "partner";
  }
}

function inLawTerm(relativeTerm: string, g: Gender): string | null {
  if (/^(mother|father|parent)$/.test(relativeTerm)) return pick(g, "mother-in-law", "father-in-law", "parent-in-law");
  if (/^(half-)?(sister|brother|sibling)$/.test(relativeTerm)) return pick(g, "sister-in-law", "brother-in-law", "sibling-in-law");
  if (/^(daughter|son|child)$/.test(relativeTerm)) return pick(g, "daughter-in-law", "son-in-law", "child-in-law");
  return null;
}

const possessive = (s: string) => (s.endsWith("s") ? `${s}'` : `${s}'s`);

/**
 * What `target` is to `ego`, in plain words: "mother", "second cousin once removed",
 * "sister-in-law", "aunt" (an uncle's wife), "stepfather", "Holly's mother". Null when
 * there's no known connection.
 */
export function kinship(index: FamilyIndex, ego: string, target: string, genderOf: (id: string) => Gender): string | null {
  if (ego === target) return "you";
  const g = genderOf(target);

  // Partners, current or past.
  const partner = partnersOf(index, ego).find((p) => p.id === target);
  if (partner) return partnerTerm(partner.status, g);

  // Blood (and adoption).
  const blood = bloodDistance(index, ego, target);
  if (blood) {
    const half = blood.up === 1 && blood.down === 1 && (siblingsOf(index, ego).find((s) => s.id === target)?.half ?? false);
    return bloodTerm(blood.up, blood.down, g, half);
  }

  // Step and foster family.
  const nonLineal = (kind: ChildKind, female: string, male: string, neutral: string) =>
    kind === "guardian" ? "guardian" : `${kind === "foster" ? "foster " : "step"}${pick(g, female, male, neutral)}`;
  for (const f of index.birthFamilies.get(ego) ?? []) {
    const kind = f.children.find((c) => c.id === ego)!.kind;
    if (f.partners.includes(target) && !lineal(kind)) return nonLineal(kind, "mother", "father", "parent");
  }
  // A parent's current (or late) partner is a step-parent; an ex isn't.
  const together = (st: FamilyStatus) => st === "married" || st === "partners" || st === "engaged" || st === "widowed" || st === "unknown";
  if (parentsOf(index, ego).some((p) => partnersOf(index, p).some((pp) => pp.id === target && together(pp.status))))
    return nonLineal("step", "mother", "father", "parent");
  for (const f of index.ownFamilies.get(ego) ?? []) {
    const c = f.children.find((c) => c.id === target);
    if (c && !lineal(c.kind)) return nonLineal(c.kind, "daughter", "son", "child");
  }
  const myPartners = partnersOf(index, ego).map((p) => p.id);
  if (myPartners.some((p) => childrenOf(index, p).includes(target))) return nonLineal("step", "daughter", "son", "child");

  // Married into your family: a sibling's wife, an uncle's husband.
  for (const tp of partnersOf(index, target)) {
    const d = bloodDistance(index, ego, tp.id);
    if (!d) continue;
    const rel = bloodTerm(d.up, d.down, genderOf(tp.id));
    // Only a sibling's or child's partner is an in-law; a parent's partner was handled above.
    const inLaw = d.down === 1 && d.up <= 1 ? inLawTerm(rel, g) : null;
    if (inLaw) return inLaw;
    if (d.down === 1 && d.up >= 2) return greats(d.up - 2) + pick(g, "aunt", "uncle", "aunt or uncle");
    return `${possessive(rel)} ${partnerTerm(tp.status, g)}`;
  }

  // Your partner's family.
  for (const p of myPartners) {
    const d = bloodDistance(index, p, target);
    if (!d) continue;
    const rel = bloodTerm(d.up, d.down, g, d.up === 1 && d.down === 1 && (siblingsOf(index, p).find((s) => s.id === target)?.half ?? false));
    const inLaw = inLawTerm(rel, g);
    if (inLaw) return inLaw;
    return `${possessive(partnerTerm(partnersOf(index, ego).find((x) => x.id === p)!.status, genderOf(p)))} ${rel}`;
  }
  return null;
}

/** Group a kinship term for lists: "Parents & grandparents", "Cousins", "In-laws". */
export function kinshipGroup(term: string): string {
  if (/in-law|'s /.test(term)) return "In-laws & by marriage";
  if (/^(wife|husband|spouse|partner|fiancé|fiancée|ex-|late )/.test(term)) return "Partners";
  if (/(mother|father|parent)$/.test(term) && !/step|foster/.test(term)) return "Parents & grandparents";
  if (/(daughter|son|child)$/.test(term) && !/step|foster/.test(term)) return "Children & grandchildren";
  if (/(sister|brother|sibling)$/.test(term)) return "Siblings";
  if (/aunt|uncle|niece|nephew/.test(term)) return "Aunts, uncles, nieces & nephews";
  if (/cousin/.test(term)) return "Cousins";
  if (/step|foster|guardian/.test(term)) return "Step & foster family";
  return "Others";
}

export type DirectRole = "parent" | "sibling" | "child" | "partner";

/**
 * Where a free-text relationship label puts someone relative to you: "Mom" is a parent,
 * "Little brother" a sibling. Only direct relations; "Grandma" needs a parent in between.
 */
export function roleFromLabel(label: string | null | undefined): { role: DirectRole; gender: Gender; kind: ChildKind } | null {
  const l = (label ?? "").toLowerCase().trim();
  if (!l) return null;
  const step = /\bstep[- ]?/.test(l);
  const kind: ChildKind = step ? "step" : /\badopt/.test(l) ? "adoptive" : /\bfoster\b/.test(l) ? "foster" : "biological";
  const w = l.replace(/\b(step[- ]?|adoptive|adopted|foster|big|little|older|younger|baby|twin)\s*/g, "").trim();
  const table: [RegExp, DirectRole, Gender][] = [
    [/^(mom|mum|mother|mama|mommy|ma|mam)$/, "parent", "female"],
    [/^(dad|father|papa|daddy|pa|pops)$/, "parent", "male"],
    [/^parent$/, "parent", null],
    [/^(sister|sis)$/, "sibling", "female"],
    [/^(brother|bro)$/, "sibling", "male"],
    [/^sibling$/, "sibling", null],
    [/^daughter$/, "child", "female"],
    [/^son$/, "child", "male"],
    [/^(child|kid)$/, "child", null],
    [/^(wife)$/, "partner", "female"],
    [/^(husband)$/, "partner", "male"],
    [/^(spouse|partner)$/, "partner", null],
  ];
  for (const [re, role, gender] of table) if (re.test(w)) return { role, gender, kind };
  return null;
}
