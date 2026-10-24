import { describe, expect, it } from "vitest";
import { digSitemapEntries } from "@/lib/seoRoutes";

describe("digSitemapEntries", () => {
  it("lists /dig, /dig/past and each archive page", () => {
    const urls = digSitemapEntries(["2026-12-09"]).map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/dig"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/dig/past"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/dig/2026-12-09"))).toBe(true);
    expect(urls.some((u) => u.includes("/play"))).toBe(false);
  });
});
