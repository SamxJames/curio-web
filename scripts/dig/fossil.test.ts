import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { assignTiers, chooseFossil, etymologyFact, toPlainPrompt } from "./fossil";
import { ETYMOLOGY_CHARS } from "./sources/compact";
import { yearlyViews } from "./pageviews";
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
    expect(etymologyFact("See the etymology of the corresponding lemma form.")).toBeNull();
    expect(etymologyFact("Unknown.")).toBeNull();
    expect(etymologyFact("Imitative.")).toBeNull();
    expect(etymologyFact("x ".repeat(100))!.length).toBeLessThanOrEqual(140);
  });
  it("skips Wiktionary's etymology tree and keeps the sentence after it", () => {
    const et = "Etymology tree\nProto-Indo-European *kápros\nLatin caper\nScottish Gaelic cabarbor.\nEnglish caber\nFrom Scottish Gaelic cabar (“spar, pole”).";
    expect(etymologyFact(et)).toBe("From Scottish Gaelic cabar (“spar, pole”)");
    expect(etymologyFact("Etymology tree\nItalian flauto\nEnglish flautist")).toBeNull();
  });
  it("ends a clause the compact file cut off at a whole word, with an ellipsis", () => {
    const tree = "Etymology tree\n" + "Proto-Indo-European *kápros\n".repeat(7) + "English caber\n";
    const et = (tree + "From Scottish Gaelic cabar (“spar, pole, rafter”), from Old Irish cabar, perhaps from Latin capreus").slice(0, ETYMOLOGY_CHARS);
    const fact = etymologyFact(et)!;
    expect(fact.endsWith("…")).toBe(true);
    expect(fact).not.toMatch(/(fro|perh|capr)…$/);
    expect(etymologyFact("From Arabic qahwa")).toBe("From Arabic qahwa"); // short and whole: no stop needed
    const treeOf = (n: number) => "Etymology tree\n" + "Proto-Indo-European *kápros\n".repeat(n) + "English caber\n";
    const prose = "From Scottish Gaelic cabar (“spar, pole”), from Old Irish cabar, perhaps from Latin capreus";
    expect(etymologyFact((treeOf(7) + prose).slice(0, ETYMOLOGY_CHARS))).toBe("From Scottish Gaelic cabar (“spar, pole”), from Old Irish cabar, perhaps…");
    expect(etymologyFact((treeOf(8) + prose).slice(0, ETYMOLOGY_CHARS))).toBe("From Scottish Gaelic cabar (“spar, pole”)…");
    expect(etymologyFact((treeOf(9) + prose).slice(0, ETYMOLOGY_CHARS))).toBeNull(); // only a stub survives
    expect(etymologyFact((treeOf(5) + prose).slice(0, ETYMOLOGY_CHARS))).toBe(prose); // under the limit: whole
  });
  it("never leaves a bracket open, even in a short fact", () => {
    expect(etymologyFact("From Hindi ḍāku (“robber")).toBe("From Hindi ḍāku…");
  });
  it("never splits inside brackets or quotes, and never leaves one open", () => {
    expect(etymologyFact("Borrowed from Irish geis (“injunction; taboo”). Compare Welsh.")).toBe("Borrowed from Irish geis (“injunction; taboo”)");
    const long = `From Ancient Greek νάρδος (nárdos), from Phoenician, Sanskrit नलद (nalada, “${"a ".repeat(60)}”)`;
    const fact = etymologyFact(long)!;
    expect(fact.length).toBeLessThanOrEqual(140);
    expect(fact).not.toMatch(/\([^)]*$/);
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
  it("for origin prompts, uses only facts that name one of the prompt's languages", () => {
    const etymology = (w: string) => (w === "bowsprit" ? "Borrowed from Sotho lelapa." : w === "halyard" ? "From Māori hāriata." : "");
    const pick = chooseFossil(c, { ...base, curio: new Map(), etymology, mustMention: ["Maori", "Tahitian"] });
    expect(pick).toEqual({ word: "halyard", fact: "From Māori hāriata" });
  });
  it("skips words the build rejects (a typo would land on another answer)", () => {
    const etymology = (w: string) => (w === "bowsprit" ? "From Middle Low German bōchsprēt." : w === "halyard" ? "From Middle English halier." : "");
    expect(chooseFossil(c, { ...base, curio: new Map(), etymology, reject: (w) => w === "bowsprit" })?.word).toBe("halyard");
  });
  it("skips excluded words and returns null when nothing is left", () => {
    expect(chooseFossil(c, { ...base, curio: new Map(), exclude: new Set(["halyard", "gunwale", "bowsprit"]) })).toBeNull();
  });
  it("never chooses a Common word, even one with a story", () => {
    const curio = new Map([["sail", { slug: "sail", teaser: "Once a sheet of cloth." }]]);
    const tiers = new Map([["sail", "common" as const], ["halyard", "rare" as const]]);
    const etymology = (w: string) => (w === "halyard" ? "From Middle English halier." : "");
    expect(chooseFossil(c, { ...base, candidates: ["sail", "halyard"], tiers, curio, etymology })).toEqual({ word: "halyard", fact: "From Middle English halier" });
  });
  it("skips a story word with an empty teaser and falls through", () => {
    const curio = new Map([["gunwale", { slug: "gunwale", teaser: "   " }]]);
    const views = new Map([["halyard", 1300], ["gunwale", 2500], ["bowsprit", 2000]]);
    expect(chooseFossil(c, { ...base, curio, views })).toEqual({ word: "bowsprit", fact: "From Middle Low German bōchsprēt" });
  });
  it("trims a long story teaser to 140 characters or fewer, ending in an ellipsis", () => {
    const curio = new Map([["gunwale", { slug: "gunwale", teaser: "word ".repeat(60).trim() }]]);
    const pick = chooseFossil(c, { ...base, curio })!;
    expect(pick.word).toBe("gunwale");
    expect(pick.fact.length).toBeLessThanOrEqual(140);
    expect(pick.fact.endsWith("…")).toBe(true);
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

describe("yearlyViews", () => {
  const now = new Date("2026-10-24T00:00:00Z");
  const DAY = 24 * 60 * 60 * 1000;
  let dir: string;
  let cachePath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "pageviews-test-"));
    cachePath = path.join(dir, "pageviews.json");
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Twelve monthly items for Oct 2025 to Sep 2026, the window before `now`, each with `views`. */
  const monthlyItems = (views: number) =>
    Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(2025, 9 + i, 1));
      return { timestamp: `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}0100`, views };
    });

  function fakeFetcher(notFound = false) {
    const calls: string[] = [];
    const fetcher = async (url: string) => {
      calls.push(url);
      if (notFound) return new Response("", { status: 404 });
      return new Response(JSON.stringify({ items: monthlyItems(10) }), { status: 200 });
    };
    return { fetcher, calls };
  }

  it("sums twelve months of views and asks for the complete window", async () => {
    const { fetcher, calls } = fakeFetcher();
    const out = await yearlyViews(["halyard", "gunwale"], { fetcher, cachePath, now });
    expect(out.get("halyard")).toBe(120);
    expect(out.get("gunwale")).toBe(120);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("/monthly/20251001/20260930");
  });

  it("reuses a fresh cache entry without refetching", async () => {
    await yearlyViews(["halyard"], { fetcher: fakeFetcher().fetcher, cachePath, now });
    const second = fakeFetcher();
    const out = await yearlyViews(["halyard"], { fetcher: second.fetcher, cachePath, now: new Date(now.getTime() + 10 * DAY) });
    expect(out.get("halyard")).toBe(120);
    expect(second.calls).toHaveLength(0);
  });

  it("refetches an entry older than 180 days", async () => {
    await yearlyViews(["halyard"], { fetcher: fakeFetcher().fetcher, cachePath, now });
    const later = fakeFetcher();
    await yearlyViews(["halyard"], { fetcher: later.fetcher, cachePath, now: new Date(now.getTime() + 200 * DAY) });
    expect(later.calls).toHaveLength(1);
  });

  it("counts a 404 as zero views and caches that zero", async () => {
    const out = await yearlyViews(["obscure"], { fetcher: fakeFetcher(true).fetcher, cachePath, now });
    expect(out.get("obscure")).toBe(0);
    const cached = JSON.parse(readFileSync(cachePath, "utf8"));
    expect(cached.obscure.views).toBe(0);
  });

  it("treats a corrupt cache file as empty and still returns the right sum", async () => {
    writeFileSync(cachePath, "{not json");
    const { fetcher, calls } = fakeFetcher();
    const out = await yearlyViews(["halyard"], { fetcher, cachePath, now });
    expect(out.get("halyard")).toBe(120);
    expect(calls).toHaveLength(1);
  });

  it("treats a cache of the wrong shape as empty", async () => {
    writeFileSync(cachePath, JSON.stringify({ halyard: { views: "lots", at: 5 } }));
    const { fetcher, calls } = fakeFetcher();
    const out = await yearlyViews(["halyard"], { fetcher, cachePath, now });
    expect(out.get("halyard")).toBe(120);
    expect(calls).toHaveLength(1);
  });

  it("creates a missing nested cache folder before the first periodic flush", async () => {
    const nested = path.join(dir, "missing", "deeper", "pageviews.json");
    const words = Array.from({ length: 501 }, (_, i) => `word${i}`);
    const out = await yearlyViews(words, { fetcher: fakeFetcher().fetcher, cachePath: nested, now });
    expect(out.size).toBe(501);
    expect(existsSync(nested)).toBe(true);
  });

  it("rejects a failed fetch without printing the word, and keeps the earlier fetches", async () => {
    const fetcher = async (url: string) =>
      url.includes("secretword")
        ? new Response("", { status: 500 })
        : new Response(JSON.stringify({ items: monthlyItems(10) }), { status: 200 });
    const err = await yearlyViews(["alpha", "beta", "secretword", "gamma"], { fetcher, cachePath, now }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/after \d+ fetched/);
    expect((err as Error).message).toContain("HTTP 500");
    expect((err as Error).message).not.toContain("secretword");
    // Fetches run concurrently, so the words alongside the failure may be cached too; the failure never is.
    const cached = Object.keys(JSON.parse(readFileSync(cachePath, "utf8")));
    expect(cached).toEqual(expect.arrayContaining(["alpha", "beta"]));
    expect(cached).not.toContain("secretword");
  });
});
