import { describe, expect, it } from "vitest";
import { buildResortMessage, sanitizeResort, type ResortInput, type ResortTarget } from "./resort";

const input: ResortInput = {
  today: "2026-10-22",
  subject: { id: "c-holly", name: "Holly Reid", partnerLabel: "Girlfriend" },
  items: [
    { id: "f1", kind: "fact", text: "follow_up / Ask about: Loves Stardew Valley" },
    { id: "f2", kind: "fact", text: "interest / Game: Stardew Valley" },
    { id: "n1", kind: "note", text: "Note: Her sister Emma works at Sick Kids. We started dating March 3 2023." },
  ],
  knownPeople: [
    { id: "c-holly", name: "Holly Reid" },
    { id: "c-emma", name: "Emma Reid" },
  ],
};

const blank: ResortTarget = {
  kind: "fact",
  category: null,
  label: null,
  value: null,
  dateKind: null,
  milestone: null,
  month: null,
  day: null,
  year: null,
  personId: null,
  newPerson: null,
};

describe("sanitizeResort", () => {
  it("keeps a duplicate, a split and a move to someone else", () => {
    const out = sanitizeResort(
      {
        changes: [
          { id: "f1", reason: "Same as the game fact", duplicateOf: "f2", into: [] },
          {
            id: "n1",
            reason: "Has a milestone in it",
            duplicateOf: null,
            into: [{ ...blank, kind: "milestone", milestone: "official", month: 3, day: 3, year: 2023 }],
          },
        ],
      },
      input,
    );
    expect(out.changes.map((c) => c.id)).toEqual(["f1", "n1"]);
  });

  it("drops unknown ids, repeats, self duplicates, empty moves and duplicate cycles", () => {
    const out = sanitizeResort(
      {
        changes: [
          { id: "x9", reason: "", duplicateOf: null, into: [{ ...blank, category: "interest", label: "A", value: "B" }] },
          { id: "f1", reason: "", duplicateOf: "f1", into: [] },
          { id: "f2", reason: "", duplicateOf: null, into: [{ ...blank, category: "interest", label: "" , value: "x" }] },
          { id: "f1", reason: "", duplicateOf: "f2", into: [] },
          { id: "f2", reason: "", duplicateOf: "f1", into: [] },
        ],
      },
      input,
    );
    expect(out.changes.map((c) => [c.id, c.duplicateOf])).toEqual([["f1", "f2"]]);
  });

  it("only allows milestones for a partner, and never on someone else", () => {
    const change = {
      id: "n1",
      reason: "",
      duplicateOf: null,
      into: [{ ...blank, kind: "milestone" as const, milestone: "official" as const, month: 3, day: 3, year: 2023 }],
    };
    expect(sanitizeResort({ changes: [change] }, { ...input, subject: { id: "c-holly", name: "Holly" } }).changes).toEqual([]);
    const onEmma = { ...change, into: [{ ...change.into[0]!, personId: "c-emma" }] };
    expect(sanitizeResort({ changes: [onEmma] }, input).changes).toEqual([]);
  });

  it("ignores the subject or unknown ids as the person to move to", () => {
    const fact = { ...blank, category: "work" as const, label: "Job", value: "Sick Kids" };
    const out = sanitizeResort(
      {
        changes: [
          { id: "n1", reason: "", duplicateOf: null, into: [{ ...fact, personId: "c-holly" }] },
          { id: "f2", reason: "", duplicateOf: null, into: [{ ...fact, personId: "c-emma" }] },
        ],
      },
      input,
    );
    expect(out.changes.map((c) => c.into[0]!.personId)).toEqual([null, "c-emma"]);
  });

  it("splits a note across the subject and a new relative, and matches a new person already known", () => {
    const jake = { firstName: "Jake", lastName: null, relation: "sibling" as const, relationLabel: "Brother" };
    const out = sanitizeResort(
      {
        changes: [
          {
            id: "n1",
            reason: "",
            duplicateOf: null,
            into: [
              { ...blank, category: "interest", label: "Show", value: "Severance" },
              { ...blank, category: "interest", label: "Hobby", value: "Fishing", newPerson: jake },
              { ...blank, category: "work", label: "Job", value: "Sick Kids", newPerson: { ...jake, firstName: "Emma", lastName: "Reid" } },
              { ...blank, category: "work", label: "Job", value: "x", newPerson: { ...jake, firstName: " " } },
            ],
          },
        ],
      },
      input,
    );
    expect(out.changes[0]!.into.map((t) => [t.value, t.personId, t.newPerson?.firstName ?? null])).toEqual([
      ["Severance", null, null],
      ["Fishing", null, "Jake"],
      ["Sick Kids", "c-emma", null],
    ]);
  });
});

describe("buildResortMessage", () => {
  it("lists saved items and other people, not the subject", () => {
    const msg = buildResortMessage(input);
    expect(msg).toContain("- f1 [fact] follow_up / Ask about: Loves Stardew Valley");
    expect(msg).toContain("- c-emma: Emma Reid");
    expect(msg).not.toContain("- c-holly");
  });
});
