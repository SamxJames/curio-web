import { describe, expect, it } from "vitest";
import { buildRewritePrompt, parseRewriteResponse } from "./rewriteEtymology";

describe("buildRewritePrompt", () => {
  it("includes the word and every fact, and forbids inventing details", () => {
    const prompt = buildRewritePrompt("bank", [
      "From Middle English banke, from Old Norse banki.",
      "From Old Italian banca, from Old High German banc.",
    ]);
    expect(prompt).toContain("bank");
    expect(prompt).toContain("From Middle English banke, from Old Norse banki.");
    expect(prompt).toContain("From Old Italian banca, from Old High German banc.");
    expect(prompt.toLowerCase()).toContain("do not invent");
  });
});

describe("parseRewriteResponse", () => {
  const validJson = JSON.stringify({
    respelling: "BANGK",
    partOfSpeech: "noun",
    teaser: "A word for money-holding and riverbanks alike, from the very same root.",
    origin: "From Middle English banke, ultimately from Old Norse banki.",
    journey: "The word split into two senses that still share one spelling today.",
    related: "A distant cousin of bench, from the same Germanic root for a raised shelf.",
    lineage: ["Old Norse", "Middle English", "English"],
    clues: [
      "A raised shelf of ground and a place to keep your money share more than you'd think.",
      "Old Norse for a raised shelf of ground is the shared root behind both senses.",
      "A distant cousin of bench, from the same Germanic root.",
    ],
  });

  it("parses a valid response into a DraftEntry with the given slug/word", () => {
    const draft = parseRewriteResponse(validJson, "bank");
    expect(draft.slug).toBe("bank");
    expect(draft.word).toBe("bank");
    expect(draft.respelling).toBe("BANGK");
    expect(draft.lineage).toEqual(["Old Norse", "Middle English", "English"]);
    expect(draft.clues).toHaveLength(3);
  });

  it("throws if the response isn't valid JSON", () => {
    expect(() => parseRewriteResponse("not json", "bank")).toThrow();
  });

  it("throws if a required field is missing", () => {
    const missingTeaser = JSON.stringify({
      respelling: "BANGK",
      partOfSpeech: "noun",
      origin: "...",
      journey: "...",
      related: "...",
      lineage: ["English"],
    });
    expect(() => parseRewriteResponse(missingTeaser, "bank")).toThrow(/teaser/i);
  });

  it("throws if lineage doesn't end in English", () => {
    const badLineage = JSON.stringify({
      respelling: "BANGK",
      partOfSpeech: "noun",
      teaser: "A teaser sentence here.",
      origin: "Origin text.",
      journey: "Journey text.",
      related: "Related text.",
      lineage: ["Old Norse"],
    });
    expect(() => parseRewriteResponse(badLineage, "bank")).toThrow(/lineage/i);
  });

  it("throws if teaser equals origin", () => {
    const sameText = JSON.stringify({
      respelling: "BANGK",
      partOfSpeech: "noun",
      teaser: "Identical text.",
      origin: "Identical text.",
      journey: "Journey text.",
      related: "Related text.",
      lineage: ["English"],
    });
    expect(() => parseRewriteResponse(sameText, "bank")).toThrow(/teaser/i);
  });

  it("throws if clues isn't exactly 3 non-empty strings", () => {
    const badClues = JSON.stringify({
      respelling: "BANGK",
      partOfSpeech: "noun",
      teaser: "A teaser sentence here.",
      origin: "Origin text.",
      journey: "Journey text.",
      related: "Related text.",
      lineage: ["English"],
      clues: ["Only one clue."],
    });
    expect(() => parseRewriteResponse(badClues, "bank")).toThrow(/clues/i);
  });

  it("throws if a clue contains the answer word", () => {
    const spoilerClue = JSON.stringify({
      respelling: "BANGK",
      partOfSpeech: "noun",
      teaser: "A teaser sentence here.",
      origin: "Origin text.",
      journey: "Journey text.",
      related: "Related text.",
      lineage: ["English"],
      clues: [
        "This clue accidentally mentions bank directly.",
        "A second clue.",
        "A third clue.",
      ],
    });
    expect(() => parseRewriteResponse(spoilerClue, "bank")).toThrow(/clue/i);
  });
});
