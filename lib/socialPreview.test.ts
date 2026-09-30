import { describe, expect, it } from "vitest";
import { buildSocialPreview } from "./socialPreview";
import { getWordForDate } from "./words";
import { buildCarouselSlides, buildInstagramCaption, buildThreadsPost } from "./socialPost";

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
        expect(s.url.endsWith(`/social/carousel/${w.slug}/${i + 1}`)).toBe(true);
      });
    }
  });
});
