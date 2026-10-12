import { describe, expect, it } from "vitest";
import type { WordEntry } from "../words";
import type { LanguageSheet } from "./types";
import { LATIN_FIXTURE } from "./__fixtures__/latin";
import {
  MIN_WORDS,
  buildLanguagePages,
  findLanguagePage,
  languageHref,
  languagePages,
} from "./pages";

const word = (w: string, lineage: string[]): WordEntry =>
  ({ slug: w.toLowerCase(), word: w, teaser: `${w} teaser`, lineage }) as WordEntry;

const sheet = (name: string, extra: Partial<LanguageSheet> = {}): LanguageSheet => ({
  ...LATIN_FIXTURE,
  name,
  aliases: [],
  parent: null,
  approved: true,
  ...extra,
});

describe("buildLanguagePages", () => {
  it(`needs ${MIN_WORDS} words: 2 → no page, 3 → page`, () => {
    const sheets = [sheet("Latin"), sheet("Arabic")];
    const words = [
      word("a", ["Latin", "English"]),
      word("b", ["Latin", "English"]),
      word("c", ["Latin", "English"]),
      word("d", ["Arabic", "English"]),
      word("e", ["Arabic", "English"]),
    ];
    expect(buildLanguagePages(words, sheets).map((p) => p.name)).toEqual(["Latin"]);
  });

  it("gives an unapproved sheet no page", () => {
    const words = ["a", "b", "c"].map((w) => word(w, ["Latin", "English"]));
    expect(buildLanguagePages(words, [sheet("Latin", { approved: false })])).toEqual([]);
  });

  it("gives a lineage name with no sheet no page", () => {
    const words = ["a", "b", "c"].map((w) => word(w, ["Gothic", "English"]));
    expect(buildLanguagePages(words, [sheet("Latin")])).toEqual([]);
  });

  it("folds aliases into the canonical page", () => {
    const sheets = [sheet("Ottoman Turkish", { aliases: ["Ottoman"] })];
    const words = [
      word("a", ["Ottoman", "English"]),
      word("b", ["Ottoman Turkish", "English"]),
      word("c", ["Ottoman", "English"]),
    ];
    const [page] = buildLanguagePages(words, sheets);
    expect(page.name).toBe("Ottoman Turkish");
    expect(page.slug).toBe("ottoman-turkish");
    expect(page.words).toHaveLength(3);
  });

  it("never makes a page for English", () => {
    const words = ["a", "b", "c"].map((w) => word(w, ["English"]));
    expect(buildLanguagePages(words, [sheet("English")])).toEqual([]);
  });

  it("counts a word once even if its lineage names the language twice (or via an alias)", () => {
    const sheets = [sheet("Old Occitan", { aliases: ["Old Provençal"] })];
    const words = [
      word("a", ["Old Occitan", "Old Provençal", "English"]),
      word("b", ["Old Occitan", "Old Occitan", "English"]),
    ];
    expect(buildLanguagePages(words, sheets)).toEqual([]);
  });

  it("sorts words A to Z and pages by word count, then name", () => {
    const sheets = [sheet("Latin"), sheet("Greek"), sheet("Arabic")];
    const words = [
      word("zebra", ["Latin", "English"]),
      word("Apple", ["Latin", "Greek", "Arabic", "English"]),
      word("mango", ["Latin", "Greek", "Arabic", "English"]),
      word("kite", ["Latin", "Greek", "Arabic", "English"]),
    ];
    const pages = buildLanguagePages(words, sheets);
    expect(pages.map((p) => p.name)).toEqual(["Latin", "Arabic", "Greek"]);
    expect(pages[0].words.map((w) => w.word)).toEqual(["Apple", "kite", "mango", "zebra"]);
  });
});

describe("findLanguagePage / languageHref", () => {
  const sheets = [sheet("Ottoman Turkish", { aliases: ["Ottoman"] }), sheet("Lombard")];
  const words = [
    ...["a", "b", "c"].map((w) => word(w, ["Ottoman", "English"])),
    word("d", ["Lombard", "English"]),
  ];
  const pages = buildLanguagePages(words, sheets);

  it("finds a page by slug", () => {
    expect(findLanguagePage("ottoman-turkish", pages)?.name).toBe("Ottoman Turkish");
    expect(findLanguagePage("nope", pages)).toBeUndefined();
  });

  it("links a canonical name and an alias, not a page-less name", () => {
    expect(languageHref("Ottoman Turkish", pages)).toBe("/language/ottoman-turkish");
    expect(languageHref("Ottoman", pages)).toBe("/language/ottoman-turkish");
    expect(languageHref("Lombard", pages)).toBeNull();
    expect(languageHref("English", pages)).toBeNull();
  });
});

describe("languagePages (real data)", () => {
  const pages = languagePages();

  it("has 57 or more pages including Latin", () => {
    expect(pages.length).toBeGreaterThanOrEqual(57);
    expect(pages.map((p) => p.slug)).toContain("latin");
  });

  it("has unique slugs", () => {
    const slugs = pages.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("only includes approved sheets with at least MIN_WORDS words", () => {
    for (const p of pages) {
      expect(p.sheet.approved).toBe(true);
      expect(p.words.length).toBeGreaterThanOrEqual(MIN_WORDS);
    }
  });
});
