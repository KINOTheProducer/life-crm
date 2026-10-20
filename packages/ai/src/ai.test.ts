import { describe, expect, it, vi } from "vitest";
import { AnthropicExtractor } from "./anthropic";
import { sanitizeExtraction, type Extraction, type ExtractionInput } from "./extraction";
import { OpenAiCompatibleExtractor, OpenAiCompatibleTranscriber } from "./openai-compatible";
import { buildExtractionMessage } from "./prompt";

const input: ExtractionInput = {
  transcript: "Had dinner with Sarah yesterday, she's starting at Sunnybrook. Met her friend Priya, birthday March 3rd.",
  today: "2026-10-19",
  timeZone: "America/Toronto",
  knownPeople: [{ id: "c-sarah", name: "Sarah Chen" }],
};

const extraction: Extraction = {
  people: [
    {
      ref: "p1",
      existingContactId: "c-sarah",
      firstName: "Sarah",
      lastName: null,
      nickname: null,
      pronouns: null,
      birthday: null,
      howMet: null,
      facts: [{ category: "work", label: "Job", value: "Starting at Sunnybrook" }],
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
      note: null,
    },
  ],
  interaction: {
    type: "in_person",
    date: "2026-10-18",
    location: null,
    summary: "Dinner with Sarah and Priya.",
    participantRefs: ["p1", "p2"],
  },
};

describe("sanitizeExtraction", () => {
  it("keeps valid output untouched", () => {
    expect(sanitizeExtraction(extraction, input)).toEqual(extraction);
  });

  it("drops unknown contact ids, bad birthdays, dangling refs and bad dates", () => {
    const messy: Extraction = {
      people: [
        { ...extraction.people[0]!, existingContactId: "made-up" },
        { ...extraction.people[1]!, birthday: { month: 2, day: 30, year: null } },
      ],
      interaction: { ...extraction.interaction!, date: "yesterday", participantRefs: ["p1", "p9"] },
    };
    const clean = sanitizeExtraction(messy, input);
    expect(clean.people[0]!.existingContactId).toBeNull();
    expect(clean.people[1]!.birthday).toBeNull();
    expect(clean.interaction).toMatchObject({ date: "2026-10-19", participantRefs: ["p1"] });
  });

  it("never maps two people to the same contact", () => {
    const dup: Extraction = {
      people: [extraction.people[0]!, { ...extraction.people[1]!, existingContactId: "c-sarah" }],
      interaction: null,
    };
    const clean = sanitizeExtraction(dup, input);
    expect(clean.people.map((p) => p.existingContactId)).toEqual(["c-sarah", null]);
  });

  it("drops the interaction when no participant remains", () => {
    const lonely: Extraction = { ...extraction, interaction: { ...extraction.interaction!, participantRefs: ["p7"] } };
    expect(sanitizeExtraction(lonely, input).interaction).toBeNull();
  });
});

describe("buildExtractionMessage", () => {
  it("includes date, known people and transcript", () => {
    const msg = buildExtractionMessage({ ...input, contextPerson: { id: "c-sarah", name: "Sarah Chen" } });
    expect(msg).toContain("Today is 2026-10-19 (America/Toronto)");
    expect(msg).toContain("- c-sarah: Sarah Chen");
    expect(msg).toContain("Context person: c-sarah: Sarah Chen");
    expect(msg).toContain(input.transcript);
  });
});

describe("OpenAiCompatibleExtractor", () => {
  it("requests a strict JSON schema and validates the reply", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("llama3.1");
      expect(body.response_format.type).toBe("json_schema");
      expect(body.response_format.json_schema.schema.$schema).toBeUndefined();
      return Response.json({ choices: [{ message: { content: JSON.stringify(extraction) } }] });
    });
    const extractor = new OpenAiCompatibleExtractor({
      baseUrl: "http://ollama:11434/v1/",
      model: "llama3.1",
      fetch: fetchMock as typeof fetch,
    });
    expect(await extractor.extract(input)).toEqual(extraction);
    expect(String(fetchMock.mock.calls[0]![0])).toBe("http://ollama:11434/v1/chat/completions");
  });

  it("rejects output that doesn't match the schema", async () => {
    const fetchMock = vi.fn(async () => Response.json({ choices: [{ message: { content: '{"people": "nope"}' } }] }));
    const extractor = new OpenAiCompatibleExtractor({ baseUrl: "http://x/v1", model: "m", fetch: fetchMock as typeof fetch });
    await expect(extractor.extract(input)).rejects.toThrow("expected format");
  });
});

describe("OpenAiCompatibleTranscriber", () => {
  it("posts multipart audio and returns trimmed text", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const form = init?.body as FormData;
      expect(form.get("model")).toBe("whisper-1");
      expect((form.get("file") as File).name).toBe("note.webm");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer k");
      return Response.json({ text: "  hello there \n" });
    });
    const t = new OpenAiCompatibleTranscriber({ baseUrl: "http://stt/v1", apiKey: "k", model: "whisper-1", fetch: fetchMock as typeof fetch });
    expect(await t.transcribe(new Uint8Array([1, 2, 3]), "audio/webm;codecs=opus")).toBe("hello there");
  });
});

describe("AnthropicExtractor", () => {
  it("sends structured output config with fallbacks and parses the reply", async () => {
    let sent: Record<string, unknown> = {};
    let betaHeader: string | null = null;
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      betaHeader = new Headers(init?.headers).get("anthropic-beta");
      return Response.json({
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [{ type: "text", text: JSON.stringify(extraction) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      });
    });
    const extractor = new AnthropicExtractor({ apiKey: "test", fetch: fetchMock as typeof fetch });
    expect(await extractor.extract(input)).toEqual(extraction);
    expect(sent.model).toBe("claude-opus-5-5");
    expect(sent.fallbacks).toBe("default");
    expect(betaHeader).toContain("server-side-fallback-2026-07-01");
    expect((sent.output_config as { format: { type: string } }).format.type).toBe("json_schema");
  });

  it("surfaces refusals", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        id: "msg_2",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [],
        stop_reason: "refusal",
        stop_sequence: null,
        stop_details: { type: "refusal", category: null, explanation: null },
        usage: { input_tokens: 10, output_tokens: 0 },
      }),
    );
    const extractor = new AnthropicExtractor({ apiKey: "test", fetch: fetchMock as typeof fetch });
    await expect(extractor.extract(input)).rejects.toThrow("declined");
  });
});
