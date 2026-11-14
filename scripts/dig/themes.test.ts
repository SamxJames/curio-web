import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseOewn } from "./sources/oewn";
import type { CompactEntry } from "./sources/compact";
import { indexWiktionary, usableWord } from "./wiktionary";
import { letterVariants, slugify, themeText, unknownExtraCategories, wordnetThemes, type Candidate } from "./themes";
import type { Catalogue } from "./catalogue";

const wn = parseOewn(readFileSync(path.join(__dirname, "fixtures/oewn-mini.xml"), "utf8"));
const entry = (w: string, cats: string[], extra: Partial<CompactEntry> = {}): CompactEntry =>
  ({ w, pos: "noun", t: [], c: cats.map((c) => `en:${c}`), g: [], e: [], f: [], n: 1, et: "", ...extra });

const cat: Catalogue = {
  anchorOverrides: {}, renames: {}, blockPatterns: ["slur"], wikidataThemes: [], originGroups: [], originExclude: [], langCodes: {},
};

describe("indexWiktionary", () => {
  it("records filters and categories", async () => {
    const idx = await indexWiktionary(
      [entry("apple", ["Fruits"]), entry("rude", ["Fruits"], { g: ["vulgar"] }), entry("lemon", ["Citrus fruits"], { f: ["lemons"] })],
      new Set()
    );
    expect(idx.categories.get("Fruits")).toEqual(new Set(["apple", "rude"]));
    expect(idx.info.get("rude")?.offensive).toBe(true);
    expect(idx.info.get("lemon")?.aliases).toEqual(["lemons"]);
    expect(usableWord(idx, new Map(), "apple")).toBe(true);
    expect(usableWord(idx, new Map(), "rude")).toBe(false);
  });

  it("judges offensive and obsolete by sense counts when the compact file has them", async () => {
    const idx = await indexWiktionary(
      [
        // One derogatory sense among many plain ones: an ordinary word.
        entry("potato", ["Vegetables"], { g: ["offensive", "slang"], n: 6, k: 5, b: 1, l: 5 }),
        // A clean entry plus a separate vulgar-only entry: still an ordinary word.
        entry("mother", ["Female family members"], { n: 4, k: 4, b: 0, l: 4 }),
        entry("mother", ["Female family members"], { g: ["vulgar", "slang"], n: 2, k: 0, b: 2, l: 0 }),
        // Mostly bad senses: kept out.
        entry("sluricle", ["Vegetables"], { g: ["offensive"], n: 4, k: 1, b: 3, l: 1 }),
        // One abbreviation and one obsolete sense don't make the noun unusable or obsolete.
        entry("onion", ["Vegetables"], { g: ["alt-of", "abbreviation", "obsolete"], n: 8, k: 6, b: 0, l: 5 }),
        // Every usable sense obsolete: obsolete.
        entry("more", ["Vegetables"], { g: ["obsolete"], n: 2, k: 2, b: 0, l: 0 }),
      ],
      new Set(["blockedword"])
    );
    const z = new Map<string, number>();
    expect(usableWord(idx, z, "potato")).toBe(true);
    expect(usableWord(idx, z, "mother")).toBe(true);
    expect(usableWord(idx, z, "onion")).toBe(true);
    expect(usableWord(idx, z, "sluricle")).toBe(false);
    expect(idx.info.get("more")?.obsolete).toBe(true);
    // Fossils stay strict: any offensive sense or obsolete tag rules a word out.
    expect(idx.info.get("potato")?.strictOffensive).toBe(true);
    expect(idx.info.get("mother")?.strictOffensive).toBe(true);
    expect(idx.info.get("onion")?.strictObsolete).toBe(true);
  });

  it("keeps the blocklist absolute, whatever the sense counts say", async () => {
    const idx = await indexWiktionary([entry("blockedword", ["Fruits"], { n: 3, k: 3, b: 0, l: 3 })], new Set(["blockedword"]));
    expect(usableWord(idx, new Map(), "blockedword")).toBe(false);
  });
});

describe("wording and ids", () => {
  it("phrases kind-of and domain themes", () => {
    expect(themeText("Fruits", "kind-of", {})).toBe("Name a fruit");
    expect(themeText("Musical instruments", "kind-of", {})).toBe("Name a musical instrument");
    expect(themeText("Insects", "kind-of", {})).toBe("Name an insect");
    expect(themeText("Nautical", "domain", {})).toBe("Name a nautical word");
    expect(themeText("Clothing", "kind-of", {})).toBe("Name a type of clothing");
    expect(themeText("Glass", "kind-of", {})).toBe("Name a type of glass");
    expect(themeText("Buildings and structures", "kind-of", {})).toBe("Name a building or structure");
    expect(themeText("Arts and crafts", "kind-of", {})).toBe("Name an art or craft");
    expect(themeText("Nautical", "domain", { Nautical: "Name a word from sailing" })).toBe("Name a word from sailing");
    expect(themeText("Geese", "kind-of", {})).toBe("Name a goose");
    expect(themeText("Cacti", "kind-of", {})).toBe("Name a cactus");
    expect(themeText("Birds of prey", "kind-of", {})).toBe("Name a bird of prey");
    expect(themeText("Cookware and bakeware", "kind-of", {})).toBe("Name a type of cookware or bakeware");
    expect(themeText("Utensils", "kind-of", {})).toBe("Name a utensil");
    expect(themeText("Uniforms", "kind-of", {})).toBe("Name a uniform");
    expect(themeText("Umbrellas", "kind-of", {})).toBe("Name an umbrella");
    expect(themeText("Potatoes", "kind-of", {})).toBe("Name a potato");
    expect(themeText("Shelves", "kind-of", {})).toBe("Name a shelf");
    expect(themeText("Clothes", "kind-of", {})).toBe("Name a type of clothes");
    expect(themeText("Fabrics", "kind-of", {})).toBe("Name a fabric");
    expect(themeText("Mathematics", "kind-of", {})).toBe("Name a type of mathematics");
    expect(themeText("Classes of drugs", "kind-of", {})).toBe("Name a class of drugs");
    expect(themeText("Ukuleles", "kind-of", {})).toBe("Name a ukulele");
    expect(slugify("Citrus fruits")).toBe("citrus-fruits");
  });
});

describe("wordnetThemes", () => {
  it("anchors a sub-category to its own sense and rolls it up into the parent", async () => {
    const fruits = ["apple", "fig", "pear", "plum", "date"].map((w) => entry(w, ["Fruits"]));
    const citrus = ["lemon"].map((w) => entry(w, ["Citrus fruits"]));
    const idx = await indexWiktionary([...fruits, ...citrus], new Set());
    const themes = wordnetThemes(wn, idx, new Map(), cat, { minOwnWords: 1, minAnchor: 1 });
    const fruit = themes.find((t) => t.id === "theme:fruits")!;
    expect(fruit.core.sort()).toEqual(["apple", "lemon"]);
    expect(fruit.accepted).toEqual(expect.arrayContaining(["apple", "lemon", "fig", "pear", "plum", "date"]));
    const citrusTheme = themes.find((t) => t.id === "theme:citrus-fruits")!;
    expect(citrusTheme.anchor).toBe("oewn-citrus-n-1");
    expect(citrusTheme.ancestors.has("oewn-fruit-n-1")).toBe(true);
  });
  it("keeps a category anchored only by its last word as its own theme, with only its own words", async () => {
    const fruits = ["apple", "fig", "pear", "plum", "date"].map((w) => entry(w, ["Fruits"]));
    const citrus = ["lemon"].map((w) => entry(w, ["Citrus fruits"]));
    const dried = ["fig", "date", "apple"].map((w) => entry(w, ["Dried fruits"]));
    const idx = await indexWiktionary([...fruits, ...citrus, ...dried], new Set());
    const themes = wordnetThemes(wn, idx, new Map(), cat, { minOwnWords: 1, minAnchor: 1 });
    const driedTheme = themes.find((t) => t.id === "theme:dried-fruits")!;
    expect(driedTheme.anchor).toBe("oewn-fruit-n-1");
    expect(driedTheme.core).toEqual(["apple"]); // not lemon, which only the parent rolls up
    expect(driedTheme.accepted).not.toContain("lemon"); // nor every fruit WordNet knows
    expect(themes.find((t) => t.id === "theme:fruits")!.core.sort()).toEqual(["apple", "lemon"]);
  });
});

describe("jargonCategories", () => {
  // "Poker" anchors under card game, so its vocabulary (river, flop, bluff) used to roll up into "Name a card game".
  const entries = [...["apple", "fig", "pear", "plum", "date"].map((w) => entry(w, ["Fruits"])), entry("lemon", ["Citrus fruits"]), entry("zest", ["Citrus fruits"])];
  it("rolls a sub-category up into its parent by default", async () => {
    const idx = await indexWiktionary(entries, new Set());
    const fruit = wordnetThemes(wn, idx, new Map(), cat, { minOwnWords: 1, minAnchor: 1 }).find((t) => t.id === "theme:fruits")!;
    expect(fruit.accepted).toContain("zest");
  });
  it("keeps a category of jargon out of its parent", async () => {
    const idx = await indexWiktionary(entries, new Set());
    const fruit = wordnetThemes(wn, idx, new Map(), { ...cat, jargonCategories: ["Citrus fruits"] }, { minOwnWords: 1, minAnchor: 1 }).find((t) => t.id === "theme:fruits")!;
    expect(fruit.accepted).not.toContain("zest");
    expect(fruit.accepted).toContain("lemon"); // WordNet still places lemon under fruit
  });
});

describe("category words WordNet files elsewhere (audit fix 1)", () => {
  it("keeps them: tulip is a flower though WordNet files it under lilies, and sad is an emotion though it is a very common word", async () => {
    // The fixture's stand-ins: "colour" is a noun WordNet files elsewhere (like tulip, museum, juice);
    // "more" is a very common word WordNet does not place at all (like sad, hope, river).
    const fruits = ["apple", "fig", "pear", "plum", "date", "colour", "more"].map((w) => entry(w, ["Fruits"]));
    const idx = await indexWiktionary(fruits, new Set());
    const zipf = new Map([["more", 6.4], ["fig", 3.6]]);
    const fruit = wordnetThemes(wn, idx, zipf, cat, { minOwnWords: 1, minAnchor: 1 }).find((t) => t.id === "theme:fruits")!;
    // Wiktionary tags a category on the whole page, so no rule can tell a stray sense from a real one.
    // Real strays ("more" as a vegetable) are named in the catalogue's excludeAnswers (finishCandidate).
    expect(fruit.accepted).toEqual(expect.arrayContaining(["apple", "fig", "pear", "plum", "date", "colour", "more"]));
    expect(fruit.core).not.toContain("colour"); // accepted-only: the shown list still needs both sources
  });
});

describe("extraCategories (audit fix 2)", () => {
  const entries = [
    ...["apple", "fig", "pear", "plum", "date"].map((w) => entry(w, ["Fruits"])),
    // Wiktionary files black under "Blacks", not "Colors", and knife under "Cutlery", not "Kitchenware".
    entry("lemon", ["Sour things"]), entry("sloe", ["Sour things"]),
  ];
  it("refuses a sub-category's words until the catalogue joins it to the theme", async () => {
    const idx = await indexWiktionary(entries, new Set());
    const fruit = wordnetThemes(wn, idx, new Map(), cat, { minOwnWords: 1, minAnchor: 1 }).find((t) => t.id === "theme:fruits")!;
    expect(fruit.accepted).not.toContain("sloe");
  });
  it("accepts them once joined, and shows the ones WordNet agrees on", async () => {
    const idx = await indexWiktionary(entries, new Set());
    const joined = { ...cat, extraCategories: { Fruits: ["Sour things", "No such category"] } };
    const fruit = wordnetThemes(wn, idx, new Map(), joined, { minOwnWords: 1, minAnchor: 1 }).find((t) => t.id === "theme:fruits")!;
    expect(fruit.accepted).toEqual(expect.arrayContaining(["sloe", "lemon"]));
    expect(fruit.core).toContain("lemon"); // in WordNet's fruit tree too
    expect(fruit.core).not.toContain("sloe");
    expect(fruit.sources[0].has("sloe")).toBe(true); // so adjudication can accept from it
    expect(unknownExtraCategories(joined, idx)).toEqual(["No such category"]);
  });
});

describe("obvious members", () => {
  it("always accepts an everyday member whose first sense is the theme, whatever Wiktionary's tags say", async () => {
    // Tagged badly enough to fail the answer filter, yet "apple"'s first WordNet sense is the fruit.
    const fruits = [entry("apple", ["Fruits"], { g: ["offensive"], n: 3, k: 1, b: 2, l: 1 }), ...["fig", "pear", "plum", "date"].map((w) => entry(w, ["Fruits"]))];
    const idx = await indexWiktionary(fruits, new Set());
    expect(usableWord(idx, new Map(), "apple")).toBe(false);
    const zipf = new Map([["apple", 4.5], ["lemon", 3.2]]);
    const fruit = wordnetThemes(wn, idx, zipf, cat, { minOwnWords: 1, minAnchor: 1 }).find((t) => t.id === "theme:fruits")!;
    expect(fruit.obvious).toEqual(["apple"]); // lemon is in WordNet's fruit tree but not an everyday word
    expect(fruit.accepted).toContain("apple");
  });
});

describe("letterVariants", () => {
  it("splits a theme by first letter and keeps the base id", () => {
    const words = Array.from({ length: 30 }, (_, i) => `c${"abcdefghijklmnopqrstuvwxyz"[i % 26]}${i}x`.replace(/\d/g, "q"));
    const theme = {
      id: "theme:mammals", base: "theme:mammals", kind: "theme" as const, text: "Name a mammal", core: words, accepted: words,
      sources: [], anchor: "x", senseIds: null, ancestors: new Set<string>(), languages: [],
    };
    const [c] = letterVariants(theme, new Map(), { minCore: 25 });
    expect(c.id).toBe("theme:mammals:c");
    expect(c.base).toBe("theme:mammals");
    expect(c.text).toBe("Name a mammal beginning with C");
  });

  it("filters every source set to the variant's letter and keeps variants in letter order", () => {
    const theme: Candidate = {
      id: "theme:food", base: "theme:food", kind: "theme", text: "Name a food",
      core: ["apple", "avocado", "banana", "bean", "carrot", "cat"],
      accepted: ["apple", "avocado", "banana", "bean", "carrot", "cat", "axe", "beet", "cherry"],
      sources: [
        new Set(["apple", "avocado", "axe", "cat", "carrot", "banana", "bean"]),
        new Set(["cherry", "beet", "kale", "apple"]),
      ],
      anchor: "x", senseIds: null, ancestors: new Set<string>(), languages: [],
    };
    const variants = letterVariants(theme, new Map(), { minCore: 2 });
    expect(variants.map((v) => v.id)).toEqual(["theme:food:a", "theme:food:b", "theme:food:c"]);
    for (const v of variants) {
      const letter = v.id.slice(-1);
      for (const s of v.sources) for (const w of s) expect(w[0]).toBe(letter);
    }
    const b = variants[1];
    expect(b.sources[0]).toEqual(new Set(["banana", "bean"]));
    expect(b.sources[1]).toEqual(new Set(["beet"]));
  });
});
