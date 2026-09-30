import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSocialPreview } from "./socialPreview";
import { getWordForDate } from "./words";
import { buildCarouselSlides, buildInstagramCaption, buildThreadsPost, carouselSlideUrl } from "./socialPost";

afterEach(() => vi.unstubAllGlobals());

describe("buildSocialPreview", () => {
  it("lists the next N UTC days, each with that day's calendar word and its exact posts", () => {
    const rows = buildSocialPreview(new Date("2026-10-01T15:00:00Z"), 3);
    expect(rows.map((r) => r.day)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    for (const r of rows) {
      const w = getWordForDate(new Date(`${r.day}T00:00:00Z`));
      expect(r.word).toBe(w.word);
      expect(r.threads).toBe(buildThreadsPost(w));
      expect(r.threadsLink).toContain("utm_source=threads");
      expect(r.threadsLink).toContain(`/story/${w.slug}`);
      expect(r.caption).toBe(buildInstagramCaption(w));
      const slides = buildCarouselSlides(w);
      expect(r.slides).toHaveLength(slides.length);
      r.slides.forEach((s, i) => {
        expect(s.n).toBe(i + 1);
        expect(s.kind).toBe(slides[i].kind);
        // The same URL the Instagram poster hands Meta.
        expect(s.url).toBe(carouselSlideUrl(w, i + 1));
      });
    }
  });

  it("stays offline: no slide warm-up, no network at all", () => {
    vi.stubGlobal("fetch", vi.fn());
    buildSocialPreview(new Date("2026-10-01T15:00:00Z"), 7);
    expect(fetch).not.toHaveBeenCalled();
  });
});
