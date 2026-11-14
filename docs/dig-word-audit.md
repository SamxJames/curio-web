# Dig word audit: why good answers get refused

Audit date: 14 November 2026. Branch: `dig-word-audit`. No app code or content was changed.

## The short version

- I ran **2,922 answers a typical player would try** across **56 prompts** through the real matching code.
- Under today's rules **71% are accepted and 29% are refused**. Refused words include *sad* (emotion), *tulip* (flower), *juice* (beverage), *black* and *white* (colour), *knife*, *fork*, *spoon* (kitchenware), *river* (landform), *gun* (firearm), *pizza* (from Italian), *cloud* (weather).
- **It got worse on 12 November.** A new "stray-sense" filter went live that evening. On the same guesses, days played before it accepted 77%; days after it accept 72%. "Name an emotion" fell from 95% to 40%, "Name a flower" from 84% to 38%.
- Spelling handling is **not** the problem. Capitals, accents, hyphens, apostrophes, plurals (*wolves*, *geese*, *churches*) and UK/US spellings (*theatre/theater*, *grey/gray*) all work. Fewer than 1% of refusals were about the form of the word.
- The problem is **the lists**: three causes explain about 70% of refusals (see below).

## How a guess is judged (walkthrough)

1. **Before the day**: a script builds each prompt's answer list from two public sources, Wiktionary's topic categories (for example "Flowers") and WordNet's "is a kind of" tree. Words both sources agree on are the **core** list (shown at the end). Words only one source has are **accepted-only** (they score, never shown). Filters then remove offensive, obsolete and "stray-sense" words, and cap each list at 1,200.
2. The list is saved with extra spellings (irregular plurals, UK/US forms) and frozen. The game downloads today's list when the page loads.
3. **When a player types**, the word is tidied: lower-cased, accents and punctuation removed, a leading "a/an/the" dropped. "Crème Brûlée" becomes "cremebrulee".
4. The game looks for that exact key in the list, then tries plural endings (-ies, -es, -s), then the extra spellings.
5. **Found**: accepted. Its score comes from how common the word is in everyday English (common words score 10, rare ones up to 85, the day's hidden "fossil" 100).
6. **Not found**: if exactly one answer is a single typo away, the game asks "did you mean…?". Otherwise the guess is refused.
7. **Afterwards**: refused guesses are logged. Twice a week the pipeline re-checks them, but it only lets a word in if one of the two sources already lists it. So it cannot repair a word the sources are missing.

There is no general dictionary check: a real word that is not on that prompt's list is always refused. Rarity scoring does not depend on the list either. It uses a fixed word-frequency table, so adding words to a list never changes any other word's score.

## What I tested

| | Prompts | Guesses | Accepted |
|---|---|---|---|
| Real days, 7–14 Nov (today's 7 prompts plus 34 from the past week), as played | 41 | 2,067 | 77.0% |
| The same 41 prompts under today's rules | 41 | 2,067 | 71.7% |
| 15 prompts that have not run yet (fruit, colours, mammals, furniture…) | 15 | 855 | 70.5% |
| **All, under today's rules** | **56** | **2,922** | **71.4%** |

Two honest limits:

- **Upcoming days cannot be read from outside** (they live only in the production database, by design). I rebuilt the lists with the real pipeline code and the same sources. For the 14 prompts from 13–14 November the rebuild matched the live lists exactly (the same 139 refusals out of 734 guesses), so it is a faithful stand-in. Almost every theme recurs within the 30-day buffer.
- **The guesses are mine**, not logged player guesses. Perhaps 5–10% are debatable (is *squid* a fish? did *yoga* come from Hindi or Sanskrit?). The admin page's "Refused guesses" list is the real-player version of this and is worth reading alongside.

### Best and worst prompts (share of fair guesses accepted, today's rules)

| Worst | | Best | |
|---|---|---|---|
| From Hebrew | 32% | Fruit | 96% |
| Kitchenware | 33% | Mammal | 95% |
| Word about the weather | 35% | Bird | 95% |
| Flower | 38% (was 84%) | Family member | 93% |
| Emotion | 40% (was 95%) | Musical instrument | 93% |
| From Hindi | 41% | Baseball word | 93% |
| Cut of meat | 44% (was 57%) | Body part | 92% |
| Architecture word | 53% | Tree, Insect | 91% |
| Shape | 54% | Golf word | 90% |
| Art word | 54% | Clothing | 90% |
| Landform | 55% | Container | 89% |

## Root causes, ranked by player impact

Percentages are shares of the 837 refused guesses.

### 1. The "stray-sense" filter throws out obvious answers: 24%

Added 12 November to stop oddities like "more" counting as a vegetable. It drops a word from a theme when WordNet files the word somewhere else, or when the word is simply very common. But WordNet's tree is quirky: it files *tulip* under "lily family", not "flower"; *museum* under "depository", not "building"; and it has no noun for *sad* at all. The filter has already been applied to every upcoming day.

Refused because of it: **sad, angry, proud, scared, hope, grief, shame** (emotion) · **tulip, lily, daffodil, iris, jasmine, lavender** (flower) · **juice, milkshake, squash** (beverage) · **river, lake, sea, ocean, island, bay** (landform) · **museum, bank, station, warehouse** (building) · **office, attic, cellar, basement, loft** (room) · **garlic, corn** (vegetable) · **sock, heel** (footwear) · **plate, toaster, dish** (kitchenware) · **cupboard, shelf, drawer** (furniture) · **salsa, tap, disco** (dance).

Ranked first because it hits the most obvious words, it is recent, and it has one clear fix.

### 2. Neither source lists the word under that theme: 27%

Wiktionary files words in small sub-categories that the pipeline does not join to the parent theme: *black* is under "Blacks" not "Colors", *knife* under "Cutlery" not "Kitchenware", *cube* under "Polyhedra" not "Shapes", *salt* under "Seasonings" not "Condiments". WordNet has its own gaps (*gun* is the parent of "firearm", so it is not a kind of firearm).

Refused: **black, white, grey, silver** (colour) · **knife, fork, spoon, bowl, cup, mug, glass** (kitchenware) · **cube, cone, cylinder, pyramid, cross** (shape) · **gun, cannon** (firearm) · **salt, pepper, honey, jam, sugar** (condiment) · **airport, gym, pyramid, tunnel, statue** (building or structure) · **garage, hallway, porch** (room) · **desert, forest, waterfall** (landform) · **mirror, rug, mattress** (furniture) · **shoes, boots** (clothing) · **keyboard** (instrument) · **thigh, belly, mince** (cut of meat).

The twice-weekly re-check cannot fix these, because it only accepts words a source already lists.

### 3. "Name a ___ word" prompts have narrow, jargon-heavy lists: 20%

Prompts like "Name an art word" or "Name a word about the weather" invite almost anything, but their lists come from specialist glossaries. Everyday words are missing while technical ones are in.

Refused: **sun, sunny, cloud, cloudy, storm, thunder, lightning, hot, cold, wet, dry, ice, rainbow, forecast, temperature** (weather / meteorology) · **football, soccer, hockey, swimming, team, player, win, trophy, champion** (sports) · **brush, canvas, easel, portrait, gallery, artist, colour, frame, ink** (art) · **window, tower, stairs, balcony, brick, chimney, architect** (architecture) · **boat, captain, sailor, yacht, compass, wave** (sailing) · **cello, clarinet, concert, cymbals** (music, letter C).

### 4. "Came to English from ___" prompts miss well-known loanwords: 15%

Three sub-causes:

- **Dialect labels are not mapped to the language (9%).** Wiktionary says *pizza* is from "Neapolitan", *taco* from "Mexican Spanish", *amen* from "Biblical Hebrew", *bungalow* from "Gujarati". The pipeline only knows "Italian", "Spanish", "Hebrew", "Hindi". Also refused: **mafia, ghetto, parmesan · nacho, paella, tequila, tango · hallelujah, sabbath, torah, hanukkah · nazi, zeppelin, muesli · kremlin, bolshevik, cossack**.
- **The "first sentence" check (4%).** The word's etymology must name the language in its first sentence. Words that arrived via French or Spanish fail: **alcohol, sugar, cotton, magazine, orange, admiral, sultan** (Arabic) · **tornado, ranch, cigarette, barbecue** (Spanish) · **messiah, jubilee, cherub** (Hebrew).
- **The size cap (2%).** Big languages (Italian, German, Japanese, Spanish) already have more than 1,200 core words, so every accepted-only word is cut: **opera, violin, graffiti, ravioli, scenario · poodle, rucksack, strudel · sudoku, udon · tortilla, chorizo**.

### 5. Smaller causes: 14% together

| Cause | Share | Examples refused |
|---|---|---|
| Dictionary quirks: capitalised entries are skipped, and words whose entry is "short for…" or "another spelling of…" count as unusable | 6% | Labrador, German shepherd, Chihuahua, Rottweiler, Doberman, corgi, wellington, SUV, Pepsi, netball, chimp, gothic |
| Phrases: nothing over two words is ever allowed, and some two-word phrases are simply not in the dictionary | 4.5% | hide and seek, chest of drawers, hole in one, noughts and crosses, skull and crossbones, Jack Russell, football boot |
| Size cap on big themes: phrases have no frequency score, so they are cut first | 2% | polar bear, guinea pig, t-shirt, peregrine falcon, iced tea, big toe, crow's nest |
| Narrow sub-themes that take only their own category's words | 1% | chop, fillet, rump, bacon (cut of meat) |
| Over-cautious offensive filter | 1% | blue tit (contains "tit"), mayo, sauerkraut, mutt, cockroach, swastika |
| Word form (the only spelling/plural failures found) | <1% | high heel (only "high heels" listed), chilli sauce (only "chili sauce"), short rib |

## The opposite problem: wrong words that are accepted

Less harmful than refusals, because a junk word only scores the lowest 10 points. But it can make the game look broken, and a few are a taste risk.

- **Filler words on big lists.** "Name a word from sailing" accepts *to, in, on, by, can, about*. Symbols accepts *he, an, do, am*. Buildings and Rooms accept *or* (from the abbreviation "OR", operating room). Baseball accepts *on, get, first, take*.
- **Plainly wrong.** *Hyena* counts as a canid (and it is not one). *Spoon* counts as a container. *Chair* counts as a music word.
- **Offensive or sensitive words on the shown (core) lists.** *Minge* and *pecker* (body part), *pecker* and *peckerwood* (bird), *queer, dumb, autism, schizoid* (from German), *douche* (from Italian), *shag* and *skank* (dances, legitimately). Accepted but never shown: *wifebeater* (clothing, beverage), *duck fart*, *mare's fart*. The fossil already has a stricter offensive check; the shown list does not.
- **Obscure words.** Between 40% and 75% of most lists are words too rare to appear in the frequency table. Harmless: they only widen what is accepted.

## Recommended fixes

"Rarity effect" is the same for every fix unless noted: **none on existing scores**. Scores come from a fixed frequency table, restored words are accepted-only (never shown, never the fossil), and played days are never re-scored. Any fix that adds words is picked up by the existing "repair" step, which tops up days already in the buffer on the next pipeline run.

| # | Fix | Changes | Effort | Risk |
|---|---|---|---|---|
| **1** | **Replace the stray-sense filter with a sense-level one.** Only drop a word when the dictionary marks its theme meaning as obsolete, archaic, rare or dialect ("more" the root vegetable). Stop using WordNet's filing or the word's commonness as the reason. | Code, then a pipeline run to restore upcoming days | Medium (about half a day; the dictionary file has to be re-processed once) | A few odd-but-true answers return ("chat" is a real bird). They score 10 points. Quick fallback if needed: switch the filter off entirely (small change). |
| **2** | **Join Wiktionary's sub-categories to their parent theme**, listed per theme in the catalogue file (Colours + Blacks, Whites, Greys…; Kitchenware + Cutlery, Knives…; Shapes + Polyhedra…), plus a short hand-picked list for words no source has (*gun*, *shoes*). The audit harness then proves each theme reaches a pass mark. | Code (small) and content (catalogue file) | Medium (1 day, mostly choosing categories for about 90 themes; I can draft, you approve) | A too-broad sub-category could let in off-theme words; the 1,200 cap could squeeze phrases (fix 6 covers this). Lists only grow with accepted-only words. |
| **3** | **Fix or pause the "___ word" prompts.** Use the same sub-category joining (Weather + Atmospheric phenomena…) and Wiktionary's unused topic labels to add everyday words. Pause any that still score under about 75% on the audit. | Code and content | Medium | Pausing shrinks the pool of prompts, which is already tight (about 126). I would measure supply before pausing anything. More filler words may get in unless fix 7 is done too. |
| **4** | **Origins:** (a) map dialect labels to their language (Neapolitan → Italian, Mexican Spanish → Spanish, Biblical Hebrew → Hebrew, Gujarati → India group); (b) for accepted-only words, let the language be named anywhere in the etymology, not just the first sentence; (c) always keep everyday words even past the size cap. | Code and content (catalogue file) | Small to medium | Needs your call: should *sugar* count as "from Arabic" when it came via French? Players clearly think so. The shown core list would stay strict either way. Day files have a size limit, so (c) needs a ceiling. |
| **5** | **Accept capitalised and "short for / also spelled" entries as accepted-only** (Labrador, corgi, wellington, SUV). | Code | Small | Brand names and abbreviations become answers. Never shown, low points. |
| **6** | **Phrases:** allow up to four words as accepted-only; accept the singular of plural-only phrases and UK spellings inside phrases; stop the size cap cutting phrases first. | Code | Small | Slightly bigger day files. |
| **7** | **Tidy the wrong direction:** drop filler words (the few hundred most common English words) from accepted-only lists; apply the strict offensive check to the shown core list; stop "tit" blocking "blue tit" and a single rude sense blocking *mayo* or *sauerkraut*. | Code | Small | Removing a core word changes what is shown on that prompt's reveal for future days only. Loosening the blocklist needs a small allow-list rather than a rule change. |
| 8 | **Later: let the AI reviewer accept refused guesses automatically.** Already built in "shadow mode". It is the only self-healing fix for causes 2 and 3. | Code (switch on) | Small, after a week or two of checking its verdicts | An AI "yes" lets a wrong word in. Keep the blocklist and cap checks. |

### What each fix would recover (estimate from this audit)

| Fix | Refusals addressed | Acceptance rate if done alone |
|---|---|---|
| 1 Stray-sense filter | about 24% | 71% → about 78% |
| 2 Sub-categories | up to 27% (realistically two-thirds of it) | → about 77% |
| 3 "___ word" prompts | up to 20% | → about 75% |
| 4 Origins | up to 15% | → about 75% |
| 5–7 Small fixes | about 14% | → about 75% |
| **1 to 4 together** | | **about 90%** |

## How to re-run this audit

```
# 1. Typical guesses against real day files (needs the day JSON from /api/dig/day/<date>)
npx tsx scripts/dig/audit/probe.ts --days <folder of day files>

# 2. Why each guess is refused (needs the pipeline data: npm run dig:fetch -- --data <dir>)
npx tsx --max-old-space-size=8192 scripts/dig/audit/diagnose.ts --data <dir> --out <dir outside the repo>
```

The guesses live in `scripts/dig/audit/guesses.txt`. Output files contain answers, so keep them out of the repo.
