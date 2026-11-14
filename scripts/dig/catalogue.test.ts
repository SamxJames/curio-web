import { describe, expect, it } from "vitest";
import { curatedAnswers, listFor, loadCatalogue, rootId } from "./catalogue";
import { normalizeKey } from "../../lib/dig/normalize";

describe("curatedAnswers", () => {
  const cat = { extraAnswers: { "theme:beverages": ["water", "milk"] } };
  it("gives a theme its hand-picked answers", () => {
    expect(curatedAnswers(cat, { id: "theme:beverages", base: "theme:beverages" })).toEqual(["water", "milk"]);
  });
  it("gives a letter variant only the answers with its letter", () => {
    expect(curatedAnswers(cat, { id: "theme:beverages:w", base: "theme:beverages" })).toEqual(["water"]);
  });
  it("gives nothing to a theme without a list", () => {
    expect(curatedAnswers({}, { id: "theme:birds", base: "theme:birds" })).toEqual([]);
  });
  it("ships water as a beverage, which neither source lists", () => {
    expect(curatedAnswers(loadCatalogue(), { id: "theme:beverages", base: "theme:beverages" })).toContain("water");
  });
});

describe("catalogue lists per prompt", () => {
  it("keys a letter variant by its theme and an origin by its own id", () => {
    expect(rootId({ id: "theme:canids:h", kind: "theme" })).toBe("theme:canids");
    expect(rootId({ id: "theme:canids", kind: "theme" })).toBe("theme:canids");
    expect(rootId({ id: "origin:group:pacific", kind: "origin" })).toBe("origin:group:pacific");
  });
  it("joins a prompt's own list with the list for every prompt", () => {
    const lists = { "*": ["to"], "theme:canids": ["hyena"] };
    expect(listFor(lists, { id: "theme:canids:h", kind: "theme" })).toEqual(["to", "hyena"]);
    expect(listFor(lists, { id: "theme:birds", kind: "theme" })).toEqual(["to"]);
    expect(listFor(undefined, { id: "theme:birds", kind: "theme" })).toEqual([]);
  });
});

describe("content/dig/catalogue.json", () => {
  const cat = loadCatalogue();
  const lists = { extraAnswers: cat.extraAnswers ?? {}, excludeAnswers: cat.excludeAnswers ?? {}, hiddenAnswers: cat.hiddenAnswers ?? {} };
  it("keys every word list by a prompt id (or * where allowed) and holds only plain lower-case words", () => {
    for (const [name, byPrompt] of Object.entries(lists)) {
      for (const [id, words] of Object.entries(byPrompt)) {
        expect(id === "*" ? name !== "extraAnswers" : /^(theme|origin):[a-z0-9:-]+$/.test(id), `${name} key ${id}`).toBe(true);
        for (const w of words) expect(/^[a-z][a-z' -]*[a-z]$/.test(w) && normalizeKey(w).length > 1, `${name} ${id}: ${w}`).toBe(true);
        expect(new Set(words.map(normalizeKey)).size, `${name} ${id} has a repeated word`).toBe(words.length);
      }
    }
  });
  it("never hand-picks a word it also excludes for the same prompt", () => {
    const everywhere = new Set((lists.excludeAnswers["*"] ?? []).map(normalizeKey));
    for (const [id, words] of Object.entries(lists.extraAnswers)) {
      const out = new Set([...everywhere, ...(lists.excludeAnswers[id] ?? []).map(normalizeKey)]);
      for (const w of words) expect(out.has(normalizeKey(w)), `${id}: ${w}`).toBe(false);
    }
  });
  it("names only real languages in originVariants, and never a variant twice", () => {
    const variants = Object.values(cat.originVariants ?? {}).flat();
    expect(new Set(variants).size).toBe(variants.length);
    for (const lang of Object.keys(cat.originVariants ?? {})) expect(cat.langCodes[lang], lang).toBeTruthy();
  });
});
