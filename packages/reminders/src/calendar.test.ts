import { describe, expect, it } from "vitest";
import { buildCalendar, hashCalendarToken, newCalendarToken } from "./calendar";

describe("buildCalendar", () => {
  const ics = buildCalendar(
    "Life CRM",
    [
      { uid: "date-1@life-crm", date: "19941024", summary: "Sarah Chen's birthday", rrule: "FREQ=YEARLY", alarms: [3, 0] },
      { uid: "reminder-2@life-crm", date: "20261025", summary: "Call Grandma; bring photos, maybe" },
    ],
    new Date("2026-10-19T12:00:00Z"),
  );

  it("writes all-day yearly events with alarms", () => {
    expect(ics).toContain("DTSTART;VALUE=DATE:19941024\r\nDTEND;VALUE=DATE:19941025");
    expect(ics).toContain("RRULE:FREQ=YEARLY");
    expect(ics).toContain("TRIGGER:-P2DT15H");
    expect(ics).toContain("TRIGGER:PT9H");
    expect(ics).toContain("DTSTAMP:20261019T120000Z");
  });

  it("escapes text and uses CRLF line endings", () => {
    expect(ics).toContain(String.raw`SUMMARY:Call Grandma\; bring photos\, maybe`);
    expect(ics.split("\r\n").every((l) => !l.includes("\n"))).toBe(true);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("folds long lines", () => {
    const long = buildCalendar("x", [{ uid: "u", date: "20260101", summary: "a".repeat(200) }]);
    expect(long.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });
});

describe("calendar tokens", () => {
  it("stores only a hash", () => {
    const { token, hash } = newCalendarToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(hash).toBe(hashCalendarToken(token));
    expect(hash).not.toContain(token);
  });
});
