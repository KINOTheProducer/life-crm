import { partialParse } from "@anthropic-ai/sdk/_vendor/partial-json-parser/parser";
import type { InteractionType } from "@life-crm/core";
import type { Extraction, KnownPerson } from "./extraction";

type DeepPartial<T> = T extends (infer U)[] ? DeepPartial<U>[] : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/** Whatever the model has written so far. Strings are only present once they're complete. */
export type PartialExtraction = DeepPartial<Extraction>;

/** Parse half-written JSON. Unfinished strings and keys are left out, so what's there is final. */
export function parsePartialJson(text: string): Record<string, unknown> | null {
  if (!text.trim()) return null;
  try {
    const value = partialParse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const occasion: Record<InteractionType, string> = {
  in_person: "time together",
  call: "a call",
  video: "a video call",
  message: "messages",
  email: "an email",
  event: "an event",
  other: "a catch-up",
};

/** "Sarah", "Sarah and Mike", "Sarah, Mike and Al", "Sarah, Mike and 3 others". */
export function listNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length > 3) return `${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function dayLabel(iso: string, today: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  if (iso === today) return "today";
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (t && Date.UTC(+t[1]!, +t[2]! - 1, +t[3]!) - Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!) === 86_400_000) return "yesterday";
  return `on ${months[+m[2]! - 1]} ${+m[3]!}`;
}

/**
 * Known people whose names come up in a transcript, by first name, nickname or full name.
 * Gives the review screen something real to say before the model has written anything.
 */
export function mentionedPeople(transcript: string, known: KnownPerson[]): string[] {
  const text = ` ${transcript.toLowerCase().replace(/[^\p{L}\p{N}'-]+/gu, " ")} `;
  const found: string[] = [];
  for (const p of known) {
    const first = p.name.split(/\s+/)[0] ?? "";
    const words = [p.name, first, p.nickname].filter((w): w is string => !!w && w.length > 1).map((w) => w.toLowerCase());
    const label = p.nickname && text.includes(` ${p.nickname.toLowerCase()} `) ? p.nickname : first;
    if (words.some((w) => text.includes(` ${w} `) || text.includes(` ${w}'s `)) && !found.includes(label)) found.push(label);
  }
  return found;
}

/** The first line on the review screen, from names in the transcript. */
export function mentionLine(names: string[]) {
  return names.length ? `Sounds like this is about ${listNames(names)}` : "Picking out who you talked about";
}

/**
 * What the model has worked out so far, as short lines for the person waiting on it:
 * "Found Sarah Chen in your people", "Sarah's job: Nurse at Sunnybrook",
 * "Logging a video call with Sarah yesterday".
 */
export function extractionProgress(partial: PartialExtraction | null, opts: { knownPeople: KnownPerson[]; today: string }): string[] {
  if (!partial) return [];
  const known = new Map(opts.knownPeople.map((p) => [p.id, p.name]));
  const lines: string[] = [];
  const firstNames = new Map<string, string>();

  for (const p of partial.people ?? []) {
    if (!p?.firstName) continue;
    const first = p.firstName;
    if (p.ref) firstNames.set(p.ref, first);
    const existing = p.existingContactId ? known.get(p.existingContactId) : undefined;
    lines.push(existing ? `Found ${existing} in your people` : `${first} is someone new`);
    // Numbers can be cut off mid-write; the birthday is settled once the next field starts.
    if (p.birthday?.month && p.birthday.day && p.howMet !== undefined) {
      lines.push(`${first}'s birthday: ${months[p.birthday.month - 1] ?? ""} ${p.birthday.day}${p.birthday.year ? `, ${p.birthday.year}` : ""}`);
    }
    if (p.howMet) lines.push(`How you met ${first}: ${p.howMet}`);
    for (const f of p.facts ?? []) {
      if (!f?.value || !f.label) continue;
      lines.push(f.category === "follow_up" ? `To ask ${first} about: ${f.value}` : `${first}'s ${f.label.toLowerCase()}: ${f.value}`);
    }
    if (p.note) lines.push(`Writing a note on ${first}`);
  }

  const ix = partial.interaction;
  if (ix?.type && ix.date && occasion[ix.type as InteractionType]) {
    const who = (ix.participantRefs ?? []).map((r) => (r ? firstNames.get(r) : undefined)).filter((n): n is string => !!n);
    const when = dayLabel(ix.date, opts.today);
    lines.push(`Logging ${occasion[ix.type as InteractionType]}${who.length ? ` with ${listNames(who)}` : ""}${when ? ` ${when}` : ""}`);
  }
  return lines;
}
