import "server-only";
import {
  child,
  descendants,
  escapeXml,
  multistatus,
  NS,
  parseVcards,
  parseXml,
  serializeVcard,
  type DavResponse,
  type PropName,
  type XmlElement,
} from "@life-crm/dav";
import { and, eq, gt, isNull, or, schema, sql, TOMBSTONE_DAYS, withTenant, type Tx } from "@life-crm/db";
import { cardsFor, createFromCard, replaceFromCard } from "@/lib/data/cards";
import { db } from "@/lib/db";
import { hashDavPassword } from "./passwords";

const { contacts, contactTombstones, davPasswords, user } = schema;

const ROOT = "/dav/";
const PRINCIPAL = "/dav/principal/";
const HOME = "/dav/addressbooks/";
const BOOK = "/dav/addressbooks/people/";
const MAX_CARD_BYTES = 1024 * 1024;
const SYNC_PREFIX = "http://life-crm/sync/";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DavUser {
  id: string;
  name: string;
  email: string;
  tenantId: string;
}

type Target = { kind: "root" | "principal" | "home" | "book" } | { kind: "card"; name: string };

const p = (ns: string, name: string): PropName => ({ ns, name });
const dav = (name: string) => p(NS.dav, name);

const headers = { DAV: "1, 3, addressbook", "Cache-Control": "no-store" };

function reply(status: number, body?: string | null, extra: Record<string, string> = {}) {
  const type: Record<string, string> = body?.startsWith("<?xml") ? { "Content-Type": "application/xml; charset=utf-8" } : {};
  return new Response(body ?? null, { status, headers: { ...headers, ...type, ...extra } });
}

const unauthorized = () => reply(401, "Sign in with your email and an app password from Settings.", { "WWW-Authenticate": 'Basic realm="life-crm", charset="UTF-8"' });

function targetOf(pathname: string): Target | null {
  const path = pathname.endsWith("/") || pathname.endsWith(".vcf") ? pathname : `${pathname}/`;
  if (path === ROOT) return { kind: "root" };
  if (path === PRINCIPAL) return { kind: "principal" };
  if (path === HOME) return { kind: "home" };
  if (path === BOOK) return { kind: "book" };
  if (path.startsWith(BOOK) && path.endsWith(".vcf")) {
    let name: string;
    try {
      name = decodeURIComponent(path.slice(BOOK.length, -4));
    } catch {
      return null;
    }
    if (!name || name.length > 200 || /[/\\\0]/.test(name)) return null;
    return { kind: "card", name };
  }
  return null;
}

const hrefFor = (name: string) => `${BOOK}${encodeURIComponent(name)}.vcf`;
const nameFromHref = (href: string) => {
  try {
    const t = targetOf(new URL(href, "http://x").pathname);
    return t?.kind === "card" ? t.name : null;
  } catch {
    return null;
  }
};
const etagOf = (updatedAt: Date) => `"${updatedAt.getTime()}"`;

async function authenticate(request: Request): Promise<DavUser | null> {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("basic ")) return null;
  const decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  if (colon < 0) return null;
  const username = decoded.slice(0, colon).trim().toLowerCase();
  const password = decoded.slice(colon + 1);
  if (!password || password.length > 200) return null;
  const [row] = await db
    .select({ passwordId: davPasswords.id, lastUsedAt: davPasswords.lastUsedAt, id: user.id, name: user.name, email: user.email, tenantId: user.tenantId })
    .from(davPasswords)
    .innerJoin(user, eq(user.id, davPasswords.userId))
    .where(eq(davPasswords.tokenHash, hashDavPassword(password)));
  if (!row?.tenantId || row.email.toLowerCase() !== username) return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 10 * 60_000) {
    await db.update(davPasswords).set({ lastUsedAt: new Date() }).where(eq(davPasswords.id, row.passwordId));
  }
  return { id: row.id, name: row.name, email: row.email, tenantId: row.tenantId };
}

/** People a phone sees: everyone but the user themselves. Trashed people are left to the caller. */
const visible = eq(contacts.isSelf, false);
const davNameSql = sql<string>`coalesce(${contacts.davName}, ${contacts.id}::text)`;

async function findByName(tx: Tx, name: string) {
  const [row] = await tx
    .select({ id: contacts.id, updatedAt: contacts.updatedAt, deletedAt: contacts.deletedAt, davUid: contacts.davUid })
    .from(contacts)
    .where(and(visible, UUID.test(name) ? or(eq(contacts.davName, name), and(isNull(contacts.davName), eq(contacts.id, name))) : eq(contacts.davName, name)));
  return row ?? null;
}

/** Changes as a single number: the newest edit, trash or delete. */
async function syncPoint(tx: Tx) {
  const [row] = await tx.execute<{ ms: string | null }>(sql`
    select floor(extract(epoch from greatest(
      (select max(updated_at) from contacts where not is_self),
      (select max(deleted_at) from contact_tombstones)
    )) * 1000)::bigint::text as ms`);
  return Number(row?.ms ?? 0);
}

const syncToken = (ms: number) => `${SYNC_PREFIX}${ms}`;

// Properties

const live = and(visible, isNull(contacts.deletedAt));

interface CardRow {
  id: string;
  name: string;
  updatedAt: Date;
}

async function liveCards(tx: Tx, where = live) {
  return tx.select({ id: contacts.id, name: davNameSql, updatedAt: contacts.updatedAt }).from(contacts).where(where);
}

function commonProps(): Record<string, string> {
  return {
    "DAV:|current-user-principal": `<d:href>${PRINCIPAL}</d:href>`,
    "DAV:|principal-URL": `<d:href>${PRINCIPAL}</d:href>`,
    "DAV:|principal-collection-set": `<d:href>${ROOT}</d:href>`,
    "DAV:|owner": `<d:href>${PRINCIPAL}</d:href>`,
    [`${NS.carddav}|addressbook-home-set`]: `<d:href>${HOME}</d:href>`,
    "DAV:|current-user-privilege-set": `<d:privilege><d:read/></d:privilege><d:privilege><d:write/></d:privilege><d:privilege><d:write-content/></d:privilege><d:privilege><d:bind/></d:privilege><d:privilege><d:unbind/></d:privilege>`,
  };
}

async function collectionProps(tx: Tx, u: DavUser, kind: "root" | "principal" | "home" | "book"): Promise<Record<string, string>> {
  const common = commonProps();
  if (kind === "root") return { ...common, "DAV:|resourcetype": "<d:collection/>" };
  if (kind === "principal")
    return {
      ...common,
      "DAV:|resourcetype": "<d:principal/>",
      "DAV:|displayname": escapeXml(u.name),
    };
  if (kind === "home") return { ...common, "DAV:|resourcetype": "<d:collection/>", "DAV:|displayname": "Address books" };
  const ms = await syncPoint(tx);
  return {
    ...common,
    "DAV:|resourcetype": "<d:collection/><card:addressbook/>",
    "DAV:|displayname": "People",
    [`${NS.carddav}|addressbook-description`]: "Everyone in life-crm",
    [`${NS.carddav}|supported-address-data`]: '<card:address-data-type content-type="text/vcard" version="3.0"/>',
    [`${NS.carddav}|max-resource-size`]: String(MAX_CARD_BYTES),
    "DAV:|supported-report-set": ["sync-collection"].map((r) => `<d:supported-report><d:report><d:${r}/></d:report></d:supported-report>`).join("") +
      ["addressbook-multiget", "addressbook-query"].map((r) => `<d:supported-report><d:report><card:${r}/></d:report></d:supported-report>`).join(""),
    "DAV:|sync-token": escapeXml(syncToken(ms)),
    [`${NS.cs}|getctag`]: String(ms),
  };
}

function cardProps(row: CardRow, vcard?: string): Record<string, string> {
  return {
    "DAV:|resourcetype": "",
    "DAV:|getetag": escapeXml(etagOf(row.updatedAt)),
    "DAV:|getcontenttype": "text/vcard; charset=utf-8",
    "DAV:|getlastmodified": row.updatedAt.toUTCString(),
    ...(vcard !== undefined ? { [`${NS.carddav}|address-data`]: escapeXml(vcard) } : {}),
  };
}

/** Props a client asked for, or null for "everything" (allprop, propname, or no body). */
function requestedProps(prop: XmlElement | undefined): PropName[] | null {
  return prop ? prop.children.map((c) => p(c.ns, c.name)) : null;
}

const wantsAddressData = (wanted: PropName[] | null) => !!wanted?.some((w) => w.ns === NS.carddav && w.name === "address-data");

function respond(href: string, props: Record<string, string>, wanted: PropName[] | null): DavResponse {
  if (!wanted) {
    return { href, found: Object.entries(props).map(([k, xml]) => ({ prop: p(k.slice(0, k.lastIndexOf("|")), k.slice(k.lastIndexOf("|") + 1)), xml })) };
  }
  const found: DavResponse["found"] = [];
  const missing: PropName[] = [];
  for (const w of wanted) {
    const xml = props[`${w.ns}|${w.name}`];
    if (xml === undefined) missing.push(w);
    else found.push({ prop: w, xml });
  }
  return { href, found, missing };
}

async function vcardsFor(tx: Tx, rows: CardRow[]) {
  const cards = await cardsFor(
    tx,
    rows.map((r) => r.id),
  );
  return new Map(rows.map((r) => [r.id, cards.get(r.id) ? serializeVcard(cards.get(r.id)!) : ""]));
}

async function cardResponses(tx: Tx, rows: CardRow[], wanted: PropName[] | null) {
  const vcards = wantsAddressData(wanted) ? await vcardsFor(tx, rows) : null;
  return rows.map((r) => respond(hrefFor(r.name), cardProps(r, vcards?.get(r.id)), wanted));
}

// Methods

async function propfind(tx: Tx, u: DavUser, target: Target, body: XmlElement | null, depth: string) {
  if (body && !(body.ns === NS.dav && body.name === "propfind")) return reply(400, "Expected a propfind body.");
  const wanted = requestedProps(child(body, NS.dav, "prop"));
  const deep = depth !== "0";
  const out: DavResponse[] = [];

  if (target.kind === "card") {
    const row = await findByName(tx, target.name);
    if (!row || row.deletedAt) return reply(404);
    out.push(...(await cardResponses(tx, [{ id: row.id, name: target.name, updatedAt: row.updatedAt }], wanted)));
    return reply(207, multistatus(out));
  }

  const hrefs = { root: ROOT, principal: PRINCIPAL, home: HOME, book: BOOK };
  out.push(respond(hrefs[target.kind], await collectionProps(tx, u, target.kind), wanted));
  if (deep) {
    if (target.kind === "root") {
      out.push(respond(PRINCIPAL, await collectionProps(tx, u, "principal"), wanted));
      out.push(respond(HOME, await collectionProps(tx, u, "home"), wanted));
    } else if (target.kind === "home") {
      out.push(respond(BOOK, await collectionProps(tx, u, "book"), wanted));
    } else if (target.kind === "book") {
      out.push(...(await cardResponses(tx, await liveCards(tx), wanted)));
    }
  }
  return reply(207, multistatus(out));
}

async function report(tx: Tx, target: Target, body: XmlElement | null) {
  if (target.kind !== "book" || !body) return reply(403, "Reports run on the address book.");
  const wanted = requestedProps(child(body, NS.dav, "prop")) ?? [dav("getetag")];

  if (body.ns === NS.carddav && body.name === "addressbook-multiget") {
    const names = [...new Set(descendants(body, NS.dav, "href").map((h) => nameFromHref(h.text.trim())))];
    const rows = (await liveCards(tx)).filter((r) => names.includes(r.name));
    const found = await cardResponses(tx, rows, wanted);
    const missing = names.filter((n): n is string => !!n && !rows.some((r) => r.name === n)).map((n) => ({ href: hrefFor(n), status: 404 }));
    return reply(207, multistatus([...found, ...missing]));
  }

  if (body.ns === NS.carddav && body.name === "addressbook-query") {
    // Filters aren't applied; an address book this size is cheap to send whole.
    return reply(207, multistatus(await cardResponses(tx, await liveCards(tx), wanted)));
  }

  if (body.ns === NS.dav && body.name === "sync-collection") {
    const now = await syncPoint(tx);
    const raw = child(body, NS.dav, "sync-token")?.text.trim() ?? "";
    if (!raw) return reply(207, multistatus(await cardResponses(tx, await liveCards(tx), wanted), syncToken(now)));

    const since = raw.startsWith(SYNC_PREFIX) ? Number(raw.slice(SYNC_PREFIX.length)) : NaN;
    if (!Number.isSafeInteger(since) || since < 0 || since > now || Date.now() - since > TOMBSTONE_DAYS * 86_400_000) {
      return reply(403, `<?xml version="1.0" encoding="utf-8"?>\n<d:error xmlns:d="DAV:"><d:valid-sync-token/></d:error>`);
    }
    const after = new Date(since);
    const changed = await tx
      .select({ id: contacts.id, name: davNameSql, updatedAt: contacts.updatedAt, deletedAt: contacts.deletedAt })
      .from(contacts)
      .where(and(visible, gt(contacts.updatedAt, after)));
    const gone = await tx.select({ name: contactTombstones.davName }).from(contactTombstones).where(gt(contactTombstones.deletedAt, after));
    const alive = changed.filter((r) => !r.deletedAt);
    const removed = new Set([...changed.filter((r) => r.deletedAt).map((r) => r.name), ...gone.map((g) => g.name)]);
    for (const r of alive) removed.delete(r.name);
    const responses = [...(await cardResponses(tx, alive, wanted)), ...[...removed].map((n) => ({ href: hrefFor(n), status: 404 }))];
    return reply(207, multistatus(responses, syncToken(now)));
  }

  return reply(403, "That report isn't supported.");
}

function matchesPreconditions(request: Request, etag: string | null) {
  const ifMatch = request.headers.get("if-match");
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch?.trim() === "*" && etag) return false;
  if (ifMatch) {
    if (!etag) return false;
    const tags = ifMatch.split(",").map((t) => t.trim().replace(/^W\//, ""));
    if (!tags.includes("*") && !tags.includes(etag)) return false;
  }
  return true;
}

async function put(tx: Tx, u: DavUser, request: Request, name: string, text: string) {
  const cards = parseVcards(text);
  if (cards.length !== 1) return reply(400, "Send one vCard.");
  const c = cards[0]!;
  c.firstName = (c.firstName || c.fullName || c.company || "Unnamed").trim().slice(0, 100);

  const existing = await findByName(tx, name);
  const etag = existing && !existing.deletedAt ? etagOf(existing.updatedAt) : null;
  if (!matchesPreconditions(request, etag)) return reply(412);

  let id: string;
  if (existing) {
    id = existing.id;
    await replaceFromCard(tx, u.tenantId, id, c);
    await tx
      .update(contacts)
      .set({ deletedAt: null, davUid: c.uid ?? existing.davUid })
      .where(eq(contacts.id, id));
  } else {
    id = await createFromCard(tx, u.tenantId, c, { source: "your phone", davUid: c.uid ?? name });
    if (name !== id) await tx.update(contacts).set({ davName: name }).where(eq(contacts.id, id));
  }
  const [after] = await tx.select({ updatedAt: contacts.updatedAt }).from(contacts).where(eq(contacts.id, id));
  return reply(existing ? 204 : 201, null, { ETag: etagOf(after!.updatedAt) });
}

async function handle(request: Request, u: DavUser, target: Target): Promise<Response> {
  const method = request.method.toUpperCase();
  const depth = request.headers.get("depth") ?? "0";

  // Read the body before the transaction; PUT is the only one that can be big.
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_CARD_BYTES) return reply(413);
  const text = ["PROPFIND", "REPORT", "PUT", "PROPPATCH"].includes(method) ? await request.text() : "";
  if (text.length > MAX_CARD_BYTES) return reply(413);
  const xml = method === "PUT" || !text.trim() ? null : parseXml(text);
  if (method !== "PUT" && text.trim() && !xml) return reply(400, "Couldn't read that XML.");

  return withTenant(db, u.tenantId, async (tx) => {
    switch (method) {
      case "PROPFIND":
        return propfind(tx, u, target, xml, depth);
      case "REPORT":
        return report(tx, target, xml);
      case "PROPPATCH": {
        // Names and colors live in the app; accept nothing, say so politely.
        const names = xml ? descendants(xml, NS.dav, "prop").flatMap((pr) => pr.children.map((c) => p(c.ns, c.name))) : [];
        return reply(207, multistatus([{ href: new URL(request.url).pathname, forbidden: names }]));
      }
      case "GET":
      case "HEAD": {
        if (target.kind !== "card") return reply(200, method === "HEAD" ? null : "life-crm CardDAV. Point your contacts app at this server.", { "Content-Type": "text/plain; charset=utf-8" });
        const row = await findByName(tx, target.name);
        if (!row || row.deletedAt) return reply(404);
        const vcard = (await vcardsFor(tx, [{ id: row.id, name: target.name, updatedAt: row.updatedAt }])).get(row.id)!;
        return reply(200, method === "HEAD" ? null : vcard, { "Content-Type": "text/vcard; charset=utf-8", ETag: etagOf(row.updatedAt), "Last-Modified": row.updatedAt.toUTCString() });
      }
      case "PUT":
        if (target.kind !== "card") return reply(405);
        return put(tx, u, request, target.name, text);
      case "DELETE": {
        if (target.kind !== "card") return reply(403, "Only single contacts can be deleted.");
        const row = await findByName(tx, target.name);
        if (!row || row.deletedAt) return reply(404);
        if (!matchesPreconditions(request, etagOf(row.updatedAt))) return reply(412);
        // To the trash, same as deleting in the app. It can be restored for 30 days.
        await tx.update(contacts).set({ deletedAt: new Date() }).where(eq(contacts.id, row.id));
        return reply(204);
      }
      default:
        return reply(405, null, { Allow: "OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, PROPPATCH, REPORT" });
    }
  });
}

/** Entry point for /dav/* and /.well-known/carddav, called from the proxy. */
export async function handleDav(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname.startsWith("/.well-known/carddav")) return reply(301, null, { Location: new URL(ROOT, request.url).toString() });
  if (request.method === "OPTIONS") return reply(200, null, { Allow: "OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, PROPPATCH, REPORT" });

  const u = await authenticate(request);
  if (!u) return unauthorized();
  const target = targetOf(pathname);
  if (!target) return reply(404);
  try {
    return await handle(request, u, target);
  } catch (err) {
    console.error("carddav", request.method, pathname, err);
    return reply(500);
  }
}
