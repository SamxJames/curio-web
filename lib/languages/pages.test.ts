import { describe, expect, it } from "vitest";
import type { WordEntry } from "../words";
import type { LanguageSheet } from "./types";
import { LATIN_FIXTURE } from "./__fixtures__/latin";
import {
  MIN_WORDS,
  buildLanguagePages,
  findLanguagePage,
  familyLinks,
  languageDescription,
  languageHref,
  languagePages,
  lineageHrefs,
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

  it("lineageHrefs maps only names that have pages", () => {
    expect(lineageHrefs(["Ottoman", "Lombard", "English"], pages)).toEqual({
      Ottoman: "/language/ottoman-turkish",
    });
  });
});

describe("languageDescription", () => {
  const three = ["a", "b", "c"].map((w) => word(w, ["Latin", "English"]));

  it("is the count line plus the origin's first sentence", () => {
    const [page] = buildLanguagePages(three, [
      sheet("Latin", { origin: "Latin was spoken in Latium. It spread with Rome." }),
    ]);
    expect(languageDescription(page)).toBe(
      "3 English words that passed through Latin, each with its origin story. Latin was spoken in Latium.",
    );
  });

  it("doesn't end the first sentence at an abbreviation such as St. or c.", () => {
    const [page] = buildLanguagePages(three, [
      sheet("Latin", { origin: "Monks at St. Gall wrote it down c. 800 AD. It spread with Rome." }),
    ]);
    expect(languageDescription(page, 500)).toBe(
      "3 English words that passed through Latin, each with its origin story. Monks at St. Gall wrote it down c. 800 AD.",
    );
  });

  it("trims to about 155 characters at a word boundary", () => {
    const long = `Latin ${"belongs to a very long family of words ".repeat(6)}indeed.`;
    const [page] = buildLanguagePages(three, [sheet("Latin", { origin: long })]);
    const d = languageDescription(page);
    expect(d.length).toBeLessThanOrEqual(155);
    expect(d.endsWith("…")).toBe(true);
    expect(d).not.toMatch(/\s…$/);
    expect(long).toContain(d.slice(d.indexOf("Latin belongs"), -1));
  });
});

describe("familyLinks", () => {
  const sheets = [
    sheet("Latin", { parent: "Old Latin" }),
    sheet("Italian", { parent: "Latin" }),
    sheet("Late Latin", { parent: "Latin" }),
    sheet("Medieval Latin", { parent: "Late Latin" }),
    sheet("Unapproved Child", { parent: "Latin", approved: false }),
  ];
  const words = [
    ...["a", "b", "c"].map((w) => word(w, ["Latin", "Italian", "English"])),
    word("d", ["Late Latin", "English"]),
  ];
  const pages = buildLanguagePages(words, sheets);
  const latin = findLanguagePage("latin", pages)!;
  const italian = findLanguagePage("italian", pages)!;

  it("parent without a page is plain text; children link only when they have a page, A to Z", () => {
    expect(familyLinks(latin, sheets, pages)).toEqual({
      parent: { name: "Old Latin", href: null },
      children: [
        { name: "Italian", href: "/language/italian" },
        { name: "Late Latin", href: null },
      ],
    });
  });

  it("links a parent that has a page; no children → empty list", () => {
    expect(familyLinks(italian, sheets, pages)).toEqual({
      parent: { name: "Latin", href: "/language/latin" },
      children: [],
    });
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
