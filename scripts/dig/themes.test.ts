import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseOewn } from "./sources/oewn";
import type { CompactEntry } from "./sources/compact";
import { indexWiktionary, usableWord } from "./wiktionary";
import { letterVariants, slugify, themeText, wordnetThemes, type Candidate } from "./themes";
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
});

describe("wording and ids", () => {
  it("phrases kind-of and domain themes", () => {
    expect(themeText("Fruits", "kind-of", {})).toBe("Name a fruit");
    expect(themeText("Musical instruments", "kind-of", {})).toBe("Name a musical instrument");
    expect(themeText("Insects", "kind-of", {})).toBe("Name an insect");
    expect(themeText("Nautical", "domain", {})).toBe("Name a nautical word");
    expect(themeText("Nautical", "domain", { Nautical: "Name a word from sailing" })).toBe("Name a word from sailing");
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
