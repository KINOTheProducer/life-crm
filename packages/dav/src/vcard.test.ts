import { describe, expect, it } from "vitest";
import { cardsFromCsv, parseCsv, toCsv } from "./csv";
import { emptyCard, parseVcards, serializeVcard } from "./vcard";

const ios = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "PRODID:-//Apple Inc.//iPhone OS 18.0//EN",
  "N:Chen;Holly;;;",
  "FN:Holly Chen",
  "NICKNAME:Hols",
  "ORG:Sunnybrook Health;",
  "TITLE:Nurse",
  "item1.EMAIL;type=INTERNET;type=pref:holly@example.com",
  "TEL;type=CELL;type=VOICE;type=pref:(416) 555-0123",
  "TEL;type=WORK;type=VOICE:416 555 0199",
  "item2.ADR;type=HOME;type=pref:;;12 Elm St;Toronto;ON;M5V 2T6;Canada",
  "BDAY;X-APPLE-OMIT-YEAR=1604:1604-03-14",
  "X-SOCIALPROFILE;type=instagram;x-user=hollyc:http://instagram.com/hollyc",
  "NOTE:Met at Jay's wedding\\, loves climbing\\nAllergic to peanuts",
  "UID:ABC-123",
  "END:VCARD",
].join("\r\n");

describe("parseVcards", () => {
  it("reads an iPhone export", () => {
    const [c] = parseVcards(ios);
    expect(c).toMatchObject({
      uid: "ABC-123",
      firstName: "Holly",
      lastName: "Chen",
      nickname: "Hols",
      company: "Sunnybrook Health",
      jobTitle: "Nurse",
      birthday: { year: null, month: 3, day: 14 },
      emails: [{ label: "personal", value: "holly@example.com" }],
      phones: [
        { label: "mobile", value: "(416) 555-0123" },
        { label: "work", value: "416 555 0199" },
      ],
      addresses: [{ label: "home", street: "12 Elm St", city: "Toronto", region: "ON", postalCode: "M5V 2T6", country: "Canada" }],
      socials: [{ service: "instagram", value: "hollyc" }],
      note: "Met at Jay's wedding, loves climbing\nAllergic to peanuts",
    });
  });

  it("handles folding, vCard 4 dates, 2.1 bare types and quoted-printable", () => {
    const text = [
      "BEGIN:VCARD",
      "VERSION:4.0",
      "FN:Marcus Bell",
      "N:Bell;Marcus;;;",
      "BDAY:19880702",
      "NOTE:a very long note that has been",
      "  folded across lines",
      "END:VCARD",
      "BEGIN:VCARD",
      "VERSION:2.1",
      "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Nu=C3=B1ez;Jos=C3=A9;;;",
      "TEL;CELL:4165550100",
      "END:VCARD",
      "BEGIN:VCARD",
      "VERSION:3.0",
      "END:VCARD",
    ].join("\n");
    const cards = parseVcards(text);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ firstName: "Marcus", birthday: { year: 1988, month: 7, day: 2 }, note: "a very long note that has been folded across lines" });
    expect(cards[1]).toMatchObject({ firstName: "José", lastName: "Nuñez", phones: [{ label: "mobile", value: "4165550100" }] });
  });

  it("falls back to FN or the company for a name", () => {
    const [a, b] = parseVcards("BEGIN:VCARD\nFN:Priya Shah\nEND:VCARD\nBEGIN:VCARD\nORG:Pai Restaurant\nEND:VCARD");
    expect(a).toMatchObject({ firstName: "Priya", lastName: "Shah" });
    expect(b).toMatchObject({ firstName: "Pai Restaurant" });
  });
});

describe("serializeVcard", () => {
  it("round-trips through the parser", () => {
    const [c] = parseVcards(ios);
    const text = serializeVcard({ ...c!, uid: "abc-123" });
    expect(text).toMatch(/^BEGIN:VCARD\r\nVERSION:3.0\r\n/);
    expect(text).toContain("BDAY;X-APPLE-OMIT-YEAR=1604:1604-03-14");
    expect(text).toContain("NOTE:Met at Jay's wedding\\, loves climbing\\nAllergic to peanuts");
    const [back] = parseVcards(text);
    expect(back).toMatchObject({ ...c, uid: "abc-123", fullName: "Holly Chen" });
  });

  it("folds long lines at 75 octets without splitting characters", () => {
    const text = serializeVcard({ ...emptyCard(), uid: "u", firstName: "Zoë", note: "é".repeat(100) });
    for (const line of text.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(parseVcards(text)[0]!.note).toBe("é".repeat(100));
  });
});

describe("csv", () => {
  it("parses quotes, embedded newlines and CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","line1\nline2"\r\n"he said ""hi""",\n')).toEqual([
      ["a", "b"],
      ["x, y", "line1\nline2"],
      ['he said "hi"', ""],
    ]);
  });

  it("writes CSV that spreadsheets won't run as formulas", () => {
    expect(toCsv([["=SUM(A1)", 'a "b"', "plain"]])).toBe(`'=SUM(A1),"a ""b""",plain\r\n`);
  });

  it("reads a Google Contacts export", () => {
    const csv = [
      "First Name,Middle Name,Last Name,Nickname,Birthday,Notes,E-mail 1 - Label,E-mail 1 - Value,Phone 1 - Label,Phone 1 - Value,Phone 2 - Label,Phone 2 - Value,Address 1 - Label,Address 1 - Street,Address 1 - City,Address 1 - Region,Address 1 - Postal Code,Address 1 - Country,Organization Name,Organization Title",
      "Holly,,Chen,Hols,--03-14,,* Home,holly@example.com ::: h.chen@work.com,Mobile,416 555 0123,Work,416 555 0199,Home,12 Elm St,Toronto,ON,M5V 2T6,Canada,Sunnybrook,Nurse",
    ].join("\n");
    const { cards } = cardsFromCsv(csv);
    expect(cards[0]).toMatchObject({
      firstName: "Holly",
      lastName: "Chen",
      birthday: { year: null, month: 3, day: 14 },
      company: "Sunnybrook",
      jobTitle: "Nurse",
      phones: [
        { label: "mobile", value: "416 555 0123" },
        { label: "work", value: "416 555 0199" },
      ],
      addresses: [{ street: "12 Elm St", city: "Toronto", region: "ON", postalCode: "M5V 2T6", country: "Canada" }],
    });
    expect(cards[0]!.emails.map((e) => e.value)).toEqual(["holly@example.com", "h.chen@work.com"]);
  });

  it("reads a plain spreadsheet with a single name column", () => {
    const { cards } = cardsFromCsv("Name,Phone,Email,Birthday\nMarcus Bell,4165550100,marcus@example.com,1988-07-02\n,,,\n");
    expect(cards).toEqual([expect.objectContaining({ firstName: "Marcus", lastName: "Bell", birthday: { year: 1988, month: 7, day: 2 } })]);
  });

  it("reads Outlook's columns", () => {
    const { cards } = cardsFromCsv("First Name,Last Name,Mobile Phone,E-mail Address,Home Street,Home City,Home State,Home Postal Code\nPriya,Shah,647 555 0111,priya@example.com,5 Oak Ave,Ottawa,ON,K1A 0B1\n");
    expect(cards[0]).toMatchObject({ phones: [{ label: "mobile" }], emails: [{ value: "priya@example.com" }], addresses: [{ street: "5 Oak Ave", city: "Ottawa", region: "ON" }] });
  });
});
