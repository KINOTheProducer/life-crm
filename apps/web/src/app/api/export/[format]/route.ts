import { serializeGedcom } from "@life-crm/core";
import { serializeVcard, toCsv } from "@life-crm/dav";
import { and, eq, isNull, schema, withTenant, type Tx } from "@life-crm/db";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { cardsFor } from "@/lib/data/cards";
import { familyAsGedcom } from "@/lib/data/gedcom";
import { cardListRows } from "@/lib/data/households";
import { APP_NAME } from "@/lib/brand";
import { db } from "@/lib/db";

const { contacts } = schema;

/**
 * Tables in a full export. Secrets (Immich and AI keys, push endpoints, auth) and raw
 * audio are left out; everything else you entered comes with you.
 */
const tables = {
  contacts: schema.contacts,
  contactPeriods: schema.contactPeriods,
  contactMethods: schema.contactMethods,
  addresses: schema.addresses,
  importantDates: schema.importantDates,
  facts: schema.facts,
  notes: schema.notes,
  interactions: schema.interactions,
  interactionPeople: schema.interactionPeople,
  timelineEntries: schema.timelineEntries,
  reminders: schema.reminders,
  partnerships: schema.partnerships,
  partnershipMilestones: schema.partnershipMilestones,
  dateNights: schema.dateNights,
  families: schema.families,
  familyChildren: schema.familyChildren,
  connections: schema.connections,
  memories: schema.memories,
  memoryPeople: schema.memoryPeople,
  memoryAssets: schema.memoryAssets,
  contactFaces: schema.contactFaces,
  gifts: schema.gifts,
  lifeEvents: schema.lifeEvents,
  tasks: schema.tasks,
  debts: schema.debts,
  circles: schema.circles,
  households: schema.households,
  circleMembers: schema.circleMembers,
  eras: schema.eras,
} as const;

async function liveIds(tx: Tx) {
  const rows = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(isNull(contacts.deletedAt), eq(contacts.isSelf, false)));
  return rows.map((r) => r.id);
}

export async function GET(request: NextRequest, { params }: RouteContext<"/api/export/[format]">) {
  const session = await auth.api.getSession({ headers: request.headers });
  const tenantId = session?.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { format } = await params;
  const stamp = new Date().toISOString().slice(0, 10);
  const download = (body: string, type: string, name: string) =>
    new Response(body, {
      headers: {
        "content-type": `${type}; charset=utf-8`,
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
      },
    });

  if (format === "vcf") {
    const body = await withTenant(db, tenantId, async (tx) => {
      const cards = await cardsFor(tx, await liveIds(tx));
      return [...cards.values()].map(serializeVcard).join("");
    });
    return download(body, "text/vcard", `people-${stamp}.vcf`);
  }

  if (format === "csv") {
    const body = await withTenant(db, tenantId, async (tx) => {
      const cards = [...(await cardsFor(tx, await liveIds(tx))).values()].sort((a, b) => a.firstName.localeCompare(b.firstName));
      const rows = cards.map((c) => [
        c.firstName,
        c.lastName,
        c.nickname,
        c.birthday ? `${c.birthday.year ?? "-"}-${String(c.birthday.month).padStart(2, "0")}-${String(c.birthday.day).padStart(2, "0")}` : "",
        c.phones.map((p) => p.value).join(" ::: "),
        c.emails.map((e) => e.value).join(" ::: "),
        c.addresses[0]?.street,
        c.addresses[0]?.city,
        c.addresses[0]?.region,
        c.addresses[0]?.postalCode,
        c.addresses[0]?.country,
        c.company,
        c.jobTitle,
      ]);
      return toCsv([
        ["First Name", "Last Name", "Nickname", "Birthday", "Phone", "E-mail", "Street", "City", "Region", "Postal Code", "Country", "Company", "Title"],
        ...rows,
      ]);
    });
    return download(body, "text/csv", `people-${stamp}.csv`);
  }

  if (format === "holiday-cards") {
    const body = await withTenant(db, tenantId, async (tx) =>
      toCsv([["Name", "Street", "Apt or unit", "City", "Province or state", "Postal code", "Country", "People"], ...(await cardListRows(tx))]),
    );
    return download(body, "text/csv", `holiday-cards-${stamp}.csv`);
  }

  if (format === "ged") {
    const user = session!.user;
    const body = await withTenant(db, tenantId, async (tx) =>
      serializeGedcom(await familyAsGedcom(tx, { tenantId, name: user.name }), { source: APP_NAME }),
    );
    return download(body, "text/x-gedcom", `family-tree-${stamp}.ged`);
  }

  if (format === "json") {
    const body = await withTenant(db, tenantId, async (tx) => {
      const out: Record<string, unknown> = {
        exportedAt: new Date().toISOString(),
        format: "life-crm-export",
        version: 1,
      };
      for (const [name, table] of Object.entries(tables)) out[name] = await tx.select().from(table);
      // Voice note transcripts, without the audio.
      out.captures = await tx
        .select({ id: schema.captures.id, kind: schema.captures.kind, transcript: schema.captures.transcript, extraction: schema.captures.extraction, createdAt: schema.captures.createdAt })
        .from(schema.captures);
      return JSON.stringify(out, null, 2);
    });
    return download(body, "application/json", `life-crm-${stamp}.json`);
  }

  return NextResponse.json({ error: "Unknown format" }, { status: 404 });
}
