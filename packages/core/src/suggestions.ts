import { daysBetween, parseIsoDate } from "./dates";

/**
 * Memory suggestions: find bursts of photos with your people in them (a weekend away, a
 * birthday dinner) that aren't a memory yet. Pure, so it's easy to tune and test.
 */

export interface ClusterPhoto {
  id: string;
  type: string;
  /** Camera-local time, "2025-03-10T08:00:00". */
  localDateTime: string;
  city: string | null;
  country: string | null;
  /** Your people in the photo (contact ids, already mapped from Immich faces). */
  contactIds: string[];
}

export interface ExistingMemory {
  startedOn: string;
  endedOn: string | null;
  assetIds: string[];
}

export interface SuggestionOptions {
  /** A day counts when it has at least this many photos with your people. */
  minPerDay?: number;
  /** A suggestion needs at least this many photos in total. */
  minPhotos?: number;
  /** Days with nothing in between that still count as the same outing. */
  maxGapDays?: number;
  /** Longer runs are someone you see every day, not an event. */
  maxSpanDays?: number;
  /** Suggestion keys the user said no to. */
  dismissed?: Set<string>;
}

export interface MemorySuggestion {
  /** Stable id for dismissing: the date range. */
  key: string;
  startedOn: string;
  endedOn: string;
  kind: "trip" | "event";
  photos: { id: string; type: string; localDateTime: string }[];
  /** People who were clearly there, most photographed first. */
  people: { contactId: string; photos: number }[];
  city: string | null;
  country: string | null;
}

const day = (p: { localDateTime: string }) => p.localDateTime.slice(0, 10);

/** The value at least `share` of the items agree on, if any. */
function mostCommon(values: (string | null)[], share: number): string | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: [string, number] | null = null;
  for (const entry of counts) if (!best || entry[1] > best[1]) best = entry;
  return best && best[1] / values.length >= share ? best[0] : null;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}

export function suggestMemories(photos: ClusterPhoto[], existing: ExistingMemory[], options: SuggestionOptions = {}): MemorySuggestion[] {
  const { minPerDay = 3, minPhotos = 8, maxGapDays = 1, maxSpanDays = 21, dismissed = new Set() } = options;

  const withPeople = photos.filter((p) => p.contactIds.length > 0 && p.localDateTime);
  const byDay = new Map<string, ClusterPhoto[]>();
  for (const p of withPeople) byDay.set(day(p), [...(byDay.get(day(p)) ?? []), p]);

  // Days busy enough to be an occasion, in order, then joined into runs.
  const busyDays = [...byDay.keys()].filter((d) => byDay.get(d)!.length >= minPerDay).sort();
  const runs: string[][] = [];
  for (const d of busyDays) {
    const run = runs.at(-1);
    if (run && daysBetween(parseIsoDate(run.at(-1)!), parseIsoDate(d)) <= maxGapDays + 1) run.push(d);
    else runs.push([d]);
  }

  const attached = new Set(existing.flatMap((m) => m.assetIds));
  const out: MemorySuggestion[] = [];
  for (const run of runs) {
    const startedOn = run[0]!;
    const endedOn = run.at(-1)!;
    const span = daysBetween(parseIsoDate(startedOn), parseIsoDate(endedOn)) + 1;
    if (span > maxSpanDays) continue;
    const key = `${startedOn}_${endedOn}`;
    if (dismissed.has(key)) continue;
    if (existing.some((m) => overlaps(startedOn, endedOn, m.startedOn, m.endedOn ?? m.startedOn))) continue;

    const inRun = run.flatMap((d) => byDay.get(d)!).sort((a, b) => a.localDateTime.localeCompare(b.localDateTime));
    if (inRun.length < minPhotos) continue;
    if (inRun.filter((p) => attached.has(p.id)).length >= inRun.length / 2) continue;

    const counts = new Map<string, number>();
    for (const p of inRun) for (const c of new Set(p.contactIds)) counts.set(c, (counts.get(c) ?? 0) + 1);
    // Someone who shows up once in the background of a 60-photo day wasn't really there.
    const people = [...counts]
      .filter(([, n]) => n >= 2 && n >= inRun.length * 0.15)
      .sort((a, b) => b[1] - a[1])
      .map(([contactId, n]) => ({ contactId, photos: n }));
    if (people.length === 0) continue;

    out.push({
      key,
      startedOn,
      endedOn,
      kind: span >= 2 ? "trip" : "event",
      photos: inRun.map(({ id, type, localDateTime }) => ({ id, type, localDateTime })),
      people,
      city: mostCommon(
        inRun.map((p) => p.city),
        0.4,
      ),
      country: mostCommon(
        inRun.map((p) => p.country),
        0.4,
      ),
    });
  }
  // Biggest first: those are the ones you'd hate to lose.
  return out.sort((a, b) => b.photos.length - a.photos.length || b.startedOn.localeCompare(a.startedOn));
}
