import { describe, expect, it } from "vitest";
import { contactShade, lifeSpan, periodsProblem, yearTicks, type Period, type SpanInput } from "./life-timeline";

const base: SpanInput = {
  periods: [],
  familyBirthYear: null,
  isFamily: false,
  selfBirthYear: 1990,
  firstInteractionYear: null,
  addedYear: 2026,
  deathYear: null,
};

const period = (startYear: number | null, endYear: number | null = null, startMonth: number | null = null, endMonth: number | null = null): Period => ({
  startYear,
  startMonth,
  endYear,
  endMonth,
});

describe("lifeSpan", () => {
  it("uses when you met when it's known", () => {
    expect(lifeSpan({ ...base, periods: [period(2014)] }, 2026)).toEqual({ start: 2014, end: 2026, startGuessed: false, ended: null, gaps: [] });
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
    expect(lifeSpan({ ...base, periods: [period(2005, 2012)] }, 2026)).toMatchObject({ end: 2012, ended: "lost_touch" });
    expect(lifeSpan({ ...base, periods: [period(2005, 2010)], deathYear: 2019 }, 2026)).toMatchObject({ end: 2010, ended: "died" });
  });

  it("leaves gaps between periods, in any order", () => {
    const span = lifeSpan({ ...base, periods: [period(2020), period(2005, 2012), period(2014, 2016)] }, 2026);
    expect(span).toMatchObject({ start: 2005, end: 2026, ended: null, gaps: [{ from: 2012, to: 2014 }, { from: 2016, to: 2020 }] });
    // Back the next year: no visible gap.
    expect(lifeSpan({ ...base, periods: [period(2005, 2012), period(2013)] }, 2026).gaps).toEqual([]);
  });

  it("guesses a start no later than losing touch when you never said when you met", () => {
    expect(lifeSpan({ ...base, periods: [period(null, 2012)] }, 2026)).toMatchObject({ start: 2012, startGuessed: true, end: 2012 });
  });

  it("never starts in the future", () => {
    expect(lifeSpan({ ...base, periods: [period(2030)] }, 2026)).toMatchObject({ start: 2026, end: 2026 });
  });
});

describe("periodsProblem", () => {
  const now = { year: 2026, month: 10 };
  it("accepts one open period, or closed ones followed by an open one", () => {
    expect(periodsProblem([period(2014)], now)).toBeNull();
    expect(periodsProblem([period(2020), period(2005, 2012, 3, 6)], now)).toBeNull();
    // Same year with no months to tell them apart is fine.
    expect(periodsProblem([period(2005, 2012), period(2012)], now)).toBeNull();
  });

  it("needs a start, an end after it, and nothing in the future", () => {
    expect(periodsProblem([period(null)], now)).toEqual({ index: 0, message: "Add when it started" });
    expect(periodsProblem([period(2012, 2010)], now)?.message).toBe("Ends before it starts");
    expect(periodsProblem([period(2012, 2012, 6, 3)], now)?.message).toBe("Ends before it starts");
    expect(periodsProblem([period(2026, null, 11)], now)?.message).toBe("That start hasn't happened yet");
    expect(periodsProblem([period(2020, 2027)], now)?.message).toBe("That end hasn't happened yet");
  });

  it("rejects overlaps and more than one open period", () => {
    expect(periodsProblem([period(2005, 2012), period(2010)], now)).toEqual({ index: 1, message: "Overlaps with 2005 to 2012" });
    expect(periodsProblem([period(2005, 2012, null, 6), period(2012, null, 3)], now)?.index).toBe(1);
    expect(periodsProblem([period(2005), period(2020)], now)).toEqual({ index: 0, message: "Only the latest period can go on to now. Add when this one ended" });
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
