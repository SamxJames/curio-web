import { describe, it, expect } from "vitest";
import {
  computeLanguageStats,
  formatShortDate,
  spellNumber,
  capitalize,
  pluralize,
  toCollectionWord,
  resolveCollection,
  type CollectionWord,
} from "./collection";
import type { WordEntry } from "./words";

function word(slug: string, lineage: string[]): WordEntry {
  return {
    slug,
    word: slug,
    respelling: slug.toUpperCase(),
    partOfSpeech: "noun",
    teaser: "",
    origin: "",
    journey: "",
    related: "",
    lineage,
    clues: ["", "", ""],
  };
}

describe("computeLanguageStats", () => {
  it("excludes English and counts every other language in the lineage", () => {
    const words = [
      word("a", ["Latin", "English"]),
      word("b", ["Latin", "Italian", "English"]),
      word("c", ["Old English", "English"]),
    ];
    const stats = computeLanguageStats(words);
    expect(stats.map((s) => s.name)).not.toContain("English");
    expect(stats.find((s) => s.name === "Latin")?.count).toBe(2);
    expect(stats.find((s) => s.name === "Italian")?.count).toBe(1);
    expect(stats.find((s) => s.name === "Old English")?.count).toBe(1);
  });

  it("orders by count descending, then alphabetically", () => {
    const words = [
      word("a", ["Nahuatl", "English"]),
      word("b", ["Latin", "English"]),
      word("c", ["Latin", "English"]),
      word("d", ["Czech", "English"]),
    ];
    const stats = computeLanguageStats(words);
    expect(stats.map((s) => s.name)).toEqual(["Latin", "Czech", "Nahuatl"]);
  });

  it("steps opacity linearly from 0.58 (most common) to 0.24 (least common)", () => {
    const words = [
      word("a", ["Latin", "English"]),
      word("a2", ["Latin", "English"]),
      word("b", ["Italian", "English"]),
      word("c", ["Czech", "English"]),
    ];
    const stats = computeLanguageStats(words);
    expect(stats[0].opacity).toBeCloseTo(0.58);
    expect(stats[stats.length - 1].opacity).toBeCloseTo(0.24);
  });

  it("puts a single language at the top of the opacity range", () => {
    const words = [word("a", ["Latin", "English"])];
    const stats = computeLanguageStats(words);
    expect(stats).toHaveLength(1);
    expect(stats[0].opacity).toBeCloseTo(0.58);
  });

  it("returns an empty list for no words", () => {
    expect(computeLanguageStats([])).toEqual([]);
  });
});

describe("formatShortDate", () => {
  it("formats as day-then-month", () => {
    expect(formatShortDate("2026-09-09")).toBe("9 Sep");
    expect(formatShortDate("2026-01-01")).toBe("1 Jan");
  });
});

describe("spellNumber", () => {
  it("spells out small numbers", () => {
    expect(spellNumber(0)).toBe("zero");
    expect(spellNumber(7)).toBe("seven");
    expect(spellNumber(20)).toBe("twenty");
  });

  it("falls back to digits beyond the spelled-out range", () => {
    expect(spellNumber(21)).toBe("21");
  });
});

describe("capitalize", () => {
  it("uppercases the first letter only", () => {
    expect(capitalize("seven")).toBe("Seven");
    expect(capitalize("")).toBe("");
  });
});

describe("pluralize", () => {
  it("uses the singular only at exactly one", () => {
    expect(pluralize(1, "word")).toBe("word");
    expect(pluralize(0, "word")).toBe("words");
    expect(pluralize(2, "word")).toBe("words");
  });
});

describe("toCollectionWord", () => {
  it("keeps exactly the seven collection fields and drops origin, journey and clues", () => {
    const out = toCollectionWord(word("a", ["Latin", "English"]));
    expect(Object.keys(out).sort()).toEqual(
      ["lineage", "partOfSpeech", "related", "respelling", "slug", "teaser", "word"]
    );
  });
});

describe("resolveCollection", () => {
  const cw = (slug: string): CollectionWord => toCollectionWord(word(slug, ["Latin", "English"]));

  it("returns loaded words in slug order and lists the slugs not yet loaded", () => {
    const cache = new Map<string, CollectionWord | null>([["b", cw("b")], ["a", cw("a")]]);
    const out = resolveCollection(["a", "c", "b", "d"], cache);
    expect(out.words.map((w) => w.slug)).toEqual(["a", "b"]);
    expect(out.missing).toEqual(["c", "d"]);
  });

  it("skips slugs the server reported as unknown without asking for them again", () => {
    const cache = new Map<string, CollectionWord | null>([["a", cw("a")], ["gone", null]]);
    const out = resolveCollection(["gone", "a"], cache);
    expect(out.words.map((w) => w.slug)).toEqual(["a"]);
    expect(out.missing).toEqual([]);
  });

  it("drops words whose slug is no longer in the list, with nothing to fetch", () => {
    const cache = new Map<string, CollectionWord | null>([["a", cw("a")], ["b", cw("b")]]);
    const out = resolveCollection(["b"], cache);
    expect(out.words.map((w) => w.slug)).toEqual(["b"]);
    expect(out.missing).toEqual([]);
  });

  it("handles an empty list", () => {
    expect(resolveCollection([], new Map())).toEqual({ words: [], missing: [] });
  });
});
