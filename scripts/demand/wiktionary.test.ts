import { describe, expect, it } from "vitest";
import type { WordDemand } from "./types";
import {
  collectWiktionary,
  encodeTitle,
  existingTitles,
  fetchMonthlyViews,
  formatTrend,
  lastCompleteMonths,
  rankByDemand,
  resolveTitles,
  summarizeViews,
  titleCandidates,
  USER_AGENT,
} from "./wiktionary";
import { FIXTURE_ENTRIES, fakeFetch, jsonResponse, wikimediaRoute } from "./testing";

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

const MONTHS = lastCompleteMonths(new Date("2026-10-03T12:00:00Z"));

describe("existingTitles", () => {
  it("maps titles that exist to their canonical title and leaves out missing ones", async () => {
    const fetch = fakeFetch(wikimediaRoute);
    const found = await existingTitles(["quarantine", "December", "zzxqv"], fetch);
    expect([...found]).toEqual([["quarantine", "quarantine"]]);
  });

  it("follows the API's normalisation", async () => {
    const fetch = fakeFetch(() =>
      jsonResponse(
        JSON.stringify({
          query: {
            normalized: [{ from: "hoi_polloi", to: "hoi polloi" }],
            pages: [{ pageid: 1, ns: 0, title: "hoi polloi" }],
          },
        })
      )
    );
    const found = await existingTitles(["hoi_polloi"], fetch);
    expect(found.get("hoi_polloi")).toBe("hoi polloi");
  });

  it("asks for at most 50 titles per request, with the User-Agent", async () => {
    const fetch = fakeFetch(() => jsonResponse('{"query":{"pages":[]}}'));
    const titles = Array.from({ length: 120 }, (_, i) => `w${i}`);
    await existingTitles(titles, fetch);
    expect(fetch).toHaveBeenCalledTimes(3);
    const batches = fetch.mock.calls.map(([url]) => new URL(url).searchParams.get("titles")!.split("|"));
    expect(batches.map((b) => b.length)).toEqual([50, 50, 20]);
    const init = fetch.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers["User-Agent"]).toBe(USER_AGENT);
  });

  it("makes no request for an empty list", async () => {
    const fetch = fakeFetch();
    expect((await existingTitles([], fetch)).size).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails on an HTTP error", async () => {
    const fetch = fakeFetch(() => jsonResponse("{}", 500));
    await expect(existingTitles(["a"], fetch)).rejects.toThrow("Wiktionary title lookup failed: HTTP 500");
  });
});

describe("resolveTitles", () => {
  it("uses the exact spelling, falls back to the other case, and records no page as null", async () => {
    const fetch = fakeFetch(wikimediaRoute);
    const titles = await resolveTitles(["quarantine", "December", "zzxqv"], fetch);
    expect(titles.get("quarantine")).toBe("quarantine");
    expect(titles.get("December")).toBe("december");
    expect(titles.get("zzxqv")).toBeNull();
  });
});

describe("fetchMonthlyViews", () => {
  it("requests the user-agent monthly series for the window and fills gaps with 0", async () => {
    const fetch = fakeFetch(wikimediaRoute);
    const views = await fetchMonthlyViews("quarantine", MONTHS, fetch);
    expect(fetch.mock.calls[0][0]).toBe(
      "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wiktionary.org/all-access/user/quarantine/monthly/20251001/20260930"
    );
    expect(views).toEqual([1200, 1100, 0, 900, 800, 1000, 950, 1050, 1000, 1300, 1500, 1700]);
  });

  it("treats a 404 for an existing page as zero views", async () => {
    const fetch = fakeFetch(wikimediaRoute);
    expect(await fetchMonthlyViews("december", MONTHS, fetch)).toEqual(Array(12).fill(0));
  });

  it("fails on any other HTTP error", async () => {
    const fetch = fakeFetch(() => jsonResponse("{}", 503));
    await expect(fetchMonthlyViews("quarantine", MONTHS, fetch)).rejects.toThrow(
      'Wiktionary pageviews failed for "quarantine": HTTP 503'
    );
  });
});

describe("collectWiktionary", () => {
  it("summarises every word and records words with no page instead of failing", async () => {
    const fetch = fakeFetch(wikimediaRoute);
    const progress: number[] = [];
    const data = await collectWiktionary(FIXTURE_ENTRIES, {
      fetcher: fetch,
      now: new Date("2026-10-03T12:00:00Z"),
      onProgress: (done) => progress.push(done),
    });
    expect(data.months).toEqual(MONTHS);
    const [quarantine, december, zzxqv] = data.words;
    expect(quarantine).toMatchObject({ slug: "quarantine", title: "quarantine", total12: 12500, avg3: 1500, trend: 0.5 });
    expect(december).toMatchObject({ word: "December", title: "december", total12: 0, trend: null });
    expect(zzxqv).toMatchObject({ title: null, total12: 0, views: Array(12).fill(0) });
    expect(progress).toEqual([1, 2, 3]);
    const pageviewCalls = fetch.mock.calls.filter(([url]) => url.startsWith("https://wikimedia.org/"));
    expect(pageviewCalls).toHaveLength(2);
  });
});
