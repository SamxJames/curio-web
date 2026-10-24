import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseWordfreq } from "./wordfreq";
import { ancestors, domainLemmas, hyponymLemmas, parseOewn } from "./oewn";
import { compactEntry } from "./compact";
import { buildLexicon } from "../lexicon";

// Minimal msgpack writer for the fixture: fixarray, fixmap, fixstr only.
const str = (s: string) => [0xa0 | Buffer.byteLength(s), ...Buffer.from(s)];
const arr = (items: number[][]) => [0x90 | items.length, ...items.flat()];

describe("parseWordfreq", () => {
  it("turns centibel buckets into Zipf values", () => {
    const header = [0x81, ...str("format"), ...str("cB")];
    const buf = Buffer.from(arr([header, arr([str("the")]), arr([]), arr([str("sail"), str("mast")])]));
    const z = parseWordfreq(buf);
    expect(z.get("the")).toBeCloseTo(9);
    expect(z.get("sail")).toBeCloseTo(8.98);
    expect(z.has("keel")).toBe(false);
  });
});

describe("parseOewn", () => {
  const wn = parseOewn(readFileSync(path.join(__dirname, "../fixtures/oewn-mini.xml"), "utf8"));
  it("walks kind-of trees", () => {
    expect([...hyponymLemmas(wn, ["oewn-fruit-n-1"])].sort()).toEqual(["apple", "citrus fruit", "fruit", "lemon"]);
  });
  it("collects topic domains", () => {
    expect(domainLemmas(wn, ["oewn-seafaring-n-1"]).has("keel")).toBe(true);
  });
  it("finds UK/US spelling pairs sharing a synset", () => {
    expect(wn.spellingVariants.get("colour")?.has("color")).toBe(true);
  });
  it("lists ancestors", () => {
    expect([...ancestors(wn, "oewn-lemon-n-1")]).toEqual(["oewn-citrus-n-1", "oewn-fruit-n-1"]);
  });
  it("keeps sense order per lemma", () => {
    expect(wn.synsetsOf.get("keel")).toEqual(["oewn-keel-n-1"]);
  });
});

describe("compactEntry", () => {
  it("keeps only the fields the pipeline needs", () => {
    const raw = {
      word: "halyard", lang_code: "en", pos: "noun",
      categories: ["en:Nautical", "English terms derived from Middle English", { name: "Pages with entries" }],
      senses: [{ topics: ["nautical"], tags: ["countable"], categories: [{ name: "en:Ropes" }] }],
      etymology_templates: [{ name: "inh", args: { "1": "en", "2": "enm" } }],
      forms: [{ form: "halyards", tags: ["plural"] }],
      etymology_text: "From Middle English halier, from halen (“to haul”).",
    };
    expect(compactEntry(raw)).toEqual({
      w: "halyard", pos: "noun", t: ["nautical"],
      c: ["en:Nautical", "English terms derived from Middle English", "en:Ropes"],
      g: [], e: ["inh:enm"], f: ["halyards"], n: 1,
      et: "From Middle English halier, from halen (“to haul”).",
    });
  });
  it("drops non-English entries", () => {
    expect(compactEntry({ word: "haar", lang_code: "nl", pos: "noun" })).toBeNull();
  });
});

describe("buildLexicon", () => {
  it("normalises real words from both sources", () => {
    const lex = buildLexicon(new Map([["Heel", 3]]), ["crème brûlée", "keel"]);
    expect([...lex].sort()).toEqual(["cremebrulee", "heel", "keel"]);
  });
});
