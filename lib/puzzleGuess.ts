// Guess checking, share text and letter hints for /play. Kept free of the
// word bank so client components (PuzzleGame) can import these without
// shipping WORDS (every upcoming answer and clue) to the browser.
// lib/puzzle.ts re-exports everything here for server code and tests.

function normalizeGuess(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Folds common British spellings onto American ones, applied to both guess
 * and answer, so "anaesthesia"/"anesthesia" or "colour"/"color" match. Only
 * patterns safe on a single word: ae/oe digraphs inside a word, a final
 * "-our" after 3+ letters, "-tre" endings and "-ise"/"-isation" forms. */
function foldSpelling(s: string): string {
  return s
    .replace(/(\w)(ae|oe)(?=\w)/g, "$1e")
    .replace(/(\w{3,})our(s?)$/, "$1or$2")
    .replace(/(\w{2,})tre(s?)$/, "$1ter$2")
    .replace(/(\w{3,})is(e|es|ed|ing|ation|ations)$/, "$1iz$2");
}

/** Every plausible singular reading of `s`: itself, unchanged, plus (when
 * applicable) both an "-es" strip and an "-s" strip. Both candidates are
 * offered rather than picking one branch, because committing to just the
 * "-es" strip for a word like "clues" produces "clu" and never matches
 * "clue" — the "-s" strip ("clue") is the one that's actually correct
 * here. Trying both and letting the caller check for any match avoids
 * having to decide in advance which strip is "right" for a given word. */
function pluralForms(s: string): string[] {
  const out = [s];
  if (s.endsWith("es") && s.length > 3) out.push(s.slice(0, -2));
  if (s.endsWith("s") && s.length > 2) out.push(s.slice(0, -1));
  return out;
}

/** Accepts near-misses — case, surrounding/collapsed whitespace, and a
 * simple trailing "-s"/"-es" plural in either direction — as a correct
 * guess, without attempting full fuzzy matching. */
export function isCorrectGuess(guess: string, answer: string): boolean {
  const g = normalizeGuess(guess);
  const a = normalizeGuess(answer);
  if (!g) return false;
  if (g === a) return true;
  const guessForms = pluralForms(g).map(foldSpelling);
  const answerForms = pluralForms(a).map(foldSpelling);
  return guessForms.some((gf) => answerForms.includes(gf));
}

const RESULT_SQUARES = 3;

/** The result grid for a share: 🟫 marks which clue solved it, ⬜ marks
 * unused clues, ⬛⬛⬛ marks a total failure. Never reveals the word, clue
 * text, or how many wrong guesses were made beyond the clue count. */
export function buildPuzzleResultGrid(cluesUsedToSolve: 1 | 2 | 3 | null): string {
  if (cluesUsedToSolve === null) return "⬛".repeat(RESULT_SQUARES);
  return Array.from({ length: RESULT_SQUARES }, (_, i) =>
    i === cluesUsedToSolve - 1 ? "🟫" : "⬜"
  ).join("");
}

/** The full share text — puzzle number, the result grid, and the puzzle's
 * address (`curioword.com/play`) as plain text (deliberately not a link: a
 * real URL would let social platforms render a preview card, which this
 * share is designed to avoid — see this plan's Global Constraints). It
 * names /play so a friend lands on the puzzle, not the homepage. Derived
 * from `siteUrl` rather than hardcoded, so it always names this app's
 * actual current domain (see Flagged decision B). */
export function buildPuzzleShareText(
  puzzleNumber: number,
  cluesUsedToSolve: 1 | 2 | 3 | null,
  siteUrl: string
): string {
  const domain = siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const grid = buildPuzzleResultGrid(cluesUsedToSolve);
  return `Curio puzzle #${puzzleNumber}\n${grid}\n${domain}/play`;
}

/** Shown under the third clue so the last clue is a strong hint rather
 * than just the most specific etymology fact — those often still don't
 * point at the modern word. Deterministic, so every word in the bank gets
 * one without any content changes. */
export function buildLetterHint(answer: string): string {
  const letters = answer.replace(/[^\p{L}]/gu, "");
  const noun = letters.length === 1 ? "letter" : "letters";
  return `${letters.length} ${noun}, starts with ${letters[0].toUpperCase()}`;
}
