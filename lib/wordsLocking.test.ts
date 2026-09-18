import { vi, describe, it, expect, beforeEach } from "vitest";

// A minimal in-memory stand-in for the Upstash client, supporting exactly
// the get/set/mget calls lib/words.ts's locking layer makes. Declared via
// vi.hoisted so the mock factory below (which vitest hoists above imports)
// can reference it.
const { fakeRedis } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    fakeRedis: {
      store,
      get: vi.fn(async (key: string) => (store.has(key) ? store.get(key)! : null)),
      set: vi.fn(async (key: string, value: string, opts?: { nx?: boolean }) => {
        if (opts?.nx && store.has(key)) return null;
        store.set(key, value);
        return "OK";
      }),
      mget: vi.fn(async (...keys: string[]) => keys.map((k) => (store.has(k) ? store.get(k)! : null))),
    },
  };
});

vi.mock("./redis", () => ({ redis: fakeRedis, usingUpstash: true }));

const {
  WORDS,
  getWordForDate,
  getWordForUser,
  resolveWordForDate,
  resolveTodayWord,
  resolveHistory,
  resolveUniqueWordsMostRecent,
  resolveWordForUser,
  resolveHistoryForUser,
  resolveDigestWordForSubscriber,
} = await import("./words");

beforeEach(() => {
  fakeRedis.store.clear();
  vi.clearAllMocks();
});

describe("resolveWordForDate", () => {
  it("computes and locks the word on first resolution", async () => {
    const date = new Date("2026-01-05T00:00:00Z");
    const expected = getWordForDate(date);
    const result = await resolveWordForDate(date);
    expect(result).toEqual(expected);
    expect(fakeRedis.store.get("curio:wordoftheday:2026-01-05")).toBe(expected.slug);
  });

  it("returns a previously locked word even when it disagrees with the current live computation", async () => {
    // Simulates what actually happened this morning: the word bank grew,
    // shifting getWordForDate's live pick for an already-served date. A
    // lock recorded before that growth must keep winning.
    const date = new Date("2026-01-05T00:00:00Z");
    const liveWord = getWordForDate(date);
    const lockedWord = WORDS.find((w) => w.slug !== liveWord.slug)!;
    fakeRedis.store.set("curio:wordoftheday:2026-01-05", lockedWord.slug);

    const result = await resolveWordForDate(date);
    expect(result).toEqual(lockedWord);
    expect(result).not.toEqual(liveWord);
  });

  it("resolveTodayWord delegates to resolveWordForDate for the current date", async () => {
    const result = await resolveTodayWord();
    expect(result).toEqual(getWordForDate(new Date()));
  });
});

describe("resolveHistory", () => {
  it("preserves an existing lock and locks in every previously-unlocked day it visits", async () => {
    const today = new Date("2026-01-03T00:00:00Z");
    const liveDay0 = getWordForDate(new Date("2026-01-01T00:00:00Z"));
    const lockedDay0 = WORDS.find((w) => w.slug !== liveDay0.slug)!;
    fakeRedis.store.set("curio:wordoftheday:2026-01-01", lockedDay0.slug);

    const history = await resolveHistory(today);

    expect(history.find((d) => d.date === "2026-01-01")!.word).toEqual(lockedDay0);
    expect(history.find((d) => d.date === "2026-01-03")!.word).toEqual(getWordForDate(today));
    // The day that wasn't locked yet is now locked, for next time.
    expect(fakeRedis.store.get("curio:wordoftheday:2026-01-02")).toBe(
      getWordForDate(new Date("2026-01-02T00:00:00Z")).slug
    );
  });

  it("resolveUniqueWordsMostRecent reflects locked history rather than live recomputation", async () => {
    const today = new Date("2026-01-05T00:00:00Z");
    const liveWord = getWordForDate(today);
    const lockedWord = WORDS.find((w) => w.slug !== liveWord.slug)!;
    fakeRedis.store.set("curio:wordoftheday:2026-01-05", lockedWord.slug);

    const unique = await resolveUniqueWordsMostRecent(today);
    expect(unique[0].word).toEqual(lockedWord);
  });
});

describe("resolveWordForUser / resolveHistoryForUser", () => {
  const joinedAt = new Date("2026-01-01T00:00:00Z");

  it("locks a signed-in account's word per day, independent of the global lock", async () => {
    const today = new Date("2026-01-02T00:00:00Z");
    const expected = getWordForUser("user-1", joinedAt, today);
    const result = await resolveWordForUser("user-1", joinedAt, today);
    expect(result).toEqual(expected);
    expect(fakeRedis.store.get("curio:user:user-1:wordFor:2026-01-02")).toBe(expected.slug);
  });

  it("a locked account-day overrides what the current personal shuffle would produce", async () => {
    const today = new Date("2026-01-02T00:00:00Z");
    const liveWord = getWordForUser("user-1", joinedAt, today);
    const lockedWord = WORDS.find((w) => w.slug !== liveWord.slug)!;
    fakeRedis.store.set("curio:user:user-1:wordFor:2026-01-02", lockedWord.slug);

    const result = await resolveWordForUser("user-1", joinedAt, today);
    expect(result).toEqual(lockedWord);
  });

  it("resolveHistoryForUser mixes locked and freshly-locked days correctly", async () => {
    const today = new Date("2026-01-03T00:00:00Z");
    const liveDay1 = getWordForUser("user-1", joinedAt, new Date("2026-01-02T00:00:00Z"));
    const lockedDay1 = WORDS.find((w) => w.slug !== liveDay1.slug)!;
    fakeRedis.store.set("curio:user:user-1:wordFor:2026-01-02", lockedDay1.slug);

    const history = await resolveHistoryForUser("user-1", joinedAt, today);
    expect(history.find((d) => d.date === "2026-01-02")!.word).toEqual(lockedDay1);
    expect(history.find((d) => d.date === "2026-01-03")!.word).toEqual(
      getWordForUser("user-1", joinedAt, today)
    );
  });
});

describe("resolveDigestWordForSubscriber", () => {
  it("falls back to the shared word when there's no linked account", async () => {
    const now = new Date("2026-01-05T00:00:00Z");
    const sharedWord = getWordForDate(now);
    const result = await resolveDigestWordForSubscriber(null, null, now, sharedWord);
    expect(result).toEqual(sharedWord);
  });

  it("uses (and locks) the account's personalized word when both userId and join date are known", async () => {
    const now = new Date("2026-01-05T00:00:00Z");
    const sharedWord = getWordForDate(now);
    const joinedAtStr = "2026-01-01";
    const expected = getWordForUser("user-1", new Date(joinedAtStr + "T00:00:00Z"), now);

    const result = await resolveDigestWordForSubscriber("user-1", joinedAtStr, now, sharedWord);
    expect(result).toEqual(expected);
    expect(fakeRedis.store.get("curio:user:user-1:wordFor:2026-01-05")).toBe(expected.slug);
  });
});
