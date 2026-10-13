import { WORDS } from "./words";
import { absoluteUrl } from "./siteUrl";
import { FEED_PATH } from "./feed";
import { languagePages } from "./languages/pages";

/** Routes a crawler should index. Every other route is private,
 * account-scoped, an auth flow or an API endpoint — see DISALLOWED_PATHS. */
export const PUBLIC_ROUTES = ["/", "/history", "/words", "/play", "/attribution"] as const;

/** Kept out of the sitemap AND disallowed in robots.txt. These are
 * account-scoped, auth-flow or API paths: a crawler can only ever see the
 * signed-out shell of them, so indexing them would put empty or
 * redirect-to-login pages in search results under Curio's name.
 * /collection is here for the same reason: its favourites live in each
 * reader's own browser, so to a crawler it is an empty per-device shell. */
export const DISALLOWED_PATHS = [
  "/admin",
  "/account",
  "/login",
  "/collection",
  "/subscribe",
  "/subscribed",
  "/unsubscribe",
  "/unsubscribed",
  "/api/",
  // Not "/social/": Instagram must fetch the carousel JPEGs there, and a
  // fetcher that honours robots.txt would be turned away. The slide route
  // sends X-Robots-Tag: noindex instead.
] as const;

export type SitemapEntry = {
  url: string;
  changeFrequency: "daily" | "weekly" | "monthly";
  priority: number;
  /** ISO date (YYYY-MM-DD). Only ever set from PAGES_UPDATED. */
  lastModified?: string;
};

/** The day each page type's HTML last changed in a way a crawler should
 * re-read (links, metadata, content), set by hand. Not a build time: a
 * redeploy that changes nothing must not claim a change. Bump the relevant
 * date in the same commit as the template change. Home, /play and /history
 * change daily and the sitemap is built once per deploy, so they carry none. */
export const PAGES_UPDATED = {
  // 2026-10-13: "Etymology of <word>:" descriptions and a Languages footer link.
  stories: "2026-10-13",
  // 2026-10-13: Languages footer link (pages first published 2026-10-12).
  languages: "2026-10-13",
  // /words and /languages: new description, footer link.
  indexes: "2026-10-13",
} as const;

/** `lastModified` appears only where PAGES_UPDATED says when that page type
 * last changed. Home, /play, /history and /attribution carry none: the first
 * two change daily, and the other two haven't changed. `changeFrequency` and
 * `priority` are hints, not claims of fact, so they stay on every entry. */
export function buildSitemapEntries(): SitemapEntry[] {
  const routes: SitemapEntry[] = PUBLIC_ROUTES.map((route) => ({
    url: absoluteUrl(route),
    // "/" and "/play" genuinely change every day (the rotation and the
    // puzzle); the index pages gain at most one row a day.
    changeFrequency: route === "/" || route === "/play" ? "daily" : "weekly",
    priority: route === "/" ? 1 : 0.8,
    ...(route === "/words" ? { lastModified: PAGES_UPDATED.indexes } : {}),
  }));

  const stories: SitemapEntry[] = WORDS.map((word) => ({
    url: absoluteUrl(`/story/${word.slug}`),
    changeFrequency: "monthly",
    priority: 0.6,
    lastModified: PAGES_UPDATED.stories,
  }));

  // The language pages and their index. Monthly: a page only changes when a new
  // sheet batch or new words land.
  const languages: SitemapEntry[] = [
    {
      url: absoluteUrl("/languages"),
      changeFrequency: "weekly",
      priority: 0.8,
      lastModified: PAGES_UPDATED.indexes,
    },
    ...languagePages().map((page) => ({
      url: absoluteUrl(`/language/${page.slug}`),
      changeFrequency: "monthly" as const,
      priority: 0.7,
      lastModified: PAGES_UPDATED.languages,
    })),
  ];

  return [...routes, ...stories, ...languages];
}

export type RobotsConfig = {
  rules: { userAgent: string; allow: string; disallow: string[] };
  sitemap: string[];
};

/** One rule block for every crawler. The disallow list is the same
 * DISALLOWED_PATHS the sitemap excludes, so the two files can't drift into
 * advertising a URL that robots.txt blocks. */
export function buildRobots(): RobotsConfig {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...DISALLOWED_PATHS],
    },
    // Google and Bing both accept an RSS 2.0 feed as a sitemap; the short
    // recent-items feed is a freshness companion to the full sitemap.
    sitemap: [absoluteUrl("/sitemap.xml"), absoluteUrl(FEED_PATH)],
  };
}
