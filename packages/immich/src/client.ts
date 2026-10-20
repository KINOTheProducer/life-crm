import { z } from "zod";

/**
 * Minimal Immich API client. Every call is server-side with the user's API key in
 * `x-api-key`; the key and the Immich URL never reach the browser.
 */

export class ImmichError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "ImmichError";
  }
}

export interface ImmichConfig {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface ImmichAsset {
  id: string;
  type: "IMAGE" | "VIDEO" | "AUDIO" | "OTHER";
  fileName: string;
  /** When it was taken, in the camera's local time: "2024-03-02T14:05:00". */
  localDateTime: string | null;
  city: string | null;
  country: string | null;
}

export interface ImmichPerson {
  id: string;
  name: string;
  /** "1990-04-12" when set in Immich. */
  birthDate: string | null;
  isHidden: boolean;
}

export interface SearchPage {
  assets: ImmichAsset[];
  nextPage: number | null;
}

/** "https://photos.example.com/api/" and "https://photos.example.com" both become the latter. */
export function normalizeBaseUrl(input: string): string {
  const url = new URL(input.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ImmichError("Use an http or https address", null);
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/api$/, "");
  return url.toString().replace(/\/+$/, "");
}

const assetSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    originalFileName: z.string().optional(),
    localDateTime: z.string().nullish(),
    fileCreatedAt: z.string().nullish(),
    isTrashed: z.boolean().optional(),
    isArchived: z.boolean().optional(),
    visibility: z.string().optional(),
    exifInfo: z.object({ city: z.string().nullish(), country: z.string().nullish() }).nullish(),
  })
  .loose();

const searchSchema = z.object({
  assets: z.object({
    items: z.array(assetSchema),
    nextPage: z.union([z.string(), z.number()]).nullish(),
  }),
});

const personSchema = z
  .object({ id: z.string(), name: z.string().nullish(), birthDate: z.string().nullish(), isHidden: z.boolean().optional() })
  .loose();

const toPerson = (p: z.infer<typeof personSchema>): ImmichPerson => ({
  id: p.id,
  name: p.name ?? "",
  birthDate: p.birthDate ? p.birthDate.slice(0, 10) : null,
  isHidden: p.isHidden ?? false,
});

const hidden = new Set(["archive", "hidden", "locked"]);

function toAsset(a: z.infer<typeof assetSchema>): ImmichAsset | null {
  if (a.isTrashed || a.isArchived || (a.visibility && hidden.has(a.visibility))) return null;
  const local = a.localDateTime ?? a.fileCreatedAt ?? null;
  return {
    id: a.id,
    type: (["IMAGE", "VIDEO", "AUDIO"].includes(a.type) ? a.type : "OTHER") as ImmichAsset["type"],
    fileName: a.originalFileName ?? "",
    // Immich stores local time with a fake "Z"; keep the wall-clock part.
    localDateTime: local ? local.slice(0, 19) : null,
    city: a.exifInfo?.city ?? null,
    country: a.exifInfo?.country ?? null,
  };
}

function toPage(json: unknown): SearchPage {
  const parsed = searchSchema.safeParse(json);
  if (!parsed.success) throw new ImmichError("Unexpected response from Immich", null);
  const next = parsed.data.assets.nextPage;
  return {
    assets: parsed.data.assets.items.map(toAsset).filter((a): a is ImmichAsset => a !== null),
    nextPage: next == null ? null : Number(next),
  };
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function createImmichClient(config: ImmichConfig) {
  const base = normalizeBaseUrl(config.baseUrl);
  const doFetch = config.fetch ?? fetch;
  const timeoutMs = config.timeoutMs ?? 15_000;

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    let res: Response;
    try {
      res = await doFetch(`${base}/api${path}`, {
        ...init,
        headers: { "x-api-key": config.apiKey, accept: "application/json", ...init.headers },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      throw new ImmichError(timedOut ? "Immich took too long to answer" : "Couldn't reach Immich at that address", null);
    }
    if (res.status === 401 || res.status === 403) throw new ImmichError("Immich rejected the API key", res.status);
    if (res.status === 404) throw new ImmichError("Not found on Immich", 404);
    if (!res.ok) throw new ImmichError(`Immich returned ${res.status}`, res.status);
    return res;
  }

  async function json(path: string, init?: RequestInit) {
    const res = await request(path, init);
    try {
      return await res.json();
    } catch {
      throw new ImmichError("That doesn't look like an Immich server", null);
    }
  }

  const post = (path: string, body: unknown) =>
    json(path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

  /**
   * Photos and videos taken between two calendar dates (inclusive), by the camera's local date.
   * Immich filters in UTC, so ask for a day either side and trim locally.
   */
  async function takenBetween(
    from: string,
    to: string,
    opts: { page?: number; size?: number; personIds?: string[] } = {},
  ): Promise<SearchPage> {
    const page = toPage(
      await post("/search/metadata", {
        takenAfter: addDays(from, -1),
        takenBefore: addDays(to, 2),
        ...(opts.personIds?.length ? { personIds: opts.personIds } : {}),
        page: opts.page ?? 1,
        size: opts.size ?? 100,
        order: "asc",
        withExif: true,
      }),
    );
    return {
      ...page,
      assets: page.assets.filter((a) => {
        const day = a.localDateTime?.slice(0, 10);
        return day != null && day >= from && day <= to;
      }),
    };
  }

  /** Immich's CLIP search ("beach at sunset"). Needs machine learning enabled on the server. */
  async function smartSearch(query: string, opts: { page?: number; size?: number } = {}): Promise<SearchPage> {
    return toPage(await post("/search/smart", { query, page: opts.page ?? 1, size: opts.size ?? 100, withExif: true }));
  }

  /**
   * Photos with every one of these people in them, newest first. One id is "photos of them";
   * their id plus yours is "photos together".
   */
  async function withPeople(personIds: string[], opts: { page?: number; size?: number } = {}): Promise<SearchPage> {
    return toPage(await post("/search/metadata", { personIds, page: opts.page ?? 1, size: opts.size ?? 50, order: "desc", withExif: true }));
  }

  return {
    baseUrl: base,
    withPeople,

    /** Who the key belongs to. Used to test a connection. */
    async me(): Promise<{ id: string; name: string; email: string }> {
      const parsed = z.object({ id: z.string(), name: z.string(), email: z.string() }).safeParse(await json("/users/me"));
      if (!parsed.success) throw new ImmichError("That doesn't look like an Immich server", null);
      return parsed.data;
    },

    takenBetween,
    smartSearch,

    async asset(id: string): Promise<ImmichAsset | null> {
      return toAsset(assetSchema.parse(await json(`/assets/${encodeURIComponent(id)}`)));
    },

    /** Face clusters Immich has found, most photographed first. Hidden people are left out. */
    async people(opts: { page?: number; size?: number } = {}): Promise<{ people: ImmichPerson[]; hasNextPage: boolean }> {
      const parsed = z
        .object({ people: z.array(personSchema), hasNextPage: z.boolean().optional() })
        .safeParse(await json(`/people?withHidden=false&page=${opts.page ?? 1}&size=${opts.size ?? 500}`));
      if (!parsed.success) throw new ImmichError("Unexpected response from Immich", null);
      return { people: parsed.data.people.map(toPerson).filter((p) => !p.isHidden), hasNextPage: parsed.data.hasNextPage ?? false };
    },

    async person(id: string): Promise<ImmichPerson> {
      return toPerson(personSchema.parse(await json(`/people/${encodeURIComponent(id)}`)));
    },

    /** How many photos and videos a person appears in. */
    async personAssetCount(id: string): Promise<number> {
      const parsed = z.object({ assets: z.number() }).safeParse(await json(`/people/${encodeURIComponent(id)}/statistics`));
      return parsed.success ? parsed.data.assets : 0;
    },

    /** Name a face in Immich. Needs the key to allow updating people. */
    async renamePerson(id: string, name: string): Promise<void> {
      await request(`/people/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify({ name }),
        headers: { "content-type": "application/json" },
      });
    },

    async personThumbnail(id: string): Promise<Response> {
      return request(`/people/${encodeURIComponent(id)}/thumbnail`, { headers: { accept: "image/*" } });
    },

    /** Raw image response for a thumbnail ("thumbnail", ~250px) or preview (~1440px). */
    async thumbnail(id: string, size: "thumbnail" | "preview" = "thumbnail"): Promise<Response> {
      return request(`/assets/${encodeURIComponent(id)}/thumbnail?size=${size}`, { headers: { accept: "image/*" } });
    },
  };
}

export type ImmichClient = ReturnType<typeof createImmichClient>;
