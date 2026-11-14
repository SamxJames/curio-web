# Dig word fixes (from docs/dig-word-audit.md)

Date: 14 November 2026. Branch: `dig-word-audit`. Sam approved fixes 1, 2 and 4 from the audit, plus
"rude words on the reveal lists" and "junk accepts". Fix 3 ("___ word" prompts) is measure-only.

**Status: done, in a PR for review.** Results and deviations are in `docs/dig-word-audit.md` ("What was fixed"). Two later changes to this plan: filler words are a catalogue list (task 5's part-of-speech rule removed real answers), and `jargonCategories` was added so vocabulary lists such as "Poker" stop counting as kinds of card game.

**Goal:** stop refusing answers a typical player would try, without changing any existing score.

**Rules that hold throughout**
- Scores come from the fixed frequency table; nothing here re-tiers a word or touches a played day's result.
- Restored and added words are accepted-only unless both sources already agree (core). Fossils are untouched.
- No new catalogue content is committed until Sam has seen it.
- Never push to `master`, never deploy, never run the pipeline with `--publish`.

## Tasks

Each code task is test-first: write the failing test that names the refused words, watch it fail, fix, watch it pass.

1. **Stray-sense filter (fix 1).** The dictionary dump tags a theme on the whole page, not on one sense, so the
   sense-level rule proposed in the audit cannot be built (checked against the raw dump: *bank*'s verb entry carries
   "Buildings" too). Instead: remove `isHomograph`; add `excludeAnswers` to the catalogue (per prompt, or `*`), a
   reviewed list of everyday stray words ("more" as a vegetable). Files: `themes.ts`, `catalogue.ts`, `answers.ts`.
   Test words: tulip, sad, juice, river, museum accepted; more, name refused when listed.
2. **Sub-categories and hand-picked answers (fix 2).** `extraCategories` in the catalogue joins Wiktionary
   sub-categories to a theme (Colors + Blacks, Whites; Kitchenware + Cutlery). `extraAnswers` (exists) takes the
   words no source has. Files: `themes.ts`, `catalogue.ts`. Test words: black, knife.
3. **Origins (fix 4).** Sam's ruling: a word counts if the language is its immediate or its original source, and
   *sugar* counts as Arabic. Wiktionary's "derived from" data cannot tell a middle step from the original source,
   so accepted-only takes any step; the shown core list keeps today's strict rule. (a) `originVariants` maps dialect
   labels to their language (Neapolitan, Mexican Spanish, Biblical Hebrew) and "the Arabic root …" categories;
   (b) accepted-only drops the first-sentence check; (c) everyday words survive the size cap, up to a ceiling.
   Files: `origins.ts`, `catalogue.ts`. Test words: pizza, taco, amen, sugar, opera.
4. **Rude words on shown lists.** No count-based rule separates *minge* from *dog* or *turkey* (checked on all 353
   shown words with a rude sense). Add `hiddenAnswers` to the catalogue: still accepted, never shown, never a
   fossil. Files: `catalogue.ts`, `answers.ts`.
5. **Junk accepts.** Function words (prepositions, pronouns, articles, conjunctions, by Wiktionary part of speech)
   with Zipf ≥ 5 are dropped from accepted-only lists unless hand-picked. *hyena* goes in `excludeAnswers` for canids.
   Files: `wiktionary.ts`, `answers.ts`.
6. **One finishing step.** `finishCandidate` in `answers.ts` replaces `withExtras` in `build.ts` and applies
   extras, hand-picked answers, exclusions, hidden words, the blocklist and de-duplication in one place. The audit
   script uses the same function.
7. **Built days.** `repair.ts`: on days nobody has played, remove excluded words (never the fossil) and hide
   hidden ones; on every day except today, add the words the lists now accept (already how repair works).
   `adjudicate.ts`: an excluded word can never be voted back in.
8. **Catalogue content (shown to Sam first).** Draft `extraCategories`, `extraAnswers`, `excludeAnswers`,
   `hiddenAnswers`, `originVariants` from the audit data; review every list by eye.
9. **Verify.** Unit tests, type-check, lint. Re-run the audit on the same 56 prompts and on the hold-out guesses
   (`scripts/dig/audit/holdout.txt`, written before any fix). Run the real builder locally for a few days to
   check day size (400,000-character limit) and validation.
10. **Fix 3, measure only.** Count the "___ word" prompts under 75% on the audit and simulate supply with and
    without them.
11. **PR into `master`**, not merged.

## Risks

- **Day size.** Days already sit close to the 400,000-character limit. Bigger lists mean more retries when
  building. Checked in task 9; repair already drops the rarest additions first when a built day would go over.
- **Catalogue upkeep.** Three new hand-kept lists. Unknown category names are counted in the build log.
- **First run after merge.** Repair rewrites most buffered days (adds words, removes strays). It never touches
  today's day, a fossil, or a tier.
