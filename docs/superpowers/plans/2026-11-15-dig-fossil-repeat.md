# Dig: fossils may repeat after four months

Date: 15 November 2026. Branch: `dig-fossil-repeat`, stacked on `dig-word-audit` (PR #5). Sam chose this from the
options measured in `docs/dig-word-audit.md` ("Supply runway").

**Status: built, in a PR for review.**

**Goal:** stop the prompt pool running out of fossils, without changing any score.

**Why four months:** every prompt needed a new fossil each time it ran, and half the theme prompts have 11 fossil
candidates or fewer. In simulation the pool could not fill a day from about day 131-151. Letting fossils return after
6 or 12 months did not move that day, because the pool empties before any fossil comes back. At 4 months (122 days)
no day failed in three simulated years.

## Tasks (each test-first)

1. **The rule.** `COOLDOWNS.fossilDays = 122` in `scripts/dig/assemble.ts`, with `lastFossilUse` and `fossilsResting`.
   `validate.ts` refuses a fossil the same prompt used within 122 days (it used to refuse any repeat, ever).
   `build.ts` excludes only resting fossils when choosing.
2. **Fresh fossils first.** `chooseFossil` (`fossil.ts`) takes `lastUsed`: a fossil the prompt has never used always
   wins; only when none works does a used one return, the one used longest ago first. Without this the most-viewed
   fossil would come back every four months while unused ones waited.
3. **The alarm.** `isFree` in `assemble.ts`: off cooldown and with a fossil that is not resting. A fossil here is a
   candidate with a fact to show (`fossilFactFor` in `fossil.ts`, added after review). The spare-pool count
   in `build.ts` uses it, for themes and origins, and `MIN_POOL_THEMES` goes from 20 to 8.
4. **Simulation.** `scripts/dig/audit/supply.ts` uses `COOLDOWNS.fossilDays` by default and reports how low the free
   pool gets.
5. **Docs.** Handover, pipeline design note, audit report.

## The new alarm threshold, in one line

8 = the 5 themes a day needs plus 3 to spare; under the new rule the free pool never fell below 9 in three simulated
years, and every day was still filled.

## What does not change

- Points, tiers, and which words can be a fossil.
- Days already built. The rule only affects days built after it merges.
- The origin alarm stays at 6 (origin prompts have 44 or more fossil candidates each).

## Risks

- **A regular may recognise a fossil** from four months earlier. Old fossils are already visible on past-day pages.
- **The simulation is a best case.** It counts fossil candidates that have a fact to show (as the alarm does), but
  before the page-view and typo rules narrow them, so the real free pool is smaller than simulated. If the alarm fires, it is a true warning: add prompts or
  widen what can be a fossil.
- **The alarm now means something different.** It counts fossils as well as cooldowns, so the "Spare pool" number in
  the run summary will be lower than before for the same pool.
