import { describe, expect, it } from "vitest";
import { genderFromPronouns, indexFamilies, kinship, kinshipGroup, roleFromLabel, siblingsOf, type Family, type Gender } from "./kinship";

/*
 * gma + gpa
 *   ├─ mom + dad ─ me (+ holly, married), sis (+ tom), half-bro (dad + ex)
 *   │                │                      └─ niece
 *   │                └─ kid
 *   └─ aunt + uncle ─ cousin ─ cousin-kid
 * holly's parents: hmom + hdad ─ holly, hbro
 * dad + ex ─ half-bro ; mom later + stepdad
 */
const fam = (id: string, partners: string[], children: string[], status: Family["status"] = "married", kind: Family["children"][number]["kind"] = "biological"): Family => ({
  id,
  partners,
  status,
  children: children.map((c) => ({ id: c, kind })),
});

const families: Family[] = [
  fam("f-gp", ["gma", "gpa"], ["mom", "aunt"]),
  fam("f-parents", ["mom", "dad"], ["me", "sis"], "divorced"),
  fam("f-dad-ex", ["dad", "ex"], ["halfbro"], "divorced"),
  fam("f-stepdad", ["mom", "stepdad"], [], "married"),
  fam("f-me", ["me", "holly"], ["kid"]),
  fam("f-sis", ["sis", "tom"], ["niece"]),
  fam("f-aunt", ["aunt", "uncle"], ["cousin"]),
  fam("f-cousin", ["cousin"], ["cousinkid"], "unknown"),
  fam("f-holly", ["hmom", "hdad"], ["holly", "hbro"]),
  fam("f-adopt", ["me", "holly"], ["adopted"], "married", "adoptive"),
  fam("f-step", ["holly", "hex"], ["hollyskid"], "divorced"),
];

const genders: Record<string, Gender> = {
  gma: "female", gpa: "male", mom: "female", dad: "male", aunt: "female", uncle: "male", sis: "female", tom: "male",
  holly: "female", kid: null, niece: "female", halfbro: "male", stepdad: "male", hmom: "female", hdad: "male", hbro: "male",
  cousin: null, cousinkid: "male", adopted: "female", hollyskid: "male",
};
const index = indexFamilies(families);
const term = (target: string, ego = "me") => kinship(index, ego, target, (id) => genders[id] ?? null);

describe("kinship", () => {
  it("names direct family", () => {
    expect(term("me")).toBe("you");
    expect(term("mom")).toBe("mother");
    expect(term("dad")).toBe("father");
    expect(term("gma")).toBe("grandmother");
    expect(term("kid")).toBe("child");
    expect(term("sis")).toBe("sister");
    expect(term("adopted")).toBe("daughter");
  });

  it("knows half-siblings", () => {
    expect(term("halfbro")).toBe("half-brother");
    expect(siblingsOf(index, "me")).toEqual(expect.arrayContaining([{ id: "sis", half: false }, { id: "halfbro", half: true }]));
  });

  it("names aunts, nieces and cousins", () => {
    expect(term("aunt")).toBe("aunt");
    expect(term("niece")).toBe("niece");
    expect(term("cousin")).toBe("first cousin");
    expect(term("cousinkid")).toBe("first cousin once removed");
    expect(term("me", "cousinkid")).toBe("first cousin once removed");
  });

  it("names partners and people who married in", () => {
    expect(term("holly")).toBe("wife");
    expect(term("tom")).toBe("brother-in-law");
    expect(term("uncle")).toBe("uncle");
    expect(term("hmom")).toBe("mother-in-law");
    expect(term("hbro")).toBe("brother-in-law");
  });

  it("names step family", () => {
    expect(term("stepdad")).toBe("stepfather");
    expect(term("hollyskid")).toBe("stepson");
    expect(term("ex")).toBe("father's ex-partner");
  });

  it("reads the other way around", () => {
    expect(term("me", "kid")).toBe("parent");
    expect(term("me", "niece")).toBe("aunt or uncle");
    expect(term("me", "gma")).toBe("grandchild");
  });

  it("returns null for strangers", () => {
    expect(kinship(index, "me", "nobody", () => null)).toBeNull();
  });
});

describe("helpers", () => {
  it("guesses gender from pronouns", () => {
    expect(genderFromPronouns("she/her")).toBe("female");
    expect(genderFromPronouns("He/Him")).toBe("male");
    expect(genderFromPronouns("they/them")).toBeNull();
    expect(genderFromPronouns("she/they")).toBe("female");
    expect(genderFromPronouns(null)).toBeNull();
  });

  it("groups terms", () => {
    expect(kinshipGroup("great-grandmother")).toBe("Parents & grandparents");
    expect(kinshipGroup("second cousin once removed")).toBe("Cousins");
    expect(kinshipGroup("sister-in-law")).toBe("In-laws & by marriage");
    expect(kinshipGroup("stepfather")).toBe("Step & foster family");
    expect(kinshipGroup("wife")).toBe("Partners");
  });
});

describe("roleFromLabel", () => {
  it("reads common labels", () => {
    expect(roleFromLabel("Mom")).toEqual({ role: "parent", gender: "female", kind: "biological" });
    expect(roleFromLabel("Little brother")).toEqual({ role: "sibling", gender: "male", kind: "biological" });
    expect(roleFromLabel("Stepdad")).toEqual({ role: "parent", gender: "male", kind: "step" });
    expect(roleFromLabel("adopted daughter")).toEqual({ role: "child", gender: "female", kind: "adoptive" });
    expect(roleFromLabel("Wife")?.role).toBe("partner");
  });

  it("leaves indirect or unknown labels alone", () => {
    expect(roleFromLabel("Grandma")).toBeNull();
    expect(roleFromLabel("Best friend")).toBeNull();
    expect(roleFromLabel("")).toBeNull();
  });
});
