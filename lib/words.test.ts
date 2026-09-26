import { describe, it, expect } from "vitest";
import { WORDS, getUniqueWordsMostRecent, getWordForDate } from "./words";

describe("WORDS content", () => {
  it("every entry has a teaser distinct from its origin text", () => {
    for (const word of WORDS) {
      expect(word.teaser.length).toBeGreaterThan(0);
      // The whole point of a separate teaser is that it isn't just the
      // origin text repeated — this doesn't catch every possible overlap,
      // but it catches the easy mistake of leaving teaser === origin.
      expect(word.teaser).not.toBe(word.origin);
    }
  });

  it("every entry has a non-empty lineage ending in English", () => {
    for (const word of WORDS) {
      expect(word.lineage.length).toBeGreaterThan(0);
      expect(word.lineage[word.lineage.length - 1]).toBe("English");
    }
  });
});

describe("WORDS clues", () => {
  it("every entry has exactly 3 clues", () => {
    for (const word of WORDS) {
      expect(word.clues).toHaveLength(3);
      for (const clue of word.clues) {
        expect(clue.length).toBeGreaterThan(0);
      }
    }
  });

  it("no clue contains the answer word or its rough stem, case-insensitively", () => {
    for (const word of WORDS) {
      const lowerWord = word.word.toLowerCase();
      // A deliberately crude stem — strips one common suffix if present.
      // This is a mechanical safety net, not a linguistic guarantee: it
      // catches the easy mistake of a clue containing "salary"/"salaries",
      // not every possible morphological relative. Editorial judgment
      // (never naming the word, its direct translation, or a visible
      // cognate in clue 1 specifically) is enforced by hand-authorship and
      // by the rewrite pipeline's prompt (scripts/rewriteEtymology.ts),
      // not by this test.
      const stem = lowerWord.replace(/(ing|tion|ed|es|s|y)$/i, "");
      for (const clue of word.clues) {
        const lowerClue = clue.toLowerCase();
        expect(lowerClue).not.toContain(lowerWord);
        expect(lowerClue).not.toContain(stem);
      }
    }
  });
});

describe("getUniqueWordsMostRecent", () => {
  it("returns exactly one entry per word, regardless of how many days have passed", () => {
    // Many days past WORDS.length, so the underlying calendar rotation has
    // definitely repeated every word several times over.
    const farFuture = new Date(Date.now() + WORDS.length * 5 * 24 * 60 * 60 * 1000);
    const unique = getUniqueWordsMostRecent(farFuture);
    expect(unique).toHaveLength(WORDS.length);
    const slugs = unique.map((d) => d.word.slug);
    expect(new Set(slugs).size).toBe(WORDS.length);
    expect(slugs.slice().sort()).toEqual(WORDS.map((w) => w.slug).sort());
  });

  it("orders words by most recent appearance first", () => {
    const today = new Date("2026-01-05T00:00:00Z"); // day 4 of the rotation
    const unique = getUniqueWordsMostRecent(today);
    // Today's word must be first, since it was (by definition) just seen.
    expect(unique[0].word).toEqual(getWordForDate(today));
  });

  it("returns fewer than WORDS.length entries before the rotation has completed once", () => {
    const earlyDay = new Date("2026-01-02T00:00:00Z"); // 2 days into the rotation
    const unique = getUniqueWordsMostRecent(earlyDay);
    expect(unique.length).toBeLessThanOrEqual(2);
    expect(unique.length).toBeGreaterThan(0);
  });
});

describe("launch schedule", () => {
  const day = (iso: string) => getWordForDate(new Date(iso + "T00:00:00Z")).slug;

  it("leaves every already-served position alone", () => {
    expect(WORDS[0].slug).toBe("quarantine");
    expect(day("2026-09-26")).toBe("custard");
    // Positions 26..268 were served in alphabetical batch order; they must
    // still be exactly that order, or past dates' live picks would move.
    const served = WORDS.slice(26, 269).map((w) => w.word.toLowerCase());
    expect(served).toEqual([...served].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("opens the friends-and-family launch with the hand-picked run", () => {
    expect(["2026-09-27", "2026-09-28", "2026-09-29"].map(day)).toEqual(["dinner", "fiasco", "sideburns"]);
  });

  it("no longer marches through the rest of the bank alphabetically", () => {
    const upcoming = Array.from({ length: 60 }, (_, i) =>
      getWordForDate(new Date(Date.UTC(2026, 8, 27 + i))).word.toLowerCase()
    );
    expect(upcoming).not.toEqual([...upcoming].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("is still a permutation of the whole bank", () => {
    expect(new Set(WORDS.map((w) => w.slug)).size).toBe(WORDS.length);
  });
});
