# Dig: placement, first run and encouragement — plan

Status: research done 2026-11-07, not started. Run `superpowers:brainstorming` on this before building, since parts of it change product direction.

## Where dig sits today

| Surface | Mentions dig? |
|---|---|
| Header nav (Curio, Today, Puzzle, Collection, account) | No |
| Home: `TodayHero` (returning) / `ArrivalHero` (first visit) | No. Both link to the story, /play and /history |
| Footer (words, languages, attribution) | No |
| /play end screen (`PuzzleGame.tsx:273`) | Yes, one sentence, only after the puzzle is solved |
| Story pages | No |
| Daily email + social line (`lib/dig/digLineText.ts`) | Yes |
| Sitemap (`lib/seoRoutes.ts`) | Yes |

So the only way in from the site is to finish /play first. People who don't play the puzzle, or who leave after reading the word, never see dig.

## What the walkthroughs found (2026-11-07)

These are scores out of 700 for different kinds of player, taken before the list fix:

- casual native speaker: 130
- confident learner: 100
- beginner: 90
- word lover: 405

The list fix (accepting potato, milk, mother and so on, and removing junk senses) addresses most of the gap. What it leaves:

- **The intro is dense.** It uses the words "fossil", "bedrock" and "cross-section" before the player has seen a single prompt.
- **The timer is the default.** 25 seconds is stressful the first time.
- **The first prompt can be a hard one.** Origin prompts such as "a word from a Pacific language" stop learners cold.
- **Low scores read as failure.** Nothing yet tells a new player that "common" answers are good answers.

## Proposal

### A. Make it findable (small, do first)

1. **Nav item "Dig"**, shown when `isDigOpen()`, placed after Puzzle. The header already wraps on narrow screens (a74caa6), but check it at 320px.
2. **"Today on Curio" strip on `TodayHero`**: three compact rows, *the word*, *the puzzle* and *the dig*, each with a one-line description and a quiet "done" tick read from localStorage.
   - It must not show "2 of 3", progress bars or nudges (see the archive rule below). Ticks only, today only.
3. **`ArrivalHero`**: one line under the puzzle link: "And a quick word game: curio dig."
4. **Cross-links**:
   - The dig end screen links to today's word story and to /play when the player hasn't done them.
   - Story pages for today's word get a small "Play today's dig" footer link.
   - The /play end-screen line stays.
5. **Optional, to discuss:** rename the nav's "Puzzle" to "Play" and make it a small hub with Puzzle and Dig. This is cleaner if more games follow (the "Curio for X" network), but it is more churn now. **Recommendation:** add the plain "Dig" item now and revisit a hub at game three.

### B. First run that welcomes (medium)

1. **Rewrite the intro to 2 short lines plus the example.** Plain words first ("Name words that fit each prompt. Rarer answers score more."), and let the strata metaphor arrive through the UI, not the rules.
2. **No timer on the first visit.** Default to *No timer* until the player has finished one dig, then offer the timer as "Add a timer for more of a challenge". Keep the choice in localStorage.
3. **Coach the first answer once.**
   - After the first accepted answer, show a one-time tip: "Nice — everyday words count. Rarer ones dig deeper."
   - After the first rejected answer: "Not on our list — try another." Never a red error tone.
4. **Encouraging end screen copy.**
   - Lead with what they found: "You found 9 words and reached the clay."
   - Treat the fossil as a reveal ("Today's fossil was …"), not "you missed".
   - Show no comparison to the maximum score.

### C. Gentler days (pipeline, after the list fix lands)

These are levers, not difficulty modes:

1. **An easy opener**: prompt 1 is always a broad, common-heavy theme.
2. **At most one origin prompt a day**, drawn from well-known source languages only (French, Latin, Greek, German, Spanish, Italian, Old Norse, Arabic, Japanese, Hindi).
3. **Hold off on difficulty modes.** Decide on 2026-12-04 at the kill-line read, using the returner numbers.

## Archive, never backlog — checks

- The Today strip shows only today and only ticks, with no counts. It must not say "you haven't played dig", and it must not keep a history of untouched days.
- There are no dig streaks, no "X of 7 found", and no "you missed".
- The nav item is a plain link, with no badges or dots.

## Measure

The dig funnel admin table (`components/dig/DigFunnelTable.tsx`) already tracks intro → start → finish. Add a `source` param (`nav`, `home`, `play`, `email`, `story`) to the inbound links so A's effect shows up. Compare a week before and after.

## Suggested order

| Release | Contents | Size | Notes |
|---|---|---|---|
| 1 | A1–A4 + funnel `source` | ~1 day | Low risk, biggest effect on discovery |
| 2 | B1–B4 | ~1–2 days | Run `ux-reviewer` on mobile first |
| 3 | C1–C2 | Pipeline change | Only for days built after it ships |

## Questions for Sam

1. Is it "Dig" in the nav now, or the "Play" hub?
2. Should the Today strip appear for signed-out readers too? (Recommended: yes. It uses localStorage only.)
3. No timer by default on the first visit: OK?

## Key files

- `components/Header.tsx`
- `components/TodayHero.tsx`
- `components/ArrivalHero.tsx`
- `components/PuzzleGame.tsx:273`
- `components/dig/Intro.tsx`
- `components/dig/EndScreen.tsx`
- `components/dig/DigGame.tsx`
- `lib/dig/clock.ts` (`isDigOpen`)
- `scripts/dig/build.ts` (prompt ordering, for C)
- `docs/design-system.md`
