import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const { fake } = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  return {
    fake: {
      store,
      set: vi.fn(async (k: string, v: string, o?: { nx?: boolean; ex?: number }) => {
        if (o?.nx && store.has(k)) return null;
        store.set(k, v);
        return "OK";
      }),
      del: vi.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
      sadd: vi.fn(async (k: string, ...members: string[]) => {
        const s = (store.get(k) as Set<string>) ?? new Set<string>();
        members.forEach((m) => s.add(m));
        store.set(k, s);
        return members.length;
      }),
      smismember: vi.fn(async (k: string, members: string[]) => {
        const s = (store.get(k) as Set<string>) ?? new Set<string>();
        return members.map((m) => (s.has(m) ? 1 : 0));
      }),
    },
  };
});

vi.mock("./redis", () => ({ redis: fake, usingUpstash: true }));

const { sitemapFixture } = vi.hoisted(() => ({ sitemapFixture: { override: null as null | Array<{ url: string; lastModified?: string }> } }));

vi.mock("./seoRoutes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./seoRoutes")>();
  return { ...actual, buildSitemapEntries: () => sitemapFixture.override ?? actual.buildSitemapEntries() };
});

const { submitDailyIndexNow, INDEXNOW_KEY, INDEXNOW_ENDPOINT } = await import("./indexNow");
const { buildSitemapEntries } = await import("./seoRoutes");

const SUBMITTED = "curio:digest:indexnow:submitted";
const ok = (status = 200) => vi.fn(async () => new Response(null, { status }));
const redisCalls = () =>
  fake.set.mock.calls.length + fake.del.mock.calls.length + fake.sadd.mock.calls.length + fake.smismember.mock.calls.length;

let log: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  fake.store.clear();
  sitemapFixture.override = null;
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("CURIO_SITE_URL", "https://curio.example");
  log = vi.spyOn(console, "log").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  log.mockRestore();
  error.mockRestore();
  vi.unstubAllEnvs();
});

describe("submitDailyIndexNow", () => {
  it("skips outside production: no fetch, no Redis", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const fetcher = ok();
    expect(await submitDailyIndexNow("custard", "2026-10-13", { fetcher })).toBe("skipped");
    expect(fetcher).not.toHaveBeenCalled();
    expect(redisCalls()).toBe(0);
  });

  it("skips when the site URL is not https", async () => {
    vi.stubEnv("CURIO_SITE_URL", "http://localhost:3000");
    const fetcher = ok();
    expect(await submitDailyIndexNow("custard", "2026-10-13", { fetcher })).toBe("skipped");
    expect(fetcher).not.toHaveBeenCalled();
    expect(redisCalls()).toBe(0);
  });

  it("first run posts today's pages plus the whole sitemap once and records it", async () => {
    const fetcher = ok();
    expect(await submitDailyIndexNow("custard", "2026-10-13", { fetcher })).toBe("submitted");

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(INDEXNOW_ENDPOINT);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.host).toBe("curio.example");
    expect(body.key).toBe(INDEXNOW_KEY);
    expect(body.keyLocation).toBe(`https://curio.example/${INDEXNOW_KEY}.txt`);
    const sitemap = buildSitemapEntries().map((e) => e.url);
    expect(body.urlList).toContain("https://curio.example/story/custard");
    expect(body.urlList).toContain("https://curio.example/");
    expect(body.urlList).toContain("https://curio.example/play");
    expect(body.urlList).toContain("https://curio.example/history");
    for (const u of sitemap) expect(body.urlList).toContain(u);
    expect(new Set(body.urlList).size).toBe(body.urlList.length);
    const ledger = fake.store.get(SUBMITTED) as Set<string>;
    for (const e of buildSitemapEntries()) expect(ledger.has(`${e.url}|${e.lastModified ?? ""}`)).toBe(true);
  });

  it("a second call the same day is already-ran", async () => {
    await submitDailyIndexNow("custard", "2026-10-13", { fetcher: ok() });
    const fetcher = ok();
    expect(await submitDailyIndexNow("custard", "2026-10-13", { fetcher })).toBe("already-ran");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("the next day sends only the four changing pages", async () => {
    await submitDailyIndexNow("custard", "2026-10-13", { fetcher: ok() });
    const fetcher = ok();
    expect(await submitDailyIndexNow("brunch", "2026-10-14", { fetcher })).toBe("submitted");
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.urlList.sort()).toEqual(
      [
        "https://curio.example/",
        "https://curio.example/play",
        "https://curio.example/history",
        "https://curio.example/story/brunch",
      ].sort()
    );
  });

  it("re-sends a page whose lastModified moved, plus the daily pages, and nothing else", async () => {
    const base = [
      { url: "https://curio.example/words", lastModified: "2026-10-01" },
      { url: "https://curio.example/story/a", lastModified: "2026-10-01" },
      { url: "https://curio.example/story/b", lastModified: "2026-10-01" },
    ];
    sitemapFixture.override = base;
    await submitDailyIndexNow("custard", "2026-10-13", { fetcher: ok() });

    sitemapFixture.override = [base[0], { ...base[1], lastModified: "2026-10-14" }, base[2]];
    const fetcher = ok();
    expect(await submitDailyIndexNow("brunch", "2026-10-14", { fetcher })).toBe("submitted");
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.urlList.sort()).toEqual(
      [
        "https://curio.example/",
        "https://curio.example/play",
        "https://curio.example/history",
        "https://curio.example/story/brunch",
        "https://curio.example/story/a",
      ].sort()
    );
    const ledger = fake.store.get(SUBMITTED) as Set<string>;
    expect(ledger.has("https://curio.example/story/a|2026-10-14")).toBe(true);
  });

  it("HTTP 429 fails, releases the day lock and leaves the ledger alone", async () => {
    expect(await submitDailyIndexNow("custard", "2026-10-13", { fetcher: ok(429) })).toBe("failed");
    expect(fake.store.has(SUBMITTED)).toBe(false);
    const retry = ok();
    expect(await submitDailyIndexNow("custard", "2026-10-13", { fetcher: retry })).toBe("submitted");
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("a throwing fetch fails softly, logs no raw error, key or URLs, and releases the lock", async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError("fetch failed: token=abc");
    });
    expect(await submitDailyIndexNow("custard", "2026-10-13", { fetcher })).toBe("failed");
    const logged = [...error.mock.calls, ...log.mock.calls].flat().map(String).join(" ");
    expect(logged).not.toContain("abc");
    expect(logged).not.toContain(INDEXNOW_KEY);
    expect(logged).not.toContain("https://curio.example/story");
    expect(fake.store.has("curio:digest:indexnow:2026-10-13")).toBe(false);
  });

  it("never throws when smismember rejects", async () => {
    fake.smismember.mockRejectedValueOnce(new Error("upstash down https://x.upstash.io token=zzz"));
    const fetcher = ok();
    await expect(submitDailyIndexNow("custard", "2026-10-13", { fetcher })).resolves.toBe("failed");
    expect(fetcher).not.toHaveBeenCalled();
    expect([...error.mock.calls].flat().map(String).join(" ")).not.toContain("zzz");
  });
});
