# Rarity game: Phase 1 brief

Status: **draft, 2026-10-19**. Research is done, and the hook choices below are recommendations until Sam answers the
open questions, one at a time. Decisions already made in the 19 Oct grilling session are not reopened here; see the
kick-off brief. Brand: the new identity is the target (see `diagnosis.md`, "Gate answers").

## 1. Krillion teardown (played dive #96 on 2026-10-19, read the FAQ)

**Flow**
1. **Landing.** Pixel-art sky and boat with one line: "7 prompts · 25 seconds each · rarer answers sink deeper". The
   one button is "Begin descent". The rules screen is six short lines.
2. **Prompt.** A 3-second "descending" grace period, then 25 seconds. The clock shows two ways: a number in a dial
   and a draining bar under the input. You type one answer.
   - An invalid answer gets "no echo. try again", and you can retry as often as you like until time runs out.
   - A near-miss spelling is **not** auto-accepted. It shows "'ice climbrs' corrects to 'Ice Climbers'", and you
     submit again to confirm or edit it. This is their guard against freak fuzzy matches; the FAQ's "sea donkey" vs
     "sea monkey" example shows why it's needed.
3. **Reveal.** The answer sinks past labelled tier lines, then shows the tier name, points, metres sunk and a one-line
   quip ("Solid — swims with the school."). The player taps "Descend" to start the next prompt, so the clock never
   runs between prompts.
4. **Tiers:** Plankton 10 · Too clever 15 · Schooler 30 · Rare 60 · Deep cut 85 · One in a krillion 100. Each point
   sinks you 10 m, so 700 is the trench. A timeout scores 0 ("Nothing landed — the clock beat you to it.").
5. **End screen**
   - Score, plus a **live bell curve of today's scores** with "better than 27% of today's players".
   - A per-prompt "dive log" chart, and score bands with flavour text.
   - "Copy result", then cross-promotion: merch, a plushie launch, a beta mode, two sister games.
   - **"The catch"**: tap any round to see **every** accepted answer, with filter chips per tier (in round 1: 2
     Krillion, 2,927 Deep cut, 427 Rare, 50 Schooler, 13 Plankton) and search. Each gem answer carries **a one-line
     fact** ("Cape Verde's barefoot diva performed morna onstage without shoes.").
   - Your own answers show live crowd counts ("121,476 other players chose this").
   - Logbook: **streak**, played, average, best, and a countdown to the next dive.
6. **Share text:** `Krillion #96 🦐 / 250 / 🐟🦑🫧⬛🦑🦑🐟`. That's one emoji per tier, **with no link**, Wordle-style.
7. **Rollover:** 04:00 UTC (midnight US Eastern).

**Business and traction**
- It's run by one person.
- It earns from Mediavine ads, which show during play, a $5 unlock for unlimited play and the archive (which ads
  removal comes with), themed packs, and merch.
- The consent banner lists 315 ad partners.
- Traction is **large**. Six-figure counts on a single answer suggest hundreds of thousands of daily players. Other
  signs: an r/Krillion subreddit, TikTok explainer videos, forum score threads, and **parasite "answers today" sites
  already ranking on Google** (krillionanswers.com, wordhint.net).
- A Reddit thread complains about a "completely busted" day that accepted no answers at all, which is exactly the
  failure our validation safeguard exists to prevent.

**How it builds and scores content (FAQ)**
- Answer sets are merged from dictionaries, wikis and encyclopedias.
- Rarity comes from a "familiarity database" (frequency), plus an LLM pass and manual review where frequency doesn't
  work.
- The gem is picked for rarity **and** fun.

**Its prompts are trivia about named entities, not words.** Today's set: female artists, sports fouls, underwear
brands, universities, languages, Smash Bros characters, fruit.

## 2. Competitors: is our angle open?

- **Krillion** is the only close daily format. It's huge, but trivia-led, and it already has clones.
- **Pointless** (BBC) is the original rarity mechanic, scored by a 100-person survey. No current browser daily
  version.
- **Rarity-by-frequency word games:** HiWord (iOS, not daily) and Zipfyr (higher/lower on frequency) are small.
- **Wordiply, Semantle, Contexto, Connections, Strands** aren't rarity games.
- I found no game that combines themed **word** prompts, rarity scoring and a link from each answer to an
  etymology story.

**Verdict: open.** The mechanic is easy to copy (Krillion's already has clones). What Krillion can't copy cheaply is
Curio's editorial layer, its 1,147 story pages, and a free archive (Krillion charges for its archive).

## 3. Hooks

| Hook | Verdict | Why |
|---|---|---|
| Rarity tier revealed per answer | **Keep** | A variable reward tied to skill and free, with no money, gambling or loot box. Use **4–5 tiers named in Curio's own voice** rather than Krillion's sea creatures. Show rarity with the depth position and ink weight, **never red** (red has one role: brand and action). |
| One hidden gem per prompt | **Keep, made Curio's own** | Krillion attaches a one-line fact to each gem. **Our gem should always be a word with a Curio story page**, revealed with its teaser and a link. That makes every game a guaranteed doorway to at least seven stories. (Open question 2.) |
| "Too clever" label | **Keep, softened** | Distinctiveness theory: people want to be original *and* belong. Krillion's line "the school thought of it too" is wry, not shaming. Use a gentle Curio label such as "Everyone's secret pick" on the go-to obscure answer, worth slightly more than the obvious tier. No mockery. |
| Depth metaphor | **Keep the axis, choose the skin in Phase 2** | Depth gives a goal gradient and makes the share card readable. Show **depth reached only**, never "N metres to the next zone", which would be manufactured progress pressure. A Curio-native alternative is **roots and strata**: rarer answers dig deeper into older layers of the language. Phase 2 mocks it up next to the ocean. |
| Time pressure, about 25 s | **Keep, with an accessibility setting** | It makes the prompts feel live and stops people looking answers up. WCAG 2.2.1 (Level A) requires the limit to be adjustable or extendable; a solo daily game isn't an "essential" exception. Copy Krillion's 3 s grace and player-paced "next" button. Add a **"More time"** setting (open question 3). Always show time as a number **and** a bar, plus a screen-reader announcement at 10 s and 5 s. |
| Post-game reveal of missed answers | **Keep: the core Curio hook** | Loewenstein's information-gap theory: having just tried the prompt, the player now knows enough to be curious. Frame it as **"Words worth knowing"**, never "you missed". Gems and Curio words first, each linked to its story page, then the full list behind a toggle. |
| Social comparison ("deeper than 72%") | **Keep, cheaply** | Krillion shows it on a live bell curve. It costs us **about 2 Redis commands per finished game**: one HINCRBY into a daily score-bucket hash, and one HGETALL for the end screen that the edge caches for 60 s, so in practice it's mostly free. See §4. Show it as a **band** ("deeper than most of today's players") when the sample is small (under 50 finishers), and as a percentage after that. Skip per-answer crowd counts for now: 7 writes per game is too many at 10k players. |
| Streaks / "played N" logbook | **Reject streaks.** Keep a **personal best per day** in the archive only | This is already decided. Krillion's logbook shows a streak; ours won't. A plain "played N" count is borderline, so leave it out too. |
| Cross-promotion and ads during play | **Reject** | Off-brand, and ads would breach the Vercel Hobby non-commercial clause. The one post-game call to action is the daily-word signup, which is already decided. |

**Ethics check.**
- None of the kept hooks uses loss framing, timed scarcity, pay-to-progress or guilt.
- The two riskiest are the timer, which the accessibility setting addresses, and the percentile. The percentile only
  ever shows "deeper than X%", never "worse than", and becomes a band while the sample is small.
- Past days stay playable for free. Playing an old day never says "you missed it".

## 4. Social comparison: cost

Assumptions:
- 1 HINCRBY per finish.
- End-screen reads come from an edge-cached route, so about 1 HGETALL per minute per active day.
- The rejected-answer log (Phase 3) adds about 1 write per rejected guess, capped at a few per player.

| Daily finishers | Comparison commands per month | Upstash free tier (500k/month, **shared with the live site**) |
|---|---|---|
| 100 | ~3k + ~43k reads ≈ 46k | Comfortable |
| 10k | ~300k + ~43k ≈ 343k | Tight once site traffic and rejected-answer logs are added. Overage is $0.20 per 100k (about £0.16), so roughly **£0.50/month** extra in the worst case |
| 100k | ~3M + ~43k | About **£5/month** pay-as-you-go. A separate Upstash database for the game would keep the site's quota safe |

Vercel side: static day files and cached OG images sit within Hobby's 1M CDN requests and 100 GB of transfer up to
roughly the 10k mark. The full table belongs in Phase 4.

## 5. What Krillion teaches us about distribution

- **Parasite answer sites appeared within about 6 weeks.** That confirms the plan for an indexed archive page per day,
  plus hint pages, from day one.
- Krillion's share text has no link, and it still spread through TikTok, Reddit and forums. **We include the bare
  domain**, as already decided, since the goal is bringing in strangers. The share text and card must stay
  spoiler-free.
- Krillion's archive is paywalled. **Ours is free and indexed**, a differentiator that's both an SEO win and on
  principle.

## Open questions (asked one at a time)

1. **Prompt types at launch:** themes only, or themes plus **origin prompts** ("a word English borrowed from
   Arabic"), which draw on Curio's lineage data and language pages?
2. Should every prompt's gem be a word with a **Curio story page**?
3. "More time" setting: should those scores count equally on the share card and in the percentile?
4. The depth skin (ocean vs roots/strata) is settled by mockups in Phase 2. Not a question for now.
