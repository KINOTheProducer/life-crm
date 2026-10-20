import "server-only";
import { and, asc, desc, eq, inArray, isNull, schema, sql, type Tx } from "@life-crm/db";
import { fullName } from "./contacts";
import { dateToInstant, parseIsoDate } from "./dates";
import { recordTimeline } from "./timeline";

const { contacts, memories, memoryAssets, memoryPeople, timelineEntries } = schema;

export type Memory = typeof memories.$inferSelect;

async function peopleFor(tx: Tx, memoryIds: string[]) {
  if (memoryIds.length === 0) return new Map<string, { id: string; name: string; avatarRef: string | null }[]>();
  const rows = await tx
    .select({
      memoryId: memoryPeople.memoryId,
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      avatarRef: contacts.avatarRef,
    })
    .from(memoryPeople)
    .innerJoin(contacts, eq(contacts.id, memoryPeople.contactId))
    .where(and(inArray(memoryPeople.memoryId, memoryIds), isNull(contacts.deletedAt)))
    .orderBy(asc(contacts.firstName));
  const out = new Map<string, { id: string; name: string; avatarRef: string | null }[]>();
  for (const r of rows) out.set(r.memoryId, [...(out.get(r.memoryId) ?? []), { id: r.id, name: fullName(r), avatarRef: r.avatarRef }]);
  return out;
}

/** Memories newest first, optionally only those with one person. */
export async function listMemories(tx: Tx, options: { contactId?: string; limit?: number } = {}) {
  const base = tx
    .select({
      memory: memories,
      photoCount: sql<number>`(select count(*)::int from ${memoryAssets} where ${memoryAssets.memoryId} = ${memories.id})`,
      firstAsset: sql<string | null>`(select ${memoryAssets.assetId} from ${memoryAssets} where ${memoryAssets.memoryId} = ${memories.id} order by ${memoryAssets.takenAt} asc nulls last limit 1)`,
    })
    .from(memories);
  const rows = await (options.contactId
    ? base.innerJoin(memoryPeople, and(eq(memoryPeople.memoryId, memories.id), eq(memoryPeople.contactId, options.contactId)))
    : base
  )
    .orderBy(desc(memories.startedOn), desc(memories.createdAt))
    .limit(options.limit ?? 200);

  const people = await peopleFor(
    tx,
    rows.map((r) => r.memory.id),
  );
  return rows.map((r) => ({
    ...r.memory,
    cover: r.memory.coverAssetId ?? r.firstAsset,
    photoCount: r.photoCount,
    people: people.get(r.memory.id) ?? [],
  }));
}

export type MemorySummary = Awaited<ReturnType<typeof listMemories>>[number];

export async function getMemory(tx: Tx, id: string) {
  const [memory] = await tx.select().from(memories).where(eq(memories.id, id));
  if (!memory) return null;
  const people = (await peopleFor(tx, [id])).get(id) ?? [];
  const assets = await tx
    .select({ assetId: memoryAssets.assetId, type: memoryAssets.type, takenAt: memoryAssets.takenAt })
    .from(memoryAssets)
    .where(eq(memoryAssets.memoryId, id))
    .orderBy(sql`${memoryAssets.takenAt} asc nulls last`, asc(memoryAssets.addedAt));
  return { memory, people, assets, cover: memory.coverAssetId ?? assets[0]?.assetId ?? null };
}

/**
 * Rewrite the memory's entries on each person's timeline. Called after anything that
 * changes what the entry shows: details, people or photos.
 */
export async function syncMemoryTimeline(tx: Tx, memoryId: string) {
  await tx.delete(timelineEntries).where(and(eq(timelineEntries.kind, "memory"), eq(timelineEntries.refId, memoryId)));
  const found = await getMemory(tx, memoryId);
  if (!found || found.people.length === 0) return;
  const { memory, people, assets, cover } = found;
  const photos = [cover, ...assets.map((a) => a.assetId).filter((a) => a !== cover)].filter(Boolean).slice(0, 4);
  await recordTimeline(
    tx,
    people.map((p) => ({
      tenantId: memory.tenantId,
      contactId: p.id,
      kind: "memory" as const,
      occurredAt: dateToInstant(parseIsoDate(memory.startedOn)),
      title: memory.title,
      body: memory.reason,
      refId: memory.id,
      data: { location: memory.location, photos, photoCount: assets.length, with: people.map((o) => o.id).filter((id) => id !== p.id) },
    })),
  );
}
