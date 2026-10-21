import { describe, expect, it } from "vitest";
import { contactShade, lifeSpan, yearTicks, type SpanInput } from "./life-timeline";

const base: SpanInput = {
  metYear: null,
  familyBirthYear: null,
  isFamily: false,
  selfBirthYear: 1990,
  firstInteractionYear: null,
  addedYear: 2026,
  lostTouchYear: null,
  deathYear: null,
};

describe("lifeSpan", () => {
  it("uses when you met when it's known", () => {
    expect(lifeSpan({ ...base, metYear: 2014 }, 2026)).toEqual({ start: 2014, end: 2026, startGuessed: false, ended: null });
  });

  it("starts family at the later of their birth and yours", () => {
    expect(lifeSpan({ ...base, isFamily: true, familyBirthYear: 1960 }, 2026).start).toBe(1990);
    expect(lifeSpan({ ...base, isFamily: true, familyBirthYear: 1995 }, 2026).start).toBe(1995);
    expect(lifeSpan({ ...base, isFamily: true }, 2026)).toMatchObject({ start: 1990, startGuessed: true });
  });

  it("falls back to the first catch-up, then when they were added", () => {
    expect(lifeSpan({ ...base, firstInteractionYear: 2019 }, 2026)).toMatchObject({ start: 2019, startGuessed: true });
    expect(lifeSpan(base, 2026).start).toBe(2026);
  });

  it("ends at losing touch or death", () => {
    expect(lifeSpan({ ...base, metYear: 2005, lostTouchYear: 2012 }, 2026)).toMatchObject({ end: 2012, ended: "lost_touch" });
    expect(lifeSpan({ ...base, metYear: 2005, deathYear: 2019, lostTouchYear: 2010 }, 2026)).toMatchObject({ end: 2010, ended: "died" });
  });

  it("never ends before it starts or starts in the future", () => {
    expect(lifeSpan({ ...base, metYear: 2015, lostTouchYear: 2010 }, 2026)).toMatchObject({ start: 2015, end: 2015 });
    expect(lifeSpan({ ...base, metYear: 2030 }, 2026)).toMatchObject({ start: 2026, end: 2026 });
  });
});

describe("yearTicks", () => {
  it("picks a step that fits the span", () => {
    expect(yearTicks(2020, 2026)).toEqual([2020, 2021, 2022, 2023, 2024, 2025, 2026]);
    expect(yearTicks(1990, 2026)).toEqual([1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025]);
    expect(yearTicks(1931, 2026)[0]).toBe(1940);
  });
});

describe("contactShade", () => {
  it("is 0 with no contact and 1 at the busiest year", () => {
    expect(contactShade(0, 10)).toBe(0);
    expect(contactShade(10, 10)).toBe(1);
    expect(contactShade(1, 4)).toBe(0.5);
  });
});
