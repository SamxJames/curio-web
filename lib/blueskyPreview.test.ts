import { describe, expect, it } from "vitest";
import { buildBlueskyPreview } from "./blueskyPreview";
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
