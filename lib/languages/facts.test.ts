import { describe, expect, it } from "vitest";
import { WORDS } from "../words";
import {
  ALIASES,
  SKIP,
  canonicalName,
  collectLineageLanguages,
  instanceOfIds,
  labelIds,
  isAboutLanguage,
  languageSlug,
  languageTargets,
  parseWikidataClaims,
  parseWikidataLabels,
  parseWikipediaLead,
  parseWikipediaSummary,
  retryAfterMs,
  shouldRetryStatus,
  usableSummary,
  wikipediaLeadUrl,
  wikipediaSummaryUrls,
  acceptSummary,
  capLead,
  LEAD_CAP,
} from "./facts";
import latinEntity from "./__fixtures__/wikidata-latin.json";
import sparseEntity from "./__fixtures__/wikidata-sparse.json";
import labelsJson from "./__fixtures__/wikidata-labels.json";
import oldNorseSummary from "./__fixtures__/wikipedia-old-norse.json";
import leadLatin from "./__fixtures__/wikipedia-lead-latin.json";
import leadMissing from "./__fixtures__/wikipedia-lead-missing.json";
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
      subclassOf: ["Q100"],
      indigenousTo: ["Q200"],
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
      subclassOf: [],
      indigenousTo: [],
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

describe("usableSummary", () => {
  it("drops a disambiguation page, so it counts as no Wikipedia facts", () => {
    expect(usableSummary(parseWikipediaSummary(disambiguation))).toBeNull();
  });

  it("keeps a real page, and passes null through", () => {
    const real = parseWikipediaSummary(oldNorseSummary)!;
    expect(usableSummary(real)).toBe(real);
    expect(usableSummary(null)).toBeNull();
  });
});

describe("wikipediaSummaryUrls for Proto-* names", () => {
  it("tries the bare name first, then {Name} language", () => {
    expect(wikipediaSummaryUrls("Proto-West Germanic")).toEqual([
      "https://en.wikipedia.org/api/rest_v1/page/summary/Proto-West_Germanic",
      "https://en.wikipedia.org/api/rest_v1/page/summary/Proto-West_Germanic_language",
    ]);
  });
});

describe("wikipediaLeadUrl", () => {
  it("builds the extracts query for a title", () => {
    expect(wikipediaLeadUrl("Old Norse")).toBe(
      "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&format=json&formatversion=2&titles=Old_Norse",
    );
  });
});

describe("parseWikipediaLead", () => {
  it("returns the trimmed extract", () => {
    expect(parseWikipediaLead(leadLatin)).toBe(
      "Latin is a classical language belonging to the Italic branch of the Indo-European languages. It was originally spoken in Latium, in the Italian peninsula.\n\nThe Romans spread it across Europe from about 700 BCE.",
    );
  });

  it("returns null for a missing page, an empty extract or malformed input", () => {
    expect(parseWikipediaLead(leadMissing)).toBeNull();
    expect(parseWikipediaLead({ query: { pages: [{ title: "x", extract: "   " }] } })).toBeNull();
    expect(parseWikipediaLead({ query: { pages: [] } })).toBeNull();
    expect(parseWikipediaLead(null)).toBeNull();
    expect(parseWikipediaLead("nope")).toBeNull();
  });

  it("caps at 4000 characters, cutting at the last sentence end", () => {
    const long = "This is a sentence about the language. ".repeat(200);
    const lead = parseWikipediaLead({ query: { pages: [{ extract: long }] } })!;
    expect(LEAD_CAP).toBe(4000);
    expect(lead.length).toBeLessThanOrEqual(4000);
    expect(lead.endsWith("language.")).toBe(true);
    expect(/[.!?]$/.test(lead)).toBe(true);
  });
});

describe("capLead", () => {
  it("leaves short text alone", () => {
    expect(capLead("Short. Text.")).toBe("Short. Text.");
  });
  it("hard-cuts when there is no sentence end before the cap", () => {
    expect(capLead("a".repeat(5000)).length).toBe(4000);
  });
});

describe("acceptSummary (title matching)", () => {
  const summary = (title: string, extract = "It is a language of Europe.") => ({
    title,
    extract,
    url: `https://en.wikipedia.org/wiki/${title.replace(/ /g, "_")}`,
    description: null,
    wikibaseItem: null,
    type: "standard",
  });

  it("rejects West Germanic languages for Proto-West Germanic", () => {
    expect(acceptSummary("Proto-West Germanic", summary("West Germanic languages"))).toBe(false);
  });
  it("accepts Proto-West Germanic language for Proto-West Germanic", () => {
    expect(acceptSummary("Proto-West Germanic", summary("Proto-West Germanic language"))).toBe(true);
  });
  it("rejects pages whose title only contains the name", () => {
    expect(acceptSummary("Old Norse", summary("Old Norse religion"))).toBe(false);
    expect(acceptSummary("Latin", summary("Latin America", "A region where the Spanish language is spoken."))).toBe(false);
  });
  it("rejects Old Norman for Old Northern French", () => {
    expect(acceptSummary("Old Northern French", summary("Old Norman"))).toBe(false);
  });
  it("accepts a matching language page, ignoring case and the language suffix", () => {
    expect(acceptSummary("Old Norse", summary("Old Norse"))).toBe(true);
    expect(acceptSummary("Latin", summary("Latin language"))).toBe(true);
  });
  it("rejects a page that is not about a language even if the title matches", () => {
    expect(acceptSummary("Latin", summary("Latin", "A cuisine of the region."))).toBe(false);
  });
});

describe("parseWikidataClaims subclassOf and indigenousTo", () => {
  it("keeps only non-deprecated entity values", () => {
    const facts = parseWikidataClaims(latinEntity)!;
    expect(facts.subclassOf).toEqual(["Q100"]);
    expect(facts.indigenousTo).toEqual(["Q200"]); // Q201 is deprecated, the somevalue snak has no id
  });
  it("resolves their labels with the labels parser", () => {
    expect(parseWikidataLabels(labelsJson)).toMatchObject({ Q100: "Italic languages", Q200: "Latium" });
  });
});

describe("labelIds", () => {
  it("lists instance-of, subclass-of and indigenous-to ids once each", () => {
    expect(labelIds(latinEntity)).toEqual(["Q34770", "Q45762", "Q100", "Q200"]);
    expect(labelIds(null)).toEqual([]);
  });
});
