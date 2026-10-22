import { describe, expect, it } from "vitest";
import { lifeEventKindFor, monicaTies, parseMonicaExport } from "./monica";

const block = (type: string, values: unknown[]) => ({ count: values.length, type, values });

const fixture = {
  version: "1.0-preview.1",
  app_version: "4.1.2",
  account: {
    uuid: "acc",
    data: [
      block("contact", [
        {
          uuid: "c-sarah",
          created_at: "2020-01-01T00:00:00.000000Z",
          properties: {
            first_name: "Sarah",
            last_name: "Chen",
            job: "Nurse",
            company: "Sunnybrook",
            food_preferences: "No peanuts",
            stay_in_touch_frequency: 14,
            is_dead: false,
            tags: ["Climbing"],
            gender: "g-f",
            birthdate: { uuid: "d1", is_age_based: false, is_year_unknown: true, date: "1990-03-03T00:00:00.000000Z" },
            first_met_date: { uuid: "d2", is_age_based: false, is_year_unknown: false, date: "2019-06-01T00:00:00.000000Z" },
            first_met_through: "c-ryan",
          },
          data: [
            block("contact_field", [
              { uuid: "f1", properties: { data: "sarah@example.com", type: "t-email" } },
              { uuid: "f2", properties: { data: "+14165550100", type: "t-phone" } },
              { uuid: "f3", properties: { data: "sarahc", type: "t-twitter" } },
            ]),
            block("note", [{ uuid: "n1", created_at: "2021-05-02T10:00:00.000000Z", properties: { body: "Loves Pai." } }]),
            block("address", [{ uuid: "a1", properties: { name: "Home", city: "Toronto", province: "ON", country: "CA" } }]),
            block("life_event", [{ uuid: "e1", properties: { name: null, happened_at: "2022-09-01T00:00:00.000000Z", type: "le-job" } }]),
            block("gift", [{ uuid: "g1", properties: { name: "Chemex", status: "idea", amount: 6000 } }]),
            block("debt", [{ uuid: "d1", created_at: "2023-01-01T00:00:00.000000Z", properties: { amount: 2500, in_debt: true, status: "inprogress" } }]),
            block("task", [{ uuid: "t1", properties: { title: "Return drill", completed: false } }]),
            block("call", [{ uuid: "k1", properties: { called_at: "2023-02-02T00:00:00.000000Z", content: "Talked about the move" } }]),
            block("activity", ["act-1"]),
          ],
        },
        { uuid: "c-ryan", properties: { first_name: "Ryan", last_name: "Park", is_dead: true, deceased_date: { date: "2024-01-05T00:00:00.000000Z", is_year_unknown: false } } },
        { uuid: "c-empty", properties: { first_name: "" } },
      ]),
      block("relationship", [
        { uuid: "r1", properties: { type: "spouse", contact_is: "c-sarah", of_contact: "c-ryan" } },
        { uuid: "r2", properties: { type: "spouse", contact_is: "c-ryan", of_contact: "c-sarah" } },
        { uuid: "r3", properties: { type: "child", contact_is: "c-ryan", of_contact: "c-kid" } },
        { uuid: "r4", properties: { type: "parent", contact_is: "c-kid", of_contact: "c-ryan" } },
        { uuid: "r5", properties: { type: "grandparent", contact_is: "c-kid", of_contact: "c-grandma" } },
      ]),
      block("activity", [{ uuid: "act-1", properties: { summary: "Dinner at Pai", happened_at: "2023-03-04" } }]),
    ],
    instance: {
      contact_field_types: [
        { uuid: "t-email", properties: { name: "Email", type: "email" } },
        { uuid: "t-phone", properties: { name: "Phone", type: "phone" } },
        { uuid: "t-twitter", properties: { name: "Twitter" } },
      ],
      life_event_types: [{ uuid: "le-job", properties: { name: null, translation_key: "new_job" } }],
      genders: [{ uuid: "g-f", properties: { name: "Woman", type: "F" } }],
    },
  },
};

describe("parseMonicaExport", () => {
  const out = parseMonicaExport(fixture);

  it("reads people and skips nameless ones", () => {
    expect(out.people.map((p) => p.firstName)).toEqual(["Sarah", "Ryan"]);
  });

  it("maps fields, dates and sub-records", () => {
    const s = out.people[0]!;
    expect(s).toMatchObject({
      key: "c-sarah",
      job: "Nurse",
      company: "Sunnybrook",
      food: "No peanuts",
      stayInTouchDays: 14,
      tags: ["Climbing"],
      gender: "F",
      birthday: { year: null, month: 3, day: 3 },
      met: { year: 2019, month: 6 },
      metThrough: "c-ryan",
      emails: [{ label: "personal", value: "sarah@example.com" }],
      phones: [{ label: "other", value: "+14165550100" }],
      socials: [{ service: "x", value: "sarahc" }],
      notes: [{ body: "Loves Pai.", date: "2021-05-02" }],
      lifeEvents: [{ kind: "new_job", title: null, note: null, date: "2022-09-01" }],
      gifts: [{ name: "Chemex", status: "idea", amountCents: 6000 }],
      debts: [{ amountCents: 2500, currency: "CAD", iOwe: true, settled: false, date: "2023-01-01" }],
      tasks: [{ title: "Return drill", done: false }],
      calls: [{ date: "2023-02-02", content: "Talked about the move" }],
      activities: ["act-1"],
    });
    expect(s.addresses[0]).toMatchObject({ label: "home", city: "Toronto", region: "ON" });
    expect(out.people[1]).toMatchObject({ isDead: true, deathYear: 2024 });
    expect(out.activities).toEqual([{ key: "act-1", summary: "Dinner at Pai", description: null, date: "2023-03-04" }]);
  });

  it("rejects other JSON", () => {
    expect(() => parseMonicaExport({ hello: 1 })).toThrow("Monica");
  });
});

describe("monicaTies", () => {
  it("collapses both directions into one tie", () => {
    expect(monicaTies(parseMonicaExport(fixture).relationships)).toEqual([
      { kind: "partner", a: "c-sarah", b: "c-ryan", status: "married" },
      { kind: "child", parent: "c-ryan", child: "c-kid" },
      { kind: "note", about: "c-kid", other: "c-grandma", label: "Grandparent" },
    ]);
  });
});

describe("lifeEventKindFor", () => {
  it("falls back to other", () => {
    expect(lifeEventKindFor("marriage")).toBe("married");
    expect(lifeEventKindFor("tattoo_or_piercing")).toBe("other");
    expect(lifeEventKindFor(null)).toBe("other");
  });
});
