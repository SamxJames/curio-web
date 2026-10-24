import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { healthReads, pastDates, readDay, readsRedis, recordFinish, writesRedis } from "./server";
import { encodeDay } from "./payload";
import { devDay } from "./devDay";

// Redis paths are thin wrappers, exercised by the post-deploy check in Task 13. Nothing here connects to Redis.

/** A fake Upstash client. Every method is a spy shared by the client and its pipeline, so a
 * write through either path shows up in the same assertion. `ctor` counts constructions. */
const h = vi.hoisted(() => {
  const ops = {
    get: vi.fn(async (..._args: unknown[]) => null),
    set: vi.fn(async (..._args: unknown[]) => "OK"),
    hincrby: vi.fn(async (..._args: unknown[]) => 1),
    hgetall: vi.fn(async (..._args: unknown[]) => null),
    exists: vi.fn(async (..._args: unknown[]) => 0),
    expire: vi.fn(async (..._args: unknown[]) => 1),
    exec: vi.fn(async (..._args: unknown[]): Promise<unknown[]> => []),
  };
  const pipe = { ...ops };
  const pipeline = vi.fn(() => pipe);
  const ctor = vi.fn();
  class FakeRedis {
    readonly get = ops.get;
    readonly set = ops.set;
    readonly hincrby = ops.hincrby;
    readonly hgetall = ops.hgetall;
    readonly exists = ops.exists;
    readonly expire = ops.expire;
    readonly pipeline = pipeline;
    constructor(opts: unknown) {
      ctor(opts);
    }
  }
  return { ops, pipeline, ctor, FakeRedis };
});

vi.mock("@upstash/redis", () => ({ Redis: h.FakeRedis }));
// The site's shared client is mocked to null so no real client can be built by the fallback.
vi.mock("../redis", () => ({ redis: null }));

const tempDirs: string[] = [];
const tempDir = (prefix: string) => {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("environment gates", () => {
  it("never touches Redis locally", () => {
    vi.stubEnv("VERCEL_ENV", "");
    expect(readsRedis()).toBe(false);
    expect(writesRedis()).toBe(false);
  });
  it("reads in preview but writes only in production", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(readsRedis()).toBe(true);
    expect(writesRedis()).toBe(false);
    vi.stubEnv("VERCEL_ENV", "production");
    expect(writesRedis()).toBe(true);
  });
});

describe("local reads", () => {
  it("prefers a pipeline file, else the fake day", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("DIG_LAUNCH_DATE", "");
    const dir = tempDir("dig-local-");
    mkdirSync(path.join(dir, "days"));
    const real = { ...devDay("2026-10-20"), rejSample: 0.5 };
    writeFileSync(path.join(dir, "days", "2026-10-20.json"), JSON.stringify(encodeDay(real)));
    vi.stubEnv("DIG_LOCAL_DIR", dir);
    expect((await readDay("2026-10-20"))?.rejSample).toBe(0.5);
    expect((await readDay("2026-10-21"))?.prompts).toHaveLength(7);
    expect(await pastDates(new Date("2026-10-21T10:00:00Z"))).toEqual(["2026-10-20"]);
  });
  it("lists recent days from the fake day when there is no pipeline output", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("DIG_LAUNCH_DATE", "");
    vi.stubEnv("DIG_LOCAL_DIR", path.join(tmpdir(), "dig-none-" + Date.now()));
    const dates = await pastDates(new Date("2026-10-21T10:00:00Z"));
    expect(dates[0]).toBe("2026-10-20");
    expect(dates.at(-1)).toBe("2026-10-01");
  });
  it("records nothing locally and returns an empty spread", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    expect(await recordFinish({ kind: "finish", date: "2026-10-21", score: 100, tiers: [], rejected: [] })).toEqual({});
  });
  it("reads no health data locally, even when Upstash variables are set", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.invalid");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    expect(await healthReads("2026-10-21", "2026-10-22", "2026-10")).toBeNull();
  });
  it("refuses a date that is not a calendar day key", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    expect(await readDay("../x")).toBeNull();
  });
});

describe("isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writers never reach Redis in preview, even with dummy Upstash credentials", async () => {
    vi.resetModules();
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("DIG_REDIS_REST_URL", "https://dig.invalid");
    vi.stubEnv("DIG_REDIS_REST_TOKEN", "dummy-token");
    const s = await import("./server");

    await s.recordFunnel("2026-10-21", { kind: "start", date: "2026-10-21" });
    await s.recordFinish({ kind: "finish", date: "2026-10-21", score: 100, tiers: [], rejected: [] });
    await s.recordClaim({ kind: "claim", date: "2026-10-21", prompt: 0, guess: "banana" });
    await s.housekeep("2026-10-20");
    await s.writeHeartbeat(new Date("2026-10-21T00:00:00Z"));
    await s.markUsageAlert("2026-10", 50);

    expect(h.ops.hincrby).not.toHaveBeenCalled();
    expect(h.ops.set).not.toHaveBeenCalled();
    expect(h.pipeline).not.toHaveBeenCalled();
    expect(h.ops.expire).not.toHaveBeenCalled();
    expect(h.ops.exec).not.toHaveBeenCalled();

    // Sanity: the reads do go through the fake client, so the spies above are live.
    await s.readDay("2026-10-21");
    expect(h.ctor).toHaveBeenCalledWith({ url: "https://dig.invalid", token: "dummy-token" });
    expect(h.ops.get).toHaveBeenCalledWith("curio:dig:day:2026-10-21");
  });

  it("builds no Redis client locally, for any reader or writer", async () => {
    vi.resetModules();
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("DIG_LAUNCH_DATE", "");
    vi.stubEnv("DIG_REDIS_REST_URL", "https://dig.invalid");
    vi.stubEnv("DIG_REDIS_REST_TOKEN", "dummy-token");
    vi.stubEnv("DIG_LOCAL_DIR", tempDir("dig-iso-"));
    const s = await import("./server");

    await s.readDay("2026-10-20");
    await s.readManifest();
    await s.pastDates(new Date("2026-10-21T10:00:00Z"));
    await s.healthReads("2026-10-21", "2026-10-22", "2026-10");
    await s.funnelDays(["2026-10-20"]);
    await s.recordFunnel("2026-10-21", { kind: "start", date: "2026-10-21" });
    await s.recordFinish({ kind: "finish", date: "2026-10-21", score: 100, tiers: [], rejected: [] });
    await s.recordClaim({ kind: "claim", date: "2026-10-21", prompt: 0, guess: "banana" });
    await s.housekeep("2026-10-20");
    await s.writeHeartbeat(new Date("2026-10-21T00:00:00Z"));
    await s.markUsageAlert("2026-10", 50);

    expect(h.ctor).not.toHaveBeenCalled();
    expect(h.ops.get).not.toHaveBeenCalled();
    expect(h.pipeline).not.toHaveBeenCalled();
  });
});
