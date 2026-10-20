import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

/** Phones, emails, socials and the like. Addresses are their own shape. */

export const contactMethodKinds = ["phone", "email", "social", "website", "messaging"] as const;
export type ContactMethodKind = (typeof contactMethodKinds)[number];

export const contactMethodLabels: Record<ContactMethodKind, readonly string[]> = {
  phone: ["mobile", "home", "work", "other"],
  email: ["personal", "work", "other"],
  social: ["instagram", "linkedin", "x", "facebook", "tiktok", "bluesky", "mastodon", "github", "other"],
  website: ["website", "blog", "portfolio", "other"],
  messaging: ["whatsapp", "signal", "telegram", "other"],
};

export interface NormalizedMethod {
  value: string;
  /** How to show it: "(416) 555-0123", "@hollyc". */
  display: string;
  /** Where tapping it goes, if anywhere. */
  href: string | null;
}

export class ContactInfoError extends Error {}

/** E.164 for storage, national format for people in the same country. Defaults to Canada. */
export function normalizePhone(input: string, defaultCountry: CountryCode = "CA"): NormalizedMethod {
  const parsed = parsePhoneNumberFromString(input.trim(), defaultCountry);
  if (!parsed || !parsed.isPossible()) throw new ContactInfoError("That doesn't look like a phone number");
  const value = parsed.number;
  return { value, display: formatPhone(value, defaultCountry), href: `tel:${value}` };
}

export function formatPhone(e164: string, homeCountry: CountryCode = "CA"): string {
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return e164;
  return parsed.country === homeCountry ? parsed.formatNational() : parsed.formatInternational();
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(input: string): NormalizedMethod {
  const value = input.trim().replace(/^mailto:/i, "").toLowerCase();
  if (!emailRe.test(value)) throw new ContactInfoError("That doesn't look like an email address");
  return { value, display: value, href: `mailto:${value}` };
}

const socialHosts: Record<string, string> = {
  instagram: "https://instagram.com/",
  x: "https://x.com/",
  tiktok: "https://tiktok.com/@",
  github: "https://github.com/",
  facebook: "https://facebook.com/",
  linkedin: "https://linkedin.com/in/",
  bluesky: "https://bsky.app/profile/",
};

/** Socials keep the handle ("hollyc"); full URLs are trimmed down to it when we know the site. */
export function normalizeSocial(input: string, service: string): NormalizedMethod {
  let v = input.trim();
  if (!v) throw new ContactInfoError("Add a handle or link");
  const base = socialHosts[service];
  if (base && /^https?:\/\//i.test(v)) {
    try {
      const url = new URL(v);
      const parts = url.pathname.split("/").filter(Boolean);
      // linkedin.com/in/<handle>, tiktok.com/@<handle>, bsky.app/profile/<handle>
      const handle = service === "linkedin" || service === "bluesky" ? parts[1] : parts[0];
      if (handle) v = handle;
    } catch {
      // Not a URL after all; keep what they typed.
    }
  }
  v = v.replace(/^@/, "");
  if (service === "mastodon") {
    const m = v.match(/^@?([^@\s]+)@([^@\s]+)$/);
    return { value: v, display: `@${v}`, href: m ? `https://${m[2]}/@${m[1]}` : null };
  }
  if (base) return { value: v, display: `@${v}`, href: `${base}${encodeURIComponent(v)}` };
  return /^https?:\/\//i.test(v) ? { value: v, display: v, href: v } : { value: v, display: v, href: null };
}

export function normalizeWebsite(input: string): NormalizedMethod {
  const raw = input.trim();
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) throw new Error();
    return { value: url.toString(), display: url.host + url.pathname.replace(/\/$/, ""), href: url.toString() };
  } catch {
    throw new ContactInfoError("That doesn't look like a web address");
  }
}

/** Messaging apps mostly key off a phone number; anything else is kept as typed. */
export function normalizeMessaging(input: string, app: string, defaultCountry: CountryCode = "CA"): NormalizedMethod {
  try {
    const phone = normalizePhone(input, defaultCountry);
    const digits = phone.value.replace(/\D/g, "");
    const href = app === "whatsapp" ? `https://wa.me/${digits}` : app === "signal" ? `https://signal.me/#p/${phone.value}` : null;
    return { ...phone, href };
  } catch {
    const v = input.trim().replace(/^@/, "");
    if (!v) throw new ContactInfoError("Add a number or username");
    return { value: v, display: app === "telegram" ? `@${v}` : v, href: app === "telegram" ? `https://t.me/${encodeURIComponent(v)}` : null };
  }
}

export function normalizeMethod(kind: ContactMethodKind, label: string, input: string, defaultCountry: CountryCode = "CA"): NormalizedMethod {
  switch (kind) {
    case "phone":
      return normalizePhone(input, defaultCountry);
    case "email":
      return normalizeEmail(input);
    case "social":
      return normalizeSocial(input, label);
    case "website":
      return normalizeWebsite(input);
    case "messaging":
      return normalizeMessaging(input, label, defaultCountry);
  }
}

/** Display and link for something already stored (values are normalized on the way in). */
export function presentMethod(kind: ContactMethodKind, label: string, value: string, homeCountry: CountryCode = "CA"): NormalizedMethod {
  try {
    return normalizeMethod(kind, label, value, homeCountry);
  } catch {
    return { value, display: value, href: null };
  }
}

export interface PostalAddress {
  street: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
}

/** One line for lists: "12 Elm St, Toronto, ON". */
export function formatAddress(a: PostalAddress, multiline = false): string {
  const cityLine = [a.city, [a.region, a.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const parts = [a.street, a.line2, cityLine, a.country].filter((p): p is string => !!p && p.trim() !== "");
  return parts.join(multiline ? "\n" : ", ");
}

/** Canadian and US postal codes, tidied: "m5v2t6" becomes "M5V 2T6". */
export function tidyPostalCode(code: string | null | undefined): string | null {
  const c = (code ?? "").trim().toUpperCase();
  if (!c) return null;
  const ca = c.replace(/\s+/g, "").match(/^([A-Z]\d[A-Z])(\d[A-Z]\d)$/);
  return ca ? `${ca[1]} ${ca[2]}` : c;
}
