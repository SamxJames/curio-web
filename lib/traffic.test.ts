import { describe, expect, it } from "vitest";
import {
  classifySource,
  eventField,
  isLikelyBot,
  isTrafficSource,
  parseTrafficEvent,
  summarizeTraffic,
} from "./traffic";

const HOST = "curioword.com";

describe("classifySource", () => {
  it("prefers an allowlisted utm_source over the referrer", () => {
    expect(classifySource("?utm_source=email&utm_medium=email", "https://www.google.com/", HOST)).toBe("email");
    expect(classifySource("?utm_source=share", "", HOST)).toBe("share");
    expect(classifySource("?utm_source=threads", "", HOST)).toBe("threads");
  });

  it("ignores an unknown utm_source and falls back to the referrer", () => {
    expect(classifySource("?utm_source=evil%3Ahack", "https://www.google.co.uk/", HOST)).toBe("search");
  });

  it("buckets search engines", () => {
    for (const ref of [
      "https://www.google.com/",
      "https://www.google.co.uk/",
      "https://www.bing.com/search?q=x",
      "https://duckduckgo.com/",
      "https://search.brave.com/",
      "https://www.ecosia.org/",
      "https://search.yahoo.com/",
      "https://yandex.ru/",
    ]) {
      expect(classifySource("", ref, HOST)).toBe("search");
    }
  });

  it("buckets known social and community hosts", () => {
    expect(classifySource("", "https://bsky.app/profile/x", HOST)).toBe("bluesky");
    expect(classifySource("", "https://www.threads.net/", HOST)).toBe("threads");
    expect(classifySource("", "https://www.threads.com/", HOST)).toBe("threads");
    expect(classifySource("", "https://l.instagram.com/", HOST)).toBe("instagram");
    expect(classifySource("", "https://out.reddit.com/", HOST)).toBe("reddit");
    expect(classifySource("", "https://www.reddit.com/r/etymology", HOST)).toBe("reddit");
    expect(classifySource("", "https://news.ycombinator.com/item?id=1", HOST)).toBe("hn");
  });

  it("calls any other external referrer 'other'", () => {
    expect(classifySource("", "https://t.co/abc", HOST)).toBe("other");
    expect(classifySource("", "https://example.org/blog", HOST)).toBe("other");
  });

  it("calls no referrer 'direct'", () => {
    expect(classifySource("", "", HOST)).toBe("direct");
  });

  it("returns null for an internal referrer (not an arrival)", () => {
    expect(classifySource("", "https://curioword.com/words", HOST)).toBeNull();
    expect(classifySource("", "https://www.curioword.com/", HOST)).toBeNull();
  });

  it("treats an unparseable referrer as 'other', not a crash", () => {
    expect(classifySource("", "not a url", HOST)).toBe("other");
  });
});

describe("isLikelyBot", () => {
  it("flags crawlers and link-preview fetchers", () => {
    expect(isLikelyBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isLikelyBot("facebookexternalhit/1.1")).toBe(true);
    expect(isLikelyBot("Mozilla/5.0 HeadlessChrome/120.0")).toBe(true);
    expect(isLikelyBot(null)).toBe(true);
    expect(isLikelyBot("")).toBe(true);
  });

  it("lets ordinary browsers through", () => {
    expect(
      isLikelyBot("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")
    ).toBe(false);
  });
});

describe("parseTrafficEvent / eventField", () => {
  it("accepts the three event kinds and maps each to one field", () => {
    const visit = parseTrafficEvent({ kind: "visit", source: "search" });
    const signup = parseTrafficEvent({ kind: "signup", source: "share" });
    const share = parseTrafficEvent({ kind: "share", what: "puzzle" });
    expect(visit && eventField(visit)).toBe("visit:search");
    expect(signup && eventField(signup)).toBe("signup:share");
    expect(share && eventField(share)).toBe("share:puzzle");
  });

  it("rejects anything off the allowlist", () => {
    expect(parseTrafficEvent(null)).toBeNull();
    expect(parseTrafficEvent("visit")).toBeNull();
    expect(parseTrafficEvent({ kind: "visit", source: "myspace" })).toBeNull();
    expect(parseTrafficEvent({ kind: "share", what: "story; drop" })).toBeNull();
    expect(parseTrafficEvent({ kind: "delete", source: "search" })).toBeNull();
  });

  it("isTrafficSource narrows only real sources", () => {
    expect(isTrafficSource("direct")).toBe(true);
    expect(isTrafficSource("Direct")).toBe(false);
    expect(isTrafficSource(3)).toBe(false);
  });
});

describe("summarizeTraffic", () => {
  it("sums days per source, computes a signup rate, ignores unknown fields, sorts by visits", () => {
    const summary = summarizeTraffic({
      "2026-10-01": { "visit:search": 5, "visit:direct": 2, "signup:search": 1, "share:story": 1, "junk:x": 9 },
      "2026-10-02": { "visit:search": 3, "signup:direct": 1, "share:puzzle": 2, "share:story": 1 },
    });
    expect(summary.rows).toEqual([
      { source: "search", visits: 8, signups: 1, rate: 1 / 8 },
      { source: "direct", visits: 2, signups: 1, rate: 1 / 2 },
    ]);
    expect(summary.totals).toEqual({ visits: 10, signups: 2 });
    expect(summary.shares).toEqual({ story: 2, puzzle: 2 });
  });

  it("gives a null rate when a source has signups but no counted visit", () => {
    const summary = summarizeTraffic({ "2026-10-01": { "signup:email": 1 } });
    expect(summary.rows).toEqual([{ source: "email", visits: 0, signups: 1, rate: null }]);
  });

  it("is empty for no data", () => {
    expect(summarizeTraffic({})).toEqual({
      rows: [],
      totals: { visits: 0, signups: 0 },
      shares: { story: 0, puzzle: 0 },
    });
  });
});
