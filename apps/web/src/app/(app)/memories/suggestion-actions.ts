"use server";

import { addMonths, suggestMemories, todayIn, formatIsoDate, type ClusterPhoto } from "@life-crm/core";
import { ImmichError } from "@life-crm/immich";
import { and, eq, inArray, isNull, schema } from "@life-crm/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fullName } from "@/lib/data/contacts";
import { syncMemoryTimeline } from "@/lib/data/memories";
import { immichFor } from "@/lib/immich";
import { tenantQuery } from "@/lib/session";

const { contactFaces, contacts, dismissedSuggestions, memories, memoryAssets, memoryPeople } = schema;

/** Enough to cover everyone you'd realistically link, without hammering Immich. */
const MAX_FACES = 60;
const PAGE_SIZE = 1000;
const MAX_PAGES_PER_FACE = 3;

export interface SuggestionView {
  key: string;
  title: string;
  kind: "trip" | "event";
  startedOn: string;
  endedOn: string;
  location: string | null;
  people: { id: string; name: string; avatarRef: string | null; photos: number }[];
  photos: { id: string; type: string; localDateTime: string }[];
}

const weekday = new Intl.DateTimeFormat("en-CA", { weekday: "long", timeZone: "UTC" });

function namesPhrase(names: string[]) {
  if (names.length <= 2) return names.join(" and ");
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
}

/** "Negril with Holly", "Saturday with Holly and Marcus", "Away with Priya". */
function titleFor(kind: "trip" | "event", startedOn: string, city: string | null, firstNames: string[]) {
  const who = namesPhrase(firstNames);
  if (city) return `${city} with ${who}`;
  if (kind === "trip") return `Away with ${who}`;
  return `${weekday.format(new Date(`${startedOn}T12:00:00Z`))} with ${who}`;
}

/**
 * Scan Immich for bursts of photos with your linked people and suggest the ones that
 * aren't memories yet. Runs on demand: one Immich search per linked face.
 */
export async function findSuggestions(months: number): Promise<{ suggestions: SuggestionView[]; scanned: { faces: number; photos: number }; error?: string }> {
  const span = [6, 12, 36].includes(months) ? months : 12;
  return tenantQuery(async (tx, user) => {
    const empty = { suggestions: [], scanned: { faces: 0, photos: 0 } };
    const immich = await immichFor(tx, user.id);
    if (!immich) return { ...empty, error: "Connect Immich in Settings first" };

    const faces = await tx
      .select({ personId: contactFaces.personId, contactId: contactFaces.contactId })
      .from(contactFaces)
      .innerJoin(contacts, eq(contacts.id, contactFaces.contactId))
      .where(isNull(contacts.deletedAt))
      .orderBy(contactFaces.linkedAt)
      .limit(MAX_FACES);
    if (faces.length === 0) return { ...empty, error: "Link your people to their Immich faces first" };

    const today = todayIn(user.timeZone);
    const to = formatIsoDate(today);
    const from = formatIsoDate(addMonths(today, -span));

    // One search per face, merged into one photo list with everyone found in each photo.
    const photos = new Map<string, ClusterPhoto>();
    try {
      for (let i = 0; i < faces.length; i += 5) {
        await Promise.all(
          faces.slice(i, i + 5).map(async (f) => {
            for (let page = 1; page <= MAX_PAGES_PER_FACE; page++) {
              const res = await immich.takenBetween(from, to, { page, size: PAGE_SIZE, personIds: [f.personId] });
              for (const a of res.assets) {
                if (!a.localDateTime) continue;
                const p = photos.get(a.id) ?? { id: a.id, type: a.type, localDateTime: a.localDateTime, city: a.city, country: a.country, contactIds: [] };
                if (!p.contactIds.includes(f.contactId)) p.contactIds.push(f.contactId);
                photos.set(a.id, p);
              }
              if (!res.nextPage) break;
            }
          }),
        );
      }
    } catch (err) {
      return { ...empty, error: err instanceof ImmichError ? err.message : "Couldn't search Immich" };
    }

    const existing = await tx.select({ id: memories.id, startedOn: memories.startedOn, endedOn: memories.endedOn }).from(memories);
    const assetRows = existing.length
      ? await tx.select({ memoryId: memoryAssets.memoryId, assetId: memoryAssets.assetId }).from(memoryAssets)
      : [];
    const dismissed = await tx.select({ key: dismissedSuggestions.key }).from(dismissedSuggestions);

    const found = suggestMemories(
      [...photos.values()],
      existing.map((m) => ({ ...m, assetIds: assetRows.filter((a) => a.memoryId === m.id).map((a) => a.assetId) })),
      { dismissed: new Set(dismissed.map((d) => d.key)) },
    ).slice(0, 30);

    const ids = [...new Set(found.flatMap((s) => s.people.map((p) => p.contactId)))];
    const people = ids.length
      ? await tx
          .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, avatarRef: contacts.avatarRef })
          .from(contacts)
          .where(inArray(contacts.id, ids))
      : [];
    const byId = new Map(people.map((p) => [p.id, p]));

    const suggestions = found.map((s) => {
      const who = s.people.flatMap((p) => {
        const c = byId.get(p.contactId);
        return c ? [{ id: c.id, name: fullName(c), firstName: c.firstName, avatarRef: c.avatarRef, photos: p.photos }] : [];
      });
      return {
        key: s.key,
        title: titleFor(
          s.kind,
          s.startedOn,
          s.city,
          who.map((w) => w.firstName),
        ),
        kind: s.kind,
        startedOn: s.startedOn,
        endedOn: s.endedOn,
        location: [s.city, s.country].filter(Boolean).join(", ") || null,
        people: who.map(({ id, name, avatarRef, photos: count }) => ({ id, name, avatarRef, photos: count })),
        photos: s.photos,
      };
    });
    return { suggestions, scanned: { faces: faces.length, photos: photos.size } };
  });
}

const keySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/);

export async function dismissSuggestion(key: string) {
  const parsed = keySchema.safeParse(key);
  if (!parsed.success) return;
  await tenantQuery((tx, user) => tx.insert(dismissedSuggestions).values({ tenantId: user.tenantId, key: parsed.data }).onConflictDoNothing());
}

const acceptSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    kind: z.enum(["trip", "event"]),
    startedOn: z.iso.date(),
    endedOn: z.iso.date(),
    location: z.string().trim().max(200).nullable(),
    people: z.array(z.uuid()).min(1).max(200),
    photos: z
      .array(
        z.object({
          id: z.uuid(),
          type: z.enum(["IMAGE", "VIDEO", "AUDIO", "OTHER"]),
          localDateTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
        }),
      )
      .min(1)
      .max(2000),
  })
  .refine((s) => s.endedOn >= s.startedOn);

/** Turn a suggestion into a memory with its people and photos, then open it to edit. */
export async function acceptSuggestion(input: {
  title: string;
  kind: "trip" | "event";
  startedOn: string;
  endedOn: string;
  location: string | null;
  people: string[];
  photos: { id: string; type: string; localDateTime: string }[];
}): Promise<{ error?: string }> {
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) return { error: "That suggestion is out of date. Refresh and try again." };
  const { people, photos, ...s } = parsed.data;

  const id = await tenantQuery(async (tx, user) => {
    const valid = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(inArray(contacts.id, people), isNull(contacts.deletedAt)));
    if (valid.length === 0) return null;
    const [memory] = await tx
      .insert(memories)
      .values({
        tenantId: user.tenantId,
        title: s.title,
        kind: s.kind,
        startedOn: s.startedOn,
        endedOn: s.endedOn === s.startedOn ? null : s.endedOn,
        location: s.location,
      })
      .returning({ id: memories.id });
    await tx.insert(memoryPeople).values(valid.map((v) => ({ tenantId: user.tenantId, memoryId: memory!.id, contactId: v.id })));
    await tx
      .insert(memoryAssets)
      .values(photos.map((p) => ({ tenantId: user.tenantId, memoryId: memory!.id, assetId: p.id, type: p.type, takenAt: new Date(`${p.localDateTime}Z`) })))
      .onConflictDoNothing();
    await syncMemoryTimeline(tx, memory!.id);
    for (const v of valid) revalidatePath(`/people/${v.id}`);
    return memory!.id;
  });
  if (!id) return { error: "Those people no longer exist" };
  revalidatePath("/memories");
  redirect(`/memories/${id}`);
}
