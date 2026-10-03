import { describe, expect, it } from "vitest";
import type { WordDemand } from "./types";
import {
  encodeTitle,
  formatTrend,
  lastCompleteMonths,
  rankByDemand,
  summarizeViews,
  titleCandidates,
  USER_AGENT,
} from "./wiktionary";

describe("titleCandidates", () => {
  it("tries the exact spelling first, then the other case", () => {
    expect(titleCandidates("quarantine")).toEqual(["quarantine", "Quarantine"]);
    expect(titleCandidates("December")).toEqual(["December", "december"]);
  });

  it("returns one candidate when swapping case changes nothing", () => {
    expect(titleCandidates("1984")).toEqual(["1984"]);
  });
});

describe("encodeTitle", () => {
  it("turns spaces into underscores and percent-encodes the rest", () => {
    expect(encodeTitle("hoi polloi")).toBe("hoi_polloi");
    expect(encodeTitle("café")).toBe("caf%C3%A9");
    expect(encodeTitle("AC/DC")).toBe("AC%2FDC");
    expect(encodeTitle("what?")).toBe("what%3F");
  });
});

describe("lastCompleteMonths", () => {
  it("returns the 12 complete months before the run, oldest first", () => {
    const months = lastCompleteMonths(new Date("2026-10-03T12:00:00Z"));
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("202510");
    expect(months[11]).toBe("202609");
  });

  it("crosses a year boundary", () => {
    expect(lastCompleteMonths(new Date("2026-01-01T00:00:00Z"), 2)).toEqual(["202511", "202512"]);
  });
});

describe("summarizeViews", () => {
  const months = (prev3: number[], last3: number[]) => [0, 0, 0, 0, 0, 0, ...prev3, ...last3];

  it("totals 12 months, averages the last 3 and compares them with the 3 before", () => {
    const s = summarizeViews([1200, 1100, 0, 900, 800, 1000, 950, 1050, 1000, 1300, 1500, 1700]);
    expect(s.total12).toBe(12500);
    expect(s.avg3).toBe(1500);
    expect(s.trend).toBeCloseTo(0.5);
  });

  it("reports a fall as a negative trend", () => {
    expect(summarizeViews(months([100, 100, 100], [50, 50, 50])).trend).toBeCloseTo(-0.5);
  });

  it("has no trend when the previous 3 months were zero", () => {
    expect(summarizeViews(months([0, 0, 0], [10, 0, 0])).trend).toBeNull();
    expect(summarizeViews(months([0, 0, 0], [0, 0, 0])).trend).toBeNull();
  });
});

describe("formatTrend", () => {
  it("formats signed whole percentages", () => {
    expect(formatTrend(0.5, 1)).toBe("+50%");
    expect(formatTrend(-0.123, 1)).toBe("-12%");
    expect(formatTrend(0, 1)).toBe("0%");
    expect(formatTrend(-0.001, 1)).toBe("0%");
  });

  it("says new or a dash when there's no baseline", () => {
    expect(formatTrend(null, 3)).toBe("new");
    expect(formatTrend(null, 0)).toBe("—");
  });
});

describe("rankByDemand", () => {
  const w = (word: string, total12: number, title: string | null = word): WordDemand => ({
    slug: word,
    word,
    title,
    views: [],
    total12,
    avg3: 0,
    trend: null,
  });

  it("sorts by 12-month total, ties alphabetically, and drops words with no page", () => {
    const ranked = rankByDemand([w("b", 5), w("a", 5), w("c", 9), w("x", 100, null)]);
    expect(ranked.map((r) => r.word)).toEqual(["c", "a", "b"]);
  });
});

describe("USER_AGENT", () => {
  it("names the tool and gives a contact address", () => {
    expect(USER_AGENT).toBe(
      "CurioDemandReport/1.0 (https://curioword.com; samfillingham@protonmail.com)"
    );
  });
});
