import { describe, expect, it, vi } from "vitest";
import { AnthropicExtractor } from "./anthropic";
import type { Extraction, KnownPerson } from "./extraction";
import { sanitizeExtraction } from "./extraction";
import { OpenAiCompatibleExtractor } from "./openai-compatible";
import { noEmDashes } from "./types";
import { extractionProgress, mentionedPeople, mentionLine, parsePartialJson, type PartialExtraction } from "./progress";

const knownPeople: KnownPerson[] = [
  { id: "c-sarah", name: "Sarah Chen" },
  { id: "c-mike", name: "Michael Ross", nickname: "Mikey" },
  { id: "c-al", name: "Al Smith" },
];

const extraction: Extraction = {
  people: [
    {
      ref: "p1",
      existingContactId: "c-sarah",
      firstName: "Sarah",
      lastName: "Chen",
      nickname: null,
      pronouns: null,
      birthday: null,
      howMet: null,
      facts: [
        { category: "work", label: "Job", value: "Nurse at Sunnybrook" },
        { category: "follow_up", label: "Ask about", value: "How the marathon went" },
      ],
      note: null,
    },
    {
      ref: "p2",
      existingContactId: null,
      firstName: "Priya",
      lastName: null,
      nickname: null,
      pronouns: null,
      birthday: { month: 3, day: 3, year: null },
      howMet: "Through Sarah",
      facts: [],
      note: "Just moved back from Calgary.",
    },
  ],
  interaction: { type: "video", date: "2026-10-18", location: null, summary: "Discord call.", participantRefs: ["p1", "p2"] },
};

const opts = { knownPeople, today: "2026-10-19" };

describe("parsePartialJson", () => {
  it("leaves out strings that are still being written", () => {
    expect(parsePartialJson('{"people":[{"ref":"p1","firstName":"Sar')).toEqual({ people: [{ ref: "p1" }] });
  });

  it("returns null for nothing or junk", () => {
    expect(parsePartialJson("")).toBeNull();
    expect(parsePartialJson("[1,")).toBeNull();
  });
});

describe("extractionProgress", () => {
  it("describes a finished extraction", () => {
    expect(extractionProgress(extraction, opts)).toEqual([
      "Found Sarah Chen in your people",
      "Sarah's job: Nurse at Sunnybrook",
      "To ask Sarah about: How the marathon went",
      "Priya is someone new",
      "Priya's birthday: Mar 3",
      "How you met Priya: Through Sarah",
      "Writing a note on Priya",
      "Logging a video call with Sarah and Priya yesterday",
    ]);
  });

  it("grows as the JSON streams in", () => {
    const json = JSON.stringify(extraction);
    let previous: string[] = [];
    for (let i = 1; i <= json.length; i++) {
      // Every earlier line is still there, word for word: nothing half-written is shown. The
      // catch-up line is the exception: it names people as their refs come in.
      const lines = extractionProgress(parsePartialJson(json.slice(0, i)) as PartialExtraction, opts).filter((l) => !l.startsWith("Logging"));
      expect(lines.slice(0, previous.length)).toEqual(previous.slice(0, lines.length));
      previous = lines;
    }
    expect(previous).toEqual(extractionProgress(extraction, opts).slice(0, -1));
  });

  it("waits for the birthday to be settled", () => {
    const partial = { people: [{ ref: "p1", existingContactId: null, firstName: "Priya", birthday: { month: 1, day: 1 } }] };
    expect(extractionProgress(partial, opts)).toEqual(["Priya is someone new"]);
  });

  it("treats a made-up contact id as someone new", () => {
    expect(extractionProgress({ people: [{ ref: "p1", existingContactId: "nope", firstName: "Jo" }] }, opts)).toEqual(["Jo is someone new"]);
  });
});

describe("mentionedPeople", () => {
  it("finds known people by first name, full name or nickname", () => {
    expect(mentionedPeople("Called Sarah's mom, then Mikey came by", knownPeople)).toEqual(["Sarah", "Mikey"]);
    expect(mentionedPeople("michael ross said hi", knownPeople)).toEqual(["Michael"]);
  });

  it("doesn't match inside other words", () => {
    expect(mentionedPeople("Sarahs and almonds", knownPeople)).toEqual([]);
  });

  it("phrases the first line", () => {
    expect(mentionLine([])).toBe("Picking out who you talked about");
    expect(mentionLine(["Sarah", "Mike", "Al", "Jo"])).toBe("Sounds like this is about Sarah, Mike and 2 others");
  });
});

const input = { transcript: "Discord call with Sarah", today: "2026-10-19", timeZone: "America/Toronto", knownPeople };
const sse = (chunks: string[]) =>
  new Response(chunks.map((c) => `data: ${c}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });

describe("streaming extraction", () => {
  it("streams partial results from an OpenAI-compatible server", async () => {
    const json = JSON.stringify(extraction);
    const parts = [json.slice(0, 120), json.slice(120, 400), json.slice(400)];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body)).stream).toBe(true);
      return sse([...parts.map((p) => JSON.stringify({ choices: [{ delta: { content: p } }] })), "[DONE]"]);
    });
    const seen: PartialExtraction[] = [];
    const extractor = new OpenAiCompatibleExtractor({ baseUrl: "http://x/v1", model: "m", fetch: fetchMock as typeof fetch });
    const out = await extractor.extract(input, (p) => seen.push(p));
    expect(seen).toHaveLength(3);
    expect(out.people[0]!.firstName).toBe("Sarah");
  });

  it("reads a plain JSON reply when the server doesn't stream", async () => {
    const fetchMock = vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify(extraction) } }] }));
    const extractor = new OpenAiCompatibleExtractor({ baseUrl: "http://x/v1", model: "m", fetch: fetchMock as typeof fetch });
    expect((await extractor.extract(input, () => {})).interaction?.type).toBe("video");
  });

  it("streams partial results from Claude", async () => {
    const json = JSON.stringify(extraction);
    const event = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
    const body = [
      event("message_start", {
        message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } },
      }),
      event("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
      event("content_block_delta", { index: 0, delta: { type: "text_delta", text: json.slice(0, 200) } }),
      event("content_block_delta", { index: 0, delta: { type: "text_delta", text: json.slice(200) } }),
      event("content_block_stop", { index: 0 }),
      event("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 50 } }),
      event("message_stop", {}),
    ].join("");
    const fetchMock = vi.fn(async () => new Response(body, { headers: { "content-type": "text/event-stream" } }));
    const seen: PartialExtraction[] = [];
    const extractor = new AnthropicExtractor({ apiKey: "test", fetch: fetchMock as typeof fetch });
    const out = await extractor.extract(input, (p) => seen.push(p));
    expect(seen).toHaveLength(2);
    expect(out).toEqual(extraction);
  });
});

describe("noEmDashes", () => {
  it("swaps em dashes for commas, wherever the model puts them", () => {
    expect(noEmDashes("Sarah — a nurse — ran a marathon")).toBe("Sarah, a nurse, ran a marathon");
    expect(noEmDashes("Nurse—Sunnybrook")).toBe("Nurse, Sunnybrook");
    expect(noEmDashes("— just this")).toBe("just this");
  });

  it("cleans every string in an extraction", () => {
    const dashed = { ...extraction, interaction: { ...extraction.interaction!, summary: "Discord call — caught up" } };
    expect(sanitizeExtraction(dashed, input).interaction?.summary).toBe("Discord call, caught up");
  });
});
