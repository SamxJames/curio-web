import { describe, expect, it } from "vitest";
import { funnelField, parseDigEvent, planFinish } from "./events";
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

describe("funnel fields and the finish plan", () => {
  it("maps events to field names", () => {
    expect(funnelField({ kind: "land", source: "direct" })).toBe("land:direct");
    expect(funnelField({ kind: "share", how: "text" })).toBe("share:text");
    expect(funnelField({ kind: "past" })).toBe("past:start");
    expect(funnelField({ kind: "claim", date: today, prompt: 1, guess: "jib" })).toBeNull();
  });
  it("plans one pipelined write per counter", () => {
    expect(planFinish({ kind: "finish", date: today, score: SCORE, tiers: tiers as never, rejected: [[2, "jib"], [2, "jib"]] })).toEqual([
      ["curio:dig:scores:2026-12-05", "30", 1],
      ["curio:dig:funnel:2026-12-05", "finish", 1],
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
