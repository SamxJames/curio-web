import { describe, it, expect } from "vitest";
import { getRelatedWords } from "./relatedWords";
import { WORDS, getWordBySlug } from "./words";

describe("getRelatedWords", () => {
  it("gives every word in the bank at least two outbound links", () => {
    // This is the guarantee the whole approach rests on — 926 of 1,147
    // pages would be dead ends under prose matching. If this ever fails,
    // the internal-link mesh has holes and story pages are orphaned again.
    for (const word of WORDS) {
      const { peers, neighbours } = getRelatedWords(word.slug);
      expect(peers.length + neighbours.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("never links a word to itself, and never repeats a link across both lists", () => {
    for (const word of WORDS) {
      const { peers, neighbours } = getRelatedWords(word.slug);
      const slugs = [...peers, ...neighbours].map((w) => w.slug);
      expect(slugs).not.toContain(word.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it("only ever links to slugs that exist", () => {
    for (const word of WORDS) {
      const { peers, neighbours } = getRelatedWords(word.slug);
      for (const link of [...peers, ...neighbours]) {
        expect(getWordBySlug(link.slug)).toBeDefined();
      }
    }
  });

  it("names a language only when it's genuinely this word's own source", () => {
    for (const word of WORDS) {
      const { language } = getRelatedWords(word.slug);
      if (language === null) continue;
      expect(word.lineage).toContain(language);
    }
  });

  it("every peer genuinely shares the named language", () => {
    for (const word of WORDS) {
      const { language, peers } = getRelatedWords(word.slug);
      if (language === null) continue;
      for (const peer of peers) {
        expect(getWordBySlug(peer.slug)!.lineage).toContain(language);
      }
    }
  });

  it("language is null exactly when there are no peers", () => {
    for (const word of WORDS) {
      const { language, peers } = getRelatedWords(word.slug);
      expect(language === null).toBe(peers.length === 0);
    }
  });

  it("is deterministic", () => {
    expect(getRelatedWords("quarantine")).toEqual(getRelatedWords("quarantine"));
  });

  it("returns nothing for an unknown slug", () => {
    expect(getRelatedWords("not-a-real-word")).toEqual({ language: null, peers: [], neighbours: [] });
  });

  it("caps peers at four and neighbours at two", () => {
    for (const word of WORDS) {
      const { peers, neighbours } = getRelatedWords(word.slug);
      expect(peers.length).toBeLessThanOrEqual(4);
      expect(neighbours.length).toBeLessThanOrEqual(2);
    }
  });
});
