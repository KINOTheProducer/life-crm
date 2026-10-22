import { describe, expect, it, vi } from "vitest";
import { assistantFor } from "./config";
import { listAnthropicModels, listOpenAiCompatibleModels, speechModelsFirst } from "./models";

describe("listOpenAiCompatibleModels", () => {
  it("reads /models, dedupes and sorts", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("http://ollama:11434/v1/models");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer k");
      return Response.json({ object: "list", data: [{ id: "qwen2.5vl:7b" }, { id: "llama3.1" }, { id: "llama3.1" }] });
    });
    const out = await listOpenAiCompatibleModels({ baseUrl: "http://ollama:11434/v1/", apiKey: "k", fetch: fetchMock as typeof fetch });
    expect(out.map((m) => m.id)).toEqual(["llama3.1", "qwen2.5vl:7b"]);
  });

  it("says when the key is refused", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 401 }));
    await expect(listOpenAiCompatibleModels({ baseUrl: "http://x/v1", fetch: fetchMock as typeof fetch })).rejects.toThrow("API key");
  });
});

describe("listAnthropicModels", () => {
  it("pages through the Models API", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const after = new URL(String(url)).searchParams.get("after_id");
      return Response.json(
        after
          ? { data: [{ type: "model", id: "claude-haiku-5-5", display_name: "Claude Haiku 5.5", created_at: "2026-01-01T00:00:00Z" }], has_more: false, first_id: "claude-haiku-5-5", last_id: "claude-haiku-5-5" }
          : { data: [{ type: "model", id: "claude-opus-5-5", display_name: "Claude Opus 5.5", created_at: "2026-01-01T00:00:00Z" }], has_more: true, first_id: "claude-opus-5-5", last_id: "claude-opus-5-5" },
      );
    });
    const out = await listAnthropicModels({ apiKey: "test", fetch: fetchMock as typeof fetch });
    expect(out).toEqual([
      { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
    ]);
  });
});

describe("speechModelsFirst", () => {
  it("keeps transcription models, or everything if none look like one", () => {
    const all = ["gpt-4o", "whisper-1", "gpt-4o-mini-transcribe", "tts-1"].map((id) => ({ id, label: id }));
    expect(speechModelsFirst(all).map((m) => m.id)).toEqual(["whisper-1", "gpt-4o-mini-transcribe"]);
    expect(speechModelsFirst([{ id: "x", label: "x" }])).toHaveLength(1);
  });
});

describe("assistantFor", () => {
  it("uses the chat model when set", () => {
    expect((assistantFor({ provider: "openai_compatible", baseUrl: "http://x/v1", model: "small", chatModel: "big" }) as unknown as { config: { model: string } }).config.model).toBe("big");
    expect((assistantFor({ provider: "openai_compatible", baseUrl: "http://x/v1", model: "small" }) as unknown as { config: { model: string } }).config.model).toBe("small");
  });
});
