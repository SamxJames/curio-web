import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildSitemapEntries, PUBLIC_ROUTES, DISALLOWED_PATHS } from "./seoRoutes";
import { WORDS } from "./words";

const original = process.env.CURIO_SITE_URL;

beforeEach(() => {
  process.env.CURIO_SITE_URL = "https://curio.example";
});

afterEach(() => {
  if (original === undefined) delete process.env.CURIO_SITE_URL;
  else process.env.CURIO_SITE_URL = original;
});

describe("buildSitemapEntries", () => {
  it("lists every public route and every word, and nothing else", () => {
    const entries = buildSitemapEntries();
    expect(entries).toHaveLength(PUBLIC_ROUTES.length + WORDS.length);
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
});
