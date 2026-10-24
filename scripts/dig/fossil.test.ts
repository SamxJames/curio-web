import { describe, expect, it } from "vitest";
import { assignTiers, chooseFossil, etymologyFact, toPlainPrompt } from "./fossil";
import type { Candidate } from "./themes";

const c: Candidate = {
  id: "theme:sailing", base: "theme:sailing", kind: "theme", text: "Name a word from sailing",
  core: ["sail", "keel", "halyard", "gunwale", "bowsprit", "petrichor"], accepted: ["sail", "keel", "halyard", "gunwale", "bowsprit", "petrichor", "boom"],
  sources: [], anchor: "x", senseIds: null, ancestors: new Set(), languages: [],
};
const zipf = new Map([["sail", 4.01], ["keel", 3.19], ["halyard", 1.99], ["gunwale", 1.65], ["bowsprit", 1.5], ["petrichor", 1.9], ["boom", 4.2]]);

describe("assignTiers", () => {
  it("promotes at most two famous rare words to Popular pick", () => {
    const views = new Map([["halyard", 1300], ["gunwale", 900], ["bowsprit", 2000], ["petrichor", 45000]]);
    const t = assignTiers(c, zipf, views);
    expect(t.get("sail")).toBe("common");
    expect(t.get("keel")).toBe("familiar");
    expect(t.get("petrichor")).toBe("popular");
    expect(t.get("halyard")).toBe("rare");
    expect(t.get("boom")).toBe("common");
  });
});

describe("etymologyFact", () => {
  it("keeps the first clause and caps at 140 characters", () => {
    expect(etymologyFact("From Middle English halier, from halen (“to haul”). Compare Dutch.")).toBe("From Middle English halier, from halen (“to haul”)");
    expect(etymologyFact("")).toBeNull();
    expect(etymologyFact("x ".repeat(100))!.length).toBeLessThanOrEqual(140);
  });
});

describe("chooseFossil", () => {
  const base = {
    candidates: ["halyard", "gunwale", "bowsprit"],
    tiers: new Map([["halyard", "rare" as const], ["gunwale", "rare" as const], ["bowsprit", "rare" as const]]),
    views: new Map([["halyard", 1300], ["gunwale", 900], ["bowsprit", 2000]]),
    definitions: new Map<string, string>(),
    etymology: (w: string) => (w === "bowsprit" ? "From Middle Low German bōchsprēt." : ""),
    exclude: new Set<string>(),
  };
  it("prefers a Curio story word, using its teaser", () => {
    const curio = new Map([["gunwale", { slug: "gunwale", teaser: "Once the plank that held the guns." }]]);
    expect(chooseFossil(c, { ...base, curio })).toEqual({ word: "gunwale", fact: "Once the plank that held the guns.", story: "gunwale" });
  });
  it("otherwise takes the most-viewed candidate with an etymology fact", () => {
    expect(chooseFossil(c, { ...base, curio: new Map() })).toEqual({ word: "bowsprit", fact: "From Middle Low German bōchsprēt" });
  });
  it("skips excluded words and returns null when nothing is left", () => {
    expect(chooseFossil(c, { ...base, curio: new Map(), exclude: new Set(["halyard", "gunwale", "bowsprit"]) })).toBeNull();
  });
});

describe("toPlainPrompt", () => {
  it("marks the fossil, core flags and story links", () => {
    const tiers = assignTiers(c, zipf, new Map());
    const p = toPlainPrompt(c, tiers, { word: "halyard", fact: "f" }, { halyards: 2 }, ["heel"], new Map([["keel", { slug: "keel" }]]));
    expect(p.answers.find((a) => a[0] === "halyard")).toEqual(["halyard", "fossil", 1]);
    expect(p.answers.find((a) => a[0] === "boom")).toEqual(["boom", "common", 0]);
    expect(p.stories).toEqual({ keel: "keel" });
    expect(p.aliases).toEqual({ halyards: 2 });
  });
});
