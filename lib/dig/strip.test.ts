import { describe, expect, it } from "vitest";
import { stripState } from "./strip";

const miss = { answer: null, tier: null, rejected: [], lastGuess: null };
const hit = (tier: string) => ({ answer: "x", tier, rejected: [], lastGuess: null }) as never;
describe("stripState", () => {
  it("a live reveal animates its own column", () => {
    const s = stripState({ phase: "reveal", current: 2, results: [hit("common"), hit("rare"), hit("familiar"), ...Array(4).fill(miss)] }, -1);
    expect(s.justDropped).toBe(2);
    expect(s.tiers.slice(0, 4)).toEqual(["common", "rare", "familiar", undefined]);
  });
  it("a resumed reveal shows its marker with nothing animating", () => {
    const s = stripState({ phase: "reveal", current: 2, results: [hit("common"), hit("rare"), hit("familiar"), ...Array(4).fill(miss)] }, 2);
    expect(s.justDropped).toBeUndefined();
    expect(s.tiers[2]).toBe("familiar");
    expect(s.tiers[3]).toBeUndefined();
  });
  it("the next live reveal after a resumed one animates again", () => {
    const base = { results: [hit("common"), hit("rare"), hit("familiar"), hit("rare"), ...Array(3).fill(miss)] };
    expect(stripState({ ...base, phase: "reveal", current: 3 }, 2).justDropped).toBe(3);
  });
  it("a pass shows an open ring (null) and later columns stay empty", () => {
    const s = stripState({ phase: "reveal", current: 0, results: Array(7).fill(miss) }, -1);
    expect(s.tiers.slice(0, 2)).toEqual([null, undefined]);
  });
  it("while answering, the current column shows the surface ring and earlier answers show", () => {
    const s = stripState({ phase: "answering", current: 1, results: [hit("common"), ...Array(6).fill(miss)] }, -1);
    expect(s.current).toBe(1);
    expect(s.justDropped).toBeUndefined();
    expect(s.tiers.slice(0, 3)).toEqual(["common", undefined, undefined]);
  });
  it("reading also shows the surface ring, and a reveal shows no ring", () => {
    expect(stripState({ phase: "reading", current: 0, results: Array(7).fill(miss) }, -1).current).toBe(0);
    expect(stripState({ phase: "reveal", current: 0, results: Array(7).fill(hit("rare")) }, -1).current).toBeUndefined();
  });
  it("a finished run shows every column answered and animates nothing", () => {
    const s = stripState({ phase: "done", current: 6, results: Array(7).fill(hit("rare")) }, -1);
    expect(s.tiers).toEqual(Array(7).fill("rare"));
    expect(s.justDropped).toBeUndefined();
    expect(s.current).toBeUndefined();
  });
});
