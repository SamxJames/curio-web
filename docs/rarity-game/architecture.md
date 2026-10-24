# curio dig: game design and architecture (Phase 4)

2026-10-24. This builds on `brief.md` (the hooks and decisions), `mockups/option-2-dig.html` (the chosen direction)
and `pipeline-design.md` (how the days are made). The Phase 5 plan turns this into tasks. Decisions still open for
Sam are in §14.

## Changes made while planning (2026-10-24)

The Phase 5 plan changed the spec in seven places. Where the sections below disagree, this list wins.

1. **The day file carries no `number`.** `/api/dig/today` adds it from `DIG_LAUNCH_DATE`, so the launch date can be
   chosen after days are built. Fossils and story links sit inside the obfuscated payload, because a fossil is a
   spoiler.
2. **Past-day responses use `s-maxage=86400, stale-while-revalidate=604800`, not `immutable`.** Weekly adjudication
   can add accepted-only answers to past days.
3. **Signup is counted by the browser.** It sends a `signup` event after `/api/subscribe` succeeds, and
   `/api/subscribe` is unchanged.
4. **The percentile line appears only from 50 finishers.** Below that no line is shown, instead of "deeper than
   most" (§8), which would be untrue for low scores.
5. **The share card is one square 1080×1080 image.** There is no second 1200×630 size.
6. **The edge-request alert uses an estimate.** Vercel publishes no usage API for Hobby, so the health cron
   estimates edge requests from first-party counters (8 per dig landing, 6 per site visit), alerts at 50% and 70%
   with a projected date, and the constants are recalibrated against Vercel's usage page after launch week 1.
7. **Past days are played at `/dig/<date>/play`.** That page is `noindex`. The archive page `/dig/<date>` stays the
   indexed, spoiler-full page.

## Changes made while building (2026-10-24)

Decisions taken during the build that change what the product or spec does.

1. **A Pass button.** It locks the prompt with no answer, exactly like a timeout. "No timer" otherwise gave no way to
   give up on a prompt.
2. **Finish events must be self-consistent.** The server drops a finish whose reported score doesn't equal the score
   of its seven tiers. The score feeds the percentile, so this is a free spoof filter.
3. **Guesses are stored in normalised form.** Rejected and claimed guesses are tallied under `normalizeKey`, so
   "ice cream" and "icecream" are one tally.
4. **The "should count" claim is offered only when a prompt ended unanswered.** A correct answer has nothing to claim.
5. **The client sends at most 21 rejected guesses per finish** (3 per prompt, 7 prompts), and the server drops a
   finish that carries more.
6. **The event route is closed before launch.** It returns 404 until `DIG_LAUNCH_DATE` has passed, and rejects
   bodies over 4 KB (413) before parsing. A maximum finish is under 2 KB.
7. **Copy result copies.** It writes to the clipboard and falls back to the share sheet only if that fails. Share
   image uses the share sheet where available, and downloads the PNG on any other error.
8. **Share and signup events still count on past days.** They are actions taken today, so they land in today's funnel.
9. **A miss clears the answer field; a near miss keeps it** so Enter accepts the suggestion. Guesses under four
   letters never get a "Did you mean" suggestion.
10. **The strata drawing is laid out for a phone.** It is a 360×360 square, capped at the form width, with strata
    names in a left gutter, word labels alternating above and below, and labels over ten characters shortened in the
    drawing only. Unanswered prompts show as small open rings.
11. **The kill line counts absent days as zero starts.** It computes only once all seven window days (22–28 after
    launch) have passed.
12. **Depth rounds half-up.** Depth is score ÷ 100 shown to one decimal place, with ties rounded up.
13. **Accepted-only additions never break a day.** Weekly adjudication skips words a day already matches, and
    respects the answer-count and size caps. Words dropped by lineage filtering stay accepted.
14. **The health cron's heartbeat doesn't depend on its other reads.** It is written before housekeeping, and the
    usage estimate can fail without blocking the alert or the heartbeat. An unreadable `lastRun` counts as a problem.
15. **Redis keys changed (§8 is now updated).** There is no `curio:dig:pool`. Adjudication uses `curio:dig:extras` and
    `curio:dig:adjudicated`, and the health cron uses `curio:dig:health:usage:<month>`.

## 1. Summary

- **Game.** You get seven prompts a day, the same for everyone. Each gives 25 seconds (or no timer) to type one
  answer. Rarer answers dig deeper, and a perfect day reaches 7.0 m.
- **Where the work happens.** All scoring runs in the browser. The server does three things: serve today's day,
  count events, and return the score spread for the "deeper than most" line.
- **Content.** A weekly GitHub Action builds the days and writes them to Upstash under `curio:dig:`. The site
  serves **today and earlier only**, cached at Vercel's edge (CDN) until the rollover.
- **Day clock.** The day changes at **00:00 UTC**, using Curio's existing clock in `lib/day.ts`. That's midnight
  in the UK in winter and 01:00 in summer (BST). The alternative is in §14.
- **Cost.**
  - **£0** up to about 3,000 daily players.
  - About **£17 a month** at 10k daily players, because Vercel Pro becomes necessary.
  - About **£40–65 a month** at 100k (§12).
  - Kill line: fewer than 20 daily players four weeks after launch.
- **Brand.** `/dig` uses the target brand (Libre Caslon wordmark, Ink, Paper, Red for actions only), scoped to the
  game. The rest of the site keeps its current look until a separate rebrand (§11).

## 2. How a game plays

Each step below matches a screen in the dig mockup.

1. **Landing (`/dig`).**
   - One line: "7 prompts. 25 seconds each. Rarer answers dig deeper."
   - A **Start** button and the **No timer** setting.
   - A player who has already finished today sees their own end screen instead. There's no "come back tomorrow"
     countdown.
2. **Prompt.**
   - A 3-second read pause, then a 25-second clock shown as a number **and** a bar.
   - Screen-reader announcements at 10 s and 5 s.
   - One text field. **Enter** submits.
3. **Checking a guess** (in the browser, §5). Each guess has one of four outcomes:
   - **Match:** the answer locks in, and the player moves to the reveal.
   - **Near miss:** "Did you mean *halyard*?" Pressing Enter again accepts it. A different guess is checked on its
     own merits.
   - **Not on the list:** "Not on today's list. Try another." The guess is kept for the rejection log (§8).
   - **Already used today:** answers can repeat across prompts, so this never fires. It's listed only so nobody
     builds it.
4. **Time runs out.** With no answer the prompt scores 0 (a blank layer, ▫️ in the share). Running out is
   neutral; the copy reads "Time's up", never "You missed".
5. **Reveal.** After every prompt:
   - The answer drops into its stratum, with the tier name and points.
   - The prompt's **fossil** and its one-line fact.
   - A **"This should count"** link, shown only on a "not on the list" outcome.
   - **Next** is player-paced.
6. **End screen.**
   - The section drawing with all seven words at their depths, and the total depth.
   - The percentile line (§8).
   - **Words worth knowing:** answers with a Curio story listed first, then each prompt's fossil.
   - Expandable full answer lists, core set only.
   - Share, the daily-word signup, and **Past digs**.
7. **Past digs (`/dig/past`).**
   - Every earlier day, newest first. Played days show your depth; unplayed days show nothing extra.
   - **No counts and no "unplayed" marks** (archive, never backlog).
   - Past days are playable. They record locally only and never touch the percentile.

**Scoring.** Common 10, Popular pick 15, Familiar 30, Uncommon 60, Rare 85, Fossil 100. Depth = total ÷ 100 m.

**No timer** removes the clock and the announcements. It's stored in settings and counts equally everywhere.

**Accessibility.**
- The timer follows WCAG 2.2.1 through the setting.
- Motion respects `prefers-reduced-motion`, with no drop animation.
- Strata colours meet AA against their text. Tier names are always written out, never colour alone.

## 3. Day clock and numbering

- **Today** is `dayKey()` from `lib/day.ts` (UTC). The game, the daily word and the digest therefore share one
  clock, which matters because the game funnels players to the daily word.
- **Day number:** `daysSince(DIG_LAUNCH_DATE) + 1`, so the share text says "day 14".
- Browsers never compute "today". They ask `/api/dig/today`, so a wrong device clock can't open tomorrow's prompts.

## 4. The day file (contract between pipeline and site)

The pipeline writes one JSON value per day to `curio:dig:day:<date>`. Its TypeScript types live in
`lib/dig/types.ts`, so the pipeline and the site can't drift apart.

```ts
type DigDay = {
  v: 1;
  date: string;          // "2026-12-01"
  number: number;        // day 14
  prompts: DigPrompt[];  // exactly 7, in play order (§9 of pipeline-design)
};

type DigPrompt = {
  id: string;            // "theme:fruit", "origin:arabic"
  kind: "theme" | "origin";
  text: string;          // "Name a fruit"
  payload: string;       // obfuscated answer table (§5)
  fossil: { word: string; fact: string; story?: string };  // story = Curio slug
  stories: Record<string, string>;                         // answer → Curio slug, for story links
};
```

**What's inside `payload`, once decoded:**
- For each answer:
  - its normalised form;
  - its tier;
  - whether it's **core** (shown in reveals) or accepted only (scores, never shown);
  - its display spelling.
- Aliases (plurals, UK/US spellings, accents) map to their answer.
- For each answer of five letters or more, its **real-word neighbours**: real English words one edit away (§5).

**Size.**
- About 1,500 answers per prompt is typical, so a day is roughly 120 KB raw and 40 KB gzipped.
- The pipeline's validator fails any day over 400 KB raw.

## 5. Matching in the browser, and protecting answers

Matching runs entirely on the device, so a guess costs no server call. The functions are pure and live in
`lib/dig/match.ts`. The pipeline uses the same file, so its validator tests the exact code players run.

1. **Normalise:**
   - lowercase;
   - fold accents (é → e);
   - collapse spaces, hyphens and apostrophes;
   - trim;
   - drop a leading "a ", "an " or "the ".
2. **Exact or alias match:** look it up in the answer table. Plurals and spellings are already expanded by the
   pipeline.
3. **Near miss:**
   - **Eligible answers:** five letters or more, and exactly one edit away from the guess (Damerau: insert,
     delete, substitute, swap).
   - **Freak guard:** if the guess is one of that answer's real-word neighbours, it is **never** corrected. "Heel"
     never becomes "keel".
   - **Ambiguity:** if two answers qualify, nothing is suggested.
   - **Confirmation:** a correction is always confirmed, never applied silently.
4. **Otherwise:** not on the list.

**Answer protection: obfuscate, not hash (my call).** The answer table is XOR-scrambled with a key derived from the
date and base64-encoded, and it's decoded only in memory when a prompt starts. Here is what that does and doesn't
protect:

- **Real protection: future days never leave Redis** (decided at the Phase 3 gate). Copycat sites can't publish
  tomorrow's answers.
- **For today's answers,** obfuscation stops casual spoilers in view-source or devtools. That's its whole job.
  Anyone who finishes sees the answers anyway, so a determined scraper only has to play once.
- **Why not hashing:** hashing would make the near-miss check impossible on the device (you can't fuzzy-match a
  hash). We'd need a server call per wrong guess, about 10 per player. At scale that's the most expensive line in
  §12, all to protect something every finisher gets shown.

## 6. System overview

```
weekly GitHub Action (public repo, counts-only logs)
  └─ builds + validates days  ──►  Upstash  curio:dig:day:<date>, manifest, extras
                                        ▲ reads (rare, cached)          ▲ HINCRBY / HGETALL
Vercel (curioword.com)                  │                               │
  /dig, /dig/past, /dig/<date>  ── ISR pages
  /api/dig/today     GET  ── CDN-cached until 00:00 UTC
  /api/dig/day/<d>   GET  ── past days only, CDN-cached for a year
  /api/dig/event     POST ── start / finish / share / story / claim counters
  /api/cron/dig-health  daily ── buffer + freshness checks, TTL housekeeping, Resend alert
browser
  └─ plays, scores, near-misses, share card (canvas), localStorage
```

## 7. Routes and files

**Pages**
- `app/dig/page.tsx`
  - The game shell plus a short intro that search engines can index.
  - Fetches `/api/dig/today` from the browser.
  - Uses `revalidate = 3600` for its server-rendered "Past digs" teaser.
- `app/dig/past/page.tsx`: the list of past days, with `revalidate = 3600`.
- `app/dig/[date]/page.tsx`
  - The **indexed archive page** for a finished day: the prompts, each fossil and fact, the core answers by tier,
    and story links.
  - Today or future dates give a 404, served with `revalidate = 3600` so a cached 404 heals.
  - These pages are the answer to the copycat "answers today" sites: ours are free, indexed and better.
- `app/dig/opengraph-image.tsx` and `app/dig/[date]/opengraph-image.tsx`: link-preview images (§10).

**API**
- `app/api/dig/today/route.ts`
  - Sends `Cache-Control: public, s-maxage=<seconds to 00:00 UTC>`.
  - If today's day is missing, it returns 503 with `no-store` and the health cron raises the alarm.
- `app/api/dig/day/[date]/route.ts`
  - **Only for dates before today.** Responses carry `s-maxage=31536000, immutable`.
  - Future dates give 404 with `no-store`, so they can never be cached.
- `app/api/dig/event/route.ts`
  - One POST endpoint with an allowlisted vocabulary, modelled on `/api/traffic` and `parseTrafficEvent`.
  - The same safeguards: a JSON-only body, `Sec-Fetch-Site: same-origin`, a silent 204 for bots, and writes only
    when `VERCEL_ENV === "production"`.
- `app/api/cron/dig-health/route.ts`: guarded by `CRON_SECRET`. A new entry in `vercel.json` runs it daily at 07:00
  UTC.

**Code**
- `lib/dig/`
  - `types.ts`
  - `normalize.ts` and `match.ts`, shared with the pipeline
  - `score.ts` (tiers, depth and the emoji row)
  - `obfuscate.ts`
  - `clock.ts` (day number and seconds to rollover)
  - `events.ts` (parsing the event vocabulary)
  - `store.ts` (key builders and server reads and writes)
  - `storage.ts` (localStorage)
- `components/dig/`
  - `DigGame` (the state machine)
  - `PromptScreen`, `Reveal`, `EndScreen`
  - `Strata` (SVG, shared by the page and the share card)
  - `ShareCard` (canvas)
  - It uses `components/ui` Button, TextField and SegmentedControl. No hand-rolled inputs.
- `scripts/dig/` (the pipeline, run with tsx) and `.github/workflows/dig-pipeline.yml`.

**Browser storage** (localStorage key `curio:dig`, version 1):
- `{ v: 1, settings: { noTimer }, games: { [date]: { answers, tiers, score, finishedAt, spread? } } }`
- It keeps the last 400 games and drops the oldest after that.
- There's no account sync in the MVP. Signed-in sync is a later addition, following the pattern
  `/api/play-state` already uses.

## 8. Server writes and Redis keys

All writes are production-only and use the `curio:dig:` prefix. Phase 6 adds `dig` to the allowed-prefix list in
`handover.md`.

| Key | Type | Written by | What | Expiry |
|---|---|---|---|---|
| `curio:dig:day:<date>` | string (JSON) | Action | The day file (§4) | none: the archive needs it |
| `curio:dig:manifest` | string (JSON) | Action | Dates built, the buffer and the last run | none |
| `curio:dig:extras` | string (JSON) | Action (adjudication) | Prompt id → extra accepted words | none |
| `curio:dig:adjudicated` | string (JSON) | Action (adjudication) | `prompt\|word` pairs already decided, so none is asked twice | none |
| `curio:dig:scores:<date>` | hash | `event: finish` | Score bucket (score ÷ 10, 0–70) → count | 35 d |
| `curio:dig:funnel:<date>` | hash | `event: *` | Funnel counters (§9) | 90 d |
| `curio:dig:rej:<date>:<prompt>` | hash | `event: finish` | Rejected guess → count | 35 d |
| `curio:dig:claim:<date>:<prompt>` | hash | `event: claim` | "This should count" → count | 35 d |
| `curio:dig:health:last` | string | health cron | Heartbeat the Action checks | none |
| `curio:dig:health:usage:<month>` | string | health cron | Highest usage alert sent this month (50 or 70) | 40 d |

**What the events do**
- **`finish`** is one request at the end of today's game. It carries the score, the seven tiers and at most 3
  rejected guesses per prompt.
  - The server writes these with **one pipelined round trip**: HINCRBY on the score bucket, HINCRBY on the funnel,
    HINCRBY for each rejected guess, and an **HGETALL of the score spread, which it returns** to the browser.
  - The end screen then shows "deeper than 72% of today's players". When there are fewer than 50 finishers, it
    shows "deeper than most" instead.
  - The browser stores the spread, so reloading the page doesn't ask again.
- **Rejection sampling.** The day file can carry `rejSample` (a value from 0 to 1). The pipeline lowers it when the
  previous week's finishes passed 1,000 a day. Rejection logging therefore stays at about 1,500 writes a day at any
  scale.
- **Expiry housekeeping.** HINCRBY doesn't set an expiry, and adding EXPIRE to every request would double the
  writes. Instead the daily health cron sets expiries on **yesterday's** keys, at about 20 commands a day.
- **Anti-abuse.**
  - Scores outside 0–700 or off the 5-point grid are dropped.
  - Requests are limited to one finish per browser per day (a localStorage flag), plus the same-origin and bot
    checks.
  - The percentile is a soft social cue, not a leaderboard, so this level of protection is enough. Vercel's
    firewall can rate-limit `/api/dig/event` later if anyone games it.

## 9. Funnel events and the kill line

Vercel Hobby can't read custom analytics events, so these are first-party counters in
`curio:dig:funnel:<date>`.

| Field | Fired when |
|---|---|
| `land:<source>` | First view of `/dig` in a session, with the source from `classifySource` |
| `start` | Start pressed on **today's** game |
| `finish` | Today's game finished |
| `share:text`, `share:image` | Share tapped (copy or native share sheet; image card) |
| `story` | First story link tapped in a game, at most once per game |
| `signup` | The daily-word form on the end screen submitted (`placement: "dig"` passed to `/api/subscribe`) |
| `past:start` | A past day started (reported separately, never in the percentile) |

**Daily players = `start` for that date.** The kill check is the median of daily `start` over days 22–28 after
launch. Below 20 means stop. `npm run traffic:report` and the admin page get a dig section showing land → start →
finish → share → story → signup.

**Share attribution.**
- The share text carries the bare `curioword.com/dig`, as decided. Chat apps strip the referrer, so share arrivals
  land as `land:direct`.
- Before launch, `/dig` has no other direct traffic. So `land:direct` minus a pre-launch baseline is our share
  proxy.
- This is approximate, and the report says so.

## 10. Sharing

**Share text** (spoiler-free, one emoji per stratum):

```
curio dig, day 14
4.6 m down
🌱🟫🟧🪨🦴🟫▫️
curioword.com/dig
```

The emoji map is the mockup's: Common/Popular 🌱, Familiar 🟫, Uncommon 🟧, Rare 🪨, Fossil 🦴, no answer ▫️.

**The player's share card is drawn in the browser.**
- It reuses the `Strata` drawing, without words, on a `<canvas>` at 1200×630 and 1080×1080.
- It's offered through the native share sheet as a file where the browser supports that, otherwise as a download.
- The cost is zero server time, it works offline, and there's no per-player image to cache.
- Canvas text uses Libre Caslon, loaded with `document.fonts.load()` before drawing.

**Link previews (next/og).** These cover `/dig`, which gets a generic card with no day details, and `/dig/<date>`,
which gets "curio dig, day N" with that day's seven prompts.

Both read **Libre Caslon Text Bold** as a TTF once at module scope:
- `readFile(join(process.cwd(), "assets/fonts/LibreCaslonText-Bold.ttf"))`, the pattern Next 16's docs give.
- `ImageResponse` accepts TTF, OTF and WOFF only, within a 500 KB bundle. The TTF is about 100–200 KB.
- The font is under the OFL. Its licence text ships next to it, and the attribution page gains a fonts line.
- Colours come from a new `ogDigTheme` with the target-brand hex values, since `next/og` can't read CSS variables
  (as `lib/ogTheme.ts` already explains).

## 11. Brand: scope and the rebrand gap

The target is a lowercase Libre Caslon Bold "curio", Ink `#1C1A17`, Paper `#F5F1E8`, and Red `#C23B22` for actions
only. The repo currently uses Newsreader as its serif, ink `#24302b` (a green-black), paper `#f1ece0` and an ochre
accent `#9c6b30`.

**Plan for the MVP:**
- **Scope the target brand to `/dig`.** `app/dig/layout.tsx` wraps the game in a `data-brand="next"` element that
  redefines the existing tokens (`--ink`, `--paper`, `--accent-button` and the rest) for its subtree, in both light
  and dark mode.
- **New tokens.** `--stratum-1` to `--stratum-5`, running from paper to ink and **never red**, added to the
  `@theme` block. Red appears only on the Start, Share and Subscribe buttons.
- **Shared components stay.** The site header and footer stay as they are, and body text stays in Work Sans.
- **Where the gap shows:** the header wordmark is still Newsreader, and the ink and paper shift slightly at the
  edge of the game area. The mockups suggest it's noticeable side by side but not jarring.
- **A full-site rebrand is its own project.** That means swapping the tokens, the wordmark and the OG images once,
  across 1,147 story pages, the digest and the social cards. It's best done as a separate branch after launch.
  This keeps the game's three-week budget intact.

## 12. Hosting economics

**Per player-day assumptions** (a mix of 30% new and 70% returning players):

| Resource | Per player-day | How it's used |
|---|---|---|
| CDN (edge) requests | ~8 | New players: HTML, ~8 scripts and styles, 2 fonts, the day file and 2 events (~15). Returning: HTML, the day file and 2 events (~5). Scripts are cached in the browser. |
| Data transfer | ~150 KB | 350 KB new, 60 KB returning |
| Function invocations | ~2.5 | start, finish, plus some share and story events. The day file is CDN-cached (about 20 a day in total). |
| Upstash commands | ~4.5 | start 1, finish 3, plus share and story. Rejections are capped by sampling at about 45k a month. |

**Monthly cost, game traffic only:**

| Daily players | Edge requests | Invocations | Upstash commands | Transfer | Plan and cost |
|---|---|---|---|---|---|
| 100 | 24k | 7.5k | ~32k | 0.5 GB | Hobby and Upstash free: **£0** |
| 10k | 2.4M (Hobby includes 1M) | 750k | ~1.4M | 45 GB | **Vercel Pro $20.** Upstash pay-as-you-go about $2. **≈ £17/month** |
| 100k | 24M (Pro includes 10M; $2 per extra 1M) | 7.5M ($0.60 per 1M) | ~13.5M | 450 GB | Pro $20 + edge $28 + invocations $4.5, partly covered by Pro's $20 credit. Upstash pay-as-you-go about $27, or a fixed plan from $10 (check whether its command limits fit). **≈ £40–65/month** |

These use USD at about £0.80 per $1 and prices as published on 2026-10-24.

**Thresholds and risks:**
- **Hobby's ceiling is about 3,000 daily players**, counting the existing site's own traffic. Edge requests run out
  first.
- **Pausing risk:** Vercel can pause a Hobby project that goes over its allotment. That would take the daily word
  and the email links down as well as the game. A viral spike is the main hosting risk, so the health cron also
  emails when the month's edge requests pass 70% (read from the Vercel usage API, if Hobby exposes it; otherwise
  Vercel's own usage notifications, which Sam turns on).
- **Hobby is for non-commercial use only.** Ads or paid features would require Pro regardless of traffic.
  Donations are allowed.
- **Upstash free tier (500k commands a month) is shared with the live site.** Above about 2,000 finishers a day,
  either move the game to its own Upstash database (one environment variable, see below) or switch to
  pay-as-you-go.
  - All dig code reads `DIG_REDIS_REST_URL` / `DIG_REDIS_REST_TOKEN`, falling back to the site's Upstash variables.
  - Splitting the game onto its own database is therefore a configuration change, not a code change.
- **GitHub Actions minutes are free for public repos.** The weekly 3 GB download is cached in the Actions cache,
  keyed by kaikki.org's `Last-Modified` header, so it's fetched again only when the dump changes.

## 13. Security and privacy

- **Public repo, public logs.** The Action prints counts only: never answers, prompts beyond today, or Redis
  values. It uploads no artifacts, because artifacts on a public repo can be downloaded by any GitHub user.
- **Secrets, by name only:**
  - GitHub: `DIG_REDIS_REST_URL`, `DIG_REDIS_REST_TOKEN` (production write).
  - Vercel: the existing Upstash variables plus `RESEND_API_KEY`, `CRON_SECRET` and `DIG_ALERT_TO`.
- **Never from local:** I never write to production Redis, send email, push to `master` or deploy from this
  machine. Local development of the dig routes uses a **fake day fixture** and in-memory stores. A test file
  stands in for Redis.
- **No personal data.** Events carry field names and counts only. Rejected guesses are words typed into a
  public game, stored without any identifier. The share text carries no ID.

## 14. Decisions for Sam at this gate (asked one at a time)

1. **Rollover time.**
   - Recommended: **00:00 UTC**, Curio's one clock, the same as the daily word.
   - The alternative is Krillion's 04:00 UTC, which is midnight on the US east coast. That would give the game a
     separate clock from the daily word it funnels to.
   - **Decided 2026-10-24: 00:00 UTC.**
2. **Brand scope.**
   - Recommended: **target brand inside `/dig` only** for the MVP, with the full-site rebrand as a separate project
     after launch.
   - The alternative is rebranding the whole site first, which adds roughly a week and a half before the game.
   - **Decided 2026-10-24: `/dig` only.** The full-site rebrand is a separate project after launch.
3. **Hobby → Pro trigger** (money, so it's yours).
   - Recommended: **pre-approve upgrading to Pro ($20 ≈ £16 a month) once edge requests pass 70% of Hobby's
     allotment for two days running.** That avoids a viral spike pausing the whole site.
   - The alternative is to decide when the alert arrives.
   - **Decided 2026-10-24: no pre-approval.** Sam decides when the alert arrives. To leave time to decide, the
     alert fires at **50% and again at 70%** of the month's edge-request allotment. It includes the date the
     current daily rate would hit 100%. The upgrade is Sam's to make in the Vercel dashboard.

## 15. What the MVP includes (for the Phase 5 plan)

**In (about 3 weeks at 5–10 hours a week):**
- The pipeline from `pipeline-design.md`, plus the supply fix.
- The game flow in §2 with the No timer setting.
- Matching and near-miss matching.
- The end screen with the percentile.
- Share text and the canvas card.
- The `/dig/<date>` archive pages and `/dig/past`.
- Funnel counters and the report section.
- The health cron.
- Link-preview images.
- Scoped brand tokens.

**Later, if the game passes the kill line:**
- Signed-in sync.
- Hint pages for "answers today" searches.
- A score-spread curve rather than a single line.
- Per-answer crowd counts.
- Confirmed-signup attribution by placement.
- The full-site rebrand.
