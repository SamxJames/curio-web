import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  return {
    fake: {
      store,
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      set: vi.fn(async (k: string, v: unknown) => (store.set(k, v), "OK")),
    },
  };
});
vi.mock("./redis", () => ({ redis: fake, usingUpstash: true }));

const { getMetaToken, REFRESH_AFTER_MS } = await import("./metaTokens");
const NOW = new Date("2026-10-01T10:00:00Z");
const refreshed = (token: string) =>
  new Response(JSON.stringify({ access_token: token, token_type: "bearer", expires_in: 5184000 }), { status: 200 });

beforeEach(() => {
  fake.store.clear();
  vi.clearAllMocks();
  vi.stubEnv("THREADS_ACCESS_TOKEN", "seed-threads");
  vi.stubEnv("INSTAGRAM_ACCESS_TOKEN", "seed-ig");
  vi.stubGlobal("fetch", vi.fn(async () => refreshed("fresh")));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getMetaToken outside production", () => {
  it("returns the env token and never touches Redis or the network", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(await getMetaToken("threads", NOW)).toBe("seed-threads");
    expect(fake.get).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is null when unconfigured", async () => {
    vi.stubEnv("THREADS_ACCESS_TOKEN", "");
    expect(await getMetaToken("threads", NOW)).toBeNull();
  });
});

describe("getMetaToken in production", () => {
  beforeEach(() => vi.stubEnv("VERCEL_ENV", "production"));

  it("seeds from env, refreshes straight away (age unknown), and stores the new token", async () => {
    expect(await getMetaToken("threads", NOW)).toBe("fresh");
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      "https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=seed-threads"
    );
    expect(fake.store.get("curio:social:token:threads")).toEqual({
      token: "fresh",
      refreshedAt: NOW.toISOString(),
      seed: "seed-threads",
    });
  });

  it("uses the stored token without refreshing while it's younger than a week", async () => {
    fake.store.set("curio:social:token:instagram", {
      token: "stored",
      refreshedAt: new Date(NOW.getTime() - REFRESH_AFTER_MS + 60_000).toISOString(),
      seed: "seed-ig",
    });
    expect(await getMetaToken("instagram", NOW)).toBe("stored");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refreshes Instagram via ig_refresh_token once a week old", async () => {
    fake.store.set("curio:social:token:instagram", {
      token: "stored",
      refreshedAt: new Date(NOW.getTime() - REFRESH_AFTER_MS - 1).toISOString(),
      seed: "seed-ig",
    });
    expect(await getMetaToken("instagram", NOW)).toBe("fresh");
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      "https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=stored"
    );
  });

  it("keeps the current token if the refresh fails, logging no token", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("{}", { status: 400 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await getMetaToken("threads", NOW)).toBe("seed-threads");
    const logged = warn.mock.calls.flat().map(String).join(" ");
    warn.mockRestore();
    expect(logged).toContain("[curio:threads] token refresh failed");
    expect(logged).not.toContain("seed-threads");
  });

  it("logs only the error name when the request itself throws, even if its message echoes the URL", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed for ...access_token=seed-threads"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await getMetaToken("threads", NOW)).toBe("seed-threads");
    const logged = warn.mock.calls.flat().map(String).join(" ");
    warn.mockRestore();
    expect(logged).toContain("TypeError");
    expect(logged).not.toContain("seed-threads");
  });

  it("re-seeds when the owner replaces the env token in Vercel", async () => {
    fake.store.set("curio:social:token:threads", {
      token: "old-refreshed",
      refreshedAt: NOW.toISOString(),
      seed: "old-seed",
    });
    expect(await getMetaToken("threads", NOW)).toBe("fresh");
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("access_token=seed-threads");
  });

  it("returns null once the owner removes the env token, even with a stored token (env is the off switch)", async () => {
    fake.store.set("curio:social:token:threads", {
      token: "stored",
      refreshedAt: NOW.toISOString(),
      seed: "seed-threads",
    });
    vi.stubEnv("THREADS_ACCESS_TOKEN", "");
    expect(await getMetaToken("threads", NOW)).toBeNull();
    expect(fake.get).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
