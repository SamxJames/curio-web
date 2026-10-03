import { describe, expect, it } from "vitest";
import {
  joinByWord,
  nearlyThere,
  offPatternQueries,
  opportunities,
  pagePath,
  pageStatsByPath,
  storySlug,
  topByDemand,
  weekOnWeek,
  wordsBySlug,
} from "./report";
import { gscFromFixtures, makeSnapshot, word } from "./testing";
import { lastCompleteMonths } from "./wiktionary";
import type { SearchConsoleData } from "./types";

describe("pagePath and storySlug", () => {
  it("normalises curioword.com URLs, apex or www, to a path", () => {
    expect(pagePath("https://curioword.com/story/quarantine")).toBe("/story/quarantine");
    expect(pagePath("https://www.curioword.com/story/quarantine/")).toBe("/story/quarantine");
    expect(pagePath("https://curioword.com/")).toBe("/");
    expect(pagePath("https://example.com/story/x")).toBeNull();
    expect(pagePath("not a url")).toBeNull();
  });

  it("finds the slug of a story path only", () => {
    expect(storySlug("/story/quarantine")).toBe("quarantine");
    expect(storySlug("/words")).toBeNull();
    expect(storySlug("/story/a/b")).toBeNull();
  });

  it("returns null for malformed URI escapes", () => {
    expect(storySlug("/story/%E0%A4%A")).toBeNull();
  });
});

describe("pageStatsByPath", () => {
  it("merges apex and www rows, weighting position by impressions", () => {
    const stats = pageStatsByPath(gscFromFixtures().byPage).get("/story/quarantine")!;
    expect(stats.impressions).toBe(150);
    expect(stats.clicks).toBe(5);
    expect(stats.ctr).toBeCloseTo(5 / 150);
    expect(stats.position).toBeCloseTo(12);
  });
});

describe("joinByWord and topByDemand", () => {
  it("attaches each word's story-page stats and ranks by Wiktionary demand", () => {
    const top = topByDemand(joinByWord(makeSnapshot()));
    expect(top[0]).toMatchObject({ slug: "quarantine", gsc: { impressions: 150, clicks: 5 } });
    expect(top[1]).toMatchObject({ slug: "december", gsc: { impressions: 6 } });
    expect(top.find((w) => w.slug === "algebra")?.gsc).toBeNull();
    expect(top.map((w) => w.slug)).not.toContain("zzxqv");
  });

  it("leaves gsc null for every word when Search Console was skipped", () => {
    expect(joinByWord(makeSnapshot({ searchConsole: null })).every((w) => w.gsc === null)).toBe(true);
  });

  it("caps the list", () => {
    expect(topByDemand(joinByWord(makeSnapshot()), 3)).toHaveLength(3);
  });
});

describe("opportunities", () => {
  it("keeps top-quarter words with fewer than 10 impressions", () => {
    // 8 words with a page and views → top quarter is quarantine (150 impressions) and December (6).
    expect(opportunities(joinByWord(makeSnapshot())).map((w) => w.slug)).toEqual(["december"]);
  });

  it("counts a word with no Search Console row as zero impressions", () => {
    const snapshot = makeSnapshot({ searchConsole: { ...gscFromFixtures(), byPage: [] } });
    expect(opportunities(joinByWord(snapshot)).map((w) => w.slug)).toEqual(["quarantine", "december"]);
  });
});

describe("nearlyThere", () => {
  it("lists pages averaging position 8 to 20, by impressions", () => {
    const snapshot = makeSnapshot();
    const rows = nearlyThere(snapshot.searchConsole!, wordsBySlug(snapshot));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ path: "/story/quarantine", word: "quarantine", impressions: 150 });
    expect(rows[0].position).toBeCloseTo(12);
  });
});

describe("offPatternQueries", () => {
  it("splits story-page queries into off-word and other-intent", () => {
    const snapshot = makeSnapshot();
    const { offWord, otherIntent } = offPatternQueries(snapshot.searchConsole!, wordsBySlug(snapshot));
    expect(offWord.map((r) => r.query)).toEqual(["forty days venice"]);
    expect(otherIntent).toHaveLength(1);
    expect(otherIntent[0]).toMatchObject({ query: "quarantine meaning", path: "/story/quarantine", impressions: 50, clicks: 1 });
    expect(otherIntent[0].position).toBeCloseTo(18.1);
  });

  it("matches the word case-insensitively and treats origin stems as on-pattern", () => {
    const snapshot = makeSnapshot();
    const data: SearchConsoleData = {
      ...snapshot.searchConsole!,
      byPageQuery: [
        { keys: ["https://curioword.com/story/december", "december etymology"], clicks: 0, impressions: 5, ctr: 0, position: 9 },
        { keys: ["https://curioword.com/story/december", "where does december come from"], clicks: 0, impressions: 4, ctr: 0, position: 9 },
        { keys: ["https://curioword.com/story/december", "December calendar"], clicks: 0, impressions: 3, ctr: 0, position: 9 },
      ],
    };
    const { offWord, otherIntent } = offPatternQueries(data, wordsBySlug(snapshot));
    expect(offWord).toEqual([]);
    expect(otherIntent.map((r) => r.query)).toEqual(["December calendar"]);
  });
});

describe("weekOnWeek", () => {
  const previousGsc = (): SearchConsoleData => ({
    ...gscFromFixtures(),
    startDate: "2026-08-27",
    endDate: "2026-09-23",
    byPage: [
      { keys: ["https://curioword.com/story/quarantine"], clicks: 2, impressions: 60, ctr: 0.033, position: 15 },
      { keys: ["https://curioword.com/story/december"], clicks: 0, impressions: 10, ctr: 0, position: 40 },
      { keys: ["https://curioword.com/story/bank"], clicks: 1, impressions: 20, ctr: 0.05, position: 30 },
    ],
  });

  it("says there's nothing to compare on the first run", () => {
    expect(weekOnWeek(makeSnapshot(), null)).toEqual({ previousDate: null, searchConsole: null, wiktionary: null });
  });

  it("compares Search Console page by page", () => {
    const previous = makeSnapshot({ date: "2026-09-28", searchConsole: previousGsc() });
    const w = weekOnWeek(makeSnapshot(), previous);
    expect(w.previousDate).toBe("2026-09-28");
    const s = w.searchConsole!;
    expect(s.impressions).toEqual({ label: "impressions", before: 90, after: 236 });
    expect(s.clicks).toEqual({ label: "clicks", before: 3, after: 14 });
    expect(s.gains.map((c) => [c.label, c.after - c.before])).toEqual([
      ["/story/quarantine", 90],
      ["/", 80],
    ]);
    expect(s.losses.map((c) => [c.label, c.after - c.before])).toEqual([
      ["/story/bank", -20],
      ["/story/december", -4],
    ]);
    expect(s.positionGains).toHaveLength(1);
    expect(s.positionGains[0]).toMatchObject({ label: "/story/quarantine", before: 15 });
    expect(s.positionGains[0].after).toBeCloseTo(12);
    expect(s.newPages).toEqual([{ label: "/", before: 0, after: 80 }]);
  });

  it("skips the Search Console comparison when either week skipped it", () => {
    const previous = makeSnapshot({ date: "2026-09-28", searchConsole: null });
    expect(weekOnWeek(makeSnapshot(), previous).searchConsole).toBeNull();
  });

  it("compares Wiktionary only when the month window has rolled over", () => {
    const sameMonths = makeSnapshot({ date: "2026-09-28" });
    expect(weekOnWeek(makeSnapshot(), sameMonths).wiktionary).toBeNull();

    const older = makeSnapshot({ date: "2026-09-28" });
    older.wiktionary = {
      months: lastCompleteMonths(new Date("2026-09-28T06:00:00Z")),
      words: [word("quarantine", 10000), word("december", 9500, { word: "December" })],
    };
    const w = weekOnWeek(makeSnapshot(), older).wiktionary!;
    expect(w.gains).toEqual([{ label: "quarantine", before: 10000, after: 12500 }]);
    expect(w.losses).toEqual([{ label: "December", before: 9500, after: 9000 }]);
  });
});
