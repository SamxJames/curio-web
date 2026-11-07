import { describe, expect, it } from "vitest";
import { funnelField, funnelFields, overRateLimit, parseDigEvent, planFinish, RATE_LIMITS } from "./events";
import { devDay } from "./devDay";

const today = "2026-12-05";
const tiers = ["common", "rare", null, "fossil", "familiar", "uncommon", "popular"];
// 10 + 85 + 0 + 100 + 30 + 60 + 15
const SCORE = 300;

describe("parseDigEvent", () => {
  it("accepts the allowlisted vocabulary", () => {
    expect(parseDigEvent({ kind: "land", source: "share" }, today)).toEqual({ kind: "land", source: "share" });
    expect(parseDigEvent({ kind: "start", date: today }, today)).toEqual({ kind: "start", date: today });
    expect(parseDigEvent({ kind: "share", how: "image" }, today)).toEqual({ kind: "share", how: "image" });
    expect(parseDigEvent({ kind: "past" }, today)).toEqual({ kind: "past" });
    expect(parseDigEvent({ kind: "story" }, today)).toEqual({ kind: "story" });
    expect(parseDigEvent({ kind: "signup" }, today)).toEqual({ kind: "signup" });
    expect(parseDigEvent({ kind: "claim", date: today, prompt: 3, guess: "Jib" }, today)).toEqual({ kind: "claim", date: today, prompt: 3, guess: "jib" });
  });
  it("accepts a finish and normalises its rejected guesses", () => {
    const ev = parseDigEvent({ kind: "finish", date: today, score: SCORE, tiers, rejected: [[0, " Banana "], [6, "crème brûlée"]] }, today);
    expect(ev).toEqual({ kind: "finish", date: today, score: SCORE, tiers, rejected: [[0, "banana"], [6, "cremebrulee"]] });
  });
  it("drops a junk guess but keeps the finish and its real guesses", () => {
    const ev = parseDigEvent({ kind: "finish", date: today, score: SCORE, tiers, rejected: [[0, "a"], [1, "banana"], [2, "привет"]] }, today);
    expect(ev).toEqual({ kind: "finish", date: today, score: SCORE, tiers, rejected: [[1, "banana"]] });
  });
  it("stores spacing and accent variants of one guess under one key", () => {
    const ev = parseDigEvent({ kind: "finish", date: today, score: SCORE, tiers, rejected: [[0, "ice cream"], [0, "Icecream"]] }, today);
    expect(ev).toEqual({ kind: "finish", date: today, score: SCORE, tiers, rejected: [[0, "icecream"], [0, "icecream"]] });
    expect(parseDigEvent({ kind: "claim", date: today, prompt: 2, guess: "Ice Cream" }, today)).toEqual({ kind: "claim", date: today, prompt: 2, guess: "icecream" });
  });
  it("rejects other days, bad scores, junk guesses and unknown kinds", () => {
    expect(parseDigEvent({ kind: "start", date: "2026-12-04" }, today)).toBeNull();
    expect(parseDigEvent({ kind: "finish", date: today, score: 12, tiers, rejected: [] }, today)).toBeNull();
    expect(parseDigEvent({ kind: "finish", date: today, score: SCORE, tiers: ["gold"], rejected: [] }, today)).toBeNull();
    expect(parseDigEvent({ kind: "finish", date: today, score: SCORE, tiers, rejected: [[9, "x"]] }, today)).toBeNull();
    expect(parseDigEvent({ kind: "claim", date: today, prompt: 0, guess: "<script>" }, today)).toBeNull();
    expect(parseDigEvent({ kind: "land", source: "evil" }, today)).toBeNull();
    expect(parseDigEvent({ kind: "visit" }, today)).toBeNull();
    expect(parseDigEvent(null, today)).toBeNull();
  });
  it("rejects a finish whose score does not match its tiers", () => {
    expect(parseDigEvent({ kind: "finish", date: today, score: 390, tiers, rejected: [] }, today)).toBeNull();
  });
});

describe("via event", () => {
  it("parses a via event from a known internal link and rejects others", () => {
    expect(parseDigEvent({ kind: "via", from: "nav" }, today)).toEqual({ kind: "via", from: "nav" });
    expect(parseDigEvent({ kind: "via", from: "evil" }, today)).toBeNull();
    expect(parseDigEvent({ kind: "via" }, today)).toBeNull();
  });
  it("counts a via event under via:<from>", () => {
    expect(funnelField({ kind: "via", from: "home" })).toBe("via:home");
    expect(funnelFields({ kind: "via", from: "story" })).toEqual(["via:story"]);
  });
});

describe("funnel fields and the finish plan", () => {
  it("maps events to field names", () => {
    expect(funnelField({ kind: "land", source: "direct" })).toBe("land:direct");
    expect(funnelField({ kind: "share", how: "text" })).toBe("share:text");
    expect(funnelField({ kind: "past" })).toBe("past:start");
    expect(funnelField({ kind: "claim", date: today, prompt: 1, guess: "jib" })).toBeNull();
  });
  it("accepts the timer event and only the two row targets", () => {
    expect(parseDigEvent({ kind: "timer" }, today)).toEqual({ kind: "timer" });
    expect(funnelField({ kind: "timer" })).toBe("timer:switch");
    expect(parseDigEvent({ kind: "timers" }, today)).toBeNull();
    expect(parseDigEvent({ kind: "row", to: "play" }, today)).toEqual({ kind: "row", to: "play" });
    expect(parseDigEvent({ kind: "row", to: "past" }, today)).toEqual({ kind: "row", to: "past" });
    expect(parseDigEvent({ kind: "row", to: "evil:field" }, today)).toBeNull();
    expect(parseDigEvent({ kind: "row" }, today)).toBeNull();
    expect(funnelField({ kind: "row", to: "play" })).toBe("row:play");
    expect(funnelField({ kind: "row", to: "past" })).toBe("row:past");
    expect(funnelFields({ kind: "timer" })).toEqual(["timer:switch"]);
  });
  it("planFinish counts fossils found, and writes nothing when none", () => {
    const withFossil = planFinish({ kind: "finish", date: today, score: SCORE, tiers: tiers as never, rejected: [] });
    expect(withFossil).toContainEqual(["curio:dig:funnel:2026-12-05", "fossil", 1]);
    const none = planFinish({ kind: "finish", date: today, score: 10, tiers: ["common", ...Array(6).fill(null)] as never, rejected: [] });
    expect(none.some(([, f]) => f === "fossil")).toBe(false);
    const two = planFinish({ kind: "finish", date: today, score: 200, tiers: ["fossil", "fossil", ...Array(5).fill(null)] as never, rejected: [] });
    expect(two).toContainEqual(["curio:dig:funnel:2026-12-05", "fossil", 2]);
  });
  it("rate-limits timer and row like any cheap event, never unlimited", () => {
    expect(overRateLimit("timer", RATE_LIMITS.perMinute + 1, null)).toBe(true);
    expect(overRateLimit("row", RATE_LIMITS.perMinute + 1, null)).toBe(true);
    expect(overRateLimit("timer", 1, null)).toBe(false);
    expect(overRateLimit("row", 1, null)).toBe(false);
  });
  it("plans one pipelined write per counter", () => {
    expect(planFinish({ kind: "finish", date: today, score: SCORE, tiers: tiers as never, rejected: [[2, "jib"], [2, "jib"]] })).toEqual([
      ["curio:dig:scores:2026-12-05", "30", 1],
      ["curio:dig:funnel:2026-12-05", "finish", 1],
      ["curio:dig:funnel:2026-12-05", "fossil", 1],
      ["curio:dig:rej:2026-12-05:2", "jib", 2],
    ]);
  });
});

describe("devDay", () => {
  it("builds a playable 7-prompt day with origins at positions 3 and 6", () => {
    const d = devDay(today);
    expect(d.prompts).toHaveLength(7);
    expect(d.prompts.map((p) => p.kind)).toEqual(["theme", "theme", "origin", "theme", "theme", "origin", "theme"]);
    for (const p of d.prompts) expect(p.answers.filter((a) => a[1] === "fossil")).toHaveLength(1);
  });
});

describe("overRateLimit", () => {
  it("allows normal play and blocks bursts", () => {
    expect(overRateLimit("start", 1, null)).toBe(false);
    expect(overRateLimit("land", RATE_LIMITS.perMinute + 1, null)).toBe(true);
  });

  it("caps finishes and claims per sender per day", () => {
    expect(overRateLimit("finish", 1, RATE_LIMITS.finishPerDay)).toBe(false);
    expect(overRateLimit("finish", 1, RATE_LIMITS.finishPerDay + 1)).toBe(true);
    expect(overRateLimit("claim", 1, RATE_LIMITS.claimPerDay + 1)).toBe(true);
    expect(overRateLimit("share", 1, 999)).toBe(false);
  });
});

describe("return bucket on start", () => {
  it("accepts a start with a valid return bucket and drops a junk one", () => {
    expect(parseDigEvent({ kind: "start", date: today, ret: "d2_6" }, today)).toEqual({ kind: "start", date: today, ret: "d2_6" });
    expect(parseDigEvent({ kind: "start", date: today, ret: "d9" }, today)).toEqual({ kind: "start", date: today });
    expect(parseDigEvent({ kind: "start", date: today, ret: { $: 1 } }, today)).toEqual({ kind: "start", date: today });
  });
  it("a returning start increments start and start:ret:<bucket>; a plain one only start", () => {
    expect(funnelFields({ kind: "start", date: today, ret: "d1" })).toEqual(["start", "start:ret:d1"]);
    expect(funnelFields({ kind: "start", date: today })).toEqual(["start"]);
    expect(funnelFields({ kind: "claim", date: today, prompt: 0, guess: "jib" })).toEqual([]);
  });
});
