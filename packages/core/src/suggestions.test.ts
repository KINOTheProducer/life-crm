import { describe, expect, it } from "vitest";
import { suggestMemories, type ClusterPhoto } from "./suggestions";

let n = 0;
function photos(date: string, count: number, contactIds: string[], place: { city?: string; country?: string } = {}): ClusterPhoto[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `a${n++}`,
    type: "IMAGE",
    localDateTime: `${date}T${String(10 + (i % 10)).padStart(2, "0")}:00:00`,
    city: place.city ?? null,
    country: place.country ?? null,
    contactIds,
  }));
}

const jamaica = { city: "Negril", country: "Jamaica" };

describe("suggestMemories", () => {
  it("turns a few busy days in a row into a trip with who was there and where", () => {
    const all = [
      ...photos("2025-03-10", 6, ["holly"], jamaica),
      ...photos("2025-03-11", 5, ["holly", "marcus"], jamaica),
      // A quiet day in the middle doesn't split it.
      ...photos("2025-03-13", 4, ["holly"], jamaica),
    ];
    const [s, ...rest] = suggestMemories(all, []);
    expect(rest).toEqual([]);
    expect(s).toMatchObject({
      key: "2025-03-10_2025-03-13",
      startedOn: "2025-03-10",
      endedOn: "2025-03-13",
      kind: "trip",
      city: "Negril",
      country: "Jamaica",
      people: [
        { contactId: "holly", photos: 15 },
        { contactId: "marcus", photos: 5 },
      ],
    });
    expect(s!.photos).toHaveLength(15);
    expect(s!.photos[0]!.localDateTime < s!.photos.at(-1)!.localDateTime).toBe(true);
  });

  it("makes a single busy day an event, and splits on longer gaps", () => {
    const all = [...photos("2025-05-01", 9, ["priya"]), ...photos("2025-05-04", 8, ["priya"])];
    const out = suggestMemories(all, []);
    expect(out.map((s) => [s.key, s.kind])).toEqual([
      ["2025-05-01_2025-05-01", "event"],
      ["2025-05-04_2025-05-04", "event"],
    ]);
  });

  it("ignores light days, small bursts and photos without your people", () => {
    const all = [...photos("2025-06-01", 2, ["holly"]), ...photos("2025-06-02", 5, ["holly"]), ...photos("2025-06-03", 40, [])];
    expect(suggestMemories(all, [])).toEqual([]);
  });

  it("leaves out someone who only shows up once in the background", () => {
    const all = [...photos("2025-07-01", 20, ["holly"]), ...photos("2025-07-01", 1, ["holly", "stranger"])];
    expect(suggestMemories(all, [])[0]!.people.map((p) => p.contactId)).toEqual(["holly"]);
  });

  it("skips runs that are already a memory, dismissed, or too long to be one occasion", () => {
    const trip = photos("2025-03-10", 10, ["holly"]);
    expect(suggestMemories(trip, [{ startedOn: "2025-03-09", endedOn: "2025-03-12", assetIds: [] }])).toEqual([]);
    expect(suggestMemories(trip, [], { dismissed: new Set(["2025-03-10_2025-03-10"]) })).toEqual([]);

    const everyday = Array.from({ length: 30 }, (_, i) => photos(`2025-08-${String(i + 1).padStart(2, "0")}`, 3, ["holly"])).flat();
    expect(suggestMemories(everyday, [])).toEqual([]);
  });

  it("skips runs whose photos are mostly in a memory already", () => {
    const day = photos("2025-09-01", 10, ["holly"]);
    expect(suggestMemories(day, [{ startedOn: "2024-01-01", endedOn: null, assetIds: day.slice(0, 6).map((p) => p.id) }])).toEqual([]);
  });

  it("only names a place when most photos agree", () => {
    const all = [...photos("2025-10-01", 5, ["holly"], { city: "Toronto" }), ...photos("2025-10-01", 5, ["holly"], { city: "Hamilton" }), ...photos("2025-10-01", 5, ["holly"])];
    expect(suggestMemories(all, [])[0]!.city).toBeNull();
  });
});
