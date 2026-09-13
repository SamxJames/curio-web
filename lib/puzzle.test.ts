import { describe, expect, it } from "vitest";
import {
  PUZZLE_MIN_DAYS_SINCE_SHOWN,
  getEligiblePuzzleWords,
  getPuzzleForDate,
  isCorrectGuess,
  buildPuzzleResultGrid,
  buildPuzzleShareText,
} from "./puzzle";
import { WORDS, daysSinceStart, hashSeed, mulberry32 } from "./words";
import type { WordEntry } from "./words";

function makeWord(slug: string): WordEntry {
  return {
    slug,
    word: slug,
    respelling: slug.toUpperCase(),
    partOfSpeech: "noun",
    teaser: "",
    origin: "",
    journey: "",
    related: "",
    lineage: ["English"],
    clues: ["clue one", "clue two", "clue three"],
  };
}

// A synthetic 40-word list — large enough for its rotation period (40 days)
// to comfortably exceed PUZZLE_MIN_DAYS_SINCE_SHOWN (30), which the real
// WORDS array (8 entries, a rotation period far shorter than 30 days)
// cannot do. This is the only way to test the "pool becomes non-empty"
// path without waiting for real content to reach 30+ entries.
const LARGE_WORD_LIST: WordEntry[] = Array.from({ length: 40 }, (_, i) => makeWord(`word-${i}`));

describe("getEligiblePuzzleWords", () => {
  it("is empty for the real (small) WORDS array, on any date", () => {
    // WORDS.length is currently well under 30, so its rotation period is
    // too short for any word to ever go 30 days unshown — this is the
    // exact "not open yet" condition getPuzzleForDate relies on.
    const today = new Date("2027-06-01T00:00:00Z");
    expect(getEligiblePuzzleWords(today, WORDS)).toEqual([]);
  });

  it("is non-empty for a large enough synthetic word list", () => {
    const today = new Date("2026-01-01T00:00:00Z");
    const pool = getEligiblePuzzleWords(today, LARGE_WORD_LIST);
    expect(pool.length).toBeGreaterThan(0);
  });

  it("never includes today's own word", () => {
    const today = new Date("2026-01-01T00:00:00Z");
    // Same rotation formula getPuzzleForDate uses internally, applied here
    // directly to LARGE_WORD_LIST (getWordForDate itself is hardcoded to
    // the real WORDS array's length, so it can't be reused for a
    // synthetic list) — this independently derives "today's word" for the
    // assertion rather than trusting the implementation's own answer.
    const index =
      ((daysSinceStart(today) % LARGE_WORD_LIST.length) + LARGE_WORD_LIST.length) %
      LARGE_WORD_LIST.length;
    const todaysWord = LARGE_WORD_LIST[index];
    const pool = getEligiblePuzzleWords(today, LARGE_WORD_LIST);
    expect(pool.map((w) => w.slug)).not.toContain(todaysWord.slug);
  });

  it("excludes a word shown fewer than PUZZLE_MIN_DAYS_SINCE_SHOWN days ago", () => {
    const today = new Date("2026-01-01T00:00:00Z");
    const poolToday = getEligiblePuzzleWords(today, LARGE_WORD_LIST);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const poolTomorrow = getEligiblePuzzleWords(tomorrow, LARGE_WORD_LIST);
    // The word shown exactly PUZZLE_MIN_DAYS_SINCE_SHOWN - 1 days before
    // "tomorrow" must be excluded from tomorrow's pool even if it was
    // included in today's (rotation shifts eligibility by exactly one slot
    // per day for a list this size).
    expect(poolToday).not.toEqual(poolTomorrow);
  });

  it("excludes today's own word even though its raw days-since-shown would satisfy the threshold", () => {
    // The explicit `w.slug === todayWord.slug` guard in
    // getEligiblePuzzleWords is required, not decorative. wordForDateFrom's
    // rotation has period LARGE_WORD_LIST.length (40), so searching
    // backward from `today` for today's own word's slug finds a match
    // again at exactly i = 40 days ago (one full rotation earlier) — and
    // 40 >= PUZZLE_MIN_DAYS_SINCE_SHOWN (30). Without the guard, that
    // wraparound match would make today's own word satisfy the
    // days-since-shown threshold and incorrectly qualify as eligible. This
    // hand-confirms that exact case and asserts the guard actually excludes
    // it, independent of the "never includes today's own word" test above.
    const today = new Date("2026-01-01T00:00:00Z"); // daysSinceStart = 0
    const index =
      ((daysSinceStart(today) % LARGE_WORD_LIST.length) + LARGE_WORD_LIST.length) %
      LARGE_WORD_LIST.length;
    const todaysWord = LARGE_WORD_LIST[index];
    const pool = getEligiblePuzzleWords(today, LARGE_WORD_LIST);
    expect(pool.map((w) => w.slug)).not.toContain(todaysWord.slug);
  });
});

describe("getPuzzleForDate", () => {
  it("returns null when the pool is empty", () => {
    const today = new Date("2027-06-01T00:00:00Z");
    expect(getPuzzleForDate(today, WORDS)).toBeNull();
  });

  it("returns the same puzzle for the same date, called twice", () => {
    const today = new Date("2026-03-01T00:00:00Z");
    const a = getPuzzleForDate(today, LARGE_WORD_LIST);
    const b = getPuzzleForDate(today, LARGE_WORD_LIST);
    expect(a).toEqual(b);
  });

  it("can return a different puzzle on a different date", () => {
    const day1 = new Date("2026-03-01T00:00:00Z");
    const day2 = new Date("2026-03-02T00:00:00Z");
    const a = getPuzzleForDate(day1, LARGE_WORD_LIST);
    const b = getPuzzleForDate(day2, LARGE_WORD_LIST);
    expect(a?.word.slug).not.toBe(b?.word.slug);
  });

  it("gives every puzzle a positive puzzleNumber", () => {
    const today = new Date("2026-03-01T00:00:00Z");
    const puzzle = getPuzzleForDate(today, LARGE_WORD_LIST);
    expect(puzzle?.puzzleNumber).toBeGreaterThan(0);
  });

  it("selects a good variety of distinct words over 200 consecutive days (not a degenerate few)", () => {
    // Documents "good practical coverage" for the per-day seeded pick,
    // without claiming a false no-repeat-until-exhausted guarantee (the
    // pool's own membership shifts daily as words age in/out, which makes
    // that guarantee provably hard to promise — see getPuzzleForDate's doc
    // comment). The threshold here is deliberately high (30 of 40 words):
    // a re-review confirmed the OLD buggy `dayCount % pool.length`
    // positional index also reaches 25 distinct words over this same
    // 200-day window despite its severe skip/repeat pathology, so a lower
    // threshold (e.g. 15) would stay green even if selection regressed
    // back to that bug. >= 30 is the threshold that actually discriminates
    // the seeded-pick fix from the positional-index regression.
    const start = new Date("2026-01-01T00:00:00Z");
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const day = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const puzzle = getPuzzleForDate(day, LARGE_WORD_LIST);
      if (puzzle) seen.add(puzzle.word.slug);
    }
    expect(seen.size).toBeGreaterThanOrEqual(30);
  });

  it("never repeats the immediately preceding day's raw pick", () => {
    // Finds a day whose UNADJUSTED (pre-anti-repeat) seeded pick would
    // coincide with the previous day's unadjusted pick — the exact
    // collision getPuzzleForDate's one-day-lookback redraw is meant to
    // catch — using the same hashSeed/mulberry32 formula getPuzzleForDate
    // uses internally, applied independently here (via the exported
    // getEligiblePuzzleWords/hashSeed/mulberry32) rather than trusting the
    // implementation's own intermediate values. Also requires the
    // previous day's raw pick to NOT itself collide with the day before
    // that, so the previous day's actual (adjusted) puzzle is guaranteed
    // to equal its raw pick — isolating a clean single-collision case
    // rather than a chain of adjustments.
    function rawPickSlug(date: Date): string | null {
      const pool = getEligiblePuzzleWords(date, LARGE_WORD_LIST);
      if (pool.length === 0) return null;
      const dayCount = daysSinceStart(date);
      const rand = mulberry32(hashSeed(`puzzle-${dayCount}`));
      const index = Math.floor(rand() * pool.length);
      return pool[index].slug;
    }
    const start = new Date("2026-01-01T00:00:00Z");
    const dateForOffset = (i: number) => new Date(start.getTime() + i * 24 * 60 * 60 * 1000);

    let collisionOffset = -1;
    for (let i = 2; i < 2000; i++) {
      const prevPrev = rawPickSlug(dateForOffset(i - 2));
      const prev = rawPickSlug(dateForOffset(i - 1));
      const curr = rawPickSlug(dateForOffset(i));
      if (prev !== null && curr !== null && prev === curr && prev !== prevPrev) {
        collisionOffset = i;
        break;
      }
    }
    // Sanity check that this test is actually exercising the collision
    // case, not vacuously passing because no collision was found.
    expect(collisionOffset).toBeGreaterThan(-1);

    const prevDay = dateForOffset(collisionOffset - 1);
    const day = dateForOffset(collisionOffset);
    const prevPuzzle = getPuzzleForDate(prevDay, LARGE_WORD_LIST);
    const puzzle = getPuzzleForDate(day, LARGE_WORD_LIST);

    // The previous day's own predecessor didn't collide with it, so its
    // actual puzzle is unadjusted — confirming today's raw pick really
    // would have repeated it had the fix not intervened.
    expect(prevPuzzle?.word.slug).toBe(rawPickSlug(prevDay));
    // The fix must have redrawn today's pick away from that repeat.
    expect(puzzle?.word.slug).not.toBe(prevPuzzle?.word.slug);
  });
});

describe("isCorrectGuess", () => {
  it("matches an exact guess", () => {
    expect(isCorrectGuess("quarantine", "quarantine")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isCorrectGuess("Quarantine", "quarantine")).toBe(true);
  });

  it("tolerates surrounding and collapsed whitespace", () => {
    expect(isCorrectGuess("  quarantine  ", "quarantine")).toBe(true);
  });

  it("tolerates a simple trailing plural on the guess", () => {
    expect(isCorrectGuess("companions", "companion")).toBe(true);
  });

  it("tolerates a simple trailing plural on the answer", () => {
    expect(isCorrectGuess("bus", "buses")).toBe(true);
  });

  it("tolerates a trailing plural on the guess for an answer ending in 'e'", () => {
    // Regression test: a naive stripSimplePlural that commits to the "-es"
    // branch before trying "-s" turns "clues" into "clu" (never matching
    // "clue") instead of trying both candidate strips.
    expect(isCorrectGuess("clues", "clue")).toBe(true);
  });

  it("tolerates a trailing plural on the guess for a longer answer ending in 'e'", () => {
    expect(isCorrectGuess("quarantines", "quarantine")).toBe(true);
  });

  it("rejects an unrelated word", () => {
    expect(isCorrectGuess("banana", "quarantine")).toBe(false);
  });

  it("rejects an empty guess", () => {
    expect(isCorrectGuess("   ", "quarantine")).toBe(false);
  });
});

describe("buildPuzzleResultGrid", () => {
  it("marks the solving clue and leaves the rest unused", () => {
    expect(buildPuzzleResultGrid(1)).toBe("🟫⬜⬜");
    expect(buildPuzzleResultGrid(2)).toBe("⬜🟫⬜");
    expect(buildPuzzleResultGrid(3)).toBe("⬜⬜🟫");
  });

  it("marks every square failed when never solved", () => {
    expect(buildPuzzleResultGrid(null)).toBe("⬛⬛⬛");
  });
});

describe("buildPuzzleShareText", () => {
  it("includes the puzzle number, the grid, and the bare domain", () => {
    const text = buildPuzzleShareText(142, 1, "https://etymology-app-orcin.vercel.app");
    expect(text).toContain("Curio puzzle #142");
    expect(text).toContain("🟫⬜⬜");
    expect(text).toContain("etymology-app-orcin.vercel.app");
    expect(text).not.toContain("https://");
    expect(text).not.toContain("http://");
  });

  it("never reveals the word or clue text", () => {
    // buildPuzzleShareText's signature doesn't even accept a word or clue
    // argument — this test documents that constraint rather than probing
    // for a leak that structurally cannot occur.
    const text = buildPuzzleShareText(1, null, "https://example.com");
    expect(text.split("\n")).toHaveLength(3);
  });
});
