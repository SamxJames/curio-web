import { describe, expect, it } from "vitest";
import { MAX_SCORE, TIER_POINTS, formatDepth, isValidScore, scoreOf, shareRow, tierFromZipf } from "./score";

describe("tierFromZipf", () => {
  it("uses absolute cut-offs", () => {
    expect(tierFromZipf(4.01)).toBe("common");
    expect(tierFromZipf(4)).toBe("common");
    expect(tierFromZipf(3.19)).toBe("familiar");
    expect(tierFromZipf(2.83)).toBe("uncommon");
    expect(tierFromZipf(2.3)).toBe("uncommon");
    expect(tierFromZipf(1.99)).toBe("rare");
    expect(tierFromZipf(undefined)).toBe("rare");
  });
});

describe("scoring", () => {
  it("sums points and treats blanks as zero", () => {
    expect(scoreOf(["common", "fossil", null, "rare"])).toBe(10 + 100 + 0 + 85);
  });
  it("formats depth in metres to one decimal place", () => {
    expect(formatDepth(460)).toBe("4.6 m");
    expect(formatDepth(0)).toBe("0.0 m");
    expect(formatDepth(MAX_SCORE)).toBe("7.0 m");
  });
  it("builds the spoiler-free emoji row", () => {
    expect(shareRow(["common", "popular", "familiar", "uncommon", "rare", "fossil", null])).toBe("🌱🌱🟫🟧🪨🦴▫️");
  });
  it("accepts only real scores", () => {
    expect(isValidScore(395)).toBe(true);
    expect(isValidScore(0)).toBe(true);
    expect(isValidScore(700)).toBe(true);
    expect(isValidScore(701)).toBe(false);
    expect(isValidScore(12)).toBe(false);
    expect(isValidScore("100")).toBe(false);
    expect(isValidScore(-5)).toBe(false);
  });
  it("keeps the agreed points", () => {
    expect(TIER_POINTS).toEqual({ common: 10, popular: 15, familiar: 30, uncommon: 60, rare: 85, fossil: 100 });
  });
});
