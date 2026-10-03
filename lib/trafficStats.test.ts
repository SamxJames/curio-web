import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => {
  const hashes = new Map<string, Map<string, number>>();
  const ttls = new Map<string, number>();
  return {
    fake: {
      hashes,
      ttls,
      enabled: true,
      hincrby: vi.fn(async (k: string, f: string, by: number) => {
        const h = hashes.get(k) ?? new Map<string, number>();
        h.set(f, (h.get(f) ?? 0) + by);
        hashes.set(k, h);
        return h.get(f);
      }),
      expire: vi.fn(async (k: string, s: number) => (ttls.set(k, s), 1)),
      hgetall: vi.fn(async (k: string) => {
        const h = hashes.get(k);
        return h ? Object.fromEntries(h) : null;
      }),
    },
  };
});

vi.mock("./redis", () => ({
  get redis() {
    return fake.enabled ? fake : null;
  },
  usingUpstash: true,
}));

const { recordTrafficEvent, getTrafficDays, trafficKey, TRAFFIC_TTL_SECONDS } = await import("./trafficStats");

beforeEach(() => {
  fake.hashes.clear();
  fake.ttls.clear();
  fake.enabled = true;
  vi.clearAllMocks();
  vi.stubEnv("VERCEL_ENV", "production");
});
afterEach(() => vi.unstubAllEnvs());

describe("recordTrafficEvent", () => {
  it("increments the day's field and refreshes a 90-day TTL", async () => {
    await recordTrafficEvent({ kind: "visit", source: "search" }, "2026-10-03");
    await recordTrafficEvent({ kind: "visit", source: "search" }, "2026-10-03");
    await recordTrafficEvent({ kind: "share", what: "puzzle" }, "2026-10-03");
    expect(Object.fromEntries(fake.hashes.get("curio:traffic:2026-10-03")!)).toEqual({
      "visit:search": 2,
      "share:puzzle": 1,
    });
    expect(fake.ttls.get(trafficKey("2026-10-03"))).toBe(TRAFFIC_TTL_SECONDS);
    expect(TRAFFIC_TTL_SECONDS).toBe(90 * 24 * 60 * 60);
  });

  it("writes nothing outside production (local dev shares production's Upstash)", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    await recordTrafficEvent({ kind: "visit", source: "direct" }, "2026-10-03");
    vi.stubEnv("VERCEL_ENV", "");
    await recordTrafficEvent({ kind: "visit", source: "direct" }, "2026-10-03");
    expect(fake.hincrby).not.toHaveBeenCalled();
  });

  it("is a no-op without Upstash", async () => {
    fake.enabled = false;
    await expect(recordTrafficEvent({ kind: "visit", source: "direct" })).resolves.toBeUndefined();
  });
});

describe("getTrafficDays", () => {
  it("reads the last N UTC days including today, omitting empty days, coercing to numbers", async () => {
    fake.hashes.set("curio:traffic:2026-10-03", new Map([["visit:search", 4]]));
    fake.hashes.set("curio:traffic:2026-10-01", new Map([["signup:direct", 1]]));
    fake.hashes.set("curio:traffic:2026-09-20", new Map([["visit:direct", 9]])); // outside window
    const days = await getTrafficDays(3, new Date("2026-10-03T12:00:00Z"));
    expect(days).toEqual({
      "2026-10-03": { "visit:search": 4 },
      "2026-10-01": { "signup:direct": 1 },
    });
    expect(fake.hgetall).toHaveBeenCalledTimes(3);
  });

  it("reads in every environment (reading is safe) but returns {} without Upstash", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    fake.hashes.set("curio:traffic:2026-10-03", new Map([["visit:hn", 1]]));
    expect(await getTrafficDays(1, new Date("2026-10-03T00:00:00Z"))).toEqual({
      "2026-10-03": { "visit:hn": 1 },
    });
    fake.enabled = false;
    expect(await getTrafficDays(1, new Date("2026-10-03T00:00:00Z"))).toEqual({});
  });
});
