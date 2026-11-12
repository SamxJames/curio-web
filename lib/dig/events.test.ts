import { describe, expect, it } from "vitest";
import { funnelField, funnelFields, overRateLimit, parseDigEvent, planFinish, RATE_LIMITS, type DigEvent } from "./events";
import { digKeys } from "./keys";
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

  it("parses a miss like a claim: today only, a real prompt, a clean guess", () => {
    expect(parseDigEvent({ kind: "miss", date: today, prompt: 4, guess: "Ice Cream" }, today)).toEqual({ kind: "miss", date: today, prompt: 4, guess: "icecream" });
    expect(parseDigEvent({ kind: "miss", date: "2026-12-04", prompt: 4, guess: "jib" }, today)).toBeNull();
    expect(parseDigEvent({ kind: "miss", date: today, prompt: 7, guess: "jib" }, today)).toBeNull();
    expect(parseDigEvent({ kind: "miss", date: today, prompt: 0, guess: "<script>" }, today)).toBeNull();
    expect(funnelField({ kind: "miss", date: today, prompt: 1, guess: "jib" })).toBeNull();
  });

  it("caps misses per sender per day, well above a finish's worth", () => {
    expect(overRateLimit("miss", 1, RATE_LIMITS.missPerDay)).toBe(false);
    expect(overRateLimit("miss", 1, RATE_LIMITS.missPerDay + 1)).toBe(true);
    expect(RATE_LIMITS.missPerDay).toBeGreaterThanOrEqual(5 * 21);
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

describe("cohort fields", () => {
  const daysBack = (n: number) => new Date(Date.parse(today) - n * 86_400_000).toISOString().slice(0, 10);
  it("keeps a valid first-play date on a start", () => {
    expect(parseDigEvent({ kind: "start", date: today, ret: "d7", first: daysBack(7) }, today)).toEqual({ kind: "start", date: today, ret: "d7", first: daysBack(7) });
  });
  it("drops first when it is today, over 60 days old, or junk, and the event still parses", () => {
    for (const first of [today, daysBack(61), "nonsense", 5, { $: 1 }]) {
      expect(parseDigEvent({ kind: "start", date: today, first }, today)).toEqual({ kind: "start", date: today });
    }
  });
  it("funnel fields for a start with first are unchanged", () => {
    expect(funnelFields({ kind: "start", date: today, ret: "d7", first: daysBack(7) })).toEqual(["start", "start:ret:d7"]);
  });
  it("a finish with isNew keeps it and plans finish:new", () => {
    const tiers = Array(7).fill(null);
    const ev = parseDigEvent({ kind: "finish", date: today, score: 0, tiers, rejected: [], isNew: true }, today);
    expect(ev).toMatchObject({ kind: "finish", isNew: true });
    expect(planFinish(ev as Extract<DigEvent, { kind: "finish" }>)).toContainEqual([digKeys.funnel(today), "finish:new", 1]);
    const plain = parseDigEvent({ kind: "finish", date: today, score: 0, tiers, rejected: [], isNew: "yes" }, today);
    expect(plain).not.toHaveProperty("isNew");
  });
});

describe("new counters", () => {
  const day = "2026-11-10";
  it("a counted first-timer share writes old and new fields", () => {
    const ev = parseDigEvent({ kind: "share", how: "text", once: true, isNew: true }, day)!;
    expect(funnelFields(ev)).toEqual(["share:text", "shared:once", "shared:new"]);
  });
  it("a counted first-timer share by sheet also writes shared:new:sheet", () => {
    const ev = parseDigEvent({ kind: "share", how: "text", once: true, isNew: true, sheet: true }, day)!;
    expect(funnelFields(ev)).toEqual(["share:text", "shared:once", "shared:new", "shared:new:sheet"]);
  });
  it("sheet is ignored without once", () => {
    const ev = parseDigEvent({ kind: "share", how: "text", isNew: true, sheet: true }, day)!;
    expect(ev).not.toHaveProperty("sheet");
    expect(funnelFields(ev)).toEqual(["share:text"]);
  });
  it("isNew and third are ignored without once", () => {
    const ev = parseDigEvent({ kind: "share", how: "image", isNew: true, third: true }, day)!;
    expect(funnelFields(ev)).toEqual(["share:image"]);
  });
  it("marks the third sharing day", () => {
    const ev = parseDigEvent({ kind: "share", how: "text", once: true, third: true }, day)!;
    expect(funnelFields(ev)).toContain("shared:third");
  });
  it("a challenge start adds start:vs", () => {
    const ev = parseDigEvent({ kind: "start", date: day, vs: true }, day)!;
    expect(funnelFields(ev)).toEqual(["start", "start:vs"]);
  });
  it("reached carries the first-timer split", () => {
    expect(funnelFields(parseDigEvent({ kind: "reached" }, day)!)).toEqual(["reached:4"]);
    expect(funnelFields(parseDigEvent({ kind: "reached", isNew: true }, day)!)).toEqual(["reached:4", "reached:4:new"]);
  });
  it("planFinish writes challenge fields", () => {
    const t = Array(7).fill(null);
    const fields = planFinish({ kind: "finish", date: day, score: 0, tiers: t, rejected: [], isNew: true, vs: true }).map((i) => i[1]);
    expect(fields).toEqual(expect.arrayContaining(["finish:vs", "finish:vs:new"]));
    expect(planFinish({ kind: "finish", date: day, score: 0, tiers: t, rejected: [], vs: true }).map((i) => i[1])).not.toContain("finish:vs:new");
  });
  it("parses vs on a finish only when it is exactly true", () => {
    const body = { kind: "finish", date: day, score: 0, tiers: Array(7).fill(null), rejected: [] };
    expect(parseDigEvent({ ...body, vs: true }, day)).toMatchObject({ vs: true });
    expect(parseDigEvent({ ...body, vs: "yes" }, day)).not.toHaveProperty("vs");
  });
});
