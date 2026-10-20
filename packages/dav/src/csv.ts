import { emptyCard, parseVcardDate, type Card } from "./vcard";

/** RFC 4180: quoted fields, doubled quotes, newlines inside quotes, any line ending. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    // Leading = + - @ would run as formulas in spreadsheet apps.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Turn a contacts CSV into cards. Understands Google Contacts and Outlook exports, and
 * plain files with columns like "name", "first name", "phone", "email", "birthday".
 */
export function cardsFromCsv(text: string): { cards: Card[]; columns: string[] } {
  const [header, ...rows] = parseCsv(text);
  if (!header) return { cards: [], columns: [] };
  const h = header.map(norm);
  const col = (...names: string[]) => names.map((n) => h.indexOf(n)).find((i) => i >= 0) ?? -1;
  const cols = (re: RegExp) => h.map((name, i) => (re.test(name) ? i : -1)).filter((i) => i >= 0);
  const typeFor = (i: number) => {
    // Google: "Phone 1 - Value" pairs with "Phone 1 - Label" (or "Type" in older exports).
    const m = header[i]!.match(/^(.*?)\s*-\s*Value$/i);
    if (!m) return null;
    const label = h.findIndex((name) => name === norm(`${m[1]} - Label`) || name === norm(`${m[1]} - Type`));
    return label;
  };

  const first = col("first name", "given name");
  const middle = col("middle name", "additional name");
  const last = col("last name", "family name", "surname");
  const full = col("name", "full name", "display name");
  const nick = col("nickname");
  const bday = col("birthday", "birth date", "date of birth");
  const org = col("organization name", "organization 1 name", "company", "organisation");
  const title = col("organization title", "organization 1 title", "job title", "title");
  const note = col("notes", "note");
  const phoneCols = [...cols(/^phone \d+ value$/), ...cols(/(^| )(mobile|cell|home|business|work|primary|other)? ?phone( \d+)?$/), ...cols(/^(phone|telephone|mobile)$/)];
  const emailCols = [...cols(/^e ?mail \d+ value$/), ...cols(/^e ?mail( address)?( \d+)?$/), ...cols(/^e ?mail ?\d? address$/)];
  const urlCols = [...cols(/^website \d+ value$/), ...cols(/^(web page|website|url)$/)];
  const street = cols(/^(address \d+ street|home street|business street|street)$/);

  const cards: Card[] = [];
  for (const r of rows) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    const card = emptyCard();
    card.firstName = [get(first), get(middle)].filter(Boolean).join(" ");
    card.lastName = get(last) || null;
    if (!card.firstName && get(full)) {
      const [f, ...rest] = get(full).split(/\s+/);
      card.firstName = f!;
      card.lastName ??= rest.join(" ") || null;
    }
    card.nickname = get(nick) || null;
    card.birthday = get(bday) ? parseVcardDate(get(bday)) : null;
    card.company = get(org) || null;
    card.jobTitle = get(title) || null;
    card.note = get(note) || null;
    const label = (i: number, fallback: string) => {
      const li = typeFor(i);
      const raw = (li != null && li >= 0 ? get(li) : header[i]!).toLowerCase();
      if (/mobile|cell/.test(raw)) return "mobile";
      if (/work|business/.test(raw)) return "work";
      if (/home/.test(raw)) return fallback === "personal" ? "personal" : "home";
      return fallback;
    };
    // Google packs several values into one cell with " ::: ".
    const split = (v: string) => v.split(/\s*:::\s*/).filter(Boolean);
    for (const i of new Set(phoneCols)) for (const v of split(get(i))) card.phones.push({ label: label(i, "other"), value: v });
    for (const i of new Set(emailCols)) for (const v of split(get(i))) card.emails.push({ label: label(i, "personal"), value: v });
    for (const i of new Set(urlCols)) for (const v of split(get(i))) card.urls.push({ label: "website", value: v });
    for (const i of street) {
      const prefix = header[i]!.replace(/street$/i, "");
      const part = (name: string) => get(h.indexOf(norm(`${prefix}${name}`)));
      const a = {
        label: /business|work/i.test(prefix) ? "work" : "home",
        street: get(i) || null,
        line2: part("Extended Address") || null,
        city: part("City") || null,
        region: part("Region") || part("State") || null,
        postalCode: part("Postal Code") || null,
        country: part("Country") || part("Country/Region") || null,
      };
      if (a.street || a.city) card.addresses.push(a);
    }
    if (!card.firstName && card.company) card.firstName = card.company;
    if (card.firstName) cards.push(card);
  }
  return { cards, columns: header };
}
