import { describe, expect, it } from "vitest";
import { scoreOf } from "./score";
import { percentileLine, shareText } from "./share";

describe("shareText", () => {
  it("matches the agreed format exactly", () => {
    expect(shareText(14, 460, ["common", "familiar", "uncommon", "rare", "fossil", "familiar", null])).toBe(
      "curio dig, day 14\n4.6 m down\n🌱🟫🟧🪨🦴🟫▫️\nCan you go deeper?\nhttps://curioword.com/dig?vs=14.023452-&utm_source=challenge"
    );
  });
});

describe("past digs", () => {
  it("end with the plain dig link, no challenge code", () => {
    const t = shareText(12, 100, ["common", null, null, null, null, null, null], false).split(String.fromCharCode(10));
    expect(t[t.length - 1]).toBe("https://curioword.com/dig");
    expect(t).not.toContain("Can you go deeper?");
  });
});

describe("challenge link", () => {
  it("ends with the spoiler-free link", () => {
    const t = ["common", "rare", null, "fossil", "popular", "familiar", "uncommon"] as const;
    const lines = shareText(12, scoreOf([...t]), [...t]).split(String.fromCharCode(10));
    expect(lines.slice(-2)).toEqual(["Can you go deeper?", "https://curioword.com/dig?vs=12.04-5123&utm_source=challenge"]);
  });
});

describe("percentileLine", () => {
  it("needs 100 finishers: nothing at 99, a line at 100", () => {
    expect(percentileLine({ "10": 99 }, 300)).toBeNull();
    expect(percentileLine({ "10": 100 }, 300)).not.toBeNull();
    expect(percentileLine(undefined, 300)).toBeNull();
  });
  it("counts finishers in lower buckets only", () => {
    expect(percentileLine({ "20": 72, "30": 20, "40": 8 }, 300)).toBe("Deeper than 72% of today's diggers");
    expect(percentileLine({ "20": 100 }, 200)).toBeNull();
  });
});
