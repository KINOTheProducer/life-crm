import { describe, expect, it } from "vitest";
import { addDays, ageOn, birthdayInText, daysBetween, isValidPartialDate, nextOccurrence, todayIn, upcoming } from "./dates";

describe("nextOccurrence", () => {
  it("returns this year when still ahead", () => {
    expect(nextOccurrence({ month: 12, day: 25 }, { year: 2026, month: 10, day: 19 })).toEqual({
      year: 2026,
      month: 12,
      day: 25,
    });
  });

  it("returns today when the date is today", () => {
    expect(nextOccurrence({ month: 10, day: 19 }, { year: 2026, month: 10, day: 19 })).toEqual({
      year: 2026,
      month: 10,
      day: 19,
    });
  });

  it("rolls to next year when passed", () => {
    expect(nextOccurrence({ month: 1, day: 5 }, { year: 2026, month: 10, day: 19 })).toEqual({
      year: 2027,
      month: 1,
      day: 5,
    });
  });

  it("observes Feb 29 on Feb 28 by default in non-leap years", () => {
    expect(nextOccurrence({ month: 2, day: 29 }, { year: 2026, month: 1, day: 1 })).toEqual({
      year: 2026,
      month: 2,
      day: 28,
    });
  });

  it("observes Feb 29 on Mar 1 when configured", () => {
    expect(nextOccurrence({ month: 2, day: 29 }, { year: 2027, month: 2, day: 28 }, "mar1")).toEqual({
      year: 2027,
      month: 3,
      day: 1,
    });
  });

  it("keeps Feb 29 in leap years", () => {
    expect(nextOccurrence({ month: 2, day: 29 }, { year: 2028, month: 2, day: 1 })).toEqual({
      year: 2028,
      month: 2,
      day: 29,
    });
  });
});

describe("ageOn", () => {
  it("is null without a birth year", () => {
    expect(ageOn({ month: 3, day: 1 }, { year: 2026, month: 3, day: 1 })).toBeNull();
  });

  it("counts the birthday itself", () => {
    expect(ageOn({ year: 1990, month: 3, day: 1 }, { year: 2026, month: 3, day: 1 })).toBe(36);
    expect(ageOn({ year: 1990, month: 3, day: 1 }, { year: 2026, month: 2, day: 28 })).toBe(35);
  });
});

describe("upcoming", () => {
  it("reports days away and age turned", () => {
    expect(upcoming({ year: 1990, month: 10, day: 25 }, { year: 2026, month: 10, day: 19 })).toEqual({
      date: { year: 2026, month: 10, day: 25 },
      daysAway: 6,
      turning: 36,
    });
  });
});

describe("arithmetic", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays({ year: 2026, month: 12, day: 30 }, 3)).toEqual({ year: 2027, month: 1, day: 2 });
    expect(daysBetween({ year: 2026, month: 12, day: 30 }, { year: 2027, month: 1, day: 2 })).toBe(3);
  });

  it("is unaffected by DST transitions", () => {
    expect(daysBetween({ year: 2026, month: 3, day: 7 }, { year: 2026, month: 3, day: 9 })).toBe(2);
  });
});

describe("todayIn", () => {
  it("uses the given zone", () => {
    const instant = new Date("2026-10-20T02:00:00Z");
    expect(todayIn("America/Toronto", instant)).toEqual({ year: 2026, month: 10, day: 19 });
    expect(todayIn("UTC", instant)).toEqual({ year: 2026, month: 10, day: 20 });
  });
});

describe("isValidPartialDate", () => {
  it("allows Feb 29 with unknown year", () => {
    expect(isValidPartialDate({ month: 2, day: 29 })).toBe(true);
    expect(isValidPartialDate({ year: 2026, month: 2, day: 29 })).toBe(false);
    expect(isValidPartialDate({ month: 13, day: 1 })).toBe(false);
  });
});

describe("birthdayInText", () => {
  it("reads common ways of writing a birthday", () => {
    expect(birthdayInText("Birthday: August 8, 1995")).toEqual({ month: 8, day: 8, year: 1995 });
    expect(birthdayInText("his bday is Aug 8th")).toEqual({ month: 8, day: 8, year: null });
    expect(birthdayInText("birthday on the 8th of August 1995")).toEqual({ month: 8, day: 8, year: 1995 });
    expect(birthdayInText("born 1995-08-08")).toEqual({ month: 8, day: 8, year: 1995 });
    expect(birthdayInText("Birthday Sept. 3")).toEqual({ month: 9, day: 3, year: null });
  });

  it("ignores text that isn't about a birthday, or is unclear", () => {
    expect(birthdayInText("Dinner on August 8")).toBeNull();
    expect(birthdayInText("birthday 08/08/1995")).toBeNull();
    expect(birthdayInText("birthday is Feb 30")).toBeNull();
    expect(birthdayInText("birthday is March 3 or maybe March 4")).toBeNull();
    expect(birthdayInText("May was fun, birthday party soon")).toBeNull();
  });
});
