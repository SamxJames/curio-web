import { describe, it, expect } from "vitest";
import {
  computeLanguageStats,
  groupByMonth,
  formatShortDate,
  monthLabel,
  spellNumber,
  capitalize,
  pluralize,
} from "./collection";
import type { HistoryDay } from "./words";
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
  };
}

function day(date: string, w: WordEntry): HistoryDay {
  return { date, word: w };
}

describe("computeLanguageStats", () => {
  it("excludes English and counts every other language in the lineage", () => {
    const entries = [
      day("2026-01-03", word("a", ["Latin", "English"])),
      day("2026-01-02", word("b", ["Latin", "Italian", "English"])),
      day("2026-01-01", word("c", ["Old English", "English"])),
    ];
    const stats = computeLanguageStats(entries);
    expect(stats.map((s) => s.name)).not.toContain("English");
    expect(stats.find((s) => s.name === "Latin")?.count).toBe(2);
    expect(stats.find((s) => s.name === "Italian")?.count).toBe(1);
    expect(stats.find((s) => s.name === "Old English")?.count).toBe(1);
  });

  it("orders by count descending, then alphabetically", () => {
    const entries = [
      day("2026-01-04", word("a", ["Nahuatl", "English"])),
      day("2026-01-03", word("b", ["Latin", "English"])),
      day("2026-01-02", word("c", ["Latin", "English"])),
      day("2026-01-01", word("d", ["Czech", "English"])),
    ];
    const stats = computeLanguageStats(entries);
    expect(stats.map((s) => s.name)).toEqual(["Latin", "Czech", "Nahuatl"]);
  });

  it("steps opacity linearly from 0.58 (most common) to 0.24 (least common)", () => {
    const entries = [
      day("2026-01-03", word("a", ["Latin", "English"])),
      day("2026-01-03", word("a2", ["Latin", "English"])),
      day("2026-01-02", word("b", ["Italian", "English"])),
      day("2026-01-01", word("c", ["Czech", "English"])),
    ];
    const stats = computeLanguageStats(entries);
    expect(stats[0].opacity).toBeCloseTo(0.58);
    expect(stats[stats.length - 1].opacity).toBeCloseTo(0.24);
  });

  it("puts a single language at the top of the opacity range", () => {
    const entries = [day("2026-01-01", word("a", ["Latin", "English"]))];
    const stats = computeLanguageStats(entries);
    expect(stats).toHaveLength(1);
    expect(stats[0].opacity).toBeCloseTo(0.58);
  });

  it("returns an empty list for no entries", () => {
    expect(computeLanguageStats([])).toEqual([]);
  });
});

describe("groupByMonth", () => {
  it("groups consecutive same-month entries together", () => {
    const entries = [
      day("2026-09-10", word("a", ["English"])),
      day("2026-09-01", word("b", ["English"])),
      day("2026-08-20", word("c", ["English"])),
    ];
    const groups = groupByMonth(entries);
    expect(groups.map((g) => g.label)).toEqual(["September", "August"]);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].items).toHaveLength(1);
  });

  it("keeps same-named months a year apart in separate groups", () => {
    const entries = [
      day("2026-09-01", word("a", ["English"])),
      day("2025-09-01", word("b", ["English"])),
    ];
    const groups = groupByMonth(entries);
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe("September");
    expect(groups[1].label).toBe("September");
  });
});

describe("formatShortDate", () => {
  it("formats as day-then-month", () => {
    expect(formatShortDate("2026-09-09")).toBe("9 Sep");
    expect(formatShortDate("2026-01-01")).toBe("1 Jan");
  });
});

describe("monthLabel", () => {
  it("returns the full month name", () => {
    expect(monthLabel("2026-04-15")).toBe("April");
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
