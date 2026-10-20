"use server";

import { memoryKinds } from "@life-crm/core";
import { ImmichError, type ImmichAsset } from "@life-crm/immich";
import { and, eq, inArray, isNull, schema } from "@life-crm/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { syncMemoryTimeline } from "@/lib/data/memories";
import { immichFor } from "@/lib/immich";
import { tenantQuery } from "@/lib/session";

export interface MemoryFormState {
  error?: string;
  ok?: number;
}

const { contactFaces, contacts, memories, memoryAssets, memoryPeople, timelineEntries } = schema;
const uuid = z.uuid();

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const memorySchema = z
  .object({
    title: z.string().trim().min(1, "Give it a name, e.g. Jamaica with Holly").max(120),
    kind: z.enum(memoryKinds),
    reason: optional(200),
    startedOn: z.iso.date("Add when it started"),
    endedOn: z.union([z.iso.date(), z.literal("").transform(() => null)]),
    location: optional(200),
    story: optional(10_000),
    people: z.array(z.uuid()).max(200),
  })
  .refine((m) => !m.endedOn || m.endedOn >= m.startedOn, { message: "The end date is before the start", path: ["endedOn"] });

function revalidateMemory(id: string, contactIds: string[]) {
  revalidatePath("/memories");
  revalidatePath(`/memories/${id}`);
  for (const c of contactIds) revalidatePath(`/people/${c}`);
}

/** Create a memory, or update one when `memoryId` is set. */
export async function saveMemory(memoryId: string | null, _prev: MemoryFormState, form: FormData): Promise<MemoryFormState> {
  if (memoryId && !uuid.safeParse(memoryId).success) return { error: "Memory not found" };
  const parsed = memorySchema.safeParse({
    title: form.get("title"),
    kind: form.get("kind") || "other",
    reason: form.get("reason") ?? "",
    startedOn: form.get("startedOn"),
    endedOn: form.get("endedOn") ?? "",
    location: form.get("location") ?? "",
    story: form.get("story") ?? "",
    people: [...new Set(form.getAll("people").map(String))],
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { people, ...fields } = parsed.data;

  const result = await tenantQuery(async (tx, user) => {
    const valid = people.length
      ? await tx
          .select({ id: contacts.id })
          .from(contacts)
          .where(and(inArray(contacts.id, people), isNull(contacts.deletedAt)))
      : [];
    if (valid.length !== people.length) return { error: "Someone in that list no longer exists" };

    let id = memoryId;
    let before: string[] = [];
    if (id) {
      const updated = await tx.update(memories).set(fields).where(eq(memories.id, id)).returning({ id: memories.id });
      if (updated.length === 0) return { error: "Memory not found" };
      before = (await tx.select({ id: memoryPeople.contactId }).from(memoryPeople).where(eq(memoryPeople.memoryId, id))).map((r) => r.id);
      await tx.delete(memoryPeople).where(eq(memoryPeople.memoryId, id));
    } else {
      const [row] = await tx
        .insert(memories)
        .values({ tenantId: user.tenantId, ...fields })
        .returning({ id: memories.id });
      id = row!.id;
    }
    if (people.length) await tx.insert(memoryPeople).values(people.map((contactId) => ({ tenantId: user.tenantId, memoryId: id!, contactId })));
    await syncMemoryTimeline(tx, id);
    return { id, touched: [...new Set([...before, ...people])] };
  });
  if ("error" in result) return { error: result.error };

  revalidateMemory(result.id, result.touched);
  if (!memoryId) redirect(`/memories/${result.id}`);
  return { ok: Date.now() };
}

export async function deleteMemory(memoryId: string) {
  if (!uuid.safeParse(memoryId).success) return;
  const touched = await tenantQuery(async (tx) => {
    const people = await tx.select({ id: memoryPeople.contactId }).from(memoryPeople).where(eq(memoryPeople.memoryId, memoryId));
    await tx.delete(timelineEntries).where(and(eq(timelineEntries.kind, "memory"), eq(timelineEntries.refId, memoryId)));
    await tx.delete(memories).where(eq(memories.id, memoryId));
    return people.map((p) => p.id);
  });
  revalidateMemory(memoryId, touched);
  redirect("/memories");
}

export interface PhotoResult {
  assets: Pick<ImmichAsset, "id" | "type" | "localDateTime" | "city" | "country">[];
  nextPage: number | null;
  /** First names of tagged people linked to an Immich face. */
  taggedWithFaces: string[];
  error?: string;
}

/**
 * Photos to choose from: everything taken during the memory's dates, or Immich smart
 * search results when there's a query ("beach", "Holly at dinner").
 */
export async function findPhotos(memoryId: string, query: string, page = 1, onlyTagged = false): Promise<PhotoResult> {
  if (!uuid.safeParse(memoryId).success) return { assets: [], nextPage: null, taggedWithFaces: [], error: "Memory not found" };
  const q = query.trim().slice(0, 200);
  return tenantQuery(async (tx, user) => {
    const immich = await immichFor(tx, user.id);
    if (!immich) return { assets: [], nextPage: null, taggedWithFaces: [], error: "Connect Immich in Settings first" };
    const [memory] = await tx
      .select({ startedOn: memories.startedOn, endedOn: memories.endedOn })
      .from(memories)
      .where(eq(memories.id, memoryId));
    if (!memory) return { assets: [], nextPage: null, taggedWithFaces: [], error: "Memory not found" };

    // Tagged people who have Immich faces, so the picker can narrow to photos with them.
    const tagged = await tx
      .select({ firstName: contacts.firstName, personId: contactFaces.personId })
      .from(memoryPeople)
      .innerJoin(contacts, eq(contacts.id, memoryPeople.contactId))
      .innerJoin(contactFaces, eq(contactFaces.contactId, memoryPeople.contactId))
      .where(eq(memoryPeople.memoryId, memoryId));
    const taggedWithFaces = [...new Set(tagged.map((t) => t.firstName))];

    const from = memory.startedOn;
    const to = memory.endedOn ?? memory.startedOn;
    try {
      let result;
      if (q) result = await immich.smartSearch(q, { page, size: 60 });
      else if (onlyTagged && tagged.length) {
        // Several person ids mean "all of them" to Immich, so search each face and merge.
        const pages = await Promise.all(tagged.map((t) => immich.takenBetween(from, to, { page, size: 200, personIds: [t.personId] })));
        const seen = new Set<string>();
        result = {
          assets: pages
            .flatMap((p) => p.assets)
            .filter((a) => !seen.has(a.id) && seen.add(a.id))
            .sort((a, b) => (a.localDateTime ?? "").localeCompare(b.localDateTime ?? "")),
          nextPage: pages.some((p) => p.nextPage) ? page + 1 : null,
        };
      } else result = await immich.takenBetween(from, to, { page, size: 200 });
      return {
        assets: result.assets.map(({ id, type, localDateTime, city, country }) => ({ id, type, localDateTime, city, country })),
        nextPage: result.nextPage,
        taggedWithFaces,
      };
    } catch (err) {
      const message = err instanceof ImmichError ? err.message : "Couldn't search Immich";
      return {
        assets: [],
        nextPage: null,
        taggedWithFaces,
        error: q && err instanceof ImmichError && err.status != null ? `${message}. Smart search needs machine learning turned on in Immich.` : message,
      };
    }
  });
}

const attachSchema = z
  .array(
    z.object({
      id: z.uuid(),
      type: z.enum(["IMAGE", "VIDEO", "AUDIO", "OTHER"]),
      localDateTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/).nullable(),
    }),
  )
  .min(1)
  .max(500);

export async function attachPhotos(memoryId: string, picked: { id: string; type: string; localDateTime: string | null }[]): Promise<{ error?: string }> {
  if (!uuid.safeParse(memoryId).success) return { error: "Memory not found" };
  const parsed = attachSchema.safeParse(picked);
  if (!parsed.success) return { error: "Pick at least one photo" };
  const people = await tenantQuery(async (tx, user) => {
    const [memory] = await tx.select({ id: memories.id }).from(memories).where(eq(memories.id, memoryId));
    if (!memory) return null;
    await tx
      .insert(memoryAssets)
      .values(
        parsed.data.map((a) => ({
          tenantId: user.tenantId,
          memoryId,
          assetId: a.id,
          type: a.type,
          takenAt: a.localDateTime ? new Date(`${a.localDateTime}Z`) : null,
        })),
      )
      .onConflictDoNothing();
    await syncMemoryTimeline(tx, memoryId);
    return (await tx.select({ id: memoryPeople.contactId }).from(memoryPeople).where(eq(memoryPeople.memoryId, memoryId))).map((p) => p.id);
  });
  if (!people) return { error: "Memory not found" };
  revalidateMemory(memoryId, people);
  return {};
}

export async function detachPhoto(memoryId: string, assetId: string) {
  if (!uuid.safeParse(memoryId).success) return;
  const people = await tenantQuery(async (tx) => {
    await tx.delete(memoryAssets).where(and(eq(memoryAssets.memoryId, memoryId), eq(memoryAssets.assetId, assetId)));
    await tx.update(memories).set({ coverAssetId: null }).where(and(eq(memories.id, memoryId), eq(memories.coverAssetId, assetId)));
    await syncMemoryTimeline(tx, memoryId);
    return (await tx.select({ id: memoryPeople.contactId }).from(memoryPeople).where(eq(memoryPeople.memoryId, memoryId))).map((p) => p.id);
  });
  revalidateMemory(memoryId, people);
}

export async function setCover(memoryId: string, assetId: string) {
  if (!uuid.safeParse(memoryId).success) return;
  const people = await tenantQuery(async (tx) => {
    const [attached] = await tx
      .select({ id: memoryAssets.assetId })
      .from(memoryAssets)
      .where(and(eq(memoryAssets.memoryId, memoryId), eq(memoryAssets.assetId, assetId)));
    if (!attached) return [];
    await tx.update(memories).set({ coverAssetId: assetId }).where(eq(memories.id, memoryId));
    await syncMemoryTimeline(tx, memoryId);
    return (await tx.select({ id: memoryPeople.contactId }).from(memoryPeople).where(eq(memoryPeople.memoryId, memoryId))).map((p) => p.id);
  });
  revalidateMemory(memoryId, people);
}
