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

/** Edit distance counting insertions, deletions, substitutions and a swap
 * of two neighbouring letters as one edit each (optimal string alignment). */
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** How many close guesses a game forgives before they cost a turn like any
 * other miss. A cap, so close calls can't be used to probe letters for free. */
export const MAX_FREE_CLOSE_GUESSES = 2;

/** A wrong guess that's nearly right: within one edit of the answer (two for
 * answers of 8+ letters), after the same case, plural and UK/US folding
 * isCorrectGuess uses. Answers under 4 letters get no close calls, since one
 * edit away from a 3-letter word is just a different word. */
export function isCloseGuess(guess: string, answer: string): boolean {
  const g = normalizeGuess(guess);
  const a = normalizeGuess(answer);
  if (g.length < 3 || a.length < 4 || isCorrectGuess(guess, answer)) return false;
  const limit = a.length >= 8 ? 2 : 1;
  const guessForms = pluralForms(g).map(foldSpelling);
  const answerForms = pluralForms(a).map(foldSpelling);
  return guessForms.some((gf) => answerForms.some((af) => editDistance(gf, af) <= limit));
}

/** True when the player already tried this guess, so it shouldn't cost a turn. */
export function isRepeatGuess(guess: string, earlier: string[]): boolean {
  const g = normalizeGuess(guess);
  return earlier.some((e) => normalizeGuess(e) === g);
}

/** Which letter tiles show a letter before the word is solved: none on the
 * first clue, the first letter from the second, and the last letter too on
 * the third for words of 5+ letters (shorter words would be half given away). */
export function revealedLetterPositions(answer: string, cluesRevealed: 1 | 2 | 3): number[] {
  if (cluesRevealed === 1) return [];
  if (cluesRevealed === 3 && answer.length >= 5) return [0, answer.length - 1];
  return [0];
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
