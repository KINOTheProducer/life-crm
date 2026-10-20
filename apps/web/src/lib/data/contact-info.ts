import "server-only";
import {
  ContactInfoError,
  formatAddress,
  normalizeMethod,
  presentMethod,
  tidyPostalCode,
  type ContactMethodKind,
  type PostalAddress,
} from "@life-crm/core";
import { and, asc, desc, eq, inArray, schema, type Tx } from "@life-crm/db";

const { addresses, contactMethods } = schema;

export interface MethodInput {
  kind: ContactMethodKind;
  label: string;
  value: string;
}

export async function contactInfoFor(tx: Tx, contactId: string) {
  const methods = await tx
    .select()
    .from(contactMethods)
    .where(eq(contactMethods.contactId, contactId))
    .orderBy(asc(contactMethods.kind), desc(contactMethods.isPrimary), asc(contactMethods.createdAt));
  const places = await tx.select().from(addresses).where(eq(addresses.contactId, contactId)).orderBy(asc(addresses.createdAt));
  return {
    methods: methods.map((m) => ({ id: m.id, kind: m.kind, label: m.label, isPrimary: m.isPrimary, ...presentMethod(m.kind, m.label, m.value) })),
    addresses: places.map((a) => ({ id: a.id, label: a.label, oneLine: formatAddress(a), lines: formatAddress(a, true) })),
  };
}

export type ContactInfo = Awaited<ReturnType<typeof contactInfoFor>>;

/**
 * Add phones, emails and so on, skipping exact duplicates. Invalid values throw
 * ContactInfoError unless `skipInvalid` is set (imports keep going past bad rows).
 */
export async function addMethods(tx: Tx, tenantId: string, contactId: string, input: MethodInput[], options: { skipInvalid?: boolean } = {}) {
  if (input.length === 0) return 0;
  const existing = await tx
    .select({ kind: contactMethods.kind, value: contactMethods.value, isPrimary: contactMethods.isPrimary })
    .from(contactMethods)
    .where(eq(contactMethods.contactId, contactId));
  const seen = new Set(existing.map((e) => `${e.kind}:${e.value}`));
  const hasPrimary = new Set(existing.filter((e) => e.isPrimary).map((e) => e.kind));
  const rows: (typeof contactMethods.$inferInsert)[] = [];
  for (const m of input) {
    let value: string;
    try {
      value = normalizeMethod(m.kind, m.label, m.value).value;
    } catch (err) {
      if (options.skipInvalid && err instanceof ContactInfoError) continue;
      throw err;
    }
    if (seen.has(`${m.kind}:${value}`)) continue;
    seen.add(`${m.kind}:${value}`);
    const isPrimary = (m.kind === "phone" || m.kind === "email") && !hasPrimary.has(m.kind);
    if (isPrimary) hasPrimary.add(m.kind);
    rows.push({ tenantId, contactId, kind: m.kind, label: m.label || "other", value, isPrimary });
  }
  if (rows.length) await tx.insert(contactMethods).values(rows);
  return rows.length;
}

export type AddressInput = Partial<PostalAddress> & { label?: string };

const clean = (s: string | null | undefined) => {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
};

/** Add an address unless the same one is already there. Returns false when it was empty or a duplicate. */
export async function addAddress(tx: Tx, tenantId: string, contactId: string, a: AddressInput) {
  const row = {
    street: clean(a.street),
    line2: clean(a.line2),
    city: clean(a.city),
    region: clean(a.region),
    postalCode: tidyPostalCode(a.postalCode),
    country: clean(a.country),
  };
  if (!Object.values(row).some(Boolean)) return false;
  const existing = await tx.select().from(addresses).where(eq(addresses.contactId, contactId));
  if (existing.some((e) => formatAddress(e).toLowerCase() === formatAddress(row).toLowerCase())) return false;
  await tx.insert(addresses).values({ tenantId, contactId, label: clean(a.label) ?? "home", ...row });
  return true;
}

/** Contacts that share any of these phones or emails, for spotting duplicates. */
export async function contactsWithMethods(tx: Tx, methods: { kind: ContactMethodKind; value: string }[]) {
  const phones = methods.filter((m) => m.kind === "phone").map((m) => m.value);
  const emails = methods.filter((m) => m.kind === "email").map((m) => m.value);
  const out = new Map<string, string>();
  for (const [kind, values] of [
    ["phone", phones],
    ["email", emails],
  ] as const) {
    if (values.length === 0) continue;
    const rows = await tx
      .select({ contactId: contactMethods.contactId, value: contactMethods.value })
      .from(contactMethods)
      .where(and(eq(contactMethods.kind, kind), inArray(contactMethods.value, values)));
    for (const r of rows) out.set(`${kind}:${r.value}`, r.contactId);
  }
  return out;
}
