import { describe, expect, it } from "vitest";
import { percentileLine, shareText } from "./share";

describe("shareText", () => {
  it("matches the agreed format exactly", () => {
    expect(shareText(14, 460, ["common", "familiar", "uncommon", "rare", "fossil", "familiar", null])).toBe(
      "curio dig, day 14\n4.6 m down\n🌱🟫🟧🪨🦴🟫▫️\ncurioword.com/dig"
    );
  });
});

describe("percentileLine", () => {
  it("needs 50 finishers", () => {
    expect(percentileLine({ "10": 49 }, 300)).toBeNull();
    expect(percentileLine(undefined, 300)).toBeNull();
  });
  it("counts finishers in lower buckets only", () => {
    expect(percentileLine({ "20": 36, "30": 10, "40": 4 }, 300)).toBe("Deeper than 72% of today's diggers");
    expect(percentileLine({ "20": 50 }, 200)).toBeNull();
  });
});
