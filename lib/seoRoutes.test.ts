import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildSitemapEntries,
  buildRobots,
  PUBLIC_ROUTES,
  DISALLOWED_PATHS,
  PAGES_UPDATED,
} from "./seoRoutes";
import { WORDS } from "./words";
import { languagePages } from "./languages/pages";

const original = process.env.CURIO_SITE_URL;

beforeEach(() => {
  process.env.CURIO_SITE_URL = "https://curio.example";
});

afterEach(() => {
  if (original === undefined) delete process.env.CURIO_SITE_URL;
  else process.env.CURIO_SITE_URL = original;
});

describe("buildSitemapEntries", () => {
  it("lists every public route, every word, /languages and every language page, and nothing else", () => {
    const entries = buildSitemapEntries();
    expect(entries).toHaveLength(PUBLIC_ROUTES.length + WORDS.length + 1 + languagePages().length);
  });

  it("includes /languages (weekly, 0.8) and each language page (monthly, 0.7)", () => {
    const entries = buildSitemapEntries();
    expect(entries).toContainEqual({
      url: "https://curio.example/languages",
      changeFrequency: "weekly",
      priority: 0.8,
      lastModified: PAGES_UPDATED.indexes,
    });
    for (const page of languagePages()) {
      expect(entries).toContainEqual({
        url: `https://curio.example/language/${page.slug}`,
        changeFrequency: "monthly",
        priority: 0.7,
        lastModified: PAGES_UPDATED.languages,
      });
    }
  });

  it("includes every word's story URL exactly once", () => {
    const urls = buildSitemapEntries().map((e) => e.url);
    for (const word of WORDS) {
      const url = `https://curio.example/story/${word.slug}`;
      expect(urls.filter((u) => u === url)).toHaveLength(1);
    }
  });

  it("emits absolute URLs on the configured origin", () => {
    for (const entry of buildSitemapEntries()) {
      expect(entry.url.startsWith("https://curio.example/")).toBe(true);
    }
  });

  it("never leaks a private route", () => {
    for (const { url } of buildSitemapEntries()) {
      const { pathname } = new URL(url);
      for (const path of DISALLOWED_PATHS) {
        const prefix = path.endsWith("/") ? path : `${path}/`;
        expect(pathname === path.replace(/\/$/, "") || pathname.startsWith(prefix)).toBe(false);
      }
    }
  });

  it("contains no duplicate URLs", () => {
    const urls = buildSitemapEntries().map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("includes the A–Z index, which is the only page linking every word", () => {
    const urls = buildSitemapEntries().map((e) => e.url);
    expect(urls).toContain("https://curio.example/words");
  });
});

describe("lastModified", () => {
  const entryFor = (path: string) => {
    const entry = buildSitemapEntries().find((e) => new URL(e.url).pathname === path);
    if (!entry) throw new Error(`no sitemap entry for ${path}`);
    return entry;
  };
  const underPrefix = (prefix: string) =>
    buildSitemapEntries().filter((e) => new URL(e.url).pathname.startsWith(prefix));

  it("dates every story page to the stories template date", () => {
    const stories = underPrefix("/story/");
    expect(stories).toHaveLength(WORDS.length);
    for (const entry of stories) {
      expect(entry.lastModified).toBe(PAGES_UPDATED.stories);
    }
  });

  it("dates every language page to the languages template date", () => {
    const pages = underPrefix("/language/");
    expect(pages).toHaveLength(languagePages().length);
    for (const entry of pages) {
      expect(entry.lastModified).toBe(PAGES_UPDATED.languages);
    }
  });

  it("dates /languages and /words to the indexes template date", () => {
    expect(entryFor("/languages").lastModified).toBe(PAGES_UPDATED.indexes);
    expect(entryFor("/words").lastModified).toBe(PAGES_UPDATED.indexes);
  });

  it("omits lastModified on /, /play, /history and /attribution", () => {
    for (const path of ["/", "/play", "/history", "/attribution"]) {
      expect("lastModified" in entryFor(path), path).toBe(false);
    }
  });

  it("holds each date as a YYYY-MM-DD day that is not in the future", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const value of Object.values(PAGES_UPDATED)) {
      expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(value <= today).toBe(true);
    }
  });
});

describe("buildRobots", () => {
  it("allows the site root", () => {
    expect(buildRobots().rules.allow).toBe("/");
    expect(buildRobots().rules.userAgent).toBe("*");
  });

  it("disallows every private path", () => {
    const { disallow } = buildRobots().rules;
    for (const path of DISALLOWED_PATHS) {
      expect(disallow).toContain(path);
    }
  });

  it("points at the absolute sitemap URL and the recent-days feed", () => {
    expect(buildRobots().sitemap).toEqual([
      "https://curio.example/sitemap.xml",
      "https://curio.example/feed.xml",
    ]);
  });

  // Meta's fetcher may honour robots.txt, and Instagram must fetch the
  // carousel slides; the slide route sends X-Robots-Tag: noindex instead.
  it("does not disallow the social image routes, and keeps them out of the sitemap", () => {
    expect(buildRobots().rules.disallow.some((path) => path.startsWith("/social"))).toBe(false);
    expect(buildSitemapEntries().some((e) => new URL(e.url).pathname.startsWith("/social/"))).toBe(false);
  });

  it("disallows the unsubscribe confirm page and its API route", () => {
    const { disallow } = buildRobots().rules;
    expect(disallow).toContain("/unsubscribe");
    expect(disallow).toContain("/api/");
  });

  it("disallows the double opt-in confirm and result pages", () => {
    const { disallow } = buildRobots().rules;
    expect(disallow).toContain("/subscribe");
    expect(disallow).toContain("/subscribed");
  });
});
