import { describe, it, expect } from "vitest";
import { WORDS, getPersonalOrder, getWordForUser, getHistoryForUser } from "./words";

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
});
