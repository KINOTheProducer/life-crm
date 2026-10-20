import { describe, expect, it, vi } from "vitest";
import { OpenAiCompatibleCardReader, type CardExtraction } from "./card";

const card: CardExtraction = {
  firstName: "Holly",
  lastName: "Chen",
  jobTitle: "Registered Nurse",
  company: "Sunnybrook",
  phones: [{ label: "mobile", value: "416 555 0123" }],
  emails: ["holly@example.com"],
  websites: [],
  socials: [],
  address: null,
  other: null,
};

describe("OpenAiCompatibleCardReader", () => {
  it("sends the images as data URLs and parses the card", async () => {
    let body: { messages: { content: unknown }[]; response_format: { type: string } } | undefined;
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init!.body));
      return Response.json({ choices: [{ message: { content: JSON.stringify(card) } }] });
    }) as unknown as typeof globalThis.fetch;
    const reader = new OpenAiCompatibleCardReader({ baseUrl: "http://llm.local/v1/", model: "qwen-vl", fetch });
    const out = await reader.read([
      { data: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" },
      { data: new Uint8Array([4]), mimeType: "image/png" },
    ]);
    expect(out).toEqual(card);
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe("http://llm.local/v1/chat/completions");
    const parts = body!.messages[1]!.content as { type: string; image_url?: { url: string }; text?: string }[];
    expect(parts.map((p) => p.type)).toEqual(["image_url", "image_url", "text"]);
    expect(parts[0]!.image_url!.url).toBe("data:image/jpeg;base64,AQID");
    expect(parts[2]!.text).toContain("Front and back");
    expect(body!.response_format.type).toBe("json_schema");
  });

  it("explains a model that can't do images", async () => {
    const fetch = vi.fn(async () => Response.json({ choices: [{ message: { content: "Sorry, I can't see images." } }] })) as unknown as typeof globalThis.fetch;
    const reader = new OpenAiCompatibleCardReader({ baseUrl: "http://llm.local/v1", model: "llama", fetch });
    await expect(reader.read([{ data: new Uint8Array([1]), mimeType: "image/jpeg" }])).rejects.toThrow("may not support images");
  });
});
