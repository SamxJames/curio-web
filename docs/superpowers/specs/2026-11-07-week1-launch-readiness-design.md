# Week 1 launch readiness: design

Approved by Sam 2026-11-07. Source: `docs/strategy/2026-11-07-roadmap.md` (week 1). Goal: when strangers arrive from a
launch post, the dig makes sense at once, can be passed to a friend, and their return can be measured.

**Pitch line** (one constant, `DIG_PITCH` in `lib/dig/pitch.ts`):
"A daily word game where obscure answers win. No crowd, no streaks, and every answer comes with its origin story."

## 1. Dig rules show on load
- `DigGame`'s loading state renders `Intro` with `loading` (Start disabled and reading "Loading…", No-timer toggle
  disabled) instead of the skeleton. `DigGame` is a client component, so its first render is server-rendered: the rules are
  in the HTML. The intro's first line becomes `DIG_PITCH`. The `/dig` meta description becomes `DIG_PITCH`.
- Past digs (`date` prop) behave the same.

## 2. Challenge link (no storage)
- `lib/dig/challenge.ts`: `encodeVs(n, tiers)` → `"<n>.<7 chars>"`, one char per prompt: tier index `0`–`5` in `TIERS`
  order, `-` for none. `parseVs(raw, n)` → tiers or null. It rejects bad length or characters, and a code for a different day.
- Share text's last line becomes `curioword.com/dig?vs=<code>&utm_source=challenge`.
- `DigGame` (today only) reads `vs` from `window.location.search` after mount. If it's valid for today's day number:
  - the intro shows "A friend dug {depth} today. Can you go deeper?";
  - the end screen shows a "You and your friend" block with two compact `Strata` and both depths.
  Invalid, foreign-day or past-day codes are ignored silently. Nothing is ranked or stored.
- `challenge` becomes a `TrafficSource` and is accepted from `utm_source`.

## 3. Homepage and header
- `DigCard` (a Link card: "Today's dig" eyebrow, `DIG_PITCH`, a "Start today's dig" button) sits at the top of
  `TodayHero` and `ArrivalHero` when `digOpen` is true (`app/page.tsx` → `HomeContent` → heroes).
- `Header` takes `digOpen` (from `app/layout.tsx`) and shows a "Dig" link after "Puzzle" when it's true.

## 4. /play rules
- One line under "Guess the word" in `PuzzleGame`: "Guess today's word in up to three clues. Each clue gives more away."

## 5. Story disclaimers
- `lib/storyText.ts` `cleanStoryText(s)` removes reader-visible pipeline disclaimers ("the facts (here|given) don't …",
  "the facts don't …", "the facts here only …"):
  - a trailing clause (", though/but/and/while the facts …") is cut and the sentence keeps its lead;
  - a sentence that opens with "The facts …, but X" keeps X (first letter capitalised);
  - any other sentence that mentions the facts is dropped.
- `StoryView` renders `cleanStoryText(word[key])` and omits a section left empty.
- A test runs over every word: no section text may still match `/\bthe facts\b/i`, and no section text may come out
  empty except where all of it was disclaimer. Titles, descriptions, layout and data are unchanged (SEO freeze).
- (Share is already native where `navigator.share` exists. The pull-quote and related-word links are out of scope.)

## 6. Measurement
- New `TrafficSource` values `newsletter` and `challenge`. `reddit`, `hn`, `newsletter` and `challenge` are honoured
  from `utm_source`.
- Cohorts, with nothing new stored on the device: the first-play date is the earliest saved `finishedAt` day.
  - Start events carry `first` (that date) when the player is returning. The server validates it (a date before today and
    no more than 60 days old) and runs `HINCRBY curio:dig:cohort:<first>` field `d<days since first>`.
  - Finish events carry `isNew: true` when the device has no earlier finished game. The server counts `finish:new` in that
    day's funnel hash, which is the cohort size.
- `/admin`: a "Dig cohorts" table with the last 21 first-play dates: new finishers, back on day 1, back on day 7, and back
  on days 8–13 (sum).

## Testing
Unit tests: `challenge.ts`, `cleanStoryText` (including the all-words sweep), the event parsing for `first`/`isNew`,
the cohort planner, and the traffic tagging. Browser check: a cold `/dig` (HTML contains the rules), a challenge round
trip, the homepage card, the header link, `/play`, and one story with a disclaimer; at desktop and 375px.

Archive, never backlog: nothing here counts unseen words, nags, or keeps streaks.
