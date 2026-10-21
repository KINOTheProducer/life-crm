import { describe, expect, it } from "vitest";
import { parseGedcom, parseGedDate, serializeGedcom, type GedTree } from "./gedcom";

const sample = `﻿0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Robert James /Chen/
2 GIVN Robert James
2 SURN Chen
1 SEX M
1 BIRT
2 DATE 12 MAR 1950
1 DEAT
2 DATE ABT 2019
1 FAMS @F1@
0 @I2@ INDI
1 NAME Linda /Park/
1 SEX F
1 BIRT
2 DATE MAR 1952
1 FAMS @F1@
0 @I3@ INDI
1 NAME Sarah /Chen/
1 SEX F
1 BIRT
2 DATE 4 JUL 1980
1 FAMC @F1@
0 @I4@ INDI
1 NAME Max /Chen/
1 FAMC @F1@
2 PEDI adopted
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 1975
1 CHIL @I3@
1 CHIL @I4@
1 CHIL @I99@
0 TRLR
`;

describe("parseGedDate", () => {
  it("reads full, partial and qualified dates", () => {
    expect(parseGedDate("12 MAR 1950")).toEqual({ year: 1950, month: 3, day: 12, approx: false });
    expect(parseGedDate("mar 1952")).toEqual({ year: 1952, month: 3, day: null, approx: false });
    expect(parseGedDate("ABT 1900")).toEqual({ year: 1900, month: null, day: null, approx: true });
    expect(parseGedDate("BET 1950 AND 1955")).toEqual({ year: 1950, month: null, day: null, approx: true });
    expect(parseGedDate("@#DGREGORIAN@ 1 JAN 1900")).toEqual({ year: 1900, month: 1, day: 1, approx: false });
  });

  it("returns null for things that aren't dates", () => {
    expect(parseGedDate("")).toBeNull();
    expect(parseGedDate("sometime")).toBeNull();
    expect(parseGedDate("40 MAR 1950")).toBeNull();
  });
});

describe("parseGedcom", () => {
  const tree = parseGedcom(sample);

  it("reads people with names, sex, birth and death", () => {
    expect(tree.people).toHaveLength(4);
    const robert = tree.people[0]!;
    expect(robert).toMatchObject({ xref: "I1", firstName: "Robert James", lastName: "Chen", sex: "M", deceased: true });
    expect(robert.birth).toEqual({ year: 1950, month: 3, day: 12, approx: false });
    expect(robert.death?.year).toBe(2019);
    expect(tree.people[3]).toMatchObject({ firstName: "Max", lastName: "Chen", sex: "U", birth: null });
  });

  it("falls back to the slashes when there's no GIVN or SURN", () => {
    expect(parseGedcom("0 @I1@ INDI\n1 NAME John /Smith/ Jr.\n").people[0]).toMatchObject({ firstName: "John Jr.", lastName: "Smith" });
    expect(parseGedcom("0 @I1@ INDI\n1 NAME Cher\n").people[0]).toMatchObject({ firstName: "Cher", lastName: null });
  });

  it("reads families, adoption and drops unknown children", () => {
    expect(tree.families).toEqual([
      {
        xref: "F1",
        partners: ["I1", "I2"],
        status: "married",
        startYear: 1975,
        endYear: null,
        children: [
          { xref: "I3", kind: "biological" },
          { xref: "I4", kind: "adoptive" },
        ],
      },
    ]);
  });
});

describe("serializeGedcom", () => {
  it("round-trips through the parser", () => {
    const tree = parseGedcom(sample);
    const text = serializeGedcom(tree, { source: "Test", date: new Date(Date.UTC(2026, 9, 21)) });
    expect(text).toContain("1 DATE 21 OCT 2026");
    expect(text).toContain("2 PEDI adopted");
    expect(text.trim().endsWith("0 TRLR")).toBe(true);
    expect(parseGedcom(text)).toEqual(tree);
  });

  it("puts a woman in WIFE when she's listed first", () => {
    const tree: GedTree = {
      people: [
        { xref: "I1", firstName: "Ana", lastName: null, sex: "F", birth: null, deceased: false, death: null },
        { xref: "I2", firstName: "Ben", lastName: null, sex: "M", birth: null, deceased: false, death: null },
      ],
      families: [{ xref: "F1", partners: ["I1", "I2"], status: "divorced", startYear: 2001, endYear: 2010, children: [] }],
    };
    const text = serializeGedcom(tree, { source: "Test" });
    expect(text).toContain("1 WIFE @I1@\n1 HUSB @I2@");
    expect(text).toContain("1 DIV\n2 DATE 2010");
    expect(parseGedcom(text).families[0]).toMatchObject({ status: "divorced", startYear: 2001, endYear: 2010 });
  });

  it("escapes @ and newlines in names", () => {
    const text = serializeGedcom(
      { people: [{ xref: "I1", firstName: "a@b\nc", lastName: null, sex: "U", birth: null, deceased: true, death: null }], families: [] },
      { source: "Test" },
    );
    expect(text).toContain("1 NAME a@@b c");
    expect(text).toContain("1 DEAT Y");
  });
});
