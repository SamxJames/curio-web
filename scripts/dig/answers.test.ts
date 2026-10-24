import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseOewn } from "./sources/oewn";
import { indexWiktionary } from "./wiktionary";
import { buildAliases, buildGuard, counts, dedupeByKey, floorProblems, fossilCandidates } from "./answers";
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
    expect(problems).toEqual(expect.arrayContaining(["core 1 < 40", "easy 0 < 8", "rare 1 < 10", "no fossil"]));
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
