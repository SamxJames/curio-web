# Puzzle clue rewrite (2026-10-13)

## Why
Synced play data (signed-in accounts, read-only, 2026-10-13): 14 plays, **8 failed**, 1 solved on clue 1,
2 on clue 2, 2 on clue 3, 1 unfinished. Today's "devil" was failed by both players. Every clue described the
word's *history* and none said what the word *is*, so clue 1 (and often clue 2) gave nothing to guess from
unless you already knew the etymology. Clue 3 then jumped to near-giveaway, but only if you knew the cognate.

## New clue rules (owner asked for an autonomous rewrite and review)
- **Clue 1, "what it is + a hook":** opens by saying plainly what kind of thing, action or quality the word
  names today (broad category, not a giveaway), then one surprising fact from its history.
- **Clue 2, "closer":** describes the modern meaning specifically enough that an ordinary adult could name
  it with some thought, plus a different history fact.
- **Clue 3, "nearly there":** the most direct route: a sharp description and/or a closely related word.
  It never states letter count or first letter: the game already adds "N letters, starts with X".
- History claims come **only** from the entry's own teaser/origin/journey/related text (which came from
  Wiktionary). The present-day meaning may be described from general knowledge, plainly and accurately.
- Mechanical checks (`lib/clues.ts`): three non-empty clues, none contains the answer or its rough stem (same
  rule as `lib/words.test.ts`), each at most 220 characters, no em or en dashes, clue 3 doesn't restate the
  letter hint.

## Pipeline
1. `npm run clues:rewrite -- [--only a,b] [--limit N]`: Claude Opus 5.5 (effort medium, server-side refusal
   fallback on) writes clues from the entry text into `content/clues/<slug>.json`, retrying up to twice with the
   failed check as feedback. Resumable (skips existing files).
2. In the same run, a **blind solver** (Claude Haiku 5.5, told to act as an ordinary adult who ignores etymology
   it may know) guesses after clue 1, after clues 1-2, and after all three plus the letter hint. Results are
   stored with the clues. A word not solved after stage 3 is flagged `tooHard`.
3. Review agents (Claude Code subagents) check a random sample plus every flagged word for: invented history,
   wrong present-day meaning, giveaways in clue 1, and rule breaks. Fixes go into the JSON files.
4. `npm run clues:apply -- [--keep slug]` writes the new clues into `lib/words.ts`. `--keep` leaves the day's
   live puzzle word untouched so a puzzle never changes mid-day; its new clues are applied the next day.

## Tasks
1. `lib/clues.ts` (prompt builders, parser/validator, solver parsing) with tests.
2. `scripts/rewriteClues.ts` (generation + blind solve, concurrency 6, usage totals).
3. `scripts/applyClues.ts` (string-aware replacement of each entry's `clues: [...]`).
4. Pilot on ~25 words incl. devil, tulip, salary, spectrum, client, bid, symptom; solver also runs on the old
   clues for comparison; review agent; tune prompt.
5. Full run, review agents on a sample + flagged, apply, tests/build, deploy keeping today's puzzle word.
6. Docs: architecture/content pipeline, handover, decisions.
