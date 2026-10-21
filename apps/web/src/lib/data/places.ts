import "server-only";
import { and, asc, eq, isNull, schema, sql, type Tx } from "@life-crm/db";
import { fullName } from "./contacts";

const { addresses, contacts } = schema;

export interface Place {
  city: string;
  region: string | null;
  country: string | null;
  people: { id: string; name: string; avatarRef: string | null; label: string }[];
}

/**
 * Where your people live, one entry per city (case and spacing ignored), most people first.
 * Someone with a home and a work address in the same city counts once.
 */
export async function listPlaces(tx: Tx): Promise<Place[]> {
  const rows = await tx
    .select({
      key: sql<string>`lower(trim(${addresses.city}))`,
      city: addresses.city,
      region: addresses.region,
      country: addresses.country,
      label: addresses.label,
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      avatarRef: contacts.avatarRef,
    })
    .from(addresses)
    .innerJoin(contacts, eq(contacts.id, addresses.contactId))
    .where(and(isNull(contacts.deletedAt), eq(contacts.isSelf, false), eq(contacts.isDeceased, false), sql`nullif(trim(${addresses.city}), '') is not null`))
    .orderBy(asc(contacts.firstName), asc(contacts.lastName));

  const places = new Map<string, Place>();
  for (const r of rows) {
    let place = places.get(r.key);
    if (!place) {
      place = { city: r.city!.trim(), region: r.region, country: r.country, people: [] };
      places.set(r.key, place);
    }
    place.region ??= r.region;
    place.country ??= r.country;
    if (!place.people.some((p) => p.id === r.id)) place.people.push({ id: r.id, name: fullName(r), avatarRef: r.avatarRef, label: r.label });
  }
  return [...places.values()].sort((a, b) => b.people.length - a.people.length || a.city.localeCompare(b.city));
}
