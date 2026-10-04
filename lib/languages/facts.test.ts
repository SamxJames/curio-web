import { describe, expect, it } from "vitest";
import { WORDS } from "../words";
import {
  ALIASES,
  SKIP,
  canonicalName,
  collectLineageLanguages,
  instanceOfIds,
  isAboutLanguage,
  languageSlug,
  languageTargets,
  parseWikidataClaims,
  parseWikidataLabels,
  parseWikipediaSummary,
  retryAfterMs,
  shouldRetryStatus,
  wikipediaSummaryUrls,
} from "./facts";
import latinEntity from "./__fixtures__/wikidata-latin.json";
import sparseEntity from "./__fixtures__/wikidata-sparse.json";
import labelsJson from "./__fixtures__/wikidata-labels.json";
import oldNorseSummary from "./__fixtures__/wikipedia-old-norse.json";
import disambiguation from "./__fixtures__/wikipedia-disambiguation.json";

const words = [
  { lineage: ["Latin", "Old French", "English"] },
  { lineage: ["Latin", "English"] },
  { lineage: ["Old Norse", "English"] },
  { lineage: ["Latin", "Latin", "Translingual", "English"] },
  { lineage: ["Lombardic", "Italian", "English"] },
  { lineage: ["Lombard", "English"] },
  { lineage: ["Lombard", "English"] },
  { lineage: ["Indian English", "English"] },
];

describe("collectLineageLanguages", () => {
  it("returns unique names minus English and Translingual, most-used first", () => {
    expect(collectLineageLanguages(words)).toEqual([
      "Latin",
      "Lombard",
      "Indian English",
      "Italian",
      "Lombardic",
      "Old French",
      "Old Norse",
    ]);
  });

  it("counts a word once even if a language repeats in its lineage", () => {
    expect(collectLineageLanguages([{ lineage: ["Latin", "Latin", "English"] }])).toEqual(["Latin"]);
  });
});

describe("ALIASES and SKIP", () => {
  const lineageNames = new Set(WORDS.flatMap((w) => w.lineage));

  it("every alias, its canonical name and every SKIP name really occurs in WORDS lineages", () => {
    for (const [alias, canonical] of Object.entries(ALIASES)) {
      expect(lineageNames.has(alias), `alias "${alias}"`).toBe(true);
      expect(lineageNames.has(canonical), `canonical "${canonical}"`).toBe(true);
    }
    for (const name of SKIP) expect(lineageNames.has(name), `skip "${name}"`).toBe(true);
  });

  it("maps the agreed aliases", () => {
    expect(canonicalName("Lombardic")).toBe("Lombard");
    expect(canonicalName("Kiswahili")).toBe("Swahili");
    expect(canonicalName("Ottoman")).toBe("Ottoman Turkish");
    expect(canonicalName("Old Provençal")).toBe("Old Occitan");
    expect(canonicalName("Latin")).toBe("Latin");
  });
});

describe("languageTargets", () => {
  it("drops SKIP names and merges aliases under the canonical name", () => {
    const targets = languageTargets(words);
    expect(targets.map((t) => t.name)).toEqual(["Latin", "Lombard", "Italian", "Old French", "Old Norse"]);
    expect(targets.find((t) => t.name === "Lombard")?.aliases).toEqual(["Lombardic"]);
    expect(targets.find((t) => t.name === "Latin")?.aliases).toEqual([]);
  });

  it("covers the real WORDS lineages without any SKIP or alias name as a target", () => {
    const names = languageTargets(WORDS).map((t) => t.name);
    for (const s of SKIP) expect(names).not.toContain(s);
    for (const a of Object.keys(ALIASES)) expect(names).not.toContain(a);
    expect(new Set(names.map(languageSlug)).size).toBe(names.length);
  });
});

describe("languageSlug", () => {
  it("lowercases, strips diacritics and hyphenates", () => {
    expect(languageSlug("Old Provençal")).toBe("old-provencal");
    expect(languageSlug("Proto-Indo-European")).toBe("proto-indo-european");
    expect(languageSlug("Ancient Greek")).toBe("ancient-greek");
  });
});

describe("wikipediaSummaryUrls", () => {
  it("tries {Name}_language first, then {Name}", () => {
    expect(wikipediaSummaryUrls("Old Norse")).toEqual([
      "https://en.wikipedia.org/api/rest_v1/page/summary/Old_Norse_language",
      "https://en.wikipedia.org/api/rest_v1/page/summary/Old_Norse",
    ]);
    expect(wikipediaSummaryUrls("Old Provençal")[1]).toBe(
      "https://en.wikipedia.org/api/rest_v1/page/summary/Old_Proven%C3%A7al",
    );
  });
});

describe("parseWikipediaSummary", () => {
  it("returns title, extract and the desktop page URL", () => {
    expect(parseWikipediaSummary(oldNorseSummary)).toEqual({
      title: "Old Norse",
      extract: oldNorseSummary.extract,
      url: "https://en.wikipedia.org/wiki/Old_Norse",
      description: "North Germanic language spoken in Scandinavia",
      wikibaseItem: "Q35505",
      type: "standard",
    });
  });

  it("returns null for malformed input", () => {
    expect(parseWikipediaSummary(null)).toBeNull();
    expect(parseWikipediaSummary({ title: "x" })).toBeNull();
    expect(parseWikipediaSummary("nope")).toBeNull();
  });
});

describe("isAboutLanguage", () => {
  it("accepts a language page and rejects a disambiguation page", () => {
    expect(isAboutLanguage(parseWikipediaSummary(oldNorseSummary)!)).toBe(true);
    expect(isAboutLanguage(parseWikipediaSummary(disambiguation)!)).toBe(false);
  });
});

describe("parseWikidataClaims", () => {
  const labels = parseWikidataLabels(labelsJson);

  it("reads coordinates, inception, dissolution, max speakers and instance-of labels", () => {
    expect(parseWikidataClaims(latinEntity, labels)).toEqual({
      qid: "Q397",
      coordinates: { lat: 41.9, lon: 12.5 },
      inception: -700,
      dissolved: 600,
      speakers: { count: 50000000, year: 200 },
      instanceOf: ["language", "dead language"],
    });
  });

  it("returns nulls for missing claims, ignores somevalue snaks, and keeps a year-less count", () => {
    expect(parseWikidataClaims(sparseEntity, labels)).toEqual({
      qid: "Q1452291",
      coordinates: null,
      inception: null,
      dissolved: null,
      speakers: { count: 3000, year: null },
      instanceOf: ["Q206577"],
    });
  });

  it("returns null for malformed input", () => {
    expect(parseWikidataClaims(null)).toBeNull();
    expect(parseWikidataClaims({ entities: {} })).toBeNull();
  });

  it("lists instance-of ids so their labels can be fetched", () => {
    expect(instanceOfIds(latinEntity)).toEqual(["Q34770", "Q45762"]);
  });
});

describe("shouldRetryStatus", () => {
  it("retries 429 and 5xx only", () => {
    expect(shouldRetryStatus(429)).toBe(true);
    expect(shouldRetryStatus(503)).toBe(true);
    expect(shouldRetryStatus(404)).toBe(false);
    expect(shouldRetryStatus(200)).toBe(false);
  });
});

describe("retryAfterMs (fix round 1)", () => {
  it("honours Retry-After seconds or an HTTP date, capped at 30s, else a 2s default", () => {
    const now = Date.parse("2026-10-04T12:00:00Z");
    expect(retryAfterMs("5", now)).toBe(5000);
    expect(retryAfterMs("0", now)).toBe(0);
    expect(retryAfterMs("120", now)).toBe(30000);
    expect(retryAfterMs("Sun, 04 Oct 2026 12:00:10 GMT", now)).toBe(10000);
    expect(retryAfterMs("Sun, 04 Oct 2026 11:00:00 GMT", now)).toBe(0);
    expect(retryAfterMs(null, now)).toBe(2000);
    expect(retryAfterMs("soon", now)).toBe(2000);
  });
});
