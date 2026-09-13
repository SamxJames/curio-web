import { WORDS, type WordEntry, daysSinceStart, hashSeed, mulberry32 } from "./words";

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
 * PUZZLE_MIN_DAYS_SINCE_SHOWN days ago, excluding today's own word. This
 * exclusion is REQUIRED, not decorative: `daysSinceLastShown` searches
 * backward from `today`, so for today's own word it doesn't see "shown 0
 * days ago" — it walks past today entirely and finds that word's *next*
 * occurrence further back (one full rotation earlier, i.e.
 * `words.length` days ago), which for a list long enough to make the pool
 * non-empty is itself >= PUZZLE_MIN_DAYS_SINCE_SHOWN. Without this
 * explicit check, today's own word would incorrectly qualify as eligible.
 * `words` defaults to the real WORDS array; tests pass a larger synthetic
 * list to exercise the non-empty case, which the real (currently 8-word)
 * list cannot reach. */
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

type RawPick = { word: WordEntry; pool: WordEntry[] };

/** The unadjusted per-day seeded pick for `today`: recomputes the eligible
 * pool and draws one word from it via a `puzzle-${dayCount}` seeded PRNG,
 * with no anti-repeat logic applied. Returns null when the pool is empty.
 * Factored out so getPuzzleForDate can peek at the immediately preceding
 * day's raw pick — a lookback of exactly one day — without recursing into
 * the public function itself (which would apply that day's own anti-repeat
 * adjustment and, if it also delegated to *its* predecessor, cascade back
 * through every prior day). */
function rawPuzzlePick(today: Date, words: WordEntry[]): RawPick | null {
  const pool = getEligiblePuzzleWords(today, words);
  if (pool.length === 0) return null;
  const dayCount = daysSinceStart(today);
  const rand = mulberry32(hashSeed(`puzzle-${dayCount}`));
  const index = Math.floor(rand() * pool.length);
  return { word: pool[index], pool };
}

/** Today's puzzle, or null if the eligible pool is empty (the word bank
 * isn't deep enough yet — this is the honest "not open yet" case /play
 * renders, never a fallback to a recent word). Deterministic per calendar
 * day: the same date always yields the same puzzle for every player,
 * called any number of times. Selection is a per-day seeded pseudo-random
 * pick from the CURRENTLY eligible pool (same hashSeed/mulberry32 PRNG
 * lib/words.ts uses for per-account personalization), not a positional
 * index into the pool — the pool's own membership shifts by roughly one
 * word per day as words age in and out of eligibility, and a naive
 * `dayCount % pool.length` index compounds with that daily shift into a
 * degenerate step pattern (effectively skipping every other word, so only
 * a fraction of the pool is ever reachable and the rest repeat every few
 * days). Seeding the pick per day decorrelates it from that churn and
 * gives good practical coverage across the pool over time (see
 * lib/puzzle.test.ts's coverage-sanity test) — but an unadjusted seeded
 * pick can still occasionally land on the exact same word as the
 * immediately preceding day purely by chance, which for a *daily* puzzle
 * is a visible, worth-fixing bug (a player opening /play and getting
 * yesterday's word again), unlike the old positional scheme which
 * structurally couldn't do that. This function guards against that case:
 * it checks today's raw pick against yesterday's raw pick (via
 * rawPuzzlePick, a one-day lookback — never a recursive chain back
 * through every prior day) and, on a collision, redraws from today's own
 * pool excluding that word using a second, differently-seeded draw. This
 * closes the large majority of consecutive-day repeats (a 400-day
 * simulation against a 40-word list dropped the rate from ~9% to ~1%),
 * but does NOT make it impossible: because the comparison is against
 * yesterday's *raw* pick rather than yesterday's actual (possibly
 * already-redrawn) result — a deliberate choice, since computing
 * yesterday's true final answer would mean asking whether *its*
 * predecessor collided too, cascading back through every prior day — today
 * can still rarely land on yesterday's actual word when yesterday was
 * itself a redraw. It also does NOT guarantee anything about longer
 * proximity (a repeat 2-3 days out is still possible, and accepted, given
 * the pool's own daily churn) — this is a targeted, bounded fix for the
 * common consecutive-day case, not a general anti-repeat window. If
 * today's pool has only one word, there's nothing to redraw to and the
 * repeat is accepted as an unavoidable edge case. */
export function getPuzzleForDate(
  today: Date = new Date(),
  words: WordEntry[] = WORDS
): Puzzle | null {
  const pick = rawPuzzlePick(today, words);
  if (pick === null) return null;

  const dayCount = daysSinceStart(today);
  const yesterday = new Date(today.getTime() - DAY_MS);
  const yesterdayPick = rawPuzzlePick(yesterday, words);

  let chosen = pick.word;
  if (yesterdayPick !== null && yesterdayPick.word.slug === pick.word.slug) {
    const alternatives = pick.pool.filter((w) => w.slug !== pick.word.slug);
    if (alternatives.length > 0) {
      const retryRand = mulberry32(hashSeed(`puzzle-${dayCount}-retry`));
      const retryIndex = Math.floor(retryRand() * alternatives.length);
      chosen = alternatives[retryIndex];
    }
    // else: today's pool has exactly one word, so there's nothing to
    // redraw to — the repeat is accepted (see doc comment above).
  }

  // Human-facing puzzle numbers start at 1, reusing the same anchor date
  // getWordForDate does rather than introducing a second one — see this
  // plan's Flagged decision C for what that means for the first real
  // puzzle's number.
  return { word: chosen, puzzleNumber: dayCount + 1 };
}

export function getTodayPuzzle(): Puzzle | null {
  return getPuzzleForDate(new Date());
}

function normalizeGuess(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
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
  const guessForms = pluralForms(g);
  const answerForms = pluralForms(a);
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
