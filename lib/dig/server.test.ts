import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { healthReads, pastDates, readDay, readsRedis, recordFinish, writesRedis } from "./server";
import { encodeDay } from "./payload";
import { devDay } from "./devDay";

// Redis paths are thin wrappers, exercised by the post-deploy check in Task 13. Nothing here connects to Redis.

afterEach(() => vi.unstubAllEnvs());

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
    const dir = mkdtempSync(path.join(tmpdir(), "dig-local-"));
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
});
