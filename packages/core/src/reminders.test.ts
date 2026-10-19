import { describe, expect, it } from "vitest";
import { addMonths } from "./dates";
import { dueReminders, nextDueDate, type CheckinSource, type DateSource } from "./reminders";

const today = { year: 2026, month: 10, day: 19 };
const none = { dates: [], checkins: [], custom: [] };

const sarahBirthday: DateSource = {
  id: "d1",
  contactId: "c1",
  contactName: "Sarah",
  type: "birthday",
  label: null,
  date: { year: 1994, month: 10, day: 24 },
};

describe("date reminders", () => {
  it("fires the most specific lead tier reached", () => {
    const [r] = dueReminders(today, { ...none, dates: [sarahBirthday] });
    expect(r).toMatchObject({
      key: "date:d1:2026-10-24:14",
      title: "Sarah's birthday is in 5 days",
      body: "Saturday, October 24 · turning 32",
      supersedes: "date:d1:2026-10-24:",
    });
  });

  it("moves to the next tier and then to the day itself", () => {
    expect(dueReminders({ year: 2026, month: 10, day: 21 }, { ...none, dates: [sarahBirthday] })[0]!.key).toBe(
      "date:d1:2026-10-24:3",
    );
    const [onDay] = dueReminders({ year: 2026, month: 10, day: 24 }, { ...none, dates: [sarahBirthday] });
    expect(onDay).toMatchObject({ key: "date:d1:2026-10-24:0", title: "Sarah's birthday is today" });
  });

  it("is silent outside every tier", () => {
    expect(dueReminders({ year: 2026, month: 9, day: 1 }, { ...none, dates: [sarahBirthday] })).toEqual([]);
  });

  it("uses custom lead days", () => {
    const [r] = dueReminders(today, { ...none, dates: [sarahBirthday] }, { leadDays: [7, 1] });
    expect(r!.key).toBe("date:d1:2026-10-24:7");
  });

  it("handles unknown years and Feb 29", () => {
    const leap: DateSource = { ...sarahBirthday, id: "d2", contactName: "James", date: { month: 2, day: 29 } };
    const [r] = dueReminders({ year: 2027, month: 2, day: 27 }, { ...none, dates: [leap] });
    expect(r).toMatchObject({ key: "date:d2:2027-02-28:3", title: "James' birthday is tomorrow", body: "Sunday, February 28" });
  });

  it("words anniversaries and memorials", () => {
    const anniversary: DateSource = { ...sarahBirthday, id: "d3", type: "anniversary", label: "wedding anniversary", date: { year: 2020, month: 10, day: 19 } };
    const memorial: DateSource = { ...sarahBirthday, id: "d4", type: "memorial", contactName: "Grandpa Joe", date: { year: 2019, month: 10, day: 19 } };
    const rs = dueReminders(today, { ...none, dates: [anniversary, memorial] });
    expect(rs.map((r) => r.title)).toEqual(["Sarah's wedding anniversary is today", "Remembering Grandpa Joe today"]);
    expect(rs[0]!.body).toBe("Monday, October 19 · 6 years");
    expect(rs[1]!.body).toBe("Monday, October 19");
  });
});

describe("check-in reminders", () => {
  const mike: CheckinSource = {
    contactId: "c2",
    contactName: "Mike",
    cadenceDays: 21,
    lastInteraction: { year: 2026, month: 9, day: 1 },
    addedOn: { year: 2025, month: 1, day: 1 },
  };

  it("nudges once the cadence has passed, keyed to the due date", () => {
    const [r] = dueReminders(today, { ...none, checkins: [mike] });
    expect(r).toMatchObject({
      key: "checkin:c2:2026-09-22",
      title: "Time to catch up with Mike",
      body: "Last caught up 48 days ago",
    });
  });

  it("is quiet before the cadence and after a recent catch-up", () => {
    expect(dueReminders(today, { ...none, checkins: [{ ...mike, lastInteraction: { year: 2026, month: 10, day: 10 } }] })).toEqual([]);
  });

  it("counts from when the person was added if there are no catch-ups", () => {
    const [r] = dueReminders(today, {
      ...none,
      checkins: [{ ...mike, lastInteraction: null, addedOn: { year: 2026, month: 9, day: 19 } }],
    });
    expect(r).toMatchObject({ key: "checkin:c2:2026-10-10", body: "No catch-ups logged since you added them 30 days ago" });
  });
});

describe("custom reminders", () => {
  it("fires on and after the due date", () => {
    const custom = [{ id: "r1", contactId: "c1", contactName: "Lisa", title: "Ask how the interview went", dueOn: today, repeat: "none" as const }];
    expect(dueReminders(today, { ...none, custom })[0]).toMatchObject({ key: "custom:r1:2026-10-19", body: "About Lisa" });
    expect(dueReminders({ year: 2026, month: 10, day: 18 }, { ...none, custom })).toEqual([]);
  });

  it("advances repeating reminders past today", () => {
    const sunday = { year: 2026, month: 10, day: 18 };
    expect(nextDueDate(sunday, "weekly", today)).toEqual({ year: 2026, month: 10, day: 25 });
    expect(nextDueDate({ year: 2026, month: 8, day: 31 }, "monthly", today)).toEqual({ year: 2026, month: 10, day: 31 });
    expect(nextDueDate({ year: 2026, month: 1, day: 31 }, "monthly", { year: 2026, month: 2, day: 1 })).toEqual({ year: 2026, month: 2, day: 28 });
    expect(nextDueDate(today, "yearly", today)).toEqual({ year: 2027, month: 10, day: 19 });
    expect(nextDueDate(today, "none", today)).toBeNull();
  });
});

describe("addMonths", () => {
  it("clamps to month length and crosses years", () => {
    expect(addMonths({ year: 2026, month: 1, day: 31 }, 1)).toEqual({ year: 2026, month: 2, day: 28 });
    expect(addMonths({ year: 2026, month: 11, day: 15 }, 3)).toEqual({ year: 2027, month: 2, day: 15 });
  });
});
