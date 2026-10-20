/**
 * Just enough XML for WebDAV request bodies: elements, namespaces and text. No DTDs,
 * no entities beyond the five predefined ones, so nothing to expand or fetch.
 */

export const NS = {
  dav: "DAV:",
  carddav: "urn:ietf:params:xml:ns:carddav",
  cs: "http://calendarserver.org/ns/",
} as const;

export interface XmlElement {
  ns: string;
  name: string;
  children: XmlElement[];
  text: string;
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return entities[e] ?? m;
  });

export function escapeXml(s: string) {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}

/** Parse a document into its root element, or null if it isn't well-formed enough to use. */
export function parseXml(text: string): XmlElement | null {
  const body = text.replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  if (/<!DOCTYPE|<!ENTITY/i.test(body)) return null;
  const tag = /<(\/?)([\w.-]+(?::[\w.-]+)?)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!\[CDATA\[([\s\S]*?)\]\]>/g;
  const stack: { el: XmlElement; scope: Record<string, string> }[] = [];
  let root: XmlElement | null = null;
  let last = 0;
  for (let m = tag.exec(body); m; m = tag.exec(body)) {
    const between = body.slice(last, m.index);
    last = tag.lastIndex;
    const top = stack[stack.length - 1];
    if (top) top.el.text += decode(between);
    if (m[5] !== undefined) {
      if (top) top.el.text += m[5];
      continue;
    }
    const [, closing, qname, attrs, selfClosing] = m;
    const [prefix, local] = qname!.includes(":") ? qname!.split(":") : ["", qname!];
    if (closing) {
      const open = stack.pop();
      if (!open || open.el.name !== local) return null;
      continue;
    }
    const scope = { ...(top?.scope ?? {}) };
    for (const a of attrs!.matchAll(/([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      const value = decode(a[2] ?? a[3] ?? "");
      if (a[1] === "xmlns") scope[""] = value;
      else if (a[1]!.startsWith("xmlns:")) scope[a[1]!.slice(6)] = value;
    }
    const el: XmlElement = { ns: scope[prefix!] ?? "", name: local!, children: [], text: "" };
    if (top) top.el.children.push(el);
    else if (root) return null;
    else root = el;
    if (!selfClosing) stack.push({ el, scope });
  }
  return stack.length === 0 ? root : null;
}

export const child = (el: XmlElement | null | undefined, ns: string, name: string) => el?.children.find((c) => c.ns === ns && c.name === name);
export const children = (el: XmlElement | null | undefined, ns: string, name: string) => el?.children.filter((c) => c.ns === ns && c.name === name) ?? [];

/** Every descendant with this name, depth first. */
export function descendants(el: XmlElement, ns: string, name: string): XmlElement[] {
  return el.children.flatMap((c) => [...(c.ns === ns && c.name === name ? [c] : []), ...descendants(c, ns, name)]);
}

export interface PropName {
  ns: string;
  name: string;
}

const prefixes: Record<string, string> = { [NS.dav]: "d", [NS.carddav]: "card", [NS.cs]: "cs" };

function qualify(p: PropName, extra: Map<string, string>) {
  let prefix = prefixes[p.ns];
  if (!prefix) {
    prefix = extra.get(p.ns) ?? `x${extra.size}`;
    extra.set(p.ns, prefix);
  }
  return `${prefix}:${p.name}`;
}

export interface DavResponse {
  href: string;
  /** Properties we have, as inner XML (already escaped). */
  found?: { prop: PropName; xml: string }[];
  /** Properties asked for that this resource doesn't have. */
  missing?: PropName[];
  /** Properties a client tried to change that can't be. */
  forbidden?: PropName[];
  /** A bare status instead of properties, e.g. a deleted resource in a sync report. */
  status?: number;
}

const statusLine = (code: number) => `HTTP/1.1 ${code} ${{ 200: "OK", 404: "Not Found", 403: "Forbidden" }[code] ?? ""}`.trim();

/** A 207 Multi-Status body. */
export function multistatus(responses: DavResponse[], syncToken?: string) {
  const extra = new Map<string, string>();
  const body = responses
    .map((r) => {
      const parts = [`<d:href>${escapeXml(r.href)}</d:href>`];
      if (r.status) parts.push(`<d:status>${statusLine(r.status)}</d:status>`);
      if (r.found?.length) {
        const props = r.found.map((f) => {
          const q = qualify(f.prop, extra);
          return f.xml ? `<${q}>${f.xml}</${q}>` : `<${q}/>`;
        });
        parts.push(`<d:propstat><d:prop>${props.join("")}</d:prop><d:status>${statusLine(200)}</d:status></d:propstat>`);
      }
      if (r.missing?.length) {
        const props = r.missing.map((p) => `<${qualify(p, extra)}/>`);
        parts.push(`<d:propstat><d:prop>${props.join("")}</d:prop><d:status>${statusLine(404)}</d:status></d:propstat>`);
      }
      if (r.forbidden?.length) {
        const props = r.forbidden.map((p) => `<${qualify(p, extra)}/>`);
        parts.push(`<d:propstat><d:prop>${props.join("")}</d:prop><d:status>${statusLine(403)}</d:status></d:propstat>`);
      }
      return `<d:response>${parts.join("")}</d:response>`;
    })
    .join("");
  const ns = [`xmlns:d="DAV:"`, `xmlns:card="${NS.carddav}"`, `xmlns:cs="${NS.cs}"`, ...[...extra].map(([uri, p]) => `xmlns:${p}="${escapeXml(uri)}"`)].join(" ");
  const token = syncToken ? `<d:sync-token>${escapeXml(syncToken)}</d:sync-token>` : "";
  return `<?xml version="1.0" encoding="utf-8"?>\n<d:multistatus ${ns}>${body}${token}</d:multistatus>`;
}
