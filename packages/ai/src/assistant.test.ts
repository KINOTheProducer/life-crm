import { describe, expect, it, vi } from "vitest";
import {
  AnthropicAssistant,
  buildAskMessage,
  OpenAiCompatibleAssistant,
  sanitizeAnswer,
  sanitizeSummary,
  type Source,
} from "./assistant";

const sources: Source[] = [
  { ref: "F1", person: "Sarah Chen", text: "Work: Nurse at Sunnybrook" },
  { ref: "I1", person: "Sarah Chen", date: "2026-10-04", text: "Dinner at Pai. She has a job interview at SickKids next week." },
];

const claudeReply = (payload: unknown) =>
  Response.json({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text: JSON.stringify(payload) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  });

describe("sanitizeSummary", () => {
  it("drops made-up refs and empty items, keeps at most five", () => {
    const clean = sanitizeSummary(
      {
        summary: "  Your friend from nursing school. ",
        askAbout: [
          { text: "The SickKids interview", ref: "I1" },
          { text: "Her trip", ref: "X9" },
          { text: " ", ref: null },
          ...Array.from({ length: 6 }, (_, i) => ({ text: `thing ${i}`, ref: null })),
        ],
      },
      sources,
    );
    expect(clean.summary).toBe("Your friend from nursing school.");
    expect(clean.askAbout[0]).toEqual({ text: "The SickKids interview", ref: "I1" });
    expect(clean.askAbout[1]).toEqual({ text: "Her trip", ref: null });
    expect(clean.askAbout).toHaveLength(5);
  });
});

describe("sanitizeAnswer", () => {
  it("keeps only real refs, once each", () => {
    expect(sanitizeAnswer({ answer: "At Sunnybrook.", refs: ["F1", "F1", "N7"] }, sources)).toEqual({ answer: "At Sunnybrook.", refs: ["F1"] });
  });
});

describe("buildAskMessage", () => {
  it("numbers sources with date and person, question last", () => {
    const msg = buildAskMessage({ question: "Where does Sarah work?", sources, today: "2026-10-21" });
    expect(msg).toContain("[I1] 2026-10-04 (Sarah Chen): Dinner at Pai.");
    expect(msg.trimEnd().endsWith("Question: Where does Sarah work?")).toBe(true);
  });
});

describe("AnthropicAssistant", () => {
  it("asks with structured output and fallbacks", async () => {
    let sent: Record<string, unknown> = {};
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return claudeReply({ answer: "She's a nurse at Sunnybrook.", refs: ["F1", "Z1"] });
    });
    const assistant = new AnthropicAssistant({ apiKey: "test", fetch: fetchMock as typeof fetch });
    const out = await assistant.ask({ question: "Where does Sarah work?", sources, today: "2026-10-21" });
    expect(out).toEqual({ answer: "She's a nurse at Sunnybrook.", refs: ["F1"] });
    expect(sent.fallbacks).toBe("default");
    expect((sent.output_config as { effort: string }).effort).toBe("medium");
  });

  it("summarizes", async () => {
    const fetchMock = vi.fn(async () => claudeReply({ summary: "Your friend Sarah.", askAbout: [{ text: "The interview", ref: "I1" }] }));
    const assistant = new AnthropicAssistant({ apiKey: "test", fetch: fetchMock as typeof fetch });
    expect(await assistant.summarize({ person: "Sarah Chen, friend", sources, today: "2026-10-21" })).toEqual({
      summary: "Your friend Sarah.",
      askAbout: [{ text: "The interview", ref: "I1" }],
    });
  });
});

describe("OpenAiCompatibleAssistant", () => {
  it("requests a strict schema and rejects bad output", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.response_format.json_schema.name).toBe("answer");
      expect(body.response_format.json_schema.schema.$schema).toBeUndefined();
      return Response.json({ choices: [{ message: { content: '{"answer": 3}' } }] });
    });
    const assistant = new OpenAiCompatibleAssistant({ baseUrl: "http://x/v1", model: "m", fetch: fetchMock as typeof fetch });
    await expect(assistant.ask({ question: "?", sources, today: "2026-10-21" })).rejects.toThrow("expected format");
  });
});
