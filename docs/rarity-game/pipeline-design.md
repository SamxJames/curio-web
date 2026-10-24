# curio dig: content pipeline design (Phase 3)

Date: 2026-10-24. Status: **design for review (GATE)**. No production code yet.

The measurement scripts that produced the numbers below live outside the repo. Phase 5 turns them into
`scripts/dig/*`.

## 1. Summary

A **weekly GitHub Action** builds every day's seven prompts offline. It's free, because the repo is public.

It downloads free datasets:
- Wiktionary, via the Wiktextract dump
- Open English WordNet
- wordfreq
- cached Wikidata queries

It then:
1. builds answer sets that **two independent sources agree on**;
2. scores rarity from word frequency;
3. picks each prompt's **fossil**, preferring a Curio story word;
4. assembles days of 5 themes plus 2 origin prompts;
5. **validates every day** and swaps a spare in for anything that fails;
6. keeps **45 days** ready (never fewer than 30).

Players' rejected guesses and "this should count" reports are logged to Redis. The same weekly job checks them
against the full Wiktionary data and adds the valid ones to future and archive days.

Two independent watchdogs email Sam if the buffer drops below 14 days or a job stops running.

Running cost: **£0/month**.

```
 weekly GitHub Action (free)                                 Vercel (Hobby)
 ┌─────────────────────────────────────────────────┐        ┌───────────────────────────────────┐
 │ fetch Wiktextract · OEWN · wordfreq (cached)     │        │ /dig       today's day (cached)   │
 │ compact → catalogue → answer sets → tiers → gem  │        │ /dig/<date> past days, immutable  │
 │ assemble → VALIDATE → swap failures → buffer 45d │─days──▶│   reads curio:dig:day:<date>      │
 │ adjudicate rejected guesses → amend days         │ Redis  │ /api/dig/reject → rejection log   │
 │ any failure ⇒ GitHub emails Sam                  │        │ daily dig-health cron ⇒ email Sam │
 └─────────────────────────────────────────────────┘        └───────────────────────────────────┘
```

## 2. Sources and licences

| Source | Used for | Licence | What we must do |
|---|---|---|---|
| **Wiktextract** dump of English Wiktionary (kaikki.org, about 3.1 GB gzipped, refreshed weekly) | Answer sets (topic labels, topical categories, borrowing categories, structured etymology), plurals and alternative spellings, gem facts | CC BY-SA 4.0 and GFDL (Wiktionary) | Already credited on `/attribution`. Game data is a derivative, so the day files are CC BY-SA. |
| **Open English WordNet 2025** (en-word.net, 11 MB) | The **second, independent** source for themes ("kind of" trees and topic domains); 3,261 UK/US spelling pairs | CC BY 4.0 | Add a credit line to `/attribution`. |
| **wordfreq** (Robyn Speer; English "large" list, 321,180 words, frozen at 2021 data) | Rarity: the Zipf frequency of each answer | Data CC BY-SA 4.0; code Apache 2.0 (we use only the data, read by our own 40-line decoder) | Credit **exactly "Robyn Speer"**: her licence requires that name and makes any other credit a violation. Acknowledge Google Books Ngram Viewer with a link. |
| **Wiktionary pageviews** (Wikimedia REST API, free, no key; already used by the demand report) | Detecting the "Popular pick": words that are rare in text but famous | Pageview data is public domain (CC0) | Send a neutral user agent and no personal data. |
| **Wikidata** (query.wikidata.org SPARQL, free) | Alternative second source for everyday themes WordNet can't anchor (cheeses, pasta, cocktails, dog breeds) | CC0 (public domain) | Optional credit. Send a neutral user agent and respect rate limits. |
| **Curio's own 1,147 entries** | Story links, the preferred gem, and a lineage cross-check on origin prompts | Ours | None. |
| **Bad-word list:** LDNOOBW (Shutterstock's "List of Dirty, Naughty, Obscene and Otherwise Bad Words") | Blocking offensive answers and themes, on top of Wiktextract's vulgar/offensive/derogatory tags | CC BY 4.0 | Add a credit line. |

The frequency list was checked against the alternatives:
- **FrequencyWords** (OpenSubtitles, CC BY-SA): subtitles only, so it skews toward speech.
- **SUBTLEX:** its licence is unclear for reuse.
- **COCA:** paid, and redistribution is restricted.
- **Google Books n-grams:** free, but huge, and wordfreq already blends it.

wordfreq wins because it blends seven sources (Wikipedia, subtitles, news, books, web, Reddit and Twitter) and its
licence matches the one we already use.

## 3. What the data supports (measured 2026-10-24 on the full dump)

**Inputs**
- **Dump:** 11.1M Wiktextract entries, of which **1,499,161 are English**. Compacting them to the fields we need
  takes 2.3 minutes and gives a 236 MB file.
- **Wiktionary topical categories:** 2,916.
- **Origin languages:** 2,566.

**Themes**
- The prototype anchors each category to WordNet, as in §4, then rolls sub-categories up (Passerines count toward
  Birds).
- Passing the §5 floor: **260 themes**.
- After removing over-broad themes (more than 800 answers), technical or sensitive ones, and duplicates of the same
  WordNet anchor: **55 distinct general-audience themes**. Examples: Mammals 634 agreed answers, Birds 482, Clothing
  428, Fish 400, Insects 297, Trees 233, Beverages 182, Fruits 154, Herbs 124, Colours 120, Vegetables 101,
  Furniture 84, Musical genres 51.
- Everyday themes that **fail** today for lack of WordNet agreement: Cheeses (17), Pasta (19), Cocktails (12),
  Desserts (24), Dances (72, but only 6 easy), Dogs (63, 6 easy), Nautical (33). See §3a.

**Variants**
- **Letter variants** ("Name a mammal beginning with C"), each still a subset of an agreed core and passing a
  25/3/5 floor: **48**.
- **Theme × origin crosses** ("a word about music from Italian"): only **6** pass. That idea doesn't scale.

**Origin prompts**
- Prompts where both signals agree, with enough easy and rare answers: about **22 languages**.
- Ten of them: Arabic 972, Japanese 1,576, Spanish 1,523, Italian 1,381, German 1,376, Old Norse 761, Hindi 691,
  Sanskrit 627, Dutch 497, Portuguese 385.
- Excluded because they're too easy (more than 300 common answers): Latin, Old English, Old French. "From Latin" is
  half of English.

**Curio hooks**
- **Story links are plentiful:** the median theme prompt contains **6 Curio story words**, and Clothing has 29, so a
  typical game links around 40 stories in its reveal.
- **The Curio fossil is less common:** a Rare-tier Curio word is available for **10 of the 55 themes** and **10 of
  the 22 origin prompts**. Expect about 1–2 Curio fossils a day. The story hook will run mainly through the reveal
  lists.

**Frequency spot checks (Zipf)**
- sail 4.01, mast 3.52, keel 3.19, dinghy 2.83, flotilla 2.87, halyard 1.99, gunwale 1.65, sackbut 1.40,
  gamboge 1.11.
- haar 2.40 is inflated by Dutch and German; see §6.

### 3a. The supply problem, and the fix I recommend

**The problem.** With the strict two-source rule, supply is:
- about **110 theme prompts** (55 themes, 48 letter variants and 6 crosses);
- about **22 origin prompts**.

At 5 themes and 2 origins a day, that's **about 22 days before a theme repeats and about 11 days before a language
repeats**. That's too short for an archive that people may browse.

**Recommended fix.** It's free and keeps two sources for everything we publish:
1. **Better anchoring** (engineering, no new data). Anchor each sub-category to its *own* sense (woodwind, birds of
   prey, citrus fruit) instead of letting it fall back to the parent. Require the anchor sense to contain the
   category's head noun, and de-duplicate by anchor. Estimated **+40–60 themes**.
2. **Wikidata as an alternative second source** (CC0 public domain, free SPARQL endpoint) for themes WordNet can't
   anchor.
   - Tested 2026-10-24: cheese 1,253 items, pasta 292, cocktails 692, dog breeds 931.
   - Intersecting with Wiktionary's lowercase common nouns removes proper names.
   - Large classes time out, so results are cached weekly and the previous cache is reused if a query fails.
   - Estimated **+50–100 themes**.
3. **Grouped origins:** "a word from a Scandinavian language", "from a language of India", "from the Americas",
   "from Africa", "from the Pacific". Each is a union of agreed language sets. Estimated **+10–15 origin prompts**.
4. **A repeat policy as a backstop, enforced by validation:**
   - a base theme may return after **30 days**;
   - an exact prompt (including a letter variant) after **90 days**;
   - an origin language after **14 days**;
   - every return gets a different fossil.

   Most players are new, which is the acquisition goal, so repeats cost little.

Expected supply with 1–3: about **200–250 theme prompts** and **35 origin prompts**. That's about 40–50 days before
an exact theme repeats and about 15 days for origins. I'll re-measure once the improved anchoring is built in
Phase 6.

Alternatives (not recommended):
- **Relax the rule** to allow Wiktionary-only themes: more supply, but loses the safeguard you asked for.
- **Change the daily mix:** you decided 5 + 2.

## 4. Prompt types

### Theme prompts (5 a day)

Wiktionary groups words into about 2,400 topical categories ("Nautical", "Musical instruments", "Fruits", "Law").
The pipeline **anchors each category to WordNet automatically**:
1. Take the category's head noun.
2. Try that noun's WordNet senses.
3. For each sense, collect either everything that is a *kind of* it (Fruits → hyponyms of *fruit*) or everything in
   its *topic domain* (Nautical → seafaring and navigation).
4. Keep the sense with the biggest overlap.

The overlap is the **agreed core**.

Prompt wording comes from the anchor type:
- "kind of" themes read "Name a fruit" or "Name a musical instrument".
- domain themes read "Name a word from sailing" or "Name a word from the law".

A one-time override file (`content/dig/catalogue.json`) fixes awkward names and holds the theme blocklist. I write
it once from the measured list; Sam doesn't review it. After that, adding themes is automatic.

**Theme blocklist:**
- sexual, drug, slur and swear-word categories;
- categories that are mostly proper names;
- sensitive topics (death, diseases, religion's holy names, ethnicities);
- categories that are really grammar labels.

### Origin prompts (2 a day)

The prompt is "Name a word that came to English from Arabic". It accepts any route into English, which matches how
Curio's lineage chains read.

Membership needs **both** of these:
- Wiktionary's category "English terms derived from Arabic", **and**
- a structured etymology template that names Arabic.

For Curio words there's a third check: their own lineage must include the language. Where Curio disagrees with
Wiktionary, the word is kept out of that prompt's core and logged for the next content pass.

These two signals both come from Wiktionary, so they are **not** fully independent:
- the category is generated from a template;
- the "derived from" category and the template come from separate parts of the entry, so they disagree often enough
  to catch errors (see the measured numbers).

To make up for that, origin prompts use a stricter rule (§5). A language qualifies only if it has at least 40 agreed
words and **no more than 300 Common-tier answers**. That rules out "from Latin" and "from Old French", which would
be half of English, but keeps Arabic, Japanese, Italian and German.

## 5. Answer sets and the two-source rule

Each prompt has two sets:
- **Core:** words in both sources, filtered (see below). For themes, the two sources are Wiktionary plus WordNet,
  or Wiktionary plus Wikidata where WordNet can't anchor the theme (§3a). For origins, they are a category plus an
  etymology template. The core is used for publishing decisions, tiers, the
  fossil, the reveal list and the share stats.
- **Accepted:** the core, plus single-source words that pass the same filters. Players **score** for these, but they
  never become the fossil and never appear in the "words worth knowing" list. Being generous here costs little:
  players typed a real word that one good source puts in the theme. Strictness is kept for what we publish and
  display.

**Filters applied to every word:**
- English, lowercase, at most two words, 24 characters or fewer;
- noun, verb, adjective or adverb, with no proper nouns;
- not tagged misspelling, abbreviation, initialism or form-of;
- not obsolete or archaic, unless the word is also in wordfreq;
- not vulgar, offensive or derogatory, and not on the LDNOOBW list.

**Publishing floor (N), checked for every prompt:**
- **core ≥ 40 answers**;
- **≥ 8 easy answers** (Zipf ≥ 3.5), so a stranger can always score something;
- **≥ 10 rare answers** (Zipf < 2.3), so the dig has somewhere to go;
- **a valid fossil** (§7).

Origin prompts use the same floor, plus at most 300 Common answers (§4). Letter variants use a smaller floor of
25 / 3 / 5, because they are subsets of an already agreed core.

## 6. Rarity tiers

| Tier | Points | Rule |
|---|---|---|
| Common | 10 | Zipf ≥ 4.0 (about 1 in 100,000 words or more often) |
| Familiar | 30 | 3.0 ≤ Zipf < 4.0 |
| Uncommon | 60 | 2.3 ≤ Zipf < 3.0 |
| Rare | 85 | Zipf < 2.3, or not in wordfreq at all |
| Popular pick | 15 | Uncommon or Rare by frequency, **but** its Wiktionary pageviews are at least 4× the median of that prompt's Rare words. At most 2 per prompt. |
| Fossil | 100 | One per prompt (§7) |

The cut-offs are **absolute**, so a score means the same thing every day. The publishing floor guarantees that each
prompt has easy and rare answers.

**Known weaknesses, and what handles each:**
- **Homographs inflate frequency.** "skipper" is also a butterfly and a verb; "haar" is also Dutch and German. These
  words land a tier too common. That's acceptable for scoring, because it errs towards generosity. For the fossil it
  isn't acceptable, so the fossil's *first* WordNet sense must be the theme sense.
- **Frequency can't see fame.** Petrichor looks rare in text but everyone knows it. Measured on 2026-10-24:
  petrichor had 7,089 Wiktionary views a year and sonder 45,843, against halyard's 1,301 and bowsprit's 1,983 at
  similar frequency. The pageview rule turns these into "Popular pick".
- **Later improvement, not MVP:** per-answer pick counts from real players (one Redis command per answer) could
  re-tier archive days the Pointless way once a day has about 200 players. Leave it out until the game has traffic.

## 7. Choosing the fossil

1. **Candidates:** core answers in the **Rare** tier that are:
   - one word of 4 to 14 letters;
   - not obsolete, archaic, offensive or a Popular pick;
   - words whose first WordNet sense is the theme sense;
   - not today's or tomorrow's Curio daily word or `/play` answer.
2. **If any candidate is a Curio story word, it becomes the fossil** (decided 19 Oct). Ties go to the candidate with
   the most Wiktionary pageviews, a free proxy for "satisfying to land on". Its fact line is the Curio **teaser**, and
   the reveal links to its story page.
3. **Otherwise**, the candidate with the most pageviews wins. Its fact line is the first clause of its Wiktionary
   etymology, cleaned and capped at 140 characters (for example *"From French chinois, 'Chinese', after its hat-like
   shape"*), or its WordNet definition if there's no etymology. This is free and sourced. An LLM rewrite would cost
   money and could invent facts, so it isn't used.
4. Every prompt also lists **all core answers that have a Curio story**, whatever their tier, first in the reveal
   (decided 19 Oct).

## 8. Matching what players type

Matching is generous, and every correction is confirmed by the player:

- **Normalising:** fold Unicode and strip accents ("crème" = "creme"), lowercase, and treat spaces, hyphens and
  apostrophes as equal ("hurdy gurdy" = "hurdy-gurdy" = "hurdygurdy").
- **Inflections:** plurals and alternative forms from Wiktextract `forms`, plus rules (-s, -es, -ies → -y; -ing and
  -ed for verb answers).
- **UK/US spelling:** 3,261 WordNet spelling pairs (colour/color, harbour/harbor), plus rules (-our/-or, -re/-er,
  -ise/-ize, -yse/-yze, ae/oe → e, -ogue/-og, doubled l). These are applied symmetrically.
- **Aliases:** Wiktionary "alternative form" spellings. Synonyms are **not** aliases: a synonym scores only if it's
  an answer in its own right.
- **Near misses:** one edit for words of 4 letters or more, and none for 3 letters or fewer (changed at planning time
  from "two edits for 8+ letters": two edits matched too many unrelated real words). Exactly one answer may be in
  range.
  - **Freak-match guard:** if what the player typed is itself a real English word (in wordfreq, or a Wiktionary
    English headword), it is **never** fuzzed. They get "isn't on the list" instead. That blocks Krillion's "sea
    monkey" → "sea donkey" failure. The day file can't carry the whole lexicon, so each prompt carries a **guard
    list**: every real word exactly one edit from one of its answers.
  - A correction is never scored silently. The player sees "Did you mean *gunwale*?" and must press again. This was
    built and tested in the mockups.
- Each day file carries the matching data for its own answers (forms and spelling variants), so matching runs
  entirely in the browser. Whether answers are hashed is decided in Phase 4.

## 9. Assembling a day

- **Order:** 5 themes and 2 origin prompts. The **first prompt is always the easiest theme** (the most easy
  answers), so a stranger scores within seconds. Origin prompts go 3rd and 6th. The 7th is the theme with the most
  rare answers.
- **Repeats:** follow §3a's backstop. A base theme may return after 30 days, an exact prompt after 90, an origin
  language after 14, always with a different fossil. Two themes from the same family never share a day (Fruits and
  Foods, Music and Musical instruments, Mammals and Felids).
- **Overlap:** any two prompts on a day share less than 20% of their core.
- **Gems are all different** across the day.
- Days are **deterministic**: a seeded draw from the eligible pool, so a rerun gives the same result.
- **Days are frozen 7 days before they go live.** Adjudication can still *add* accepted answers later (§11), but never
  removes or re-tiers them, so nobody's score changes.

## 10. Validation and automatic swaps

Every generated day is checked in CI. The same checks run as a Vitest suite in the repo against a fixture day.

1. **Schema:** 7 prompts, 5 themes and 2 origins, and every field present. Fact lines are 1 to 140 characters.
   Every story link is a slug that exists.
2. **Per-prompt floor:** core ≥ 40, easy ≥ 8, rare ≥ 10, and the fossil passes the §7 rules.
3. **Safety:** no answer, fossil or theme on the blocklist or tagged offensive.
4. **Variety:** no repeats inside the windows in §9, overlap under 20%, all gems different, and no clash with the
   daily word or `/play`.
5. **Matching self-test:**
   - every core answer, plural and spelling variant matches itself;
   - no two answers collapse to the same normalised key with different tiers;
   - **simulated typos** of each fossil resolve to it or to nothing, never to a different answer.
6. **Size:** a day file is ≤ 400,000 characters before compression (raised at planning time from 80 KB: the guard
   lists and spelling variants make real days larger, and they compress well).

**When a check fails**, the whole day is picked again with a new seed, up to 5 times (as built; the planned
per-prompt swap from a stored pool was dropped as simpler-but-equivalent). The "spare pool" is now a count: the job
fails if fewer than 20 unused themes or 6 unused origins remain. A date that still fails after 5 tries is left empty,
the job fails, and the next run tries it again. A day already written is never rebuilt.

Retries are written to the job summary. If the buffer can't be refilled to 30 days, the job **fails**, so GitHub
emails Sam (§12).

## 11. Rejected guesses, "this should count", and weekly adjudication

**Logging (cheap):**
- As built, rejections are batched into the one `finish` event the browser sends to `/api/dig/event`: a list of
  `[promptIndex, guess]` pairs, at most 3 per prompt (21 in all). Nothing is sent per guess.
- The server checks each guess: 2 to 40 characters, letters, spaces, hyphens and apostrophes only. It writes
  `HINCRBY curio:dig:rej:<date>:<index> <guess> 1` in the same pipelined round trip as the score; the daily health
  cron sets the 35-day expiry.
- Bots are filtered the way `/api/traffic` already does.

**"This should count":**
- The button sits beside a rejection, and on each prompt in the reveal.
- It writes to `curio:dig:claim:<date>:<index>`, also with a 35-day expiry, and shows "Thanks, we'll check it
  this week".
- No email or account is needed. Each browser can claim once per prompt.

**Weekly adjudication** runs in the same Action, using a **read-only** Upstash token for the logs. For each claimed
guess, and each rejected guess seen at least twice:
1. Normalise it, and run the freak-match guard in reverse: is it a real English headword at all?
2. **Accept** it if **any one** strong source places it in the prompt:
   - Wiktionary topic label;
   - topical category;
   - WordNet "kind of" or domain;
   - for origin prompts, an etymology template naming the language.

   One source is enough here because a person proposed the word and it passes every filter.
3. **Reject** anything blocked, offensive or misspelt, and anything that isn't English.
4. **Accepted words are added** to that prompt's accepted set, in archive days and any future day that reuses the
   prompt. Their tier comes from Zipf; they're never the fossil and never change a past score.
5. The job summary lists what was accepted and rejected. No action is needed from Sam.

Redis cost: about 1 command per rejected guess, plus about 30 reads a week for adjudication. Negligible.

## 12. Buffer, alerts and watchdogs

**Buffer:**
- **Target 45 days.** The **floor is 30**, which is also the launch requirement. The **alert line is 14**.
- A manifest key, `curio:dig:manifest`, records the last generated date, buffer days, the spare-pool size and the
  last run time.

Three things raise an alert. The point is that a failure has to be noticed, unlike the cron that once failed
silently for weeks.

| Watchdog | Catches | How Sam hears |
|---|---|---|
| The weekly Action itself | any build, validation or adjudication error, or a buffer it can't refill to 30 | **GitHub's built-in failure email**. Free, needs no code from us, and works even if our app is broken. |
| A new **daily `dig-health` cron** on Vercel (Hobby allows 100 crons, each running once a day) | buffer < 14 days, the manifest older than 9 days (a weekly run was missed), or no day file for today or tomorrow | Email via the existing Resend setup, at most one a day. |
| The Action checks the health cron's heartbeat (`curio:dig:health:last`) | the health cron itself has stopped (stale for more than 3 days) | The Action fails, so GitHub emails Sam. |

Each watchdog checks the other, so neither can die quietly.

## 13. Where the finished days live

A decision for Sam; this changes the Phase 4 assumption. The kick-off brief imagined day files as static JSON in
the deploy. Two things in the repo argue against that:

1. **CI must not push to `master`.** The demand-report workflow documents this rule deliberately: every push to
   `master` deploys to production, and the repo is public.
2. **A public repo would leak future answers.** Committing 45 days ahead makes every future answer public, a gift
   to the parasite "answers today" sites that already exist for Krillion.

**Recommendation: keep prebuilt days in Upstash, served cached from the edge.**
- The Action writes each validated day to `curio:dig:day:<date>`, about 40 KB each and about 2 MB for 45 days.
- The site reads only **today and earlier** (UK rollover is decided in Phase 4).
- Past days are immutable, so they can be cached for a year. Today's day is cached until the rollover.
- Redis reads are about one per day per edge region, so effectively free.
- Future answers never leave Redis. Nothing deploys when content changes.

Things to know about this route:
- It needs a write token in GitHub secrets. That is the production Redis, written by CI by design, never by me
  locally.
- It needs a new key prefix, `curio:dig:`, added to the allowed list in the handover.

Alternatives considered:
- **A private data repo** read server-side with a token: workable, but more moving parts.
- **Vercel Blob:** a new service and token, and private storage still needs signed reads.

## 14. Costs

| Item | Cost |
|---|---|
| GitHub Actions (public repo, standard runner, about 40 minutes a week) | £0 |
| Wiktextract, OEWN, wordfreq and LDNOOBW downloads | £0 |
| Wiktionary pageviews API (about 300 requests a week, fossil and popular-pick candidates only) | £0 |
| Upstash: about 45 day writes a week, plus logs and edge-cached reads | £0. Far inside 500k commands a month even at 10k players a day; see Phase 4 for the full table |
| Resend: at most one health email a day | £0 (existing free tier) |
| LLM | Not used |

## 15. Testing

- **Unit tests (Vitest)** for normalising, spelling pairs, inflections, the near-miss guard, tiering, fossil
  choice, day assembly rules and every validation check, against small fixtures.
- **Golden day:** a checked-in fixture day built from a tiny fixture slice of each source. CI rebuilds it and compares
  the result.
- **Dry runs:** the generator writes to a local folder with `--dry-run` before anything touches Redis. The first real
  Redis write is a Phase 6 step that needs Sam's approval.

## 16. Decisions for Sam at this gate (asked one at a time)

1. **Prompt supply** (§3a): the strict rule supports about 22 days of themes before repeats. Recommended: better
   anchoring, plus Wikidata as a second source, plus grouped origins, with repeat cooldowns as a backstop.
   **Decided 2026-10-24: recommended fix.** The two-source rule stays strict. Phase 6 must re-measure supply once
   the fix is in, and the 30-day pre-launch buffer is the proof.
2. **Where days live** (§13): Upstash, served cached from the edge (recommended), or a private data repo.
   **Decided 2026-10-24: Upstash** under `curio:dig:`, written only by the weekly Action, edge-cached, serving
   today and earlier only.
3. **Publishing floor** (§5): core ≥ 40, easy ≥ 8, rare ≥ 10, plus a fossil. Letter variants use 25 / 3 / 5.
   **Decided 2026-10-24: keep as proposed.**
4. **Generous acceptance** (§5): single-source answers score but are never displayed. Recommended: yes.
   **Decided 2026-10-24: yes.** Single-source answers score but are never the fossil or shown in the reveal.
