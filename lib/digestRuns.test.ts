import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  const ttls = new Map<string, number>();
  return {
    fake: {
      store,
      ttls,
      enabled: true,
      set: vi.fn(async (k: string, v: string, o?: { nx?: boolean; ex?: number }) => {
        if (o?.nx && store.has(k)) return null;
        store.set(k, v);
        if (o?.ex) ttls.set(k, o.ex);
        return "OK";
      }),
      del: vi.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
      sadd: vi.fn(async (k: string, ...members: string[]) => {
        const s = (store.get(k) as Set<string>) ?? new Set<string>();
        members.forEach((m) => s.add(m));
        store.set(k, s);
        return members.length;
      }),
      srem: vi.fn(async (k: string, ...members: string[]) => {
        const s = store.get(k) as Set<string> | undefined;
        let n = 0;
        members.forEach((m) => (n += s?.delete(m) ? 1 : 0));
        return n;
      }),
      smembers: vi.fn(async (k: string) => [...((store.get(k) as Set<string>) ?? [])]),
      expire: vi.fn(async (k: string, s: number) => (ttls.set(k, s), 1)),
    },
  };
});

vi.mock("./redis", () => ({
  get redis() {
    return fake.enabled ? fake : null;
  },
  usingUpstash: true,
}));

const { claimRun, getFailures, releaseRun, removeFailures, resetDigestRunsMemory, seedPending } = await import("./digestRuns");

const THREE_DAYS = 3 * 24 * 60 * 60;
const SEVEN_DAYS = 7 * 24 * 60 * 60;

describe.each([
  ["Upstash", true],
  ["no Upstash (in-memory dev fallback)", false],
])("digest runs, %s", (_label, enabled) => {
  beforeEach(() => {
    fake.enabled = enabled;
    fake.store.clear();
    fake.ttls.clear();
    resetDigestRunsMemory();
    // Redis is only used in production (see lib/digestRuns.ts).
    vi.stubEnv("VERCEL_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("claims a day once; a second claim that day is refused", async () => {
    expect(await claimRun("email", "2026-09-27")).toBe(true);
    expect(await claimRun("email", "2026-09-27")).toBe(false);
  });

  it("keeps email and Bluesky, and different days, independent", async () => {
    expect(await claimRun("email", "2026-09-27")).toBe(true);
    expect(await claimRun("bluesky", "2026-09-27")).toBe(true);
    expect(await claimRun("email", "2026-09-28")).toBe(true);
  });

  it("force re-claims a day that already ran", async () => {
    await claimRun("email", "2026-09-27");
    expect(await claimRun("email", "2026-09-27", { force: true })).toBe(true);
    expect(await claimRun("email", "2026-09-27")).toBe(false);
  });

  it("releases a claimed lock so a fresh claim succeeds again", async () => {
    await claimRun("email", "2026-09-27");
    await releaseRun("email", "2026-09-27");
    expect(await claimRun("email", "2026-09-27")).toBe(true);
  });

  it("seeds a day's pending set, replacing the previous one, and clears it when empty", async () => {
    await seedPending("2026-09-27", ["a@example.com", "b@example.com"]);
    expect((await getFailures("2026-09-27")).sort()).toEqual(["a@example.com", "b@example.com"]);
    await seedPending("2026-09-27", ["b@example.com"]);
    expect(await getFailures("2026-09-27")).toEqual(["b@example.com"]);
    await seedPending("2026-09-27", []);
    expect(await getFailures("2026-09-27")).toEqual([]);
    expect(await getFailures("2026-09-28")).toEqual([]);
  });

  it("removes addresses one chunk at a time as they're sent, so a resend skips them", async () => {
    await seedPending("2026-09-27", ["a@example.com", "b@example.com", "c@example.com"]);
    await removeFailures("2026-09-27", ["a@example.com"]);
    await removeFailures("2026-09-27", ["c@example.com", "not-there@example.com"]);
    expect(await getFailures("2026-09-27")).toEqual(["b@example.com"]);
    await removeFailures("2026-09-27", []);
    expect(await getFailures("2026-09-27")).toEqual(["b@example.com"]);
  });
});

describe("digest runs, Upstash keys", () => {
  beforeEach(() => {
    fake.enabled = true;
    fake.store.clear();
    fake.ttls.clear();
    vi.stubEnv("VERCEL_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses SET NX with a 3-day TTL for locks and a 7-day TTL for failures, under curio:digest:", async () => {
    await claimRun("email", "2026-09-27");
    await claimRun("bluesky", "2026-09-27");
    await seedPending("2026-09-27", ["a@example.com"]);
    expect(fake.set).toHaveBeenCalledWith("curio:digest:run:2026-09-27", expect.any(String), { nx: true, ex: THREE_DAYS });
    expect(fake.ttls.get("curio:digest:bluesky:2026-09-27")).toBe(THREE_DAYS);
    expect(fake.ttls.get("curio:digest:failed:2026-09-27")).toBe(SEVEN_DAYS);
  });
});

// Local dev shares production's Upstash: a local cron run must never claim
// production's locks or touch its pending set.
describe.each([
  ["unset", undefined],
  ["preview", "preview"],
  ["development", "development"],
])("digest runs, Upstash configured but VERCEL_ENV %s", (_label, vercelEnv) => {
  beforeEach(() => {
    fake.enabled = true;
    fake.store.clear();
    resetDigestRunsMemory();
    vi.clearAllMocks();
    vi.stubEnv("VERCEL_ENV", vercelEnv);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps locks and the pending set in memory, never touching Redis", async () => {
    expect(await claimRun("email", "2026-09-27")).toBe(true);
    expect(await claimRun("email", "2026-09-27")).toBe(false);
    expect(await claimRun("bluesky", "2026-09-27", { force: true })).toBe(true);
    await releaseRun("bluesky", "2026-09-27");
    await seedPending("2026-09-27", ["a@example.com", "b@example.com"]);
    await removeFailures("2026-09-27", ["a@example.com"]);
    expect(await getFailures("2026-09-27")).toEqual(["b@example.com"]);

    for (const fn of [fake.set, fake.del, fake.sadd, fake.srem, fake.smembers, fake.expire]) {
      expect(fn).not.toHaveBeenCalled();
    }
    expect(fake.store.size).toBe(0);
  });
});
