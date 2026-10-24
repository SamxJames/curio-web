import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fetchWikidataLabels } from "./wikidata";
import { wikidataThemeCandidates } from "../themes";
import { indexWiktionary } from "../wiktionary";

const theme = { id: "theme:cheeses", text: "Name a cheese", qid: "Q10943", label: "cheese", wiktionary: ["Cheeses"] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const bindings = (labels: string[]) => ({ results: { bindings: labels.map((l) => ({ label: { value: l } })) } });

describe("fetchWikidataLabels", () => {
  it("verifies the QID label, then lowercases item labels and caches them", async () => {
    const cacheDir = mkdtempSync(path.join(tmpdir(), "wd-"));
    const calls: string[] = [];
    const fetcher = async (url: string) => {
      calls.push(url);
      return calls.length === 1 ? json(bindings(["cheese"])) : json(bindings(["Brie", "Stilton", "Q123", "Red Leicester"]));
    };
    const now = new Date("2026-11-02T00:00:00Z");
    const first = await fetchWikidataLabels(theme, { fetcher, cacheDir, now });
    expect(first.status).toBe("fresh");
    expect([...first.labels!].sort()).toEqual(["brie", "red leicester", "stilton"]);
    const again = await fetchWikidataLabels(theme, { fetcher: async () => { throw new Error("offline"); }, cacheDir, now });
    expect(again.status).toBe("cached");
  });
  it("drops a theme whose QID label does not match", async () => {
    const cacheDir = mkdtempSync(path.join(tmpdir(), "wd-"));
    const r = await fetchWikidataLabels(theme, { fetcher: async () => json(bindings(["pasta"])), cacheDir, now: new Date() });
    expect(r).toEqual({ labels: null, status: "label-mismatch" });
  });
  it("falls back to a stale cache when the query fails", async () => {
    const cacheDir = mkdtempSync(path.join(tmpdir(), "wd-"));
    let n = 0;
    await fetchWikidataLabels(theme, { fetcher: async () => (n++ === 0 ? json(bindings(["cheese"])) : json(bindings(["Brie"]))), cacheDir, now: new Date("2026-01-01") });
    const r = await fetchWikidataLabels(theme, { fetcher: async () => json({}, 504), cacheDir, now: new Date("2026-03-01") });
    expect(r.status).toBe("stale");
    expect(r.labels?.has("brie")).toBe(true);
  });
  it("replaces a corrupt cache file with a fresh fetch", async () => {
    const cacheDir = mkdtempSync(path.join(tmpdir(), "wd-"));
    const file = path.join(cacheDir, "Q10943.json");
    writeFileSync(file, "{not json");
    let n = 0;
    const fetcher = async () => (n++ === 0 ? json(bindings(["cheese"])) : json(bindings(["Brie"])));
    const r = await fetchWikidataLabels(theme, { fetcher, cacheDir, now: new Date("2026-11-02T00:00:00Z") });
    expect(r.status).toBe("fresh");
    expect(JSON.parse(readFileSync(file, "utf8")).labels).toEqual(["brie"]);
  });
  it("treats a wrong-shape cache as missing when the query fails", async () => {
    const cacheDir = mkdtempSync(path.join(tmpdir(), "wd-"));
    writeFileSync(path.join(cacheDir, "Q10943.json"), "{}");
    const r = await fetchWikidataLabels(theme, { fetcher: async () => json({}, 504), cacheDir, now: new Date("2026-03-01T00:00:00Z") });
    expect(r).toEqual({ labels: null, status: "missing" });
  });
  it("keeps an older cache when the members query comes back empty", async () => {
    const cacheDir = mkdtempSync(path.join(tmpdir(), "wd-"));
    const file = path.join(cacheDir, "Q10943.json");
    const old = JSON.stringify({ fetchedAt: "2026-01-01T00:00:00.000Z", labels: ["brie"] });
    writeFileSync(file, old);
    let n = 0;
    const fetcher = async () => (n++ === 0 ? json(bindings(["cheese"])) : json(bindings([])));
    const r = await fetchWikidataLabels(theme, { fetcher, cacheDir, now: new Date("2026-03-01T00:00:00Z") });
    expect(r.status).toBe("stale");
    expect([...r.labels!]).toEqual(["brie"]);
    expect(readFileSync(file, "utf8")).toBe(old);
  });
});

describe("wikidataThemeCandidates", () => {
  it("keeps only labels that are usable Wiktionary nouns", async () => {
    const idx = await indexWiktionary(
      [
        { w: "brie", pos: "noun", t: [], c: ["en:Cheeses"], g: [], e: [], f: [], n: 1, et: "" },
        { w: "stilton", pos: "noun", t: [], c: [], g: [], e: [], f: [], n: 1, et: "" },
        { w: "feta", pos: "noun", t: [], c: ["en:Cheeses"], g: [], e: [], f: [], n: 1, et: "" },
      ],
      new Set()
    );
    const [c] = wikidataThemeCandidates([{ theme, labels: new Set(["brie", "stilton", "red leicester"]) }], idx, new Map());
    expect(c.core.sort()).toEqual(["brie", "stilton"]);
    expect(c.accepted).toEqual(expect.arrayContaining(["brie", "stilton", "feta"]));
    expect(c.senseIds).toBeNull();
  });
});
