import { execSync } from "child_process";
import { readdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import type { DraftEntry } from "./rewriteEtymology";

/** Re-checks a draft against exactly the invariants lib/words.test.ts
 * enforces on the real WORDS array, so a draft can only ever be appended
 * if it would also pass the existing test suite. */
export function validateDraft(draft: unknown): DraftEntry {
  const d = draft as Partial<DraftEntry>;
  const requiredStringFields: (keyof DraftEntry)[] = [
    "slug",
    "word",
    "respelling",
    "partOfSpeech",
    "teaser",
    "origin",
    "journey",
    "related",
  ];
  for (const field of requiredStringFields) {
    if (typeof d[field] !== "string" || !(d[field] as string).trim()) {
      throw new Error(`Draft is missing a non-empty "${field}" field.`);
    }
  }
  if (!Array.isArray(d.lineage) || d.lineage.length === 0 || !d.lineage.every((l) => typeof l === "string")) {
    throw new Error('Draft has an invalid "lineage" field (must be a non-empty string array).');
  }
  if (d.lineage[d.lineage.length - 1] !== "English") {
    throw new Error(`Draft's "lineage" doesn't end in "English": ${JSON.stringify(d.lineage)}`);
  }
  if (d.teaser === d.origin) {
    throw new Error('Draft\'s "teaser" is identical to its "origin" — they must differ.');
  }
  if (!Array.isArray(d.clues) || d.clues.length !== 3 || !d.clues.every((c) => typeof c === "string" && c.trim())) {
    throw new Error('Draft has an invalid "clues" field (must be exactly 3 non-empty strings).');
  }
  const lowerWord = (d.word as string).toLowerCase();
  const stem = lowerWord.replace(/(ing|tion|ed|es|s|y)$/i, "");
  for (const [i, clue] of d.clues.entries()) {
    const lowerClue = (clue as string).toLowerCase();
    if (lowerClue.includes(lowerWord) || lowerClue.includes(stem)) {
      throw new Error(`Draft's clue (index ${i}) contains the answer word or its stem: "${clue}"`);
    }
  }
  return d as DraftEntry;
}

/** The exact declaration that opens the WORDS array — searching is anchored
 * to this text first, so the closing-bracket search below only ever looks
 * *inside* the WORDS array, never at some other array literal elsewhere in
 * the file. */
const WORDS_DECLARATION = "export const WORDS: WordEntry[] = [";

/** Matches an array literal's closing bracket — a `];` that starts its own
 * line (optionally indented) — but NOT an inline `= [];` such as
 * lib/words.ts's `const days: HistoryDay[] = [];` inside getHistory
 * (there `[` and `]` share a line, so this pattern can't match there). */
const ARRAY_CLOSING_BRACKET_PATTERN = /\r?\n[ \t]*\];/;

/** Inserts the draft as one more object literal into the WORDS array,
 * immediately before the array's closing `];` — a plain text insertion
 * rather than an AST transform. The search is anchored to the WORDS
 * declaration itself and then finds the *first* standalone closing bracket
 * after it, so this keeps targeting the WORDS array specifically even if a
 * later edit adds another exported array literal (with its own standalone
 * `];`) further down the file — unlike a bare "last standalone `];` in the
 * whole file" search, which would silently redirect into that later array
 * instead. */
function buildEntryLiteral(draft: DraftEntry): string {
  return `  {
    slug: ${JSON.stringify(draft.slug)},
    word: ${JSON.stringify(draft.word)},
    respelling: ${JSON.stringify(draft.respelling)},
    partOfSpeech: ${JSON.stringify(draft.partOfSpeech)},
    teaser: ${JSON.stringify(draft.teaser)},
    origin: ${JSON.stringify(draft.origin)},
    journey: ${JSON.stringify(draft.journey)},
    related: ${JSON.stringify(draft.related)},
    lineage: ${JSON.stringify(draft.lineage)},
    clues: ${JSON.stringify(draft.clues)},
  },
`;
}

/** Bulk variant of appendDraftToWordsFile: inserts every draft in one file
 * read/write instead of one round trip per word — the only difference that
 * matters at ~1,000-word scale, since the anchor-finding logic underneath
 * is identical either way. appendDraftToWordsFile (below) is now just this
 * called with a single-element array, so both share one code path and one
 * set of anchor-regression tests. */
export function appendDraftsToWordsFile(drafts: DraftEntry[], wordsFilePath: string): void {
  if (drafts.length === 0) return;

  const source = readFileSync(wordsFilePath, "utf-8");

  const wordsStart = source.indexOf(WORDS_DECLARATION);
  if (wordsStart === -1) {
    throw new Error(`Could not find "${WORDS_DECLARATION}" in ${wordsFilePath}.`);
  }

  const searchFrom = wordsStart + WORDS_DECLARATION.length;
  const match = ARRAY_CLOSING_BRACKET_PATTERN.exec(source.slice(searchFrom));
  if (!match) {
    throw new Error(`Could not find the WORDS array's closing "];" in ${wordsFilePath}.`);
  }
  const closingIndex = searchFrom + match.index + match[0].indexOf("]");

  const entryLiterals = drafts.map(buildEntryLiteral).join("");

  const updated = source.slice(0, closingIndex) + entryLiterals + source.slice(closingIndex);
  writeFileSync(wordsFilePath, updated);
}

export function appendDraftToWordsFile(draft: DraftEntry, wordsFilePath: string): void {
  appendDraftsToWordsFile([draft], wordsFilePath);
}

/** Validates every draft file in a batch without throwing on the first bad
 * one — each result is either a validated DraftEntry or a {path, error}
 * pair, so a batch approval can report every problem at once instead of
 * stopping at the first. Also rejects (as an error, not a silent skip) a
 * draft whose slug is already in `existingWordsSource` (already approved in
 * a prior run — this is what makes re-running content:approve --batch on a
 * drafts directory safe) or duplicated across two files in the same batch —
 * either would otherwise corrupt WORDS with two entries sharing one slug,
 * breaking every lookup keyed by it (getWordBySlug, getRelatedWords, …). */
export function validateDraftFiles(
  draftPaths: string[],
  existingWordsSource: string
): { valid: DraftEntry[]; errors: { path: string; error: string }[] } {
  const valid: DraftEntry[] = [];
  const errors: { path: string; error: string }[] = [];
  const seenSlugs = new Set<string>();

  for (const draftPath of draftPaths) {
    try {
      const raw = JSON.parse(readFileSync(draftPath, "utf-8"));
      const draft = validateDraft(raw);
      if (existingWordsSource.includes(`slug: ${JSON.stringify(draft.slug)}`)) {
        throw new Error(`Draft's slug "${draft.slug}" already exists in lib/words.ts.`);
      }
      if (seenSlugs.has(draft.slug)) {
        throw new Error(`Draft's slug "${draft.slug}" is duplicated across multiple files in this batch.`);
      }
      seenSlugs.add(draft.slug);
      valid.push(draft);
    } catch (err) {
      errors.push({ path: draftPath, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { valid, errors };
}

/** CLI entry point: `npm run content:approve -- content/drafts/<slug>.json`.
 * Validates the draft, appends it to the real lib/words.ts, then re-runs
 * the full test suite (which re-checks the exact same invariants across
 * every entry, old and new) so a bad append is caught immediately rather
 * than silently shipping.
 *
 * Batch mode: `npm run content:approve -- --batch content/drafts` — the
 * one-suite-run-per-word cost that's fine for a single word is wrong for
 * hundreds, so this validates every `*.json` draft in the directory first
 * (skipping any `_`-prefixed file, e.g. rewriteEtymology's own
 * `_batch-log.json`), and only if every single one passes does it append
 * them all and run the suite once. Any validation failure — including a
 * slug collision, see validateDraftFiles — aborts the whole batch with
 * nothing written, rather than partially approving a batch and leaving
 * lib/words.ts in a state nobody reviewed as a whole. */
function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--batch") {
    const draftsDir = args[1];
    if (!draftsDir) {
      console.error("Usage: npm run content:approve -- --batch <drafts-dir>");
      process.exit(1);
    }

    const draftPaths = readdirSync(draftsDir)
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => path.join(draftsDir, f));

    const wordsFilePath = "lib/words.ts";
    const existingWordsSource = readFileSync(wordsFilePath, "utf-8");
    const { valid, errors } = validateDraftFiles(draftPaths, existingWordsSource);

    if (errors.length > 0) {
      console.error(`${errors.length} draft(s) failed validation — aborting, nothing written:`);
      for (const e of errors) console.error(`  ${e.path}: ${e.error}`);
      process.exit(1);
    }
    if (valid.length === 0) {
      console.log(`No drafts to approve in ${draftsDir}.`);
      return;
    }

    appendDraftsToWordsFile(valid, wordsFilePath);
    console.log(`Appended ${valid.length} entries to ${wordsFilePath}. Running tests…`);
    execSync("npx vitest run lib/words.test.ts", { stdio: "inherit" });
    console.log(`Done. Review the diff (git diff ${wordsFilePath}) before committing.`);
    return;
  }

  const [draftPath] = args;
  if (!draftPath) {
    console.error(
      "Usage: npm run content:approve -- content/drafts/<slug>.json\n   or: npm run content:approve -- --batch <drafts-dir>"
    );
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(draftPath, "utf-8"));
  const draft = validateDraft(raw);

  const wordsFilePath = "lib/words.ts";
  appendDraftToWordsFile(draft, wordsFilePath);
  console.log(`Appended "${draft.slug}" to ${wordsFilePath}. Running tests…`);

  execSync("npx vitest run lib/words.test.ts", { stdio: "inherit" });
  console.log(`Done. Review the diff (git diff ${wordsFilePath}) before committing.`);
}

if (require.main === module) {
  main();
}
