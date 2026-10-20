import { describe, expect, it } from "vitest";
import { formatAddress, normalizeEmail, normalizeMethod, normalizePhone, normalizeSocial, normalizeWebsite, tidyPostalCode } from "./contact-info";

describe("phones", () => {
  it("stores E.164 and shows local numbers nationally", () => {
    expect(normalizePhone("(416) 555-0123")).toEqual({ value: "+14165550123", display: "(416) 555-0123", href: "tel:+14165550123" });
    expect(normalizePhone("416.555.0123").value).toBe("+14165550123");
  });

  it("shows foreign numbers internationally", () => {
    expect(normalizePhone("+44 20 7946 0958").display).toBe("+44 20 7946 0958");
  });

  it("rejects junk", () => {
    expect(() => normalizePhone("call me")).toThrow();
  });
});

describe("other methods", () => {
  it("lowercases emails", () => {
    expect(normalizeEmail(" Holly.Chen@Example.COM ").value).toBe("holly.chen@example.com");
    expect(() => normalizeEmail("holly@")).toThrow();
  });

  it("keeps social handles and links them", () => {
    expect(normalizeSocial("@hollyc", "instagram")).toEqual({ value: "hollyc", display: "@hollyc", href: "https://instagram.com/hollyc" });
    expect(normalizeSocial("https://www.linkedin.com/in/holly-chen/", "linkedin").value).toBe("holly-chen");
    expect(normalizeSocial("holly@mastodon.social", "mastodon").href).toBe("https://mastodon.social/@holly");
  });

  it("adds a scheme to websites", () => {
    expect(normalizeWebsite("hollychen.ca").value).toBe("https://hollychen.ca/");
    expect(() => normalizeWebsite("not a site")).toThrow();
  });

  it("links WhatsApp numbers", () => {
    expect(normalizeMethod("messaging", "whatsapp", "416 555 0123").href).toBe("https://wa.me/14165550123");
  });
});

describe("addresses", () => {
  it("formats on one line or several", () => {
    const a = { street: "12 Elm St", line2: null, city: "Toronto", region: "ON", postalCode: "M5V 2T6", country: "Canada" };
    expect(formatAddress(a)).toBe("12 Elm St, Toronto, ON M5V 2T6, Canada");
    expect(formatAddress(a, true)).toBe("12 Elm St\nToronto, ON M5V 2T6\nCanada");
  });

  it("tidies Canadian postal codes", () => {
    expect(tidyPostalCode("m5v2t6")).toBe("M5V 2T6");
    expect(tidyPostalCode("90210")).toBe("90210");
    expect(tidyPostalCode("")).toBeNull();
  });
});
