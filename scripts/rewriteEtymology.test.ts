import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import {
  buildRewritePrompt,
  parseRewriteResponse,
  shouldRetryStatus,
  backoffDelayMs,
  isWordAlreadyApproved,
  rewriteBatch,
} from "./rewriteEtymology";

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

// Module-scoped (not just describe-scoped) since scripts/rewriteEtymology.test.ts's
// later rewriteBatch tests need a stand-in "valid Claude response" too.
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

describe("parseRewriteResponse", () => {
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

describe("shouldRetryStatus", () => {
  it("retries on 429 (rate limited)", () => {
    expect(shouldRetryStatus(429, 0, 3)).toBe(true);
  });

  it("retries on any 5xx", () => {
    expect(shouldRetryStatus(500, 0, 3)).toBe(true);
    expect(shouldRetryStatus(503, 0, 3)).toBe(true);
    expect(shouldRetryStatus(599, 0, 3)).toBe(true);
  });

  it("does not retry on other 4xx (e.g. bad API key, bad request)", () => {
    expect(shouldRetryStatus(401, 0, 3)).toBe(false);
    expect(shouldRetryStatus(400, 0, 3)).toBe(false);
    expect(shouldRetryStatus(404, 0, 3)).toBe(false);
  });

  it("stops retrying once the attempt count reaches maxRetries", () => {
    expect(shouldRetryStatus(429, 3, 3)).toBe(false);
    expect(shouldRetryStatus(500, 5, 3)).toBe(false);
  });
});

describe("backoffDelayMs", () => {
  it("doubles the delay per attempt (exponential backoff)", () => {
    expect(backoffDelayMs(0, 1000)).toBe(1000);
    expect(backoffDelayMs(1, 1000)).toBe(2000);
    expect(backoffDelayMs(2, 1000)).toBe(4000);
  });

  it("defaults to a 1000ms base delay", () => {
    expect(backoffDelayMs(0)).toBe(1000);
  });
});

describe("isWordAlreadyApproved", () => {
  const wordsSource = `export const WORDS: WordEntry[] = [\n  {\n    slug: "quarantine",\n    word: "quarantine",\n  },\n];\n`;

  it("returns true when the word's slug is already in the WORDS source", () => {
    expect(isWordAlreadyApproved("quarantine", wordsSource)).toBe(true);
  });

  it("returns false when the word's slug isn't present", () => {
    expect(isWordAlreadyApproved("bank", wordsSource)).toBe(false);
  });
});

describe("rewriteBatch", () => {
  let dir: string;

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function setup(wordsFileContents = `export const WORDS: WordEntry[] = [\n];\n`) {
    dir = mkdtempSync(path.join(tmpdir(), "curio-rewrite-batch-test-"));
    const draftsDir = path.join(dir, "drafts");
    mkdirSync(draftsDir);
    const wordsFilePath = path.join(dir, "words-fixture.ts");
    writeFileSync(wordsFilePath, wordsFileContents);
    return { draftsDir, wordsFilePath };
  }

  it("writes a draft for a word with facts, using the injected callClaude", async () => {
    const { draftsDir, wordsFilePath } = setup();
    const fakeCallClaude = vi.fn().mockResolvedValue(validJson);

    const result = await rewriteBatch(
      { bank: ["From Middle English banke, from Old Norse banki."] },
      { draftsDir, wordsFilePath, callClaude: fakeCallClaude }
    );

    expect(result.written).toEqual(["bank"]);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(fakeCallClaude).toHaveBeenCalledOnce();

    const draftContents = JSON.parse(readFileSync(path.join(draftsDir, "bank.json"), "utf-8"));
    expect(draftContents.slug).toBe("bank");
  });

  it("skips a word already present in the WORDS file, without calling callClaude", async () => {
    const { draftsDir, wordsFilePath } = setup(
      `export const WORDS: WordEntry[] = [\n  {\n    slug: "bank",\n    word: "bank",\n  },\n];\n`
    );
    const fakeCallClaude = vi.fn().mockResolvedValue(validJson);

    const result = await rewriteBatch(
      { bank: ["From Middle English banke."] },
      { draftsDir, wordsFilePath, callClaude: fakeCallClaude }
    );

    expect(result.skipped).toEqual([{ word: "bank", reason: "already approved in WORDS" }]);
    expect(fakeCallClaude).not.toHaveBeenCalled();
  });

  it("skips a word that already has a draft file on disk, without calling callClaude", async () => {
    const { draftsDir, wordsFilePath } = setup();
    writeFileSync(path.join(draftsDir, "bank.json"), validJson);
    const fakeCallClaude = vi.fn().mockResolvedValue(validJson);

    const result = await rewriteBatch(
      { bank: ["From Middle English banke."] },
      { draftsDir, wordsFilePath, callClaude: fakeCallClaude }
    );

    expect(result.skipped).toEqual([{ word: "bank", reason: "draft already exists" }]);
    expect(fakeCallClaude).not.toHaveBeenCalled();
  });

  it("fails (not skips) a word with no extracted facts, without calling callClaude", async () => {
    const { draftsDir, wordsFilePath } = setup();
    const fakeCallClaude = vi.fn().mockResolvedValue(validJson);

    const result = await rewriteBatch(
      { thinword: [] },
      { draftsDir, wordsFilePath, callClaude: fakeCallClaude }
    );

    expect(result.failed).toEqual([{ word: "thinword", reason: "no etymology facts extracted" }]);
    expect(fakeCallClaude).not.toHaveBeenCalled();
  });

  it("logs a failure with the error message when callClaude itself throws", async () => {
    const { draftsDir, wordsFilePath } = setup();
    const fakeCallClaude = vi.fn().mockRejectedValue(new Error("Anthropic API request failed (500)"));

    const result = await rewriteBatch(
      { bank: ["From Middle English banke."] },
      { draftsDir, wordsFilePath, callClaude: fakeCallClaude }
    );

    expect(result.failed).toEqual([{ word: "bank", reason: "Anthropic API request failed (500)" }]);
    expect(result.written).toEqual([]);
  });

  it("logs a failure when callClaude's response fails validation", async () => {
    const { draftsDir, wordsFilePath } = setup();
    const fakeCallClaude = vi.fn().mockResolvedValue("not valid json");

    const result = await rewriteBatch(
      { bank: ["From Middle English banke."] },
      { draftsDir, wordsFilePath, callClaude: fakeCallClaude }
    );

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].word).toBe("bank");
    expect(result.written).toEqual([]);
  });

  it("processes every word independently — one failure doesn't abort the batch", async () => {
    const { draftsDir, wordsFilePath } = setup();
    const fakeCallClaude = vi.fn().mockImplementation(async (prompt: string) => {
      if (prompt.includes("bank")) throw new Error("simulated failure");
      return validJson;
    });

    const result = await rewriteBatch(
      { bank: ["fact"], thistle: ["fact"] },
      { draftsDir, wordsFilePath, callClaude: fakeCallClaude }
    );

    expect(result.failed.map((f) => f.word)).toEqual(["bank"]);
    // What matters here is that processing "thistle" wasn't aborted by
    // "bank"'s failure — the write for the un-failed word still happened.
    expect(result.written).toEqual(["thistle"]);
  });
});
