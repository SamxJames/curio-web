import { WORDS, type WordEntry, daysSinceStart } from "./words";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A word only becomes eligible for the daily puzzle once this many days
 * have passed since it last ran as the shared daily word — keeps the
 * puzzle from spoiling something a player might have just read on Today or
 * in the Bluesky post. With `words.length` words cycling through Today
 * every `words.length` days, the eligible pool is necessarily empty until
 * the word bank comfortably exceeds this number — see getPuzzleForDate's
 * null case. */
export const PUZZLE_MIN_DAYS_SINCE_SHOWN = 30;

/** The word shown on `date` under the same deterministic rotation
 * getWordForDate uses, but parameterized over an arbitrary word list —
 * getWordForDate itself is hardcoded to the real WORDS array, so this
 * local equivalent is what makes lib/puzzle.ts's functions testable
 * against a synthetic list without needing 30+ real words. Produces
 * identical results to getWordForDate when `words` is the real WORDS
 * array, since it's the exact same formula. */
function wordForDateFrom(words: WordEntry[], date: Date): WordEntry {
  const index = ((daysSinceStart(date) % words.length) + words.length) % words.length;
  return words[index];
}

/** How many days before `today` (1 = yesterday) `word` was last shown under
 * `wordForDateFrom`, or null if it wasn't shown at all within the search
 * window. The window is one full rotation or PUZZLE_MIN_DAYS_SINCE_SHOWN,
 * whichever is longer — either is enough to prove "not recently shown". */
function daysSinceLastShown(word: WordEntry, today: Date, words: WordEntry[]): number | null {
  const searchWindow = Math.max(words.length, PUZZLE_MIN_DAYS_SINCE_SHOWN);
  for (let i = 1; i <= searchWindow; i++) {
    const past = new Date(today.getTime() - i * DAY_MS);
    if (wordForDateFrom(words, past).slug === word.slug) return i;
  }
  return null;
}

/** Words eligible to appear as today's puzzle: shown at least
 * PUZZLE_MIN_DAYS_SINCE_SHOWN days ago, excluding today's own word (which
 * would fail that threshold anyway, having been shown zero days ago, but
 * is excluded explicitly for clarity). `words` defaults to the real WORDS
 * array; tests pass a larger synthetic list to exercise the non-empty
 * case, which the real (currently 8-word) list cannot reach. */
export function getEligiblePuzzleWords(
  today: Date = new Date(),
  words: WordEntry[] = WORDS
): WordEntry[] {
  const todayWord = wordForDateFrom(words, today);
  return words.filter((w) => {
    if (w.slug === todayWord.slug) return false;
    const days = daysSinceLastShown(w, today, words);
    return days !== null && days >= PUZZLE_MIN_DAYS_SINCE_SHOWN;
  });
}

export type Puzzle = { word: WordEntry; puzzleNumber: number };

/** Today's puzzle, or null if the eligible pool is empty (the word bank
 * isn't deep enough yet — this is the honest "not open yet" case /play
 * renders, never a fallback to a recent word). Deterministic and global:
 * the same calendar day always selects the same word for every player,
 * the same seeded-rotation approach getWordForDate uses for the shared
 * word-of-the-day, cycling through the CURRENTLY eligible pool without
 * repeating until it's been exhausted once. The pool's own membership can
 * shift day to day as the underlying daily rotation continues (a word
 * ages back out of eligibility once it's shown on Today again) — this is
 * a deliberately simple rotation, not a long-term perfect-non-repeat
 * guarantee across pool membership changes. */
export function getPuzzleForDate(
  today: Date = new Date(),
  words: WordEntry[] = WORDS
): Puzzle | null {
  const pool = getEligiblePuzzleWords(today, words);
  if (pool.length === 0) return null;
  const dayCount = daysSinceStart(today);
  const index = ((dayCount % pool.length) + pool.length) % pool.length;
  // Human-facing puzzle numbers start at 1, reusing the same anchor date
  // getWordForDate does rather than introducing a second one — see this
  // plan's Flagged decision C for what that means for the first real
  // puzzle's number.
  return { word: pool[index], puzzleNumber: dayCount + 1 };
}

export function getTodayPuzzle(): Puzzle | null {
  return getPuzzleForDate(new Date());
}

function normalizeGuess(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function stripSimplePlural(s: string): string {
  if (s.endsWith("es") && s.length > 3) return s.slice(0, -2);
  if (s.endsWith("s") && s.length > 2) return s.slice(0, -1);
  return s;
}

/** Accepts near-misses — case, surrounding/collapsed whitespace, and a
 * simple trailing "-s"/"-es" plural in either direction — as a correct
 * guess, without attempting full fuzzy matching. */
export function isCorrectGuess(guess: string, answer: string): boolean {
  const g = normalizeGuess(guess);
  const a = normalizeGuess(answer);
  if (!g) return false;
  if (g === a) return true;
  return stripSimplePlural(g) === a || g === stripSimplePlural(a);
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

/** The full share text — puzzle number, the result grid, and the bare
 * domain as plain text (deliberately not a link: a real URL would let
 * social platforms render a preview card, which this share is designed to
 * avoid — see this plan's Global Constraints). Derived from `siteUrl`
 * rather than hardcoded, so it always names this app's actual current
 * domain (see Flagged decision B). */
export function buildPuzzleShareText(
  puzzleNumber: number,
  cluesUsedToSolve: 1 | 2 | 3 | null,
  siteUrl: string
): string {
  const domain = siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const grid = buildPuzzleResultGrid(cluesUsedToSolve);
  return `Curio puzzle #${puzzleNumber}\n${grid}\n${domain}`;
}
