import "server-only";
import { todayIn, upcoming, type ClosenessTier, type UpcomingDate } from "@life-crm/core";
import { and, asc, eq, ilike, inArray, isNull, or, schema, sql } from "@life-crm/db";

import { tenantQuery } from "@/lib/session";

const { addresses, circleMembers, circles, contactMethods, contacts, facts, importantDates, notes } = schema;

export interface PeopleFilter {
  tier?: ClosenessTier;
  q?: string;
  /** Birthday month, 1-12. */
  month?: number;
  city?: string;
  interest?: string;
  circleId?: string;
  /** Past their keep-in-touch cadence. */
  overdue?: boolean;
}

const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** A short piece of text around the match, so the list shows why someone came up. */
function snippet(text: string, q: string) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text.slice(0, 80);
  const start = Math.max(0, i - 30);
  return `${start > 0 ? "…" : ""}${text.slice(start, i + q.length + 50).replace(/\s+/g, " ")}${i + q.length + 50 < text.length ? "…" : ""}`;
}

/**
 * Everyone, filtered. Search looks at names, nicknames, what they are to you, work, phones,
 * emails, cities, facts and notes, and says where it found the match.
 */
export async function listPeople(filter: PeopleFilter = {}) {
  return tenantQuery(async (tx, user) => {
    const q = filter.q?.trim();
    const digits = q?.replace(/\D/g, "") ?? "";
    const text = q ? like(q) : null;
    const conditions = [
      isNull(contacts.deletedAt),
      eq(contacts.isSelf, false),
      filter.tier ? eq(contacts.closeness, filter.tier) : undefined,
      filter.month ? eq(importantDates.month, filter.month) : undefined,
      filter.city
        ? sql`exists (select 1 from ${addresses} where ${addresses.contactId} = ${contacts.id} and ${addresses.city} ilike ${like(filter.city.trim())})`
        : undefined,
      filter.interest
        ? sql`exists (select 1 from ${facts} where ${facts.contactId} = ${contacts.id} and ${facts.archivedAt} is null and ${facts.category} = 'interest' and (${facts.value} ilike ${like(filter.interest.trim())} or ${facts.label} ilike ${like(filter.interest.trim())}))`
        : undefined,
      filter.circleId
        ? sql`exists (select 1 from ${circleMembers} where ${circleMembers.contactId} = ${contacts.id} and ${circleMembers.circleId} = ${filter.circleId})`
        : undefined,
      filter.overdue
        ? sql`${contacts.keepInTouchDays} > 0 and coalesce(${contacts.lastInteractionAt}, ${contacts.createdAt}) < now() - make_interval(days => ${contacts.keepInTouchDays})`
        : undefined,
      text
        ? or(
            sql`(${contacts.firstName} || ' ' || coalesce(${contacts.lastName}, '') || ' ' || coalesce(${contacts.nickname}, '')) ilike ${text}`,
            ilike(contacts.relationship, text),
            ilike(contacts.company, text),
            ilike(contacts.jobTitle, text),
            sql`exists (select 1 from ${contactMethods} where ${contactMethods.contactId} = ${contacts.id} and (${contactMethods.value} ilike ${text}${digits.length >= 4 ? sql` or regexp_replace(${contactMethods.value}, '[^0-9]', '', 'g') like ${`%${digits}%`}` : sql``}))`,
            sql`exists (select 1 from ${addresses} where ${addresses.contactId} = ${contacts.id} and (${addresses.city} ilike ${text} or ${addresses.street} ilike ${text}))`,
            sql`exists (select 1 from ${facts} where ${facts.contactId} = ${contacts.id} and ${facts.archivedAt} is null and (${facts.value} ilike ${text} or ${facts.label} ilike ${text}))`,
            sql`exists (select 1 from ${notes} where ${notes.contactId} = ${contacts.id} and ${notes.deletedAt} is null and ${notes.body} ilike ${text})`,
          )
        : undefined,
    ];
    const rows = await tx
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        nickname: contacts.nickname,
        avatarRef: contacts.avatarRef,
        closeness: contacts.closeness,
        relationship: contacts.relationship,
        company: contacts.company,
        jobTitle: contacts.jobTitle,
        lastInteractionAt: contacts.lastInteractionAt,
        year: importantDates.year,
        month: importantDates.month,
        day: importantDates.day,
      })
      .from(contacts)
      .leftJoin(importantDates, and(eq(importantDates.contactId, contacts.id), eq(importantDates.type, "birthday")))
      .where(and(...conditions))
      .orderBy(asc(contacts.firstName), asc(contacts.lastName))
      .limit(500);

    // Say why each person matched when it wasn't their name.
    const why = new Map<string, string>();
    if (q && rows.length) {
      const ids = rows.map((r) => r.id);
      const nameHit = (r: (typeof rows)[number]) => `${r.firstName} ${r.lastName ?? ""} ${r.nickname ?? ""}`.toLowerCase().includes(q.toLowerCase());
      for (const r of rows) {
        if (nameHit(r)) continue;
        const field = [r.relationship, r.company, r.jobTitle].find((v) => v?.toLowerCase().includes(q.toLowerCase()));
        if (field) why.set(r.id, field);
      }
      const methodHits = await tx
        .select({ contactId: contactMethods.contactId, value: contactMethods.value })
        .from(contactMethods)
        .where(and(inArray(contactMethods.contactId, ids), digits.length >= 4 ? or(ilike(contactMethods.value, text!), sql`regexp_replace(${contactMethods.value}, '[^0-9]', '', 'g') like ${`%${digits}%`}`) : ilike(contactMethods.value, text!)));
      for (const m of methodHits) if (!why.has(m.contactId)) why.set(m.contactId, m.value);
      const factHits = await tx
        .select({ contactId: facts.contactId, label: facts.label, value: facts.value })
        .from(facts)
        .where(and(inArray(facts.contactId, ids), isNull(facts.archivedAt), or(ilike(facts.value, text!), ilike(facts.label, text!))));
      for (const f of factHits) if (!why.has(f.contactId)) why.set(f.contactId, `${f.label}: ${f.value}`);
      const noteHits = await tx
        .select({ contactId: notes.contactId, body: notes.body })
        .from(notes)
        .where(and(inArray(notes.contactId, ids), isNull(notes.deletedAt), ilike(notes.body, text!)));
      for (const n of noteHits) if (!why.has(n.contactId)) why.set(n.contactId, `Note: ${snippet(n.body, q)}`);
    }

    const today = todayIn(user.timeZone);
    return rows.map((r) => ({
      ...r,
      matched: why.get(r.id) ?? null,
      birthday: r.month && r.day ? upcoming({ year: r.year, month: r.month, day: r.day }, today) : null,
    }));
  });
}

/** Cities and interests people have, for the filter suggestions. */
export async function filterOptions() {
  return tenantQuery(async (tx) => {
    const cities = await tx
      .selectDistinct({ city: addresses.city })
      .from(addresses)
      .innerJoin(contacts, eq(contacts.id, addresses.contactId))
      .where(and(isNull(contacts.deletedAt), sql`${addresses.city} is not null`))
      .orderBy(asc(addresses.city));
    const interests = await tx
      .selectDistinct({ value: facts.value })
      .from(facts)
      .where(and(eq(facts.category, "interest"), isNull(facts.archivedAt)))
      .orderBy(asc(facts.value))
      .limit(200);
    const circleRows = await tx.select({ id: circles.id, name: circles.name }).from(circles).orderBy(asc(circles.name));
    return { cities: cities.map((c) => c.city!).filter(Boolean), interests: interests.map((i) => i.value), circles: circleRows };
  });
}

export interface UpcomingBirthday extends UpcomingDate {
  contactId: string;
  name: string;
}

/** Birthdays in the next `days` days, soonest first, in the user's time zone. */
export async function upcomingBirthdays(days: number): Promise<UpcomingBirthday[]> {
  return tenantQuery(async (tx, user) => {
    const rows = await tx
      .select({
        contactId: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        year: importantDates.year,
        month: importantDates.month,
        day: importantDates.day,
      })
      .from(importantDates)
      .innerJoin(contacts, eq(contacts.id, importantDates.contactId))
      .where(and(eq(importantDates.type, "birthday"), isNull(contacts.deletedAt), eq(contacts.isSelf, false), eq(contacts.isDeceased, false)));

    const today = todayIn(user.timeZone);
    return rows
      .map((r) => ({
        contactId: r.contactId,
        name: [r.firstName, r.lastName].filter(Boolean).join(" "),
        ...upcoming({ year: r.year, month: r.month, day: r.day }, today),
      }))
      .filter((b) => b.daysAway <= days)
      .sort((a, b) => a.daysAway - b.daysAway);
  });
}
