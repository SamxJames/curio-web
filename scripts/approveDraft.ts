import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
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
 * lib/words.ts's `const days: HistoryDay[] = [];` inside getHistoryForUser
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
export function appendDraftToWordsFile(draft: DraftEntry, wordsFilePath: string): void {
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

  const entryLiteral = `  {
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

  const updated = source.slice(0, closingIndex) + entryLiteral + source.slice(closingIndex);
  writeFileSync(wordsFilePath, updated);
}

/** CLI entry point: `npm run content:approve -- content/drafts/<slug>.json`.
 * Validates the draft, appends it to the real lib/words.ts, then re-runs
 * the full test suite (which re-checks the exact same invariants across
 * every entry, old and new) so a bad append is caught immediately rather
 * than silently shipping. */
function main() {
  const [draftPath] = process.argv.slice(2);
  if (!draftPath) {
    console.error("Usage: npm run content:approve -- content/drafts/<slug>.json");
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
