import { describe, it, expect } from "vitest";
import {
  WORDS,
  getPersonalOrder,
  getWordForUser,
  getHistoryForUser,
  getUniqueWordsMostRecent,
  getWordForDate,
} from "./words";

describe("getPersonalOrder", () => {
  it("is deterministic for the same user id", () => {
    const a = getPersonalOrder("user-1").map((w) => w.slug);
    const b = getPersonalOrder("user-1").map((w) => w.slug);
    expect(a).toEqual(b);
  });

  it("is a permutation of the full word list", () => {
    const order = getPersonalOrder("user-1").map((w) => w.slug);
    expect(order.slice().sort()).toEqual(WORDS.map((w) => w.slug).sort());
  });

  it("differs between different user ids", () => {
    const a = getPersonalOrder("user-1").map((w) => w.slug);
    const b = getPersonalOrder("some-other-user").map((w) => w.slug);
    expect(a).not.toEqual(b);
  });
});

describe("getWordForUser", () => {
  it("returns the first word in the user's order on their join day", () => {
    const joinedAt = new Date("2026-01-01T00:00:00Z");
    const order = getPersonalOrder("user-1");
    expect(getWordForUser("user-1", joinedAt, joinedAt)).toEqual(order[0]);
  });

  it("advances one word per day", () => {
    const joinedAt = new Date("2026-01-01T00:00:00Z");
    const dayTwo = new Date("2026-01-02T00:00:00Z");
    const order = getPersonalOrder("user-1");
    expect(getWordForUser("user-1", joinedAt, dayTwo)).toEqual(order[1]);
  });

  it("wraps around after the full list length", () => {
    const joinedAt = new Date("2026-01-01T00:00:00Z");
    const wrapDay = new Date(joinedAt.getTime() + WORDS.length * 24 * 60 * 60 * 1000);
    const order = getPersonalOrder("user-1");
    expect(getWordForUser("user-1", joinedAt, wrapDay)).toEqual(order[0]);
  });
});

describe("getHistoryForUser", () => {
  it("returns one entry per day since joining, most recent first", () => {
    const joinedAt = new Date("2026-01-01T00:00:00Z");
    const today = new Date("2026-01-03T00:00:00Z");
    const history = getHistoryForUser("user-1", joinedAt, today);
    expect(history.map((d) => d.date)).toEqual(["2026-01-03", "2026-01-02", "2026-01-01"]);
  });

  it("matches getWordForUser for each day", () => {
    const joinedAt = new Date("2026-01-01T00:00:00Z");
    const today = new Date("2026-01-05T00:00:00Z");
    const history = getHistoryForUser("user-1", joinedAt, today);
    for (const day of history) {
      const expected = getWordForUser("user-1", joinedAt, new Date(day.date + "T00:00:00Z"));
      expect(day.word).toEqual(expected);
    }
  });

  it("wraps around after the full list length", () => {
    const joinedAt = new Date("2026-01-01T00:00:00Z");
    const today = new Date(joinedAt.getTime() + (WORDS.length + 2) * 24 * 60 * 60 * 1000);
    const history = getHistoryForUser("user-1", joinedAt, today);

    // Most recent day matches getWordForUser directly.
    expect(history[0].word).toEqual(getWordForUser("user-1", joinedAt, today));

    // More days are returned than there are distinct words, so some word
    // must repeat — confirming the cycle actually wrapped rather than the
    // list happening to produce unique words by coincidence.
    expect(history.length).toBeGreaterThan(WORDS.length);
    const words = history.map((d) => d.word.slug);
    const uniqueWords = new Set(words);
    expect(uniqueWords.size).toBeLessThan(words.length);

    // The entry exactly one full cycle before the most recent day should be
    // the same word, since the personal order repeats every WORDS.length days.
    expect(history[WORDS.length].word).toEqual(history[0].word);
  });
});

describe("getUniqueWordsMostRecent", () => {
  it("returns exactly one entry per word, regardless of how many days have passed", () => {
    // Many days past WORDS.length, so the underlying calendar rotation has
    // definitely repeated every word several times over.
    const farFuture = new Date(Date.now() + WORDS.length * 5 * 24 * 60 * 60 * 1000);
    const unique = getUniqueWordsMostRecent(farFuture);
    expect(unique).toHaveLength(WORDS.length);
    const slugs = unique.map((d) => d.word.slug);
    expect(new Set(slugs).size).toBe(WORDS.length);
    expect(slugs.slice().sort()).toEqual(WORDS.map((w) => w.slug).sort());
  });

  it("orders words by most recent appearance first", () => {
    const today = new Date("2026-01-05T00:00:00Z"); // day 4 of the rotation
    const unique = getUniqueWordsMostRecent(today);
    // Today's word must be first, since it was (by definition) just seen.
    expect(unique[0].word).toEqual(getWordForDate(today));
  });

  it("returns fewer than WORDS.length entries before the rotation has completed once", () => {
    const earlyDay = new Date("2026-01-02T00:00:00Z"); // 2 days into the rotation
    const unique = getUniqueWordsMostRecent(earlyDay);
    expect(unique.length).toBeLessThanOrEqual(2);
    expect(unique.length).toBeGreaterThan(0);
  });
});
