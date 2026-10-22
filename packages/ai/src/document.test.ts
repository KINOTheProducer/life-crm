import { describe, expect, it, vi } from "vitest";
import { AnthropicExtractor } from "./anthropic";
import { buildDocumentMessage, DOCUMENT_SYSTEM_PROMPT, sanitizeDocument, type DocumentExtraction, type DocumentInput } from "./document";
import { OpenAiCompatibleExtractor } from "./openai-compatible";

const input: DocumentInput = {
  text: "Holly loves Stardew Valley. Her sister Emma's birthday is May 2. We started dating March 3, 2023.",
  today: "2026-10-22",
  timeZone: "America/Toronto",
  subject: { id: "c-holly", name: "Holly Reid", partnerLabel: "Girlfriend" },
  knownPeople: [
    { id: "c-holly", name: "Holly Reid" },
    { id: "c-emma", name: "Emma Reid" },
  ],
  partnerPrompts: { favourites: ["Coffee or tea order", "Flowers"] },
};

const doc: DocumentExtraction = {
  nameInFile: "Holly",
  subject: {
    nickname: null,
    pronouns: null,
    birthday: null,
    howMet: null,
    facts: [{ category: "interest", label: "Game", value: "Stardew Valley" }],
    dates: [],
    milestones: [{ kind: "official", label: null, month: 3, day: 3, year: 2023 }],
    catchups: [],
    notes: [],
  },
  others: [
    {
      ref: "p1",
      existingContactId: "c-emma",
      firstName: "Emma",
      lastName: "Reid",
      relation: "sibling",
      relationLabel: "Sister",
      birthday: { month: 5, day: 2, year: null },
      facts: [],
      dates: [],
      note: null,
    },
  ],
};

describe("sanitizeDocument", () => {
  it("keeps valid output", () => {
    expect(sanitizeDocument(doc, input)).toEqual(doc);
  });

  it("drops milestones unless the subject is a partner", () => {
    const notPartner = { ...input, subject: { id: "c-holly", name: "Holly Reid" } };
    expect(sanitizeDocument(doc, notPartner).subject.milestones).toEqual([]);
  });

  it("drops the subject listed as someone else, unknown ids, bad dates and future catch-ups", () => {
    const messy: DocumentExtraction = {
      ...doc,
      subject: {
        ...doc.subject,
        birthday: { month: 2, day: 30, year: null },
        dates: [{ kind: "memorial", label: "Dad", month: 13, day: 1, year: null }],
        catchups: [
          { date: "2026-11-01", type: "in_person", summary: "Not yet" },
          { date: "2026-10-01", type: "in_person", summary: "Went to the AGO" },
        ],
      },
      others: [
        { ...doc.others[0]!, existingContactId: "c-holly" },
        { ...doc.others[0]!, ref: "p2", firstName: "Sam", existingContactId: "made-up" },
      ],
    };
    const clean = sanitizeDocument(messy, input);
    expect(clean.subject.birthday).toBeNull();
    expect(clean.subject.dates).toEqual([]);
    expect(clean.subject.catchups.map((c) => c.date)).toEqual(["2026-10-01"]);
    expect(clean.others.map((o) => [o.firstName, o.existingContactId])).toEqual([["Sam", null]]);
  });
});

describe("buildDocumentMessage", () => {
  it("names the subject as a partner, lists prompts and leaves the subject out of known people", () => {
    const msg = buildDocumentMessage(input);
    expect(msg).toContain("Subject: c-holly: Holly Reid, my partner (Girlfriend)");
    expect(msg).toContain("- favourites: Coffee or tea order; Flowers");
    expect(msg).toContain("- c-emma: Emma Reid");
    expect(msg).not.toContain("- c-holly");
    expect(msg).toContain(input.text);
  });

  it("skips prompts for someone who isn't a partner", () => {
    expect(buildDocumentMessage({ ...input, subject: { id: "c-holly", name: "Holly Reid" } })).not.toContain("Partner prompts");
  });

  it("tells the model statements aren't follow-ups", () => {
    expect(DOCUMENT_SYSTEM_PROMPT).toContain("Statements are facts, not things to ask about");
  });
});

describe("readDocument", () => {
  it("works through an OpenAI-compatible server", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.response_format.json_schema.name).toBe("document");
      expect(body.messages[0].content).toBe(DOCUMENT_SYSTEM_PROMPT);
      return Response.json({ choices: [{ message: { content: JSON.stringify(doc) } }] });
    });
    const extractor = new OpenAiCompatibleExtractor({ baseUrl: "http://x/v1", model: "m", fetch: fetchMock as typeof fetch });
    expect(await extractor.readDocument(input)).toEqual(doc);
  });

  it("works through Claude", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [{ type: "text", text: JSON.stringify(doc) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
    );
    const extractor = new AnthropicExtractor({ apiKey: "test", fetch: fetchMock as typeof fetch });
    expect(await extractor.readDocument(input)).toEqual(doc);
  });
});
