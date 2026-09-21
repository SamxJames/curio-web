import { describe, it, expect } from "vitest";
import { getRelatedWords } from "./relatedWords";
import { WORDS, getWordBySlug } from "./words";

describe("getRelatedWords", () => {
  it("gives every word in the bank at least two outbound links", () => {
    // This is the guarantee the whole approach rests on — 926 of 1,147
    // pages would be dead ends under prose matching. If this ever fails,
    // the internal-link mesh has holes and story pages are orphaned again.
    for (const word of WORDS) {
      expect(getRelatedWords(word.slug).words.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("never links a word to itself, and never repeats a link", () => {
    for (const word of WORDS) {
      const slugs = getRelatedWords(word.slug).words.map((w) => w.slug);
      expect(slugs).not.toContain(word.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it("only ever links to slugs that exist", () => {
    for (const word of WORDS) {
      for (const link of getRelatedWords(word.slug).words) {
        expect(getWordBySlug(link.slug)).toBeDefined();
      }
    }
  });

  it("names a language only when both words genuinely share it", () => {
    for (const word of WORDS) {
      const { language, words } = getRelatedWords(word.slug);
      if (language === null) continue;
      expect(word.lineage).toContain(language);
      // At least one listed word must actually share it — the neighbours
      // filling out the list need not.
      expect(words.some((w) => getWordBySlug(w.slug)!.lineage.includes(language))).toBe(true);
    }
  });

  it("is deterministic", () => {
    expect(getRelatedWords("quarantine")).toEqual(getRelatedWords("quarantine"));
  });

  it("returns nothing for an unknown slug", () => {
    expect(getRelatedWords("not-a-real-word")).toEqual({ language: null, words: [] });
  });

  it("caps the list at six", () => {
    for (const word of WORDS) {
      expect(getRelatedWords(word.slug).words.length).toBeLessThanOrEqual(6);
    }
  });
});
