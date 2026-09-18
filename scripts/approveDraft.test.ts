import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import {
  appendDraftToWordsFile,
  appendDraftsToWordsFile,
  validateDraft,
  validateDraftFiles,
} from "./approveDraft";
import type { DraftEntry } from "./rewriteEtymology";

const validDraft: DraftEntry = {
  slug: "bank",
  word: "bank",
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
};

describe("validateDraft", () => {
  it("accepts a well-formed draft", () => {
    expect(validateDraft(validDraft)).toEqual(validDraft);
  });

  it("rejects a draft missing a field", () => {
    const { teaser: _teaser, ...missingTeaser } = validDraft;
    expect(() => validateDraft(missingTeaser)).toThrow(/teaser/i);
  });

  it("rejects a draft whose lineage doesn't end in English", () => {
    expect(() => validateDraft({ ...validDraft, lineage: ["Old Norse"] })).toThrow(/lineage/i);
  });

  it("rejects a draft whose teaser equals its origin", () => {
    expect(() => validateDraft({ ...validDraft, teaser: validDraft.origin })).toThrow(/teaser/i);
  });

  it("rejects a draft whose clue contains the answer word", () => {
    expect(() =>
      validateDraft({ ...validDraft, clues: ["This one says bank outright.", "clue two", "clue three"] })
    ).toThrow(/clue/i);
  });
});

describe("appendDraftToWordsFile", () => {
  let tmpFile: string;

  afterEach(() => {
    rmSync(tmpFile, { force: true });
  });

  it("appends the draft as a new WORDS entry before the closing bracket", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "curio-approve-test-"));
    tmpFile = path.join(dir, "words-fixture.ts");
    writeFileSync(
      tmpFile,
      `export const WORDS: WordEntry[] = [\n  {\n    slug: "existing",\n    word: "existing",\n  },\n];\n`
    );

    appendDraftToWordsFile(validDraft, tmpFile);

    const contents = readFileSync(tmpFile, "utf-8");
    expect(contents).toContain('slug: "existing"');
    expect(contents).toContain('slug: "bank"');
    expect(contents.indexOf('slug: "existing"')).toBeLessThan(contents.indexOf('slug: "bank"'));
    // The array must still close exactly once, after the appended entry.
    expect(contents.trim().endsWith("];")).toBe(true);
  });

  // Regression test: the real lib/words.ts (unlike the minimal fixture above)
  // contains other `"];"` substrings after the WORDS array — e.g. a later
  // function's `const days: HistoryDay[] = [];` — so a naive
  // `source.lastIndexOf("];")` finds THAT bracket instead of the WORDS
  // array's true closing bracket and corrupts the file. This fixture
  // reproduces that shape.
  it("appends before the WORDS array's true closing bracket, not a later inline empty-array literal", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "curio-approve-test-"));
    tmpFile = path.join(dir, "words-fixture.ts");
    writeFileSync(
      tmpFile,
      `export const WORDS: WordEntry[] = [\n  {\n    slug: "existing",\n    word: "existing",\n  },\n];\n\nexport function getHistory() {\n  const days: HistoryDay[] = [];\n  return days;\n}\n`
    );

    appendDraftToWordsFile(validDraft, tmpFile);

    const contents = readFileSync(tmpFile, "utf-8");
    // The decoy empty array inside getHistory must be untouched.
    expect(contents).toContain("const days: HistoryDay[] = [];");
    // The new entry must land inside the WORDS array, before its closing
    // bracket — i.e. before the getHistory function starts.
    expect(contents.indexOf('slug: "bank"')).toBeLessThan(contents.indexOf("function getHistory"));
    expect(contents.indexOf('slug: "existing"')).toBeLessThan(contents.indexOf('slug: "bank"'));
  });

  // Regression test: anchoring. A future edit might add another exported
  // array literal after WORDS whose closing bracket also sits alone on its
  // own line (the same "standalone-line `];`" shape the search looks for).
  // Without anchoring the search to the WORDS declaration itself, "the last
  // standalone `];` in the whole file" would find THAT later array's
  // closing bracket instead of WORDS's own — this fixture simulates that
  // future shape and confirms the new entry still lands inside WORDS.
  it("appends inside the WORDS array even when a later array literal also closes on its own line", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "curio-approve-test-"));
    tmpFile = path.join(dir, "words-fixture.ts");
    writeFileSync(
      tmpFile,
      `export const WORDS: WordEntry[] = [\n  {\n    slug: "existing",\n    word: "existing",\n  },\n];\n\nexport const OTHER: string[] = [\n  "decoy",\n];\n`
    );

    appendDraftToWordsFile(validDraft, tmpFile);

    const contents = readFileSync(tmpFile, "utf-8");
    // The later array literal must be untouched.
    expect(contents).toContain('export const OTHER: string[] = [\n  "decoy",\n];');
    // The new entry must land inside WORDS, before OTHER even starts.
    expect(contents.indexOf('slug: "bank"')).toBeLessThan(contents.indexOf("OTHER"));
    expect(contents.indexOf('slug: "existing"')).toBeLessThan(contents.indexOf('slug: "bank"'));
  });
});

const otherDraft: DraftEntry = {
  slug: "thistle",
  word: "thistle",
  respelling: "THISS-uhl",
  partOfSpeech: "noun",
  teaser: "A prickly plant with a name as old as English itself.",
  origin: "From Old English þistel.",
  journey: "The word has barely changed in a thousand years of use.",
  related: "No known cognates outside the Germanic languages.",
  lineage: ["Old English", "English"],
  clues: [
    "This prickly plant's name is one of the oldest in the language.",
    "It comes straight from Old English, almost unchanged.",
    "No known relatives outside the Germanic family.",
  ],
};

describe("appendDraftsToWordsFile", () => {
  let tmpFile: string;

  afterEach(() => {
    rmSync(tmpFile, { force: true });
  });

  it("appends multiple drafts in one call, in order, before the closing bracket", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "curio-approve-batch-test-"));
    tmpFile = path.join(dir, "words-fixture.ts");
    writeFileSync(
      tmpFile,
      `export const WORDS: WordEntry[] = [\n  {\n    slug: "existing",\n    word: "existing",\n  },\n];\n`
    );

    appendDraftsToWordsFile([validDraft, otherDraft], tmpFile);

    const contents = readFileSync(tmpFile, "utf-8");
    expect(contents).toContain('slug: "existing"');
    expect(contents).toContain('slug: "bank"');
    expect(contents).toContain('slug: "thistle"');
    expect(contents.indexOf('slug: "existing"')).toBeLessThan(contents.indexOf('slug: "bank"'));
    expect(contents.indexOf('slug: "bank"')).toBeLessThan(contents.indexOf('slug: "thistle"'));
    expect(contents.trim().endsWith("];")).toBe(true);
  });

  it("does nothing for an empty draft list", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "curio-approve-batch-test-"));
    tmpFile = path.join(dir, "words-fixture.ts");
    const original = `export const WORDS: WordEntry[] = [\n  {\n    slug: "existing",\n    word: "existing",\n  },\n];\n`;
    writeFileSync(tmpFile, original);

    appendDraftsToWordsFile([], tmpFile);

    expect(readFileSync(tmpFile, "utf-8")).toBe(original);
  });
});

describe("validateDraftFiles", () => {
  let dir: string;

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeDraftFile(name: string, draft: unknown): string {
    const filePath = path.join(dir, name);
    writeFileSync(filePath, JSON.stringify(draft));
    return filePath;
  }

  it("returns every draft as valid when all are well-formed and non-conflicting", () => {
    dir = mkdtempSync(path.join(tmpdir(), "curio-validate-batch-test-"));
    const paths = [writeDraftFile("bank.json", validDraft), writeDraftFile("thistle.json", otherDraft)];

    const { valid, errors } = validateDraftFiles(paths, "export const WORDS: WordEntry[] = [\n];\n");

    expect(errors).toEqual([]);
    expect(valid.map((d) => d.slug).sort()).toEqual(["bank", "thistle"]);
  });

  it("collects an error for a malformed draft file without throwing, keeping the other valid ones", () => {
    dir = mkdtempSync(path.join(tmpdir(), "curio-validate-batch-test-"));
    const { teaser: _teaser, ...malformed } = validDraft;
    const paths = [writeDraftFile("bank.json", malformed), writeDraftFile("thistle.json", otherDraft)];

    const { valid, errors } = validateDraftFiles(paths, "export const WORDS: WordEntry[] = [\n];\n");

    expect(valid.map((d) => d.slug)).toEqual(["thistle"]);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe(paths[0]);
    expect(errors[0].error).toMatch(/teaser/i);
  });

  it("rejects a draft whose slug already exists in lib/words.ts, as an error not a silent skip", () => {
    dir = mkdtempSync(path.join(tmpdir(), "curio-validate-batch-test-"));
    const paths = [writeDraftFile("bank.json", validDraft)];
    const existingSource = `export const WORDS: WordEntry[] = [\n  {\n    slug: "bank",\n    word: "bank",\n  },\n];\n`;

    const { valid, errors } = validateDraftFiles(paths, existingSource);

    expect(valid).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].error).toMatch(/already exists/i);
  });

  it("rejects a within-batch duplicate slug across two draft files", () => {
    dir = mkdtempSync(path.join(tmpdir(), "curio-validate-batch-test-"));
    const paths = [writeDraftFile("bank-a.json", validDraft), writeDraftFile("bank-b.json", validDraft)];

    const { valid, errors } = validateDraftFiles(paths, "export const WORDS: WordEntry[] = [\n];\n");

    expect(valid).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0].error).toMatch(/duplicat/i);
  });
});
