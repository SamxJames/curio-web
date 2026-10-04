import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => {
  const counts = new Map<string, number>();
  const ttls = new Map<string, number>();
  return {
    fake: {
      counts,
      ttls,
      enabled: true,
      incr: vi.fn(async (k: string) => {
        const n = (counts.get(k) ?? 0) + 1;
        counts.set(k, n);
        return n;
      }),
      expire: vi.fn(async (k: string, s: number) => (ttls.set(k, s), 1)),
      get: vi.fn(async (k: string) => counts.get(k) ?? null),
      // One atomic round trip: INCR then EXPIRE, applied by exec().
      multi: vi.fn(() => {
        const ops: (() => Promise<unknown>)[] = [];
        const chain = {
          incr: (k: string) => (ops.push(() => fake.incr(k)), chain),
          expire: (k: string, s: number) => (ops.push(() => fake.expire(k, s)), chain),
          exec: async () => {
            const out: unknown[] = [];
            for (const op of ops) out.push(await op());
            return out;
          },
        };
        return chain;
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

const { DAILY_CONFIRM_CAP, claimDailyConfirmSlot, getDailyConfirmSends } = await import("./confirmDailyCap");

const DAY = "2026-10-03";
const KEY = `curio:confirmsends:${DAY}`;

beforeEach(() => {
  fake.counts.clear();
  fake.ttls.clear();
  fake.enabled = true;
  vi.clearAllMocks();
  vi.stubEnv("VERCEL_ENV", "production");
});
afterEach(() => vi.unstubAllEnvs());

describe("claimDailyConfirmSlot", () => {
  it("is 200 a day", () => {
    expect(DAILY_CONFIRM_CAP).toBe(200);
  });

  it("allows the first 200 sends of a UTC day and refuses the 201st", async () => {
    for (let i = 0; i < 200; i++) expect(await claimDailyConfirmSlot(DAY)).toBe(true);
    expect(await claimDailyConfirmSlot(DAY)).toBe(false);
    expect(await claimDailyConfirmSlot(DAY)).toBe(false);
  });

  it("starts fresh the next day", async () => {
    fake.counts.set(KEY, 200);
    expect(await claimDailyConfirmSlot("2026-10-04")).toBe(true);
  });

  it("counts and sets the 8-day expiry in one atomic MULTI, every time, so the key can't be left without a TTL", async () => {
    await claimDailyConfirmSlot(DAY);
    await claimDailyConfirmSlot(DAY);
    expect(fake.multi).toHaveBeenCalledTimes(2);
    expect(fake.expire).toHaveBeenCalledTimes(2);
    expect(fake.ttls.get(KEY)).toBe(8 * 24 * 60 * 60);
  });

  it("never counts outside production (local dev shares production's Upstash)", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    expect(await claimDailyConfirmSlot(DAY)).toBe(true);
    expect(fake.incr).not.toHaveBeenCalled();
  });

  it("allows without Upstash", async () => {
    fake.enabled = false;
    expect(await claimDailyConfirmSlot(DAY)).toBe(true);
    expect(fake.incr).not.toHaveBeenCalled();
  });
});

describe("getDailyConfirmSends", () => {
  it("reads the last N UTC days' counts (today first), 0 for days with none", async () => {
    fake.counts.set(KEY, 7);
    fake.counts.set("curio:confirmsends:2026-10-01", 2);
    expect(await getDailyConfirmSends(3, new Date("2026-10-03T12:00:00Z"))).toEqual([
      { day: "2026-10-03", sends: 7 },
      { day: "2026-10-02", sends: 0 },
      { day: "2026-10-01", sends: 2 },
    ]);
  });

  it("is empty without Upstash", async () => {
    fake.enabled = false;
    expect(await getDailyConfirmSends(3)).toEqual([]);
  });
});
