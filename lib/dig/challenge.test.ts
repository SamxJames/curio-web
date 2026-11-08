import { describe, expect, it } from "vitest";
import { challengeLine, encodeVs, parseVs, staleChallengeLine } from "./challenge";
import type { Tier } from "./types";

const tiers: (Tier | null)[] = ["common", "rare", null, "fossil", "popular", "familiar", "uncommon"];
describe("challenge codes", () => {
  it("round-trips", () => {
    expect(encodeVs(12, tiers)).toBe("12.04-5123");
    expect(parseVs("12.04-5123", 12)).toEqual(tiers);
  });
  it("rejects another day, bad length, bad characters and junk", () => {
    expect(parseVs("11.04-5123", 12)).toBeNull();
    expect(parseVs("12.04-512", 12)).toBeNull();
    expect(parseVs("12.04-5129", 12)).toBeNull();
    expect(parseVs("12.04x5123", 12)).toBeNull();
    expect(parseVs(null, 12)).toBeNull();
    expect(parseVs("", 12)).toBeNull();
  });
  it("words the friend's depth", () => {
    expect(challengeLine(tiers)).toMatch(/^A friend dug \d+\.\d m today\. Can you go deeper\?$/);
  });
});

describe("staleChallengeLine", () => {
  const code = "12.01234-0";
  it("names the earlier day", () => {
    expect(staleChallengeLine(code, 14)).toBe("A friend dug this on day 12. Today's dig is ready.");
  });
  it("is silent for today's link, a future day, junk or nothing", () => {
    expect(staleChallengeLine(code, 12)).toBeNull();
    expect(staleChallengeLine(code, 11)).toBeNull();
    expect(staleChallengeLine("nonsense", 14)).toBeNull();
    expect(staleChallengeLine(null, 14)).toBeNull();
  });
});
