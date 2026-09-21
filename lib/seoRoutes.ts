import { WORDS } from "./words";
import { absoluteUrl } from "./siteUrl";

/** Routes a crawler should index. Every other route is private,
 * account-scoped, an auth flow or an API endpoint — see DISALLOWED_PATHS. */
export const PUBLIC_ROUTES = ["/", "/history", "/words", "/play", "/attribution"] as const;

/** Kept out of the sitemap AND disallowed in robots.txt. These are
 * account-scoped, auth-flow or API paths: a crawler can only ever see the
 * signed-out shell of them, so indexing them would put empty or
 * redirect-to-login pages in search results under Curio's name. */
export const DISALLOWED_PATHS = [
  "/admin",
  "/account",
  "/login",
  "/collection",
  "/unsubscribed",
  "/api/",
] as const;

export type SitemapEntry = {
  url: string;
  changeFrequency: "daily" | "weekly" | "monthly";
  priority: number;
};

/** No `lastModified` anywhere in here on purpose: Curio has no per-word
 * modification date, and a build timestamp would be a claim about the
 * content that isn't true. `changeFrequency`/`priority` are hints, not
 * claims of fact, so they stay. */
export function buildSitemapEntries(): SitemapEntry[] {
  const routes: SitemapEntry[] = PUBLIC_ROUTES.map((route) => ({
    url: absoluteUrl(route),
    // "/" and "/play" genuinely change every day (the rotation and the
    // puzzle); the index pages gain at most one row a day.
    changeFrequency: route === "/" || route === "/play" ? "daily" : "weekly",
    priority: route === "/" ? 1 : 0.8,
  }));

  const stories: SitemapEntry[] = WORDS.map((word) => ({
    url: absoluteUrl(`/story/${word.slug}`),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...routes, ...stories];
}

export type RobotsConfig = {
  rules: { userAgent: string; allow: string; disallow: string[] };
  sitemap: string;
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
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
