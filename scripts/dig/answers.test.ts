import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseOewn } from "./sources/oewn";
import { indexWiktionary } from "./wiktionary";
import { buildAliases, buildGuard, counts, dedupeByKey, dropBlocked, finishCandidate, floorProblems, fossilCandidates } from "./answers";
import type { Catalogue } from "./catalogue";
import type { Candidate } from "./themes";

const wn = parseOewn(readFileSync(path.join(__dirname, "fixtures/oewn-mini.xml"), "utf8"));
const cand = (core: string[], over: Partial<Candidate> = {}): Candidate => ({
  id: "theme:fruits", base: "theme:fruits", kind: "theme", text: "Name a fruit", core, accepted: core,
  sources: [], anchor: "oewn-fruit-n-1", senseIds: new Set(["oewn-fruit-n-1", "oewn-apple-n-1", "oewn-citrus-n-1", "oewn-lemon-n-1"]),
  ancestors: new Set(), languages: [], ...over,
});

describe("counts and floor", () => {
  it("counts easy (Zipf ≥ 3.5) and rare (< 2.3 or missing) answers", () => {
    const zipf = new Map([["apple", 4.5], ["lemon", 3.6], ["quince", 2.0]]);
    expect(counts(cand(["apple", "lemon", "quince", "medlar"]), zipf)).toEqual({ core: 4, easy: 2, rare: 2, common: 1 });
  });
  it("explains why a small prompt fails", async () => {
    const index = await indexWiktionary([], new Set());
    const problems = floorProblems(cand(["apple"]), { wn, index, zipf: new Map() });
    expect(problems).toEqual(expect.arrayContaining(["core 1 < 30", "easy 0 < 5", "rare 1 < 10", "no fossil"]));
  });
});

describe("obvious answers floor", () => {
  it("rejects a prompt missing an obvious answer, and says how many without naming them", async () => {
    const index = await indexWiktionary([], new Set());
    const c = cand(["apple", "lemon"], { obvious: ["apple", "pear"] });
    expect(floorProblems(c, { wn, index, zipf: new Map() })).toContain("obvious 1 missing");
    const ok = cand(["apple", "lemon"], { obvious: ["apple"] });
    expect(floorProblems(ok, { wn, index, zipf: new Map() }).some((p) => p.startsWith("obvious"))).toBe(false);
  });
  it("lets the blocklist remove an obvious word without failing the floor", () => {
    const c = dropBlocked(cand(["apple", "lemon"], { obvious: ["apple", "pear"], accepted: ["apple", "lemon"] }), new Set(["pear"]));
    expect(c.obvious).toEqual(["apple"]);
  });
});

describe("fossilCandidates", () => {
  it("needs a rare single word of 4–14 letters whose first sense is the theme sense", async () => {
    const index = await indexWiktionary(
      ["lemon", "apple", "keel"].map((w) => ({ w, pos: "noun", t: [], c: [], g: [], e: [], f: [], n: 1, et: "" })),
      new Set()
    );
    const zipf = new Map([["apple", 4.5], ["lemon", 2.0], ["keel", 1.9]]);
    expect(fossilCandidates(cand(["apple", "lemon", "keel"]), { wn, index, zipf })).toEqual(["lemon"]);
  });
  it("stays strict for fossils: any offensive sense rules a word out, even one usable as an answer", async () => {
    // The fossil is shown to every player, so the lenient answer rule doesn't apply to it.
    const index = await indexWiktionary(
      [{ w: "lemon", pos: "noun", t: [], c: [], g: ["offensive", "slang"], e: [], f: [], n: 5, k: 4, b: 1, l: 4, et: "" }],
      new Set()
    );
    expect(fossilCandidates(cand(["lemon"]), { wn, index, zipf: new Map([["lemon", 2.0]]) })).toEqual([]);
  });
});

describe("aliases and guard", () => {
  it("adds Wiktextract forms and WordNet UK/US variants as normalised keys", async () => {
    const index = await indexWiktionary(
      [{ w: "colour", pos: "noun", t: [], c: [], g: [], e: [], f: ["colours"], n: 1, et: "" }],
      new Set()
    );
    expect(buildAliases(["colour"], index, wn)).toEqual({ colours: 0, color: 0 });
  });
  it("guards real words one edit from any key, excluding the prompt's own keys", () => {
    const lexicon = new Set(["keel", "heel", "peel", "kneel", "zebra", "keels"]);
    expect(buildGuard(["keel"], { keels: 0 }, lexicon).sort()).toEqual(["heel", "kneel", "peel"]);
  });
});

describe("dropBlocked", () => {
  it("drops an answer when any word inside it is blocked", () => {
    const c = cand(["glans penis", "kneecap", "penis bone"], { accepted: ["glans penis", "kneecap", "penis bone", "elbow"] });
    const d = dropBlocked(c, new Set(["penis"]));
    expect(d.core).toEqual(["kneecap"]);
    expect(d.accepted).toEqual(["kneecap", "elbow"]);
  });
});

describe("dedupeByKey", () => {
  it("keeps the first spelling of each normalised key, in core and accepted alike", () => {
    const c = cand(["ice rink", "court"], { accepted: ["ice rink", "court", "ice-rink", "the court", "pitch"] });
    const d = dedupeByKey(c);
    expect(d.accepted).toEqual(["ice rink", "court", "pitch"]);
    expect(d.core).toEqual(["ice rink", "court"]);
  });

  it("prefers the core spelling when a non-core spelling comes first", () => {
    const d = dedupeByKey(cand(["icerink"], { accepted: ["ice rink", "icerink", "pitch"] }));
    expect(d.accepted).toEqual(["icerink", "pitch"]);
    expect(d.core).toEqual(["icerink"]);
  });
});

describe("finishCandidate (audit fixes: hand-picked, excluded, hidden and junk words)", () => {
  const cat = (over: Partial<Catalogue> = {}): Catalogue => ({
    anchorOverrides: {}, renames: {}, blockPatterns: [], wikidataThemes: [], originGroups: [], originExclude: [], langCodes: {}, ...over,
  });
  const ctx = async (c: Partial<Catalogue> = {}) => ({ cat: cat({ fillerWords: ["to", "in", "on", "out", "up", "but"], ...c }), blocked: new Set<string>() });
  const canids = (over: Partial<Candidate> = {}) => cand(["dog", "wolf", "hyena"], { id: "theme:canids", base: "theme:canids", accepted: ["dog", "wolf", "hyena", "fox"], ...over });

  it("adds hand-picked answers and adjudication extras", async () => {
    const c = finishCandidate(canids(), { ...(await ctx({ extraAnswers: { "theme:canids": ["labrador"] } })), extras: { "theme:canids": ["dingo"] } });
    expect(c.accepted).toEqual(expect.arrayContaining(["labrador", "dingo", "dog"]));
  });

  it("never accepts an excluded word, even a shown one: hyena is not a canid", async () => {
    const c = finishCandidate(canids({ obvious: ["dog", "hyena"] }), await ctx({ excludeAnswers: { "theme:canids": ["Hyena"], "*": ["fox"] } }));
    expect(c.core).toEqual(["dog", "wolf"]);
    expect(c.accepted).toEqual(["dog", "wolf"]);
    expect(c.obvious).toEqual(["dog"]);
    expect(c.excluded).toEqual(new Set(["hyena", "fox"]));
  });

  it("keeps exclusions per prompt: hyena stays a mammal, and a letter variant uses its theme's list", async () => {
    const lists = { excludeAnswers: { "theme:canids": ["hyena"] } };
    const mammals = finishCandidate(canids({ id: "theme:mammals", base: "theme:mammals" }), await ctx(lists));
    expect(mammals.accepted).toContain("hyena");
    // base points at a bigger family here, as assignFamilies can make it.
    const letter = finishCandidate(canids({ id: "theme:canids:h", base: "theme:carnivores" }), await ctx(lists));
    expect(letter.accepted).not.toContain("hyena");
  });

  it("hides a rude word from the shown list but still accepts it", async () => {
    const body = cand(["arm", "minge", "leg"], { id: "theme:body-parts", base: "theme:body-parts" });
    const c = finishCandidate(body, await ctx({ hiddenAnswers: { "*": ["minge"] } }));
    expect(c.core).toEqual(["arm", "leg"]); // never shown, never the fossil
    expect(c.accepted).toContain("minge");
    expect(c.hidden).toEqual(new Set(["minge"]));
  });

  it("drops filler words from the accepted-only list: to, in and on are not sailing words", async () => {
    const sailing = cand(["keel", "out"], { id: "theme:nautical", base: "theme:nautical", accepted: ["keel", "out", "to", "in", "on", "jib", "dog"] });
    const c = finishCandidate(sailing, await ctx());
    expect(c.accepted).toEqual(["keel", "out", "jib", "dog"]); // "out" is core, "dog" is not filler
    expect(c.excluded).toEqual(new Set(["to", "in", "on"]));
  });

  it("keeps a filler word that is hand-picked or was added by adjudication", async () => {
    const golf = cand(["tee"], { id: "theme:golf", base: "theme:golf", accepted: ["tee", "up", "but"] });
    const c = finishCandidate(golf, { ...(await ctx({ extraAnswers: { "theme:golf": ["up"] } })), extras: { "theme:golf": ["but"] } });
    expect(c.accepted).toEqual(["tee", "up", "but"]);
  });

  it("still applies the blocklist and one spelling per key", async () => {
    const c = finishCandidate(cand(["apple"], { accepted: ["apple", "ice rink", "ice-rink", "rude"] }), { ...(await ctx()), blocked: new Set(["rude"]) });
    expect(c.accepted).toEqual(["apple", "ice rink"]);
  });
});
