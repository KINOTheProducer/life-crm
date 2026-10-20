import { describe, expect, it } from "vitest";
import { dateNightDue, formatDuration, nextAnniversary, relationshipStart, type Milestone } from "./partners";

const today = { year: 2026, month: 10, day: 19 };

const milestones: Milestone[] = [
  { kind: "met", label: null, date: { year: 2017, month: 6, day: 3 }, anniversary: false },
  { kind: "official", label: null, date: { year: 2018, month: 2, day: 14 }, anniversary: true },
  { kind: "married", label: null, date: { year: 2022, month: 11, day: 5 }, anniversary: true },
];

describe("relationshipStart", () => {
  it("prefers the got-together date", () => {
    expect(relationshipStart(milestones)).toEqual({ year: 2018, month: 2, day: 14 });
  });

  it("falls back to the earliest milestone after meeting, then to meeting", () => {
    expect(relationshipStart(milestones.filter((m) => m.kind !== "official"))).toEqual({ year: 2022, month: 11, day: 5 });
    expect(relationshipStart([milestones[0]!])).toEqual({ year: 2017, month: 6, day: 3 });
  });

  it("ignores milestones without a year", () => {
    expect(relationshipStart([{ ...milestones[1]!, date: { month: 2, day: 14 } }])).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formats years and months", () => {
    expect(formatDuration({ year: 2018, month: 2, day: 14 }, today)).toBe("8 years, 8 months");
    expect(formatDuration({ year: 2025, month: 10, day: 19 }, today)).toBe("1 year");
    expect(formatDuration({ year: 2026, month: 5, day: 20 }, today)).toBe("4 months");
  });

  it("uses weeks and days for new relationships", () => {
    expect(formatDuration({ year: 2026, month: 9, day: 28 }, today)).toBe("3 weeks");
    expect(formatDuration({ year: 2026, month: 10, day: 18 }, today)).toBe("1 day");
  });
});

describe("nextAnniversary", () => {
  it("picks the soonest milestone with an anniversary", () => {
    const next = nextAnniversary(milestones, today);
    expect(next).toMatchObject({ daysAway: 17, turning: 4, milestone: { kind: "married" } });
  });

  it("returns null when none are tracked", () => {
    expect(nextAnniversary([milestones[0]!], today)).toBeNull();
  });
});

describe("dateNightDue", () => {
  const since = { year: 2026, month: 1, day: 1 };

  it("is due once the goal has passed", () => {
    expect(dateNightDue(14, { year: 2026, month: 10, day: 1 }, since, today)).toEqual({ due: true, daysSince: 18 });
    expect(dateNightDue(14, { year: 2026, month: 10, day: 10 }, since, today)).toEqual({ due: false, daysSince: 9 });
  });

  it("counts from when the partnership was added if no dates are logged", () => {
    expect(dateNightDue(14, null, since, today)).toEqual({ due: true, daysSince: null });
  });

  it("is never due without a goal", () => {
    expect(dateNightDue(null, null, since, today).due).toBe(false);
  });
});
