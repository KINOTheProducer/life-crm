import { describe, expect, it, vi } from "vitest";
import { isPrivateAddress } from "./address";
import { createImmichClient, ImmichError, normalizeBaseUrl } from "./client";

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => handler(String(url), init ?? {})) as unknown as typeof fetch;
}

const asset = (id: string, local: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "IMAGE",
  originalFileName: `${id}.jpg`,
  localDateTime: `${local}.000Z`,
  exifInfo: { city: "Negril", country: "Jamaica" },
  ...extra,
});

describe("normalizeBaseUrl", () => {
  it("strips trailing slashes and /api", () => {
    expect(normalizeBaseUrl("https://photos.example.com/api/")).toBe("https://photos.example.com");
    expect(normalizeBaseUrl(" http://192.168.1.10:2283/ ")).toBe("http://192.168.1.10:2283");
    expect(normalizeBaseUrl("https://example.com/immich")).toBe("https://example.com/immich");
  });

  it("rejects other schemes", () => {
    expect(() => normalizeBaseUrl("file:///etc/passwd")).toThrow(ImmichError);
  });
});

describe("client", () => {
  it("sends the API key and reads the user", async () => {
    const f = fakeFetch((url, init) => {
      expect(url).toBe("https://p.example.com/api/users/me");
      expect((init.headers as Record<string, string>)["x-api-key"]).toBe("k");
      return Response.json({ id: "u1", name: "Anthony", email: "a@example.com" });
    });
    await expect(createImmichClient({ baseUrl: "https://p.example.com", apiKey: "k", fetch: f }).me()).resolves.toMatchObject({ name: "Anthony" });
  });

  it("explains a bad key", async () => {
    const f = fakeFetch(() => new Response("no", { status: 401 }));
    await expect(createImmichClient({ baseUrl: "https://p.example.com", apiKey: "k", fetch: f }).me()).rejects.toThrow("rejected the API key");
  });

  it("finds photos by local date, widening the UTC window and trimming back", async () => {
    let body: Record<string, unknown> = {};
    const f = fakeFetch((url, init) => {
      expect(url).toBe("https://p.example.com/api/search/metadata");
      body = JSON.parse(String(init.body));
      return Response.json({
        assets: {
          items: [
            asset("before", "2025-03-09T23:59:00"),
            asset("a", "2025-03-10T08:00:00"),
            asset("b", "2025-03-16T21:00:00"),
            asset("trashed", "2025-03-12T10:00:00", { isTrashed: true }),
            asset("archived", "2025-03-12T10:00:00", { visibility: "archive" }),
            asset("after", "2025-03-17T00:30:00"),
          ],
          nextPage: "2",
        },
      });
    });
    const page = await createImmichClient({ baseUrl: "https://p.example.com", apiKey: "k", fetch: f }).takenBetween("2025-03-10", "2025-03-16");
    expect(body).toMatchObject({ takenAfter: "2025-03-09T00:00:00.000Z", takenBefore: "2025-03-18T00:00:00.000Z", page: 1 });
    expect(page.assets.map((a) => a.id)).toEqual(["a", "b"]);
    expect(page.assets[0]).toMatchObject({ localDateTime: "2025-03-10T08:00:00", city: "Negril", country: "Jamaica" });
    expect(page.nextPage).toBe(2);
  });

  it("reports an unreachable server", async () => {
    const f = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    await expect(createImmichClient({ baseUrl: "https://p.example.com", apiKey: "k", fetch: f }).me()).rejects.toThrow("Couldn't reach Immich");
  });
});

describe("isPrivateAddress", () => {
  it("flags private and loopback ranges", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.10", "169.254.169.254", "100.100.1.1", "::1", "fd00::1", "::ffff:10.0.0.1"])
      expect(isPrivateAddress(ip), ip).toBe(true);
  });

  it("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "100.128.0.1", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});
