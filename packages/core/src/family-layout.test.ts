import { describe, expect, it } from "vitest";
import { layoutHourglass } from "./family-layout";
import { indexFamilies, type Family } from "./kinship";

const fam = (id: string, partners: string[], children: string[]): Family => ({
  id,
  partners,
  status: "married",
  children: children.map((c) => ({ id: c, kind: "biological" as const })),
});

const index = indexFamilies([
  fam("gp-m", ["gma", "gpa"], ["mom", "aunt"]),
  fam("gp-d", ["nana", "papa"], ["dad"]),
  fam("parents", ["mom", "dad"], ["me", "sis", "bro"]),
  fam("me", ["me", "holly"], ["kid1", "kid2"]),
  fam("kid1", ["kid1", "sam"], ["grandkid"]),
  fam("sis", ["sis", "tom"], ["niece"]),
]);

const birth: Record<string, number> = { sis: 1, me: 2, bro: 3 };
const layout = layoutHourglass(index, "me", { order: (a, b) => (birth[a] ?? 0) - (birth[b] ?? 0) });
const at = (id: string) => layout.nodes.find((n) => n.id === id);

describe("layoutHourglass", () => {
  it("puts ancestors above, siblings and partners beside, descendants below", () => {
    expect(at("me")!.gen).toBe(0);
    expect(at("holly")!.gen).toBe(0);
    expect(at("sis")!.gen).toBe(0);
    expect(at("tom")!.gen).toBe(0);
    expect(at("mom")!.gen).toBe(-1);
    expect(at("gma")!.gen).toBe(-2);
    expect(at("grandkid")!.gen).toBe(2);
    // Not shown: siblings' children and collateral relatives.
    expect(at("niece")).toBeUndefined();
    expect(at("aunt")).toBeUndefined();
  });

  it("keeps siblings in birth order with partners next to them", () => {
    expect(at("sis")!.x).toBeLessThan(at("me")!.x);
    expect(at("tom")!.x).toBe(at("sis")!.x + 1);
    expect(at("holly")!.x).toBe(at("me")!.x + 1);
    expect(at("bro")!.x).toBeGreaterThan(at("holly")!.x);
  });

  it("never overlaps cards in a row", () => {
    const byGen = new Map<number, number[]>();
    for (const n of layout.nodes) byGen.set(n.gen, [...(byGen.get(n.gen) ?? []), n.x]);
    for (const xs of byGen.values()) {
      xs.sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(1);
    }
    expect(Math.min(...layout.nodes.map((n) => n.x))).toBe(0.5);
  });

  it("draws couples and lines from parents to children", () => {
    expect(layout.couples).toContainEqual({ gen: 0, x1: at("me")!.x, x2: at("holly")!.x });
    const fromParents = layout.descents.find((d) => d.gen === -1);
    expect(fromParents!.childXs).toEqual([at("sis")!.x, at("me")!.x, at("bro")!.x]);
    expect(fromParents!.fromX).toBe((at("mom")!.x + at("dad")!.x) / 2);
  });

  it("respects depth limits", () => {
    const small = layoutHourglass(index, "me", { up: 1, down: 1 });
    expect(small.minGen).toBe(-1);
    expect(small.maxGen).toBe(1);
  });
});
