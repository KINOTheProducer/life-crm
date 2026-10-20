import { describe, expect, it } from "vitest";
import { child, descendants, multistatus, NS, parseXml } from "./xml";

describe("parseXml", () => {
  it("resolves namespaces and prefixes", () => {
    const root = parseXml(`<?xml version="1.0"?>
      <A:propfind xmlns:A="DAV:" xmlns:B="urn:ietf:params:xml:ns:carddav">
        <A:prop><A:getetag/><B:address-data/><x:color xmlns:x="http://apple.com/ns/ical/"/></A:prop>
      </A:propfind>`);
    expect(root).toMatchObject({ ns: NS.dav, name: "propfind" });
    const props = child(root, NS.dav, "prop")!.children.map((c) => `${c.ns}|${c.name}`);
    expect(props).toEqual(["DAV:|getetag", `${NS.carddav}|address-data`, "http://apple.com/ns/ical/|color"]);
  });

  it("reads text with entities and default namespaces", () => {
    const root = parseXml(`<addressbook-multiget xmlns="urn:ietf:params:xml:ns:carddav" xmlns:d="DAV:">
      <d:href>/dav/addressbooks/people/a%20b.vcf</d:href><d:href>/x&amp;y.vcf</d:href></addressbook-multiget>`)!;
    expect(root.ns).toBe(NS.carddav);
    expect(descendants(root, NS.dav, "href").map((h) => h.text)).toEqual(["/dav/addressbooks/people/a%20b.vcf", "/x&y.vcf"]);
  });

  it("refuses doctypes and broken nesting", () => {
    expect(parseXml(`<!DOCTYPE x [<!ENTITY a "b">]><x>&a;</x>`)).toBeNull();
    expect(parseXml(`<a><b></a></b>`)).toBeNull();
    expect(parseXml(`<a></a><b/>`)).toBeNull();
  });
});

describe("multistatus", () => {
  it("splits found and missing props and escapes hrefs", () => {
    const xml = multistatus(
      [
        { href: "/dav/a&b.vcf", found: [{ prop: { ns: NS.dav, name: "getetag" }, xml: "&quot;1&quot;" }], missing: [{ ns: "http://apple.com/ns/ical/", name: "color" }] },
        { href: "/dav/gone.vcf", status: 404 },
      ],
      "https://life-crm/sync/5",
    );
    expect(xml).toContain("<d:href>/dav/a&amp;b.vcf</d:href>");
    expect(xml).toContain("<d:getetag>&quot;1&quot;</d:getetag>");
    expect(xml).toContain('xmlns:x0="http://apple.com/ns/ical/"');
    expect(xml).toContain("<x0:color/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status>");
    expect(xml).toContain("<d:status>HTTP/1.1 404 Not Found</d:status></d:response>");
    expect(xml).toContain("<d:sync-token>https://life-crm/sync/5</d:sync-token>");
    expect(parseXml(xml)).not.toBeNull();
  });
});
