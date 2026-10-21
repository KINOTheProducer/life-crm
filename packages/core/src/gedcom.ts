import type { ChildKind, FamilyStatus } from "./kinship";

/**
 * GEDCOM, the file format every genealogy app speaks (Ancestry, FamilySearch, Gramps,
 * webtrees). We write 5.5.1, which everything reads, and read both 5.5.1 and 7.0.
 */

export type GedSex = "M" | "F" | "U";

/** A GEDCOM date we understood. Month and day are optional; `approx` covers ABT, EST, CAL, BEF, AFT, BET. */
export interface GedDate {
  year: number | null;
  month: number | null;
  day: number | null;
  approx: boolean;
}

export interface GedPerson {
  /** Cross-reference id without the @ signs, e.g. "I1". */
  xref: string;
  firstName: string;
  lastName: string | null;
  sex: GedSex;
  birth: GedDate | null;
  /** True when there's any death record, even one without a date. */
  deceased: boolean;
  death: GedDate | null;
}

export interface GedFamily {
  xref: string;
  /** Up to two partners, in file order. */
  partners: string[];
  status: FamilyStatus;
  startYear: number | null;
  endYear: number | null;
  children: { xref: string; kind: ChildKind }[];
}

export interface GedTree {
  people: GedPerson[];
  families: GedFamily[];
}

const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/* Reading */

interface Line {
  level: number;
  xref: string | null;
  tag: string;
  value: string;
  children: Line[];
}

function parseLines(text: string): Line[] {
  const roots: Line[] = [];
  const stack: Line[] = [];
  for (const raw of text.replace(/^﻿/, "").split(/\r\n|\r|\n/)) {
    const m = /^\s*(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?: (.*))?$/.exec(raw);
    if (!m) continue;
    const line: Line = { level: Number(m[1]), xref: m[2] ? m[2].slice(1, -1) : null, tag: m[3]!.toUpperCase(), value: m[4] ?? "", children: [] };
    while (stack.length && stack.at(-1)!.level >= line.level) stack.pop();
    if (stack.length) stack.at(-1)!.children.push(line);
    else roots.push(line);
    stack.push(line);
  }
  return roots;
}

const child = (line: Line, tag: string) => line.children.find((c) => c.tag === tag);
const pointer = (value: string) => /^@([^@]+)@$/.exec(value.trim())?.[1] ?? null;

/** "12 MAR 1950", "MAR 1950", "1950", "ABT 1950", "BET 1950 AND 1955", "@#DGREGORIAN@ 1 JAN 1900". */
export function parseGedDate(value: string): GedDate | null {
  let s = value.trim().toUpperCase().replace(/^@#D[A-Z ]+@\s*/, "").replace(/^GREGORIAN\s+/, "");
  if (!s) return null;
  let approx = false;
  const qualifier = /^(ABT|EST|CAL|BEF|AFT|FROM|TO|INT)\s+/.exec(s);
  if (qualifier) {
    approx = qualifier[1] !== "FROM" && qualifier[1] !== "TO";
    s = s.slice(qualifier[0].length);
  }
  const between = /^BET\s+(.+?)\s+AND\s+/.exec(s);
  if (between) {
    approx = true;
    s = between[1]!;
  }
  s = s.replace(/\s+(TO|AND)\s+.*$/, "").replace(/\s*\(.*\)$/, "");
  const parts = s.split(/\s+/);
  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;
  if (parts.length === 3) {
    day = Number(parts[0]);
    month = months.indexOf(parts[1]!) + 1;
    year = Number(parts[2]);
  } else if (parts.length === 2) {
    month = months.indexOf(parts[0]!) + 1;
    year = Number(parts[1]);
  } else if (parts.length === 1) {
    year = Number(parts[0]);
  }
  if (year != null && !(Number.isInteger(year) && year > 0 && year < 10000)) return null;
  if (month != null && month < 1) return null;
  if (day != null && !(Number.isInteger(day) && day >= 1 && day <= 31)) return null;
  return { year, month, day, approx };
}

function parseName(indi: Line): { firstName: string; lastName: string | null } {
  const name = child(indi, "NAME");
  if (!name) return { firstName: "", lastName: null };
  const unescape = (v: string | undefined) => v?.replace(/@@/g, "@").trim();
  const givn = unescape(child(name, "GIVN")?.value);
  const surn = unescape(child(name, "SURN")?.value);
  // "John Henry /Smith/ Jr." puts the surname between slashes.
  const m = /^(.*?)\/(.*?)\/(.*)$/.exec(unescape(name.value)!);
  const given = givn || (m ? `${m[1]}${m[3] ? ` ${m[3]}` : ""}` : unescape(name.value)!).replace(/\s+/g, " ").trim();
  const sur = surn || (m ? m[2]!.trim() : "");
  return { firstName: given, lastName: sur || null };
}

const pedigree: Record<string, ChildKind> = {
  BIRTH: "biological",
  ADOPTED: "adoptive",
  FOSTER: "foster",
  STEP: "step",
  SEALING: "biological",
};

export function parseGedcom(text: string): GedTree {
  const records = parseLines(text);
  const people: GedPerson[] = [];
  const families: GedFamily[] = [];
  // INDI.FAMC.PEDI says how a child belongs to a family; FAM.CHIL alone means birth.
  const kinds = new Map<string, ChildKind>();

  for (const r of records) {
    if (r.tag === "INDI" && r.xref) {
      const { firstName, lastName } = parseName(r);
      const sexValue = child(r, "SEX")?.value.trim().toUpperCase();
      const birt = child(r, "BIRT");
      const deat = child(r, "DEAT");
      people.push({
        xref: r.xref,
        firstName,
        lastName,
        sex: sexValue === "M" || sexValue === "F" ? sexValue : "U",
        birth: birt ? parseGedDate(child(birt, "DATE")?.value ?? "") : null,
        deceased: Boolean(deat),
        death: deat ? parseGedDate(child(deat, "DATE")?.value ?? "") : null,
      });
      for (const famc of r.children.filter((c) => c.tag === "FAMC")) {
        const fam = pointer(famc.value);
        const pedi = child(famc, "PEDI")?.value.trim().toUpperCase();
        if (fam && pedi && pedigree[pedi]) kinds.set(`${fam}|${r.xref}`, pedigree[pedi]);
      }
    }
  }

  for (const r of records) {
    if (r.tag !== "FAM" || !r.xref) continue;
    const partners = r.children
      .filter((c) => c.tag === "HUSB" || c.tag === "WIFE")
      .map((c) => pointer(c.value))
      .filter((x): x is string => !!x)
      .slice(0, 2);
    const marr = child(r, "MARR");
    const div = child(r, "DIV") ?? child(r, "ANUL");
    const enga = child(r, "ENGA");
    const year = (l: Line | undefined) => (l ? (parseGedDate(child(l, "DATE")?.value ?? "")?.year ?? null) : null);
    const status: FamilyStatus = div ? "divorced" : marr ? "married" : enga ? "engaged" : partners.length === 2 ? "partners" : "unknown";
    families.push({
      xref: r.xref,
      partners,
      status,
      startYear: year(marr) ?? year(enga),
      endYear: year(div),
      children: r.children
        .filter((c) => c.tag === "CHIL")
        .map((c) => pointer(c.value))
        .filter((x): x is string => !!x)
        .map((xref) => ({ xref, kind: kinds.get(`${r.xref}|${xref}`) ?? "biological" })),
    });
  }

  // Drop links to people the file doesn't define.
  const known = new Set(people.map((p) => p.xref));
  for (const f of families) {
    f.partners = f.partners.filter((x) => known.has(x));
    f.children = f.children.filter((c) => known.has(c.xref));
  }
  return { people, families: families.filter((f) => f.partners.length + f.children.length > 0) };
}

/* Writing */

export function formatGedDate(d: GedDate): string {
  const parts = [d.day, d.month ? months[d.month - 1] : null, d.year].filter((v) => v != null);
  return `${d.approx ? "ABT " : ""}${parts.join(" ")}`;
}

/** GEDCOM 5.5.1 lines are at most 255 characters and can't contain "@" unescaped. */
const clean = (s: string) => s.replace(/[\r\n]+/g, " ").replace(/@/g, "@@").slice(0, 200);

const pediOut: Record<ChildKind, string | null> = { biological: null, adoptive: "adopted", foster: "foster", step: "step", guardian: null };

export function serializeGedcom(tree: GedTree, options: { source: string; date?: Date }): string {
  const date = options.date ?? new Date();
  const out = [
    "0 HEAD",
    `1 SOUR ${clean(options.source)}`,
    `1 DATE ${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`,
    "1 SUBM @SUB1@",
    "1 GEDC",
    "2 VERS 5.5.1",
    "2 FORM LINEAGE-LINKED",
    "1 CHAR UTF-8",
    "0 @SUB1@ SUBM",
    `1 NAME ${clean(options.source)}`,
  ];

  const famsOf = new Map<string, string[]>();
  const famcOf = new Map<string, { fam: string; kind: ChildKind }[]>();
  for (const f of tree.families) {
    for (const p of f.partners) famsOf.set(p, [...(famsOf.get(p) ?? []), f.xref]);
    for (const c of f.children) famcOf.set(c.xref, [...(famcOf.get(c.xref) ?? []), { fam: f.xref, kind: c.kind }]);
  }
  const sexOf = new Map(tree.people.map((p) => [p.xref, p.sex]));

  for (const p of tree.people) {
    out.push(`0 @${p.xref}@ INDI`);
    out.push(`1 NAME ${clean(p.firstName)}${p.lastName ? ` /${clean(p.lastName)}/` : ""}`);
    if (p.firstName) out.push(`2 GIVN ${clean(p.firstName)}`);
    if (p.lastName) out.push(`2 SURN ${clean(p.lastName)}`);
    out.push(`1 SEX ${p.sex}`);
    if (p.birth) out.push("1 BIRT", `2 DATE ${formatGedDate(p.birth)}`);
    if (p.deceased) {
      if (p.death) out.push("1 DEAT", `2 DATE ${formatGedDate(p.death)}`);
      else out.push("1 DEAT Y");
    }
    for (const f of famcOf.get(p.xref) ?? []) {
      out.push(`1 FAMC @${f.fam}@`);
      const pedi = pediOut[f.kind];
      if (pedi) out.push(`2 PEDI ${pedi}`);
    }
    for (const f of famsOf.get(p.xref) ?? []) out.push(`1 FAMS @${f}@`);
  }

  for (const f of tree.families) {
    out.push(`0 @${f.xref}@ FAM`);
    // 5.5.1 only has HUSB and WIFE. Use sex where we know it, file order otherwise.
    const [a, b] = f.partners;
    const aIsWife = a != null && (sexOf.get(a) === "F" || (b != null && sexOf.get(b) === "M" && sexOf.get(a) !== "M"));
    if (a) out.push(`1 ${aIsWife ? "WIFE" : "HUSB"} @${a}@`);
    if (b) out.push(`1 ${aIsWife ? "HUSB" : "WIFE"} @${b}@`);
    const married = ["married", "separated", "divorced", "widowed"].includes(f.status);
    if (f.status === "engaged") out.push(f.startYear ? `1 ENGA\n2 DATE ${f.startYear}` : "1 ENGA Y");
    if (married) out.push(f.startYear ? `1 MARR\n2 DATE ${f.startYear}` : "1 MARR Y");
    if (f.status === "divorced") out.push(f.endYear ? `1 DIV\n2 DATE ${f.endYear}` : "1 DIV Y");
    for (const c of f.children) out.push(`1 CHIL @${c.xref}@`);
  }

  out.push("0 TRLR");
  return `${out.join("\n")}\n`;
}
