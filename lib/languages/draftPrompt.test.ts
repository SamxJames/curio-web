import { describe, expect, it } from "vitest";
import { buildSheetPrompt, factLines, parseDraftResponse, SHEET_FIELDS } from "./draftPrompt";
import type { LanguageFacts } from "./facts";

const latinFacts: LanguageFacts = {
  name: "Latin",
  aliases: [],
  wikipedia: {
    title: "Latin",
    extract:
      "Latin is a classical language belonging to the Italic branch of the Indo-European languages. It was originally spoken in Latium, in the Italian peninsula.",
    url: "https://en.wikipedia.org/wiki/Latin",
    description: "Indo-European language of the Italic branch",
    wikibaseItem: "Q397",
    type: "standard",
  },
  wikidata: {
    qid: "Q397",
    coordinates: { lat: 41.9, lon: 12.5 },
    inception: -700,
    dissolved: 600,
    speakers: { count: 50000000, year: 200 },
    instanceOf: ["language", "dead language"],
  },
  fetchedAt: "2026-10-04T00:00:00.000Z",
};

const pieFacts: LanguageFacts = {
  name: "Proto-Indo-European",
  aliases: [],
  wikipedia: {
    title: "Proto-Indo-European language",
    extract:
      "Proto-Indo-European is the reconstructed common ancestor of the Indo-European language family. No direct record of it exists.",
    url: "https://en.wikipedia.org/wiki/Proto-Indo-European_language",
    description: "Reconstructed common ancestor of the Indo-European languages",
    wikibaseItem: "Q37178",
    type: "standard",
  },
  wikidata: null,
  fetchedAt: "2026-10-04T00:00:00.000Z",
};

describe("factLines", () => {
  it("lists every fetched fact", () => {
    const lines = factLines(latinFacts).join("\n");
    expect(lines).toContain(latinFacts.wikipedia!.extract);
    expect(lines).toContain("https://en.wikipedia.org/wiki/Latin");
    expect(lines).toContain("Indo-European language of the Italic branch");
    expect(lines).toContain("41.9");
    expect(lines).toContain("12.5");
    expect(lines).toContain("-700");
    expect(lines).toContain("600");
    expect(lines).toContain("50000000");
    expect(lines).toContain("as of year 200");
    expect(lines).toContain("language, dead language");
  });
});

describe("buildSheetPrompt", () => {
  const prompt = buildSheetPrompt("Latin", latinFacts, ["Latin", "Proto-Italic", "Old French"]);

  it("contains every fact as a numbered list", () => {
    factLines(latinFacts).forEach((line, i) => expect(prompt).toContain(`${i + 1}. ${line}`));
  });

  it("states the ONLY-these-facts rule", () => {
    expect(prompt).toContain("Here are the ONLY facts you may use");
    expect(prompt).toMatch(/Do NOT invent, guess, or pad/);
  });

  it("states the null-speakers rule", () => {
    expect(prompt).toContain('"peakSpeakers": null');
    expect(prompt).toContain("unknownSpeakersNote");
    expect(prompt).toContain("No census of its speakers exists.");
    expect(prompt).toContain("Never estimate, round or guess a speaker count");
  });

  it("lists every JSON field except approved", () => {
    for (const f of SHEET_FIELDS) expect(prompt).toContain(`"${f}"`);
    expect(SHEET_FIELDS).not.toContain("approved");
    expect(prompt).not.toContain('"approved"');
  });

  it("requires reconstructed status for Proto-* and map null without a location", () => {
    expect(prompt).toContain('"reconstructed"');
    expect(prompt).toContain("Proto-");
    expect(prompt).toMatch(/"map": null/);
  });

  it("sets Curio's voice and names the allowed parents", () => {
    expect(prompt).toContain("warm, curious, and precise");
    expect(prompt).toContain("Proto-Italic");
  });

  it("tells the model plainly when there is no speakers fact", () => {
    const p = buildSheetPrompt("Proto-Indo-European", pieFacts);
    expect(p).toContain("There is NO speaker-count fact");
    expect(p).toContain("Reconstructed by scholars — never written down.");
  });
});

const goodDraft = {
  name: "Latin",
  aliases: [],
  status: "extinct",
  classification: "Italic branch of the Indo-European family",
  region: "Latium, central Italy",
  map: { lat: 41.9, lon: 12.5, radiusKm: 400 },
  era: { from: -700, to: 600, approximate: true },
  peakSpeakers: { count: 50000000, year: 200, note: "Wikidata estimate" },
  unknownSpeakersNote: null,
  parent: "Proto-Italic",
  origin:
    "Latin was first spoken in Latium, in the Italian peninsula, and belongs to the Italic branch of Indo-European.",
  sourceUrl: "https://en.wikipedia.org/wiki/Latin",
};

describe("parseDraftResponse", () => {
  const known = ["Latin", "Proto-Italic"];

  it("parses JSON (even fenced), sets approved false and reports no problems for a good draft", () => {
    const res = parseDraftResponse("```json\n" + JSON.stringify(goodDraft) + "\n```", latinFacts, known);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.draft.approved).toBe(false);
    expect(res.draft._problems).toBeUndefined();
    expect(res.draft.name).toBe("Latin");
  });

  it("forces the canonical name, aliases and source URL from the facts", () => {
    const res = parseDraftResponse(
      JSON.stringify({ ...goodDraft, name: "latin", aliases: ["x"], sourceUrl: "https://example.com" }),
      { ...latinFacts, aliases: ["Classical Latin"] },
      known,
    );
    expect(res.ok && res.draft.name).toBe("Latin");
    expect(res.ok && res.draft.aliases).toEqual(["Classical Latin"]);
    expect(res.ok && res.draft.sourceUrl).toBe("https://en.wikipedia.org/wiki/Latin");
  });

  it("returns an error, not a throw, for invalid JSON", () => {
    const res = parseDraftResponse("Sorry, I can't.", latinFacts, known);
    expect(res.ok).toBe(false);
  });

  it("records validation problems for malformed JSON shapes", () => {
    const res = parseDraftResponse(JSON.stringify({ ...goodDraft, peakSpeakers: undefined }), latinFacts, known);
    expect(res.ok && res.draft._problems).toContain("peakSpeakers is missing (use null when unknown)");
  });

  it("flags a speaker count with no speakers fact behind it", () => {
    const res = parseDraftResponse(
      JSON.stringify({ ...goodDraft, peakSpeakers: { count: 5, year: 1 } }),
      { ...latinFacts, wikidata: { ...latinFacts.wikidata!, speakers: null } },
      known,
    );
    expect(res.ok && res.draft._problems).toContain(
      "peakSpeakers is set but the facts have no speaker count",
    );
  });

  it("flags a speaker count that differs from the fact", () => {
    const res = parseDraftResponse(
      JSON.stringify({ ...goodDraft, peakSpeakers: { count: 60000000, year: 200 } }),
      latinFacts,
      known,
    );
    expect(res.ok && res.draft._problems).toContain(
      "peakSpeakers.count 60000000 differs from the fact 50000000",
    );
  });

  it("flags a parent outside our lineage languages", () => {
    const res = parseDraftResponse(JSON.stringify({ ...goodDraft, parent: "Etruscan" }), latinFacts, known);
    expect(res.ok && res.draft._problems).toContain('parent "Etruscan" is not one of our lineage languages');
  });
});
