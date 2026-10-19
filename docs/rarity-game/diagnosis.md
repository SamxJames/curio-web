# Rarity game: Phase 0 diagnosis

2026-10-19 · read-only · worktree `rarity-game` (branch `worktree-rarity-game`, based on master `c143503`).
Sources: the code, plus Vercel Web Analytics read through the Vercel CLI (read-only). No Redis was touched.

## 0. Skills and plugins I'll use, and where

| Phase | Skill / agent | Use |
|---|---|---|
| All | `superpowers:using-git-worktrees` | Done: this worktree. |
| 1 | `superpowers:brainstorming` | One question at a time, on open items only. |
| 1 | `anthropic-skills:built-in-browser` | Play Krillion and read its FAQ in the browser pane. |
| 1 | `product-management:competitive-brief` | Check for rival games built on rarity or obscurity. |
| 1 | `growth-marketer` agent | Share-loop and acquisition hooks, run in parallel with the teardown. |
| 2 | `frontend-design` **(not installed, see Q2)** | Mockups. |
| 2 | `design:accessibility-review`, `design:ux-copy` | Timer accessibility and contrast; copy with no FOMO. |
| 2 | `ux-reviewer` agent | Review each mockup against the "playable in five seconds" test. |
| 3 | `superpowers:brainstorming` → design doc | Pipeline design. |
| 4 | `programmatic-seo`, `schema` | Archive and hint pages, plus JSON-LD on them. |
| 4 | `engineering:system-design` | Hosting economics and the cost table. |
| 5 | `superpowers:writing-plans` | MVP plan in `docs/superpowers/plans/`. |
| 6 | `superpowers:subagent-driven-development`, `test-driven-development`, `requesting-code-review`, `verification-before-completion`, `finishing-a-development-branch` | Build. |
| 6 | `release-manager` agent, `log-session` / `scribe` | Only after you approve: deploy and verify, then update the handover. |

## 1. The `/play` clue puzzle: built, live, and used a little

- **What it is.** A daily three-clue word guess (`app/play/page.tsx`, `components/PuzzleGame.tsx`, `lib/puzzle.ts`,
  `lib/puzzleGuess.ts`). The answer is a different word from the day's shared word, picked from a pool that leaves out
  today's word and the words 30 days either side of it. Puzzle #N is `daysSinceStart + 1`. It has its own spoiler-free OG
  image (`app/play/opengraph-image.tsx`).
- **State.** Progress is saved in localStorage (`curio:play:<date>` and `curio:puzzleStats`). Signed-in players also
  sync to Redis under `curio:user:<id>:play:<date>` through `/api/play-state`. Anonymous players never reach Redis.
- **Events.** The puzzle emits only one: a share tap, recorded as `share:puzzle` in the first-party hash
  `curio:traffic:<day>`. It sends no start, solve or fail events. The share text is `Curio puzzle #N / grid / curioword.com/play`,
  **with no UTM tag**, so people arriving from a share count as "direct".
- **Where it's linked.** Header nav ("Puzzle"), the arrival hero, today's hero, story pages, the sitemap and IndexNow.
  It is **not** linked from the email, Bluesky, Threads, Instagram or RSS.
- **Usage (Vercel Web Analytics, all visitors including you):**

  | Week (Mon) | /play visitors | views |
  |---|---|---|
  | 14 Sep | 7 | 8 |
  | 21 Sep | 6 | 9 |
  | 28 Sep | 11 | 17 |
  | 5 Oct | 16 | 16 |
  | 12 Oct | 32 | 47 |

  Over the last 31 days `/play` had 70 visitors and 96 views, the 4th most-visited route. The site as a whole had 590
  visitors and 1,223 views; story pages had 343 visitors and the homepage 153. 69 of the 70 `/play` visitors arrived
  with no referrer (nav clicks, shares or direct visits); one came from Bing. The rise in the week of 12 Oct lines up
  with making share the main action (14 Oct) and the clue rewrite (18 Oct).
- **What I couldn't see.** The admin dashboard's Engagement panel (signed-in plays, solved and failed counts) and the
  "Share taps (story / puzzle)" figure both come from production Redis, so they're only visible at `/admin` on
  production. See Q3.

**Placement recommendation: alongside.** Keep `/play` as it is, and give the rarity game its own route and its own
landing page and OG image. Then make the header item a small "Play" hub only if both games survive. Reasons:
1. `/play` has a small but growing audience (32 visitors last week) and a canonical URL in the sitemap, so replacing it
   would throw that away.
2. The two are different mechanics. A one-word deduction puzzle doesn't merge cleanly with seven timed themed prompts,
   and a merged screen would make neither one playable within five seconds.
3. The rarity game will be judged on its own kill line (fewer than 20 daily players). A separate route gives clean
   numbers.
4. Each needs its own share card and OG image anyway.

The route name, such as `/dive` or `/depths`, gets decided in Phase 2, once the metaphor is chosen.

## 2. Word data

- **Fields.** Every one of the 1,147 entries has exactly 10 fields: `slug, word, respelling, partOfSpeech` (free
  text), `teaser, origin, journey, related` (prose), `lineage: string[]` (oldest language first, always ending
  "English") and `clues[3]`. Related words are worked out at runtime from shared lineage (`lib/relatedWords.ts`).
  They are not stored data.
- **Theme or topic signal in the bank: 0 of 1,147.** No entry has a category, tag or domain field.
- **But** the planning file `curio-word-candidates-by-category.md` puts **1,139 of the 1,147** bank words into
  exactly one of **21 broad categories**:
  - Food & drink 105
  - Loanwords 87
  - Animals 84
  - Household 74
  - Health 61
  - Science 60
  - Plants 60
  - Eponyms 56
  - Myth 51
  - Money/work 51
  - Clothing 49
  - Military 48
  - Travel/transport 46
  - Law 45
  - Arts 44
  - Language 42
  - Mind/emotion 41
  - Descriptors 39
  - Verbs 36
  - Sport 32
  - Time/astronomy 28

  The 8 it leaves out are the original seed words.
- **What this means for the game.** These categories are too broad to work as prompts. There's no "sailing": mast
  and keel sit under Travel, armada under Military. A theme like "words from sailing" will draw nearly all its answers
  from Wiktextract, with Curio adding a handful of story-linked words. **How much a theme overlaps with Curio's 1,147
  words decides how strong the story-link hook is.** That can only be measured once we have the dump, so it's a
  Phase 3 metric: for each candidate theme, count how many valid answers have a Curio story page.
- Language data (87 sheets, 61 language pages) offers a possible second prompt type, "words that came through
  Persian". It's already tagged on every entry. That's a Phase 1 question.

## 3. Content pipeline

- **Scripts.** Story content runs `content:extract` (streams a **local** Wiktextract JSONL), then `content:rewrite`
  (Anthropic API, `ANTHROPIC_API_KEY`), then `content:approve` (validates, then appends to `WORDS`). Clues run
  `clues:rewrite` then `clues:apply -- --keep-today`. The language pipeline is `languages:facts|draft|review|approve`.
  The reports are `demand:report` and `traffic:report`.
- **Wiktextract dump: not on disk.** The only copy is an 898-byte test fixture. It needs fetching from
  `kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz`: 2.7 GB compressed, 23 GB unpacked. That's free. Kaikki also
  offers a smaller English-only extract, which Phase 3 will compare. The scripts already stream the file line by line,
  so it never has to be unpacked to disk.
- **Word-frequency list: none** in the repo or `node_modules`. Choosing one and checking its licence is Phase 3 work.
- **Attribution page.** Credits Wiktionary via Wiktextract (CC BY-SA 4.0 and GFDL 1.3), plus Wikipedia (CC BY-SA)
  and Wikidata (CC0). The game will need its own line on this page, along with the frequency list's credit.

## 4. Analytics

- **`@vercel/analytics` is installed** (v2) and mounted in `app/layout.tsx`, along with Speed Insights and a
  first-party `TrafficBeacon`.
- **Web Analytics has been ON since 10 Sep 2026**, and has data: the project's `webAnalytics.enabledAt` is
  2026-09-10T20:37Z. You don't need to switch anything on.
- **Two Hobby-plan limits matter for the funnel:**
  1. Queries only reach back **31 days**.
  2. **Custom events are not readable on Hobby.** The query API returns `402: requires an Enterprise or Pro plan`. So
     the four `track()` events in `lib/analytics.ts` (`arrival_view, signup_submitted, story_view, collection_view`)
     are effectively invisible to us today.

  **Implication:** the game's funnel events (land → start → finish → share → share-arrival → signup → D1/D7) have to be
  first-party. The existing pattern fits: HINCRBY on the `curio:traffic:<day>` hash through `/api/traffic`, with a
  90-day TTL, writing in production only and filtering bots. Adding Vercel Pro would cost about £16/month and isn't
  needed.
- **First-party attribution** (`lib/traffic.ts`). It reads `utm_source` from a fixed `TAGGED` list (email, bluesky,
  threads, instagram, share, rss, …) and falls back to the referrer. `utm_medium` and `utm_campaign` are never read.
  The game's share links will need a `utm_source` that the list knows, plus a way to tell game shares apart, such as
  a new source or a `share:<what>` field.
- **Admin dashboard** (`/admin`, gated on `ADMIN_EMAIL`). Sections: Growth, Where visitors come from, People,
  Retention (D1/D7/D30), Engagement (signed-in puzzle plays only), Daily email (Resend 7 and 30-day metrics). Resend
  open and click tracking only started on 19 Oct, so open and click rates before that date mean nothing.
- **Excluding you from the "fewer than 20 players" count.** Nothing in the code does this today. Phase 4 needs a
  mechanism, for example a localStorage flag set from `/admin` that suppresses your counters.

## 5. Distribution the game should reuse

- **Crons** (`vercel.json`). `send-daily` runs at 09:00 UTC and sends the digest and the Bluesky post, then pings
  IndexNow. `social` runs at 10:00 UTC for Threads and the Instagram carousel. Each one claims a per-day Redis lock.
  Every post builder takes a single `WordEntry`. Adding the game's theme means changing their signatures:
  - **Bluesky:** a line in `buildBlueskyPost`, but the 300-grapheme cap is tight and the link card is already the
    story.
  - **Threads:** add to the text.
  - **Instagram:** add to the caption, or give the carousel a new `Slide` kind before the outro.
- **Sitemap.** Add routes to `PUBLIC_ROUTES` in `lib/seoRoutes.ts`; lastmod is hand-set for each page type. **IndexNow**
  (`lib/indexNow.ts`) already submits the sitemap URLs every day.
- **OG images.** Built with `next/og` from colours in `lib/ogTheme.ts`. No custom font is loaded, so they render in
  Geist. The routes are the site root, `/play` and `/story/[slug]`; the carousel is 1080×1350. There's no
  `app/api/og*` route yet. A per-result share image would be the first dynamic, parameterised OG route.
- **Email** (`lib/email.ts`). `buildDigestHtml` and `buildDigestMessage` build the HTML and plain-text versions. A game
  section goes before the footer, with the data passed in from the cron.
- **UTM convention.** `utm_source=<channel>&utm_medium=email|social&utm_campaign=daily-word`. Story shares use
  `?utm_source=share`.

## 6. Where your notes differ from the code

- **Brand.** The repo says otherwise, and I'll follow the repo unless you tell me to change it:
  - **Wordmark:** "Curio" with a capital C, set in **Newsreader** (`text-lg`), not lowercase Libre Caslon Bold. OG
    images use "CURIO" in Geist.
  - **Body text:** Work Sans.
  - **Colours:** paper `#f1ece0`, ink `#24302b` (a green-black), accent ochre `#9c6b30` (`#7a4f1e` for buttons). The
    dark theme is paper `#17140f`, ink `#ece6d6`. **There is no red `#C23B22`.**
- **Web Analytics.** It's already on (see §4); the brief assumed it was just being switched on.
- **"1,147 entries carry theme signal."** None do in the data. The only categories are broad ones in a planning
  file (see §2).

## Gate answers (Sam, 2026-10-19)

- **Brand:** the **new brand is the target**, and the repo lags behind it. That brand is a lowercase Libre Caslon Bold
  "curio" wordmark, Ink `#1C1A17`, Red `#C23B22` and Paper `#F5F1E8`, chosen earlier in October. The mockups use it,
  keep the repo's body font (Work Sans) and layout components unless they clash, and report any gaps between the two.
  The repo's Vercel-default favicon is still meant to be replaced. **Red has one role only.** It is the brand and
  action colour, so the "deep" or rarity signal must be shown another way, through ink weight, depth position or
  pattern, so the colour doesn't carry two meanings.
- **frontend-design:** installed from `claude-plugins-official` (user scope).
- **Admin numbers:** Sam will read them off `/admin`, or sign in in the browser pane themselves. Not blocking.

## Questions for the gate

- **Q1. Brand.** Is the repo right (Newsreader, green-black ink, ochre accent, "Curio" in title case), or are the
  Libre Caslon and red values a planned rebrand I should mock up?
- **Q2. `frontend-design` isn't installed.** I can install Anthropic's free `frontend-design` plugin, or build the
  mockups with `design:*` and the `ux-reviewer` agent instead. I recommend installing it: it's free and it's the skill
  you asked for.
- **Q3. Puzzle usage behind `/admin`.** Would you open https://curioword.com/admin and tell me two numbers: the
  Engagement "puzzle plays" figure and the "Share taps (story / puzzle)" figure? Or sign in in the browser pane and I'll
  read them myself. It isn't blocking: the placement recommendation stands either way.
