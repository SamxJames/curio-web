import { describe, expect, it } from "vitest";
import {
  buildSheetPrompt,
  extractResponseText,
  factLines,
  factProblems,
  parseDraftResponse,
  SHEET_FIELDS,
} from "./draftPrompt";
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

describe("buildSheetPrompt example values (fix round 1)", () => {
  it("uses neutral placeholders, not Latin's real numbers, in the example JSON", () => {
    const p = buildSheetPrompt("Proto-Indo-European", pieFacts);
    for (const n of ["41.9", "12.5", "-700", "1900", "2019", "1000", '"to": 600']) {
      expect(p, n).not.toContain(n);
    }
    expect(p).toContain("<year, negative for BCE>");
    expect(p).toContain("<number>");
  });
});

describe("parseDraftResponse cross-checks against the facts (fix round 1)", () => {
  const known = ["Latin", "Proto-Italic"];
  const problemsFor = (patch: Record<string, unknown>, facts: LanguageFacts = latinFacts) => {
    const res = parseDraftResponse(JSON.stringify({ ...goodDraft, ...patch }), facts, known);
    if (!res.ok) throw new Error(res.error);
    return res.draft._problems ?? [];
  };
  const latinWith = (wd: Partial<NonNullable<LanguageFacts["wikidata"]>>): LanguageFacts => ({
    ...latinFacts,
    wikidata: { ...latinFacts.wikidata!, ...wd },
  });

  it("flags a speaker year that differs from the fact", () => {
    expect(problemsFor({ peakSpeakers: { count: 50000000, year: 300 } })).toContain(
      "peakSpeakers.year 300 differs from the fact 200",
    );
  });

  it("flags any peakSpeakers when the speaker-count fact has no year", () => {
    expect(
      problemsFor({ peakSpeakers: { count: 50000000, year: 200 } }, latinWith({ speakers: { count: 50000000, year: null } })),
    ).toContain("peakSpeakers is set but the speaker-count fact has no year");
  });

  it("flags era.from / era.to more than 50 years from inception / dissolved, and tolerates 50", () => {
    expect(problemsFor({ era: { from: -650, to: 650, approximate: true } })).toEqual([]);
    expect(problemsFor({ era: { from: -500, to: 600, approximate: true } })).toContain(
      "era.from -500 is more than 50 years from the fact -700",
    );
    expect(problemsFor({ era: { from: -700, to: 700, approximate: true } })).toContain(
      "era.to 700 is more than 50 years from the fact 600",
    );
    expect(problemsFor({ era: { from: -700, to: null, approximate: true } })).toContain(
      "era.to is null (still spoken) but the facts give an end date of 600",
    );
  });

  it("skips the era check when the facts have no dates", () => {
    expect(
      problemsFor({ era: { from: 100, to: 1200, approximate: true } }, latinWith({ inception: null, dissolved: null })),
    ).toEqual([]);
  });

  it("flags a map centre more than 1500 km from the fact coordinates", () => {
    // Paris is ~1100 km from Rome; Oslo ~2000 km.
    expect(problemsFor({ map: { lat: 48.85, lon: 2.35, radiusKm: 300 } })).toEqual([]);
    expect(problemsFor({ map: { lat: 59.9, lon: 10.7, radiusKm: 300 } })).toContain(
      "map centre is more than 1500 km from the fact coordinates (41.9, 12.5)",
    );
    expect(
      problemsFor({ map: { lat: 59.9, lon: 10.7, radiusKm: 300 } }, latinWith({ coordinates: null })),
    ).toEqual([]);
  });

  it("forces the fixed note and null speakers for a reconstructed language", () => {
    const res = parseDraftResponse(
      JSON.stringify({
        ...goodDraft,
        name: "Proto-Indo-European",
        status: "reconstructed",
        peakSpeakers: { count: 5000000, year: -4000 },
        unknownSpeakersNote: "Maybe a few million.",
        parent: null,
      }),
      pieFacts,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.draft.peakSpeakers).toBeNull();
    expect(res.draft.unknownSpeakersNote).toBe("Reconstructed by scholars — never written down.");
    expect(res.draft._problems).toBeUndefined();
  });
});

describe("extractResponseText (fix round 1)", () => {
  it("returns the first text block, skipping thinking and fallback blocks", () => {
    expect(
      extractResponseText({
        stop_reason: "end_turn",
        content: [
          { type: "thinking", thinking: "" },
          { type: "fallback", from: { model: "a" }, to: { model: "b" } },
          { type: "text", text: "{\"a\":1}" },
          { type: "text", text: "second" },
        ],
      }),
    ).toBe('{"a":1}');
  });

  it("throws on max_tokens, a refusal of the whole chain, or no text block", () => {
    expect(() => extractResponseText({ stop_reason: "max_tokens", content: [{ type: "text", text: "{" }] })).toThrow(
      /max_tokens/,
    );
    expect(() => extractResponseText({ stop_reason: "refusal", content: [] })).toThrow(/declined/);
    expect(() => extractResponseText({ stop_reason: "end_turn", content: [{ type: "thinking" }] })).toThrow(
      /no text block/,
    );
  });
});

describe("final review: non-language pages and exported factProblems", () => {
  it("flags facts whose Wikipedia summary is not about a language", () => {
    const facts: LanguageFacts = {
      ...latinFacts,
      wikipedia: {
        ...latinFacts.wikipedia!,
        title: "Latin (disambiguation)",
        description: "Topics referred to by the same term",
        extract: "Latin refers to several things, including a script, a people and a mass.",
        type: "standard",
      },
    };
    const res = parseDraftResponse(JSON.stringify(goodDraft), facts, ["Latin", "Proto-Italic"]);
    if (!res.ok) throw new Error(res.error);
    expect(res.draft._problems?.join("\n")).toMatch(/does not look like a language page/);
    expect(factProblems(goodDraft as never, facts).join("\n")).toMatch(/does not look like a language page/);
  });

  it("reports no problems for a good draft against its facts", () => {
    expect(factProblems(goodDraft as never, latinFacts)).toEqual([]);
  });

  it("does not mention a peak in the speakers guidance", () => {
    expect(buildSheetPrompt("Latin", latinFacts)).not.toMatch(/\bpeak\b/i);
  });
});

describe("richer facts (lang-sources)", () => {
  const rich: LanguageFacts = {
    ...latinFacts,
    wikipedia: { ...latinFacts.wikipedia!, lead: "Latin was spoken in Latium from about 700 BCE. It descends from Proto-Italic." },
    wikidata: { ...latinFacts.wikidata!, parentLabels: ["Italic languages"], regionLabels: ["Latium"] },
  };

  it("includes the lead section as a labelled fact block", () => {
    const lines = factLines(rich).join("\n");
    expect(lines).toContain("Wikipedia lead section (you may take dates, places and lineage from this text)");
    expect(lines).toContain("It descends from Proto-Italic.");
  });

  it("includes parent and region labels as facts", () => {
    const lines = factLines(rich).join("\n");
    expect(lines).toContain("Wikidata parent languages / groups: Italic languages");
    expect(lines).toContain("Wikidata indigenous to: Latium");
  });

  it("omits those lines when the facts lack them", () => {
    const lines = factLines(latinFacts).join("\n");
    expect(lines).not.toContain("lead section");
    expect(lines).not.toContain("parent languages");
    expect(lines).not.toContain("indigenous to");
  });

  it("adds the parent, era and map rules to the prompt", () => {
    const prompt = buildSheetPrompt("Latin", rich, ["Proto-Italic"]);
    expect(prompt).toContain("Prefer a name that appears in the Wikidata parent languages / groups fact or that the lead section names as the language's ancestor");
    expect(prompt).toContain("from dates stated in the lead section");
    expect(prompt).toContain("a place named in the lead section or the indigenous-to fact");
  });
});
