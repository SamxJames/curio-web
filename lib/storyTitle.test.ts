import { describe, expect, it } from "vitest";
import { WORDS, type WordEntry } from "./words";
import { sourceLanguage, storyMetaDescription, storyPageTitle } from "./storyTitle";

function word(slug: string, lineage: string[]): WordEntry {
  return {
    slug, word: slug, respelling: "", partOfSpeech: "noun", teaser: "",
    origin: "", journey: "", related: "", lineage, clues: ["", "", ""],
  };
}

describe("sourceLanguage", () => {
  it("is the language English borrowed from", () => {
    expect(sourceLanguage(word("jungle", ["Sanskrit", "Hindustani", "English"]))).toBe("Hindustani");
  });

  it("looks past Middle English to the real source", () => {
    expect(sourceLanguage(word("beef", ["Latin", "Old French", "Middle English", "English"]))).toBe("Old French");
  });

  it("counts Old English as a source", () => {
    expect(
      sourceLanguage(word("owl", ["Proto-Germanic", "Old English", "Middle English", "English"])),
    ).toBe("Old English");
  });

  it("is null for a word coined in English", () => {
    expect(sourceLanguage(word("blurb", ["English"]))).toBeNull();
  });
});

describe("storyPageTitle", () => {
  it("names the source language", () => {
    expect(storyPageTitle(word("argon", ["Ancient Greek", "English"]))).toBe(
      "argon word origin: from Ancient Greek — Curio",
    );
  });

  it("falls back to the plain title with no source language", () => {
    expect(storyPageTitle(word("blurb", ["English"]))).toBe("blurb: the origin of the word — Curio");
  });

  it("keeps every real title short enough for search results (≤ 65 characters)", () => {
    const long = WORDS.map(storyPageTitle).filter((t) => t.length > 65);
    expect(long).toEqual([]);
  });
});

describe("storyMetaDescription", () => {
  it("leads with the word and 'etymology' so the snippet matches how people search", () => {
    const w = { ...word("jungle", ["Hindustani", "English"]), teaser: "A tangle of trees once meant dry, open land." };
    expect(storyMetaDescription(w)).toBe("Etymology of jungle: A tangle of trees once meant dry, open land.");
  });

  it("stays within ~170 characters for every word in the bank", () => {
    for (const w of WORDS) expect(storyMetaDescription(w).length).toBeLessThanOrEqual(175);
  });
});
