import { isValidPartialDate, type PartialDate } from "@life-crm/core";

/**
 * vCard 2.1 / 3.0 / 4.0 reading and 3.0 writing (what iOS, macOS, Android and Google all
 * accept). Only the fields we model; everything else is ignored on the way in.
 */

export interface CardAddress {
  label: string;
  street: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface Card {
  uid: string | null;
  firstName: string;
  lastName: string | null;
  fullName: string | null;
  nickname: string | null;
  birthday: PartialDate | null;
  phones: { label: string; value: string }[];
  emails: { label: string; value: string }[];
  urls: { label: string; value: string }[];
  socials: { service: string; value: string }[];
  addresses: CardAddress[];
  company: string | null;
  jobTitle: string | null;
  note: string | null;
}

export function emptyCard(): Card {
  return {
    uid: null,
    firstName: "",
    lastName: null,
    fullName: null,
    nickname: null,
    birthday: null,
    phones: [],
    emails: [],
    urls: [],
    socials: [],
    addresses: [],
    company: null,
    jobTitle: null,
    note: null,
  };
}

interface Property {
  name: string;
  params: Map<string, string[]>;
  value: string;
}

/** Undo line folding: a line starting with a space or tab continues the previous one. */
function unfold(text: string): string[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) out[out.length - 1] += line.slice(1);
    // vCard 2.1 quoted-printable soft line breaks end in "=".
    else if (out.length && /ENCODING=QUOTED-PRINTABLE/i.test(out[out.length - 1]!) && out[out.length - 1]!.endsWith("=")) out[out.length - 1] = out[out.length - 1]!.slice(0, -1) + line;
    else out.push(line);
  }
  return out.filter((l) => l.trim() !== "");
}

function parseLine(line: string): Property | null {
  // Find the colon that ends the name and params, skipping colons inside quoted params.
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ":" && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts: string[] = [];
  let cur = "";
  inQuotes = false;
  for (const c of head) {
    if (c === '"') inQuotes = !inQuotes;
    if (c === ";" && !inQuotes) {
      parts.push(cur);
      cur = "";
    } else cur += c;
  }
  parts.push(cur);
  // Drop a group prefix ("item1.EMAIL").
  const name = parts[0]!.split(".").pop()!.toUpperCase();
  const params = new Map<string, string[]>();
  for (const p of parts.slice(1)) {
    const eq = p.indexOf("=");
    // vCard 2.1 bare params: "TEL;CELL;HOME:..." mean TYPE=CELL,HOME.
    const key = eq < 0 ? "TYPE" : p.slice(0, eq).toUpperCase();
    const vals = (eq < 0 ? p : p.slice(eq + 1))
      .split(",")
      .map((v) => v.replace(/^"|"$/g, "").trim())
      .filter(Boolean);
    params.set(key, [...(params.get(key) ?? []), ...vals]);
  }
  return { name, params, value };
}

function decodeQuotedPrintable(s: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /^[0-9A-F]{2}$/i.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(s.charCodeAt(i));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** Split on unescaped separators, then unescape each part. */
function splitValue(value: string, sep: ";" | ","): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < value.length; i++) {
    const c = value[i]!;
    if (c === "\\" && i + 1 < value.length) {
      cur += c + value[i + 1];
      i++;
    } else if (c === sep) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map(unescape);
}

function unescape(v: string): string {
  return v.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

const nonEmpty = (s: string | undefined | null) => {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
};

/** Birthdays as "1990-05-10", "19900510", "--0510", "--05-10", "1990-05-10T00:00:00Z", or iOS's 1604 no-year. */
export function parseVcardDate(raw: string, omitYear = false): PartialDate | null {
  const v = raw.trim();
  let m = v.match(/^--(\d{2})-?(\d{2})/);
  if (m) return check({ year: null, month: Number(m[1]), day: Number(m[2]) });
  m = v.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (m) {
    const year = Number(m[1]);
    return check({ year: omitYear || year <= 1604 ? null : year, month: Number(m[2]), day: Number(m[3]) });
  }
  return null;
}

function check(d: PartialDate) {
  return isValidPartialDate(d) ? d : null;
}

const phoneLabel = (types: string[]) => {
  const t = types.map((x) => x.toLowerCase());
  if (t.some((x) => x === "cell" || x === "mobile" || x === "iphone")) return "mobile";
  if (t.includes("work")) return "work";
  if (t.includes("home")) return "home";
  return "other";
};

const placeLabel = (types: string[], fallback = "other") => {
  const t = types.map((x) => x.toLowerCase());
  if (t.includes("work")) return "work";
  if (t.includes("home")) return "home";
  return fallback;
};

const socialServices = ["instagram", "linkedin", "twitter", "x", "facebook", "tiktok", "bluesky", "mastodon", "github"];

function cardFrom(props: Property[]): Card | null {
  const card = emptyCard();
  let n: string[] | null = null;
  for (const p of props) {
    const enc = p.params.get("ENCODING")?.[0]?.toUpperCase();
    const value = enc === "QUOTED-PRINTABLE" ? decodeQuotedPrintable(p.value) : p.value;
    const types = [...(p.params.get("TYPE") ?? []), ...(p.params.get("LABEL") ?? [])];
    switch (p.name) {
      case "UID":
        card.uid = nonEmpty(unescape(value));
        break;
      case "FN":
        card.fullName = nonEmpty(unescape(value));
        break;
      case "N":
        n = splitValue(value, ";");
        break;
      case "NICKNAME":
        card.nickname = nonEmpty(splitValue(value, ",")[0]);
        break;
      case "BDAY":
        card.birthday = parseVcardDate(value, p.params.has("X-APPLE-OMIT-YEAR"));
        break;
      case "TEL": {
        const v = nonEmpty(unescape(value).replace(/^tel:/i, ""));
        if (v) card.phones.push({ label: phoneLabel(types), value: v });
        break;
      }
      case "EMAIL": {
        const v = nonEmpty(unescape(value).replace(/^mailto:/i, ""));
        if (v) card.emails.push({ label: placeLabel(types) === "work" ? "work" : "personal", value: v });
        break;
      }
      case "URL": {
        const v = nonEmpty(unescape(value));
        if (v) card.urls.push({ label: "website", value: v });
        break;
      }
      case "X-SOCIALPROFILE": {
        const service = (types[0] ?? "other").toLowerCase().replace("twitter", "x");
        const v = nonEmpty(p.params.get("X-USER")?.[0] ?? unescape(value));
        if (v) card.socials.push({ service: socialServices.includes(service) ? service : "other", value: v });
        break;
      }
      case "ADR": {
        const [, ext, street, city, region, postal, country] = splitValue(value, ";");
        const a: CardAddress = {
          label: placeLabel(types, "home"),
          street: nonEmpty(street?.replace(/\n/g, ", ")),
          line2: nonEmpty(ext),
          city: nonEmpty(city),
          region: nonEmpty(region),
          postalCode: nonEmpty(postal),
          country: nonEmpty(country),
        };
        if (a.street || a.city || a.region || a.postalCode || a.country) card.addresses.push(a);
        break;
      }
      case "ORG":
        card.company = nonEmpty(splitValue(value, ";")[0]);
        break;
      case "TITLE":
        card.jobTitle = nonEmpty(unescape(value));
        break;
      case "NOTE":
        card.note = nonEmpty(unescape(value));
        break;
    }
  }
  if (n) {
    card.lastName = nonEmpty(n[0]);
    card.firstName = [n[1], n[2]].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
  }
  if (!card.firstName && card.fullName) {
    const [first, ...rest] = card.fullName.split(/\s+/);
    card.firstName = first!;
    card.lastName ??= nonEmpty(rest.join(" "));
  }
  if (!card.firstName && card.company) card.firstName = card.company;
  return card.firstName ? card : null;
}

/** Every contact in a .vcf file. Cards without a usable name are skipped. */
export function parseVcards(text: string): Card[] {
  const lines = unfold(text.replace(/^\uFEFF/, ""));
  const cards: Card[] = [];
  let props: Property[] | null = null;
  for (const line of lines) {
    const p = parseLine(line);
    if (!p) continue;
    if (p.name === "BEGIN" && p.value.toUpperCase() === "VCARD") props = [];
    else if (p.name === "END" && p.value.toUpperCase() === "VCARD") {
      const card = props ? cardFrom(props) : null;
      if (card) cards.push(card);
      props = null;
    } else props?.push(p);
  }
  return cards;
}

function escape(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

/** Fold to 75 octets per line, never splitting a UTF-8 character. */
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74;
    if (size + n > limit) {
      out.push(cur);
      cur = "";
      size = 0;
    }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const pad = (n: number) => String(n).padStart(2, "0");
const socialUrl: Record<string, string> = {
  instagram: "https://instagram.com/",
  x: "https://x.com/",
  linkedin: "https://linkedin.com/in/",
  facebook: "https://facebook.com/",
  tiktok: "https://tiktok.com/@",
  github: "https://github.com/",
  bluesky: "https://bsky.app/profile/",
};

/** vCard 3.0, CRLF line endings, folded. */
export function serializeVcard(card: Card & { uid: string; rev?: Date }): string {
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `PRODID:-//life-crm//EN`, `UID:${escape(card.uid)}`];
  const full = card.fullName ?? [card.firstName, card.lastName].filter(Boolean).join(" ");
  lines.push(`FN:${escape(full)}`);
  lines.push(`N:${escape(card.lastName ?? "")};${escape(card.firstName)};;;`);
  if (card.nickname) lines.push(`NICKNAME:${escape(card.nickname)}`);
  if (card.birthday) {
    const { year, month, day } = card.birthday;
    lines.push(year ? `BDAY;VALUE=DATE:${year}-${pad(month)}-${pad(day)}` : `BDAY;X-APPLE-OMIT-YEAR=1604:1604-${pad(month)}-${pad(day)}`);
  }
  if (card.company) lines.push(`ORG:${escape(card.company)};`);
  if (card.jobTitle) lines.push(`TITLE:${escape(card.jobTitle)}`);
  for (const p of card.phones) {
    const type = p.label === "mobile" ? "CELL" : p.label === "work" ? "WORK" : p.label === "home" ? "HOME" : "VOICE";
    lines.push(`TEL;TYPE=${type}:${escape(p.value)}`);
  }
  for (const e of card.emails) lines.push(`EMAIL;TYPE=INTERNET${e.label === "work" ? ",WORK" : e.label === "personal" ? ",HOME" : ""}:${escape(e.value)}`);
  for (const a of card.addresses) {
    const type = a.label === "work" ? "WORK" : a.label === "home" ? "HOME" : "OTHER";
    lines.push(
      `ADR;TYPE=${type}:;${escape(a.line2 ?? "")};${escape(a.street ?? "")};${escape(a.city ?? "")};${escape(a.region ?? "")};${escape(a.postalCode ?? "")};${escape(a.country ?? "")}`,
    );
  }
  for (const u of card.urls) lines.push(`URL:${escape(u.value)}`);
  for (const s of card.socials) {
    const url = socialUrl[s.service] && !/^https?:/i.test(s.value) ? socialUrl[s.service] + s.value : s.value;
    lines.push(`X-SOCIALPROFILE;TYPE=${s.service === "x" ? "twitter" : s.service};X-USER=${escape(s.value)}:${escape(url)}`);
  }
  if (card.note) lines.push(`NOTE:${escape(card.note)}`);
  if (card.rev) lines.push(`REV:${card.rev.toISOString().replace(/\.\d{3}/, "")}`);
  lines.push("END:VCARD");
  return lines.map(fold).join("\r\n") + "\r\n";
}
