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

/** /play doesn't open until the eligible pool reaches this size — below
 * it, the daily selection either has no variety at all (pool size 1) or
 * an unacceptably high repeat rate relative to what's been validated (see
 * getPuzzleForDate's doc comment for why the rate depends on pool size).
 * 10 matches the pool size this algorithm was actually validated against
 * during development (a 40-word bank, since pool size is structurally
 * `words.length - PUZZLE_MIN_DAYS_SINCE_SHOWN`). */
export const PUZZLE_MIN_POOL_SIZE = 10;

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

/** Maps every slug shown within the lookback window to how many days ago
 * its FIRST (i.e. most recent) occurrence was — built in one pass over the
 * window instead of one pass per word. `searchWindow` is the same for
 * every word (it depends only on `words.length` and
 * PUZZLE_MIN_DAYS_SINCE_SHOWN, not on which word is being asked about), so
 * computing it once here and walking the window once replaces what used to
 * be an O(words.length) scan PER word — O(words.length * searchWindow)
 * overall — with a single O(searchWindow) pass whose result every word
 * then does an O(1) lookup against. Walking `i` from 1 upward and only
 * recording a slug's FIRST appearance (`!map.has(slug)`) reproduces
 * exactly what the old per-word backward scan returned: the smallest i
 * (most recent occurrence) within the window. */
function daysSinceShownMap(today: Date, words: WordEntry[]): Map<string, number> {
  const searchWindow = Math.max(words.length, PUZZLE_MIN_DAYS_SINCE_SHOWN);
  const map = new Map<string, number>();
  for (let i = 1; i <= searchWindow; i++) {
    const past = new Date(today.getTime() - i * DAY_MS);
    const slug = wordForDateFrom(words, past).slug;
    if (!map.has(slug)) map.set(slug, i);
  }
  return map;
}

/** Words eligible to appear as today's puzzle: shown at least
 * PUZZLE_MIN_DAYS_SINCE_SHOWN days ago, excluding today's own word. This
 * exclusion is REQUIRED, not decorative: `daysSinceShownMap` records each
 * slug's MOST RECENT occurrence in the window, so for today's own word it
 * doesn't record "shown 0 days ago" — it records that word's *next*
 * occurrence further back (one full rotation earlier, i.e.
 * `words.length` days ago), which for a list long enough to make the pool
 * non-empty is itself >= PUZZLE_MIN_DAYS_SINCE_SHOWN. Without this
 * explicit check, today's own word would incorrectly qualify as eligible.
 * `words` defaults to the real WORDS array; tests pass a larger synthetic
 * list to exercise the non-empty case, which the real (currently
 * 1,147-word) list clears comfortably.
 *
 * Scope note: this anti-spoiler gate protects the SHARED/anonymous daily
 * word experience specifically — it filters against getWordForDate's
 * calendar-based rotation, the one thing every player (signed in or not)
 * sees on Today and in the Bluesky post. A signed-in account also has its
 * own PERSONALIZED rotation (getWordForUser, from an earlier plan), and
 * this gate does not — and structurally cannot — account for what that
 * particular account happens to have seen recently under it. That's a
 * deliberate, accepted scope boundary: filtering per-user against each
 * account's own history would mean a different puzzle per player, which
 * breaks "the same puzzle for everyone, one shareable result grid" that
 * this whole feature is built around. So the guarantee this function
 * actually provides is "not recently shown as the shared daily word," not
 * "unspoiled for every individual player."
 *
 * Also returns an empty pool — even when the raw filtered pool is
 * non-empty — until the pool reaches PUZZLE_MIN_POOL_SIZE. A pool that's
 * merely non-empty but still small gives the daily selection either no
 * variety (pool size 1) or a repeat rate well above what's been validated
 * (see getPuzzleForDate's doc comment); this keeps /play's "not open yet"
 * state honest about when the puzzle can actually deliver on that. */
export function getEligiblePuzzleWords(
  today: Date = new Date(),
  words: WordEntry[] = WORDS
): WordEntry[] {
  const todayWord = wordForDateFrom(words, today);
  const recentlyShown = daysSinceShownMap(today, words);
  const filtered = words.filter((w) => {
    if (w.slug === todayWord.slug) return false;
    const days = recentlyShown.get(w.slug);
    return days !== undefined && days >= PUZZLE_MIN_DAYS_SINCE_SHOWN;
  });
  return filtered.length < PUZZLE_MIN_POOL_SIZE ? [] : filtered;
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

/** Today's puzzle, or null if the eligible pool is too shallow (either
 * genuinely empty, or non-empty but smaller than PUZZLE_MIN_POOL_SIZE —
 * see getEligiblePuzzleWords). This is the honest "not open yet" case
 * /play renders, never a fallback to a recent word. The consecutive-day
 * repeat rate this function's anti-repeat logic (below) has to fight
 * depends heavily on how large the eligible pool is: a smaller pool means
 * both a higher baseline collision rate and fewer alternatives to redraw
 * to, so the rate isn't a single fixed number — it was specifically
 * measured (via long simulated date ranges) at pool size
 * PUZZLE_MIN_POOL_SIZE, which is why that constant gates when /play opens
 * rather than opening as soon as the pool is merely non-empty. Deterministic per calendar
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
 * closes the large majority of consecutive-day repeats, but does NOT make
 * it impossible: because the comparison is against
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
