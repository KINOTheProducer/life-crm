import { createHash, randomBytes } from "node:crypto";

export function newCalendarToken() {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashCalendarToken(token) };
}

export function hashCalendarToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Escape text per RFC 5545. */
function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
}

/** Fold lines longer than 75 octets. */
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut -= 1;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

export interface CalendarEvent {
  uid: string;
  /** YYYYMMDD */
  date: string;
  summary: string;
  description?: string;
  rrule?: string;
  /** Days before to alert (0 = morning of). */
  alarms?: number[];
}

export function buildCalendar(name: string, events: CalendarEvent[], stamp = new Date()): string {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Life CRM//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`,
    "X-PUBLISHED-TTL:PT6H",
  ];
  for (const e of events) {
    const next = new Date(Date.UTC(+e.date.slice(0, 4), +e.date.slice(4, 6) - 1, +e.date.slice(6, 8) + 1));
    const end = next.toISOString().slice(0, 10).replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${e.date}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${esc(e.summary)}`,
      "TRANSP:TRANSPARENT",
    );
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.rrule) lines.push(`RRULE:${e.rrule}`);
    for (const days of e.alarms ?? []) {
      // All-day events start at midnight; 9am on the day is +9h, earlier days count back from there.
      const trigger = days === 0 ? "PT9H" : `-P${days - 1}DT15H`;
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.summary)}`, `TRIGGER:${trigger}`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
