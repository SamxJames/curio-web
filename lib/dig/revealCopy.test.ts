import { describe, expect, it } from "vitest";
import { bannedHits } from "./copyAudit";
import { normalizeKey } from "./normalize";
import { layerLine, originLanguage, priorSameTier, revealFact } from "./revealCopy";
import { TIERS } from "./types";

const LAYER: Record<string, string> = { common: "Topsoil", popular: "Topsoil", familiar: "Loam", uncommon: "Clay", rare: "Stone" };

describe("layerLine", () => {
  it("gives three different lines for three Familiar results in one run", () => {
    const lines = [0, 1, 2].map((n) => layerLine("familiar", n));
    expect(new Set(lines).size).toBe(3);
    expect(layerLine("familiar", 3)).toBe(lines[0]);
  });
  it("is deterministic and non-null for every tier but fossil", () => {
    for (const t of TIERS.filter((x) => x !== "fossil")) for (const n of [0, 1, 2, 5]) expect(layerLine(t, n)).toBe(layerLine(t, n));
    for (const t of TIERS.filter((x) => x !== "fossil")) expect(layerLine(t, 0)).not.toBeNull();
    expect(layerLine("fossil", 0)).toBeNull();
  });
  it("starts every line with its layer name, so the band vocabulary is taught each time", () => {
    for (const t of TIERS.filter((x) => x !== "fossil")) for (const n of [0, 1, 2]) expect(layerLine(t, n)).toMatch(new RegExp(`^${LAYER[t]}\\.`));
  });
  it("passes the copy audit for every variant", () => {
    for (const t of TIERS) for (const n of [0, 1, 2]) expect(bannedHits(layerLine(t, n) ?? "")).toEqual([]);
  });
});

describe("priorSameTier", () => {
  it("counts earlier results of the same tier only, so a refresh gives the same line", () => {
    const r = (tier: never) => ({ answer: "x", tier, rejected: [], lastGuess: null });
    const results = [r("familiar" as never), r("rare" as never), r("familiar" as never), r("familiar" as never)];
    expect(priorSameTier(results, 3)).toBe(2);
    expect(priorSameTier(results, 0)).toBe(0);
  });
});

describe("originLanguage", () => {
  // One row per origin phrasing in the pipeline data (scripts/dig/build.ts) plus the spec's wording.
  it.each([
    ["Name a word that came to English from Arabic", "Arabic"],
    ["Name a word English took from Russian", "Russian"],
    ["a word English took from Arabic", "Arabic"],
    ["Name a word that came to English from a Pacific language", null],
    ["Name a word that came to English from a Scandinavian language", null],
    ["Name a word that came to English from a language of India", null],
    ["Name a word that came to English from a language of the Americas", null],
    ["Name a word that came to English from an African language", null],
    ["Name a word from sailing", null],
  ])("%s -> %s", (text, want) => expect(originLanguage(text)).toBe(want));
});

describe("revealFact", () => {
  // [answer, tier, core]: the core:0 entries are accepted-only, never shown, and must not move the median.
  const secret = {
    answers: [["a", "common", 1], ["b", "familiar", 1], ["c", "uncommon", 1], ["d", "rare", 0], ["e", "rare", 0]] as never,
    stories: { [normalizeKey("Cappuccino")]: "cappuccino" },
  };
  it("rarity line needs clay or deeper AND above the median of shown answers", () => {
    expect(revealFact({ answer: "z", tier: "rare", kind: "theme", promptText: "p", secret })).toEqual({ kind: "text", text: "Rarer than most words that fit this prompt." });
    expect(revealFact({ answer: "z", tier: "uncommon", kind: "theme", promptText: "p", secret })).toEqual({ kind: "text", text: "Rarer than most words that fit this prompt." });
    // familiar is not above the shown median (familiar), and is below the clay floor anyway
    expect(revealFact({ answer: "z", tier: "familiar", kind: "theme", promptText: "p", secret })).toBeNull();
  });
  it("never pairs the rarity line with a topsoil or loam answer", () => {
    const low = { answers: [["a", "common", 1], ["b", "common", 1], ["c", "common", 1]] as never, stories: {} };
    for (const t of ["common", "popular", "familiar"] as const) expect(revealFact({ answer: "z", tier: t, kind: "theme", promptText: "p", secret: low })).toBeNull();
  });
  it("a story beats an origin line; the story map is read by normalised key", () => {
    expect(revealFact({ answer: "Cappuccino", tier: "common", kind: "theme", promptText: "p", secret })).toEqual({ kind: "story", text: "Curio has the story of Cappuccino.", slug: "cappuccino", linkText: "Read the story of Cappuccino" });
    expect(revealFact({ answer: "kvass", tier: "common", kind: "origin", promptText: "a word English took from Russian", secret })?.text).toBe("English took kvass from Russian.");
    expect(revealFact({ answer: "kvass", tier: "common", kind: "origin", promptText: "Name a word that came to English from Russian", secret })?.text).toBe("English took kvass from Russian.");
  });
  it("is null otherwise and for a fossil", () => {
    expect(revealFact({ answer: "q", tier: "common", kind: "theme", promptText: "p", secret })).toBeNull();
    expect(revealFact({ answer: "q", tier: "fossil", kind: "origin", promptText: "took from Russian", secret })).toBeNull();
    expect(revealFact({ answer: "Cappuccino", tier: "fossil", kind: "theme", promptText: "p", secret })).toBeNull();
  });
  it("fact text passes the copy audit", () => {
    const f = revealFact({ answer: "z", tier: "rare", kind: "theme", promptText: "p", secret });
    expect(bannedHits(f?.text ?? "")).toEqual([]);
  });
});
