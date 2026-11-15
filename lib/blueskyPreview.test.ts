import { describe, expect, it } from "vitest";
import { buildBlueskyPreview, buildBlueskyRevealPreview } from "./blueskyPreview";
import { SAMPLE_REVEAL, buildBlueskyReveal } from "./dig/revealText";
import { graphemeLength } from "./blueskyPost";
import { getWordForDate } from "./words";
import { buildBlueskyPost } from "./bluesky";

describe("buildBlueskyPreview", () => {
  it("lists the next N UTC days, each with that day's calendar word and its exact post", () => {
    const rows = buildBlueskyPreview(new Date("2026-09-29T15:00:00Z"), 7);
    expect(rows.map((r) => r.day)).toEqual([
      "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05",
    ]);
    for (const r of rows) {
      const w = getWordForDate(new Date(`${r.day}T00:00:00Z`));
      expect(r.word).toBe(w.word);
      expect(r.text).toBe(buildBlueskyPost(w));
      expect(r.graphemes).toBeLessThanOrEqual(300);
      expect(r.card.uri).toContain(`/story/${w.slug}`);
    }
  });
});

describe("buildBlueskyRevealPreview", () => {
  it("is the exact reveal post and card for a sample day, within the limit, with no network", () => {
    const r = buildBlueskyRevealPreview();
    expect(r.reveal).toBe(SAMPLE_REVEAL);
    expect(r.text).toBe(buildBlueskyReveal(SAMPLE_REVEAL));
    expect(r.graphemes).toBe(graphemeLength(r.text));
    expect(r.graphemes).toBeLessThanOrEqual(300);
    expect(r.card.uri).toContain(`/dig/${SAMPLE_REVEAL.date}?`);
  });

  it("takes a real reveal when given one", () => {
    const real = { ...SAMPLE_REVEAL, prompt: "Name a fruit", fossilWord: "pawpaw" };
    expect(buildBlueskyRevealPreview(real).text).toContain("“Name a fruit”. The rarest answer: pawpaw.");
  });
});
