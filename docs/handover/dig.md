# Curio: curio dig (the daily word game)

> **STATUS: LIVE and public since 2026-11-07 (dig #1).** Verified in production 2026-11-12: `/api/dig/today` returned 200 for 2026-11-12 as dig #6, and `/api/dig/event` answered 400 to a bad event (closed would be 404). Real players' guesses are already being recorded. Re-check any time with `https://curioword.com/api/dig/today`: 200 plus a `number` means live; 404 means closed. The "Launch sequence" and "Post-deploy checklist" below are the original pre-launch plan, kept for reference; they do not describe the current state.

> Written 2026-10-24 at the end of the Phase 6 build. Design: `docs/rarity-game/architecture.md` (its two "Changes made" lists override the sections below them). How days are made: `docs/rarity-game/pipeline-design.md`. Plan: `docs/superpowers/plans/2026-10-24-dig-game.md`.

## What it is

A daily word game at `curioword.com/dig`, written "curio dig" in lowercase. Seven prompts a day ("a fruit", "a word English took from Arabic"). The player names a word that fits. Common words land in the topsoil; rarer ones dig deeper, and each prompt hides one fossil in the bedrock. The score becomes a depth in metres, and from 100 finishers today's end screen shows "Deeper than N% of today's diggers" (past days never do). Free, no login, one new dig a day at midnight UTC. "No timer" is a setting. Past days are playable at `/dig/<date>/play`.

It does not touch the daily word. It does not push unread-ness: no counts of unplayed days, no streaks (see the product principle in `AGENTS.md`).

## Content supply (the main constraint)

There is less content than the spec expected. The Phase 6 re-measure found about 126 theme prompts in 65 families, and 22 origins. On 2026-10-24 Sam loosened the rules to fit (`pipeline-design.md` §3a):
- Themes need 30 answers and 5 easy ones.
- Origins need 5 easy ones.
- An exact theme prompt can return after 14 days, a theme family after 5, an origin language after 4. Origins have no exact-prompt rule: an origin can return as soon as its languages are out of their 4-day window.

The numbers live in one place each: `floorFor` in `scripts/dig/answers.ts` and `COOLDOWNS` in `scripts/dig/assemble.ts`. To grow supply, add `anchorOverrides` or `wikidataThemes` in `content/dig/catalogue.json`. A supply simulation is now in the repo: `scripts/dig/audit/supply.ts` (see "Word lists" below).

A local dry run on 2026-10-25 (`npm run dig:build -- --data <data dir> --out .dig-out --days 45`, which writes files and never touches Redis) built all 45 days with none failing. It left 35 themes and 15 origins spare and used 129 different prompts. A cold run spends about 10 minutes loading data, then takes about a minute per day once the pageview cache is warm. The cache is kept between Actions runs.

## Word lists: which answers count (2026-11-14)

Full story, numbers and how to re-run: `docs/dig-word-audit.md`. In short, an audit found 29% of answers a typical player would try were refused; after these fixes it is about 11% on the audit's guesses and 23% on a hold-out set.

How a list is made now: Wiktionary category words plus WordNet's "kind of" tree, as before, then `finishCandidate` (`scripts/dig/answers.ts`) applies the hand-kept lists in `content/dig/catalogue.json`:

| List | Use it when |
|---|---|
| `extraAnswers` | A plainly right answer is refused and no source has it ("gun" for firearms). Keyed by base prompt id. |
| `extraCategories` | A whole Wiktionary sub-category belongs to a theme ("Blacks" for Colors). Keyed by the theme's category name. |
| `excludeAnswers` | A wrong word is accepted ("more" as a vegetable). Keyed by base prompt id, or `*`. |
| `hiddenAnswers` | A word should count but never be shown or be the fossil. Keyed by base prompt id, or `*`. |
| `fillerWords` | A very common word should never be an accepted-only answer anywhere ("to"). |
| `jargonCategories` | A category holds the vocabulary of a thing, not kinds of it ("Poker"). |
| `originVariants` | A dialect label should count as a language ("Neapolitan" for Italian). |

There is no stray-sense filter any more (it refused "tulip" and "sad"): strays are named in `excludeAnswers`. The twice-weekly repair step applies list changes to days already built: it adds words to every day but today, and on unplayed days removes excluded words and hides hidden ones. It never changes a fossil or a tier. Adjudication never votes an excluded word back in.

When a player reports a refused or wrong word, the fix is usually one line in the catalogue. `scripts/dig/catalogue.test.ts` checks the file's shape. To try a change locally: `npm run dig:build -- --data <dir> --catalogue <draft file>` (refused with `--publish`).

Known limits: day files are bigger (about 17% of draws now exceed the size limit and are redrawn); "___ word" prompts (art, weather, sports…) were left alone and still refuse about a third of fair guesses; the pool runs out of fossils in roughly four to five months (`docs/dig-word-audit.md`, "Supply runway").

## Where the code lives

| Path | What |
|---|---|
| `lib/dig/` | Shared logic. Client-safe (no Node built-ins): `game.ts`, `match.ts`, `normalize.ts`, `score.ts`, `payload.ts`, `strata.ts`, `share.ts`, `storage.ts`, `client.ts`. Server only: `server.ts` (all Redis access), `keys.ts`, `health.ts`, `clock.ts`, `events.ts`, `funnel.ts`. |
| `components/dig/` | The game UI: intro, prompt, reveal, end screen, strata drawing, past list, share image. |
| `app/dig/` | Pages: `/dig`, `/dig/past`, `/dig/<date>` (indexed archive, shows answers), `/dig/<date>/play` (noindex), plus link-preview images. Wrapped in the scoped brand (`docs/design-system.md` §5). |
| `app/api/dig/` | `today`, `day/<date>` (day files, answers obfuscated) and `event` (funnel, finish and claim writes). |
| `app/api/cron/dig-health/` | Daily health cron, 07:00 UTC (`vercel.json`). |
| `scripts/dig/` | The offline pipeline (Node). Builds, validates and stores days; adjudication of rejected guesses on every pipeline run (Mon and Thu). |
| `.github/workflows/dig-pipeline.yml` | Runs the pipeline Mon and Thu 04:00 UTC, or by hand (`workflow_dispatch`, master only). Failure emails Sam from GitHub. |
| `components/AdminDashboard.tsx` | The "curio dig" section of the admin page: funnel and kill line. |

Locally, with no `VERCEL_ENV`, the game reads days from `.dig-out/days/` (or `DIG_LOCAL_DIR`) and falls back to a fake day (`lib/dig/devDay.ts`). Local runs never read or write production Redis. Preview deployments read Redis but never write.

## Env vars (names only)

| Name | Where | What |
|---|---|---|
| `DIG_LAUNCH_DATE` | Vercel | `YYYY-MM-DD` of day 1. Unset means `/dig` and `/api/dig/*` return 404 in production. Setting it needs a redeploy. |
| `DIG_ALERT_TO` | Vercel | Where the health cron emails problems. Must be set, or a problem day only shows as a 500 in Vercel logs. |
| `DIG_REDIS_REST_URL`, `DIG_REDIS_REST_TOKEN` | GitHub Actions secrets (always); Vercel (only for a separate database) | The pipeline reads only these two. On Vercel they are optional: without them the site uses its normal `UPSTASH_REDIS_REST_*` client. Both sides must point at the same database: the pipeline fails if it can't see the health cron's heartbeat. |
| `DIG_SEED_SALT` | GitHub Actions secret | Secret seed for the daily draw. Required (16+ characters) with `--publish`; local runs use a fixed dev string. |
| `ANTHROPIC_API_KEY` | GitHub Actions secret (optional) | Turns on the blind AI review of refused guesses (shadow mode, see "Guess review"). Absent means the step is skipped and nothing else changes. |
| `DIG_LOCAL_DIR` | Local only | Folder of pipeline output for local dev. Default `.dig-out`. |

## Redis keys

All under `curio:dig:`. Written only in production. Days are never re-drawn or re-tiered once built; adjudication may add accepted-only answers.

| Key | Type | Written by | What | Expiry |
|---|---|---|---|---|
| `curio:dig:day:<date>` | JSON | Pipeline | The day file | none |
| `curio:dig:manifest` | JSON | Pipeline | Built dates, prompts, pool sizes, `lastRun` | none |
| `curio:dig:extras` | JSON | Pipeline (adjudication) | Prompt id to extra accepted-only words | none |
| `curio:dig:adjudicated` | JSON | Pipeline | `promptId|word` marks mapped to the date judged (marks older than 40 days are dropped) | none |
| `curio:dig:scores:<date>` | hash | `finish` event | Score bucket (score ÷ 10) to count | 35 d (set by the cron the day after) |
| `curio:dig:funnel:<date>` | hash | Events | Funnel counters (`land:<source>`, `start`, `start:ret:d1|d2_6|d7`, `finish`, `fossil`, `share:*`, `story`, `signup`, `past:start`, `row:play|past`, `timer:switch`) | 90 d (same) |
| `curio:dig:rej:<date>:<0-6>` | hash | `miss` event (one per new wrong guess, as it happens) | Rejected guess (normalised) to count | 35 d (same) |
| `curio:dig:verdicts` | JSON | Pipeline (review) | `promptId|guess` to our reason plus the blind reviewer's verdict (`lib/dig/verdicts.ts`); read by the admin page. Entries older than 40 days dropped, capped at 2,000 | none |
| `curio:dig:claim:<date>:<0-6>` | hash | `claim` event | "This should count" guess to count | 35 d (same) |
| `curio:dig:health:last` | string | Health cron | Heartbeat (ISO time) the pipeline checks | none |
| `curio:dig:rate:<hash>:m<minute>` / `:d<date>:<kind>` | string | `event` route | Per-sender event counters for the rate limit (`RATE_LIMITS` in `lib/dig/events.ts`: 30 events a minute, 5 finishes, 20 claims and 120 misses a day). `<hash>` is 16 hex of sha256(address + day), never the address | 120 s / 2 d |
| `curio:dig:health:usage:<yyyy-mm>` | string | Health cron | Highest usage alert already sent this month (50 or 70) | 40 d |

Expiries are set by the health cron on yesterday's keys, because `HINCRBY` sets none. If the cron stops, those hashes live forever until it runs again.

## Launch sequence

1. Merge to master. `/dig` stays a 404 because `DIG_LAUNCH_DATE` is unset.
2. Add the GitHub secrets, then run the "Dig pipeline" Action by hand to fill the buffer (45 days).
3. Set `DIG_ALERT_TO` in Vercel. Redeploy if it was added after the last deploy.
4. Hit `/api/cron/dig-health` (with the cron secret) until it returns `{problems: 0}`.
5. Sam sets `DIG_LAUNCH_DATE` and redeploys.
6. The release-manager runs the post-deploy checklist below. The dig is not called live until it passes.

## Post-deploy checklist (release-manager)

1. With `DIG_LAUNCH_DATE` unset: `/dig` and `/api/dig/today` return 404.
2. After the buffer is filled and the variable is set (and redeployed):
   - the health cron returns `{problems: 0}`;
   - the heartbeat key `curio:dig:health:last` exists;
   - one real `start` event (play the first prompt in a browser) increments that day's `curio:dig:funnel:<date>` hash.
3. `/dig/<a past date>/opengraph-image` returns 200 in production. This proves the Libre Caslon font file is traced into the function (it is read with `readFile(process.cwd())`, which nothing tests locally).
4. Only then say it is live.

## Launch notes

- Env vars apply on deploy. Setting it needs a redeploy, which also clears any cached `/dig` 404.
- A `DIG_LAUNCH_DATE` set in the future bakes a 404 into the cached page. It heals within about an hour of the date.
- Yesterday's URLs can 404 for up to about 1 hour after midnight UTC. Nothing links to them before then.
- The sitemap revalidates hourly (`revalidate = 3600`, amendment C10 was applied), so new archive URLs appear within the hour with no deploy.
- `/dig/past` is built statically and fails the build loudly if Upstash blips. Retry the deploy.

## Operating notes

- **Fossil facts are filtered where they are shown** (`lib/dig/fact.ts`). A Curio story teaser always shows. A sourced Wiktionary fact that is dictionary notation (list markers, brackets, a cut-off ending, non-Latin script, under 40 characters) is hidden and the screen links to its Wiktionary etymology instead. Days already built keep their raw facts in Redis; only the display changed (2026-11-07).
- **A refresh resumes an unfinished dig** from localStorage `curio:dig:run` (`SavedRun` in `lib/dig/game.ts`): a revealed prompt comes back revealed, an unanswered one restarts with a fresh clock. `start` is sent only from the intro, so it counts once per run.

- **`DIG_ALERT_TO` must be set.** The health cron emails it once a day when something is wrong (today's or tomorrow's day missing, fewer than 14 days built ahead, the pipeline's last run more than 9 days ago, or edge usage at 50% or 70%).
- **The usage figure is an estimate.** Vercel Hobby has no usage API, so the cron estimates edge requests: 8 per player-day and 6 per site visit. The 6 is unsourced. Recalibrate both against Vercel's usage page in launch week. Vercel's own usage emails are the real backstop.
- **A failed finish is not retried.** If the finish request fails, the result stays on the player's device but gets no percentile. A few lost finishes is accepted.
- **Cron limit.** Vercel Hobby allows 100 cron jobs per project, at most daily each (checked on vercel.com/docs/cron-jobs/usage-and-pricing), so the third daily cron is fine.
- **The pipeline never uploads artifacts.** They would expose future answers in a public repo. Its logs print counts only.
- **Public repo.** Never put answer words or story slugs in logs or error messages.

## Sam's manual checklist (names only)

1. GitHub repo secrets `DIG_REDIS_REST_URL`, `DIG_REDIS_REST_TOKEN` and `DIG_SEED_SALT` (a random string of at least 16 characters; it seeds the daily draw so the public code can't recompute future days; keep it, because changing it changes every day built afterwards). The workflow reads no other secret and the build stops without them. To use the site's existing database, copy the values of the site's `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` into them. To use a separate database, also set `DIG_REDIS_REST_URL` and `DIG_REDIS_REST_TOKEN` in Vercel.
2. Vercel env `DIG_ALERT_TO` (an address you read daily).
3. Run the "Dig pipeline" Action by hand and check it goes green.
4. At launch: set `DIG_LAUNCH_DATE` in Vercel, then redeploy.
5. Turn on Vercel usage notifications (Hobby emails you as you approach limits).
6. Launch week: compare the health cron's edge-request estimate with Vercel's usage page.

## Retention release 1 (2026-11-07)

Five changes, all inside the dig scope. Spec `docs/superpowers/specs/2026-11-07-dig-retention-design.md`, plan `docs/superpowers/plans/2026-11-07-dig-retention.md`.

- **Return counter.** A `start` from a device that finished a dig on an earlier UTC day also bumps `start:ret:d1` (finished yesterday), `start:ret:d2_6` or `start:ret:d7` (7+ days ago). The device flag is in `lib/dig/client.ts` (`returningBucket`); nothing new is saved in `lib/dig/storage.ts` and `DigStore.v` stays 1. The admin dig table has a Return % column and the kill line row judges returners.
- **Strata strip and reveals.** A compact strata strip above the prompt and reveal screens grows one marker per answer (`lib/dig/strip.ts`, `Strata compact`), reveal lines vary by layer (`lib/dig/revealCopy.ts`), one fact per reveal, and a fossil hit is its own moment. Motion tokens are in `app/globals.css` and respect `prefers-reduced-motion`.
- **Postcard end screen.** Depth first, then the drawing, Share (the only red button) and Save image, then a come-back row: tomorrow's hint (`lib/dig/tomorrow.ts`, from tomorrow's first prompt, today only), the `/play` and Past digs links (`row:play|past` events), the email offer, and two closed disclosures.
- **Dig line in the digest and social posts.** One line, "Today's dig starts with ...", from `prompts[0].text` only (`lib/dig/digLineText.ts` pure, `lib/dig/digLine.ts` server lookup). It is in the 09:00 UTC digest, Bluesky, Threads and the Instagram caption, tagged `utm_source` email|bluesky|threads|instagram so the existing `land:<source>` field credits arrivals. It never blocks a send: a failed lookup means no line.
- **Play-screen cleanup.** The intro explains the game (the always-on "How it works" is gone; the noscript fallback keeps it), a timer switch works mid-game (`timer:switch`), and Pass needs a second tap.

**Copy audit.** The banned-word list lives only in `lib/dig/copyAudit.ts`. `lib/dig/copyAudit.test.tsx` renders every player-facing surface (intro, prompts, reveals for every tier and variant, postcard today and past, strata, digest, share text, share image, OG images, page metadata, social posts) against it. The share image and OG image words come from pure helpers (`shareImageLines`, `lib/dig/ogText.ts`) so the audit can read them. Add any new player-facing string to that test.

### Reading the baseline

- Read the returning-start share (returning starts divided by starts) daily from day 2. Review it at day 7 and day 14. Target: at least 30% over days 8 to 14, and a floor on the absolute number of returning starters (the share alone can look good on a handful of starts).
- It undercounts. Safari clears script-written storage after 7 days without a visit, and private windows lose it. Do not read the `d7` bucket as retention: the device flag cannot tell a lapsed player from an evicted store.
- The release check (task A5) wrote one fake returning start to production. It is excluded from the baseline. Record its day and bucket here when it is run: ______ (not yet recorded; the A5 check had not been run when this was written).
- UTC rollover: a page loaded before 00:00 UTC and started after it gets a 400 from the event route, so that start is lost. Existing behaviour, unchanged.
- Guardrail (spec): no random or surprise rewards that carry across days or are tied to coming back. The dig stays a pull, never a push (`AGENTS.md`).

## The kill line

**Replaced 2026-11-07 (read 2026-12-04):** >=200 first-time finishers, day-7 return >=15%, share/challenge >=15%. Under 200 = launch failed, re-launch; low return = Curio on autopilot, build Same Brain. Cohorts are in `/admin` "Dig cohorts" (`curio:dig:cohort:<first>`, `COHORT_START` 2026-11-08). The older returning-starts rule below is superseded.

Judged on returners (Sam's decision, 2026-11-07). Read at day 28 (2026-12-04 for a 2026-11-07 launch): **stop if the median daily returning starts over days 22 to 28 is under 5.** A returning start is a `start` from a device that finished a dig on an earlier UTC day (the `start:ret:d1|d2_6|d7` funnel fields). The returning share of starts is shown next to it (target 30% or more); it informs the decision but does not trigger it alone. This replaces the old rule (median daily `start` under 20).

Small sample: with about 25 visitors a day, read the trend, not one day. Returning undercounts (Safari clears storage after 7 days, private windows), so read it from day 2.

Read it on the admin page, in the "curio dig" section (funnel table and kill-line row, plus a Return % column per day). It appears once all seven window days have passed, and a day with no events counts as 0 returning starts.


## Pre-launch release (2026-11-12)

New fields in `curio:dig:funnel:<date>` (counts start 2026-11-12): `shared:once`, `shared:new`, `shared:new:sheet`, `shared:third`, `start:vs`, `finish:vs`, `finish:vs:new`, `reached:4`, `reached:4:new`.
Admin cohort columns: Shared, Shared by sheet, From challenge, Reached prompt 4, 3rd-day sharers (by share date).
12-04 gate share rate = Shared ÷ New finishers. Shared already includes challenge sends; Shared by sheet is the stricter number.
Launch kit: `docs/launch/2026-11-dig-launch.md` (pre-flight Sun 11-15, r/SideProject 11-17, r/DailyWordGames 11-19, Show HN Tue 11-24, retry 12-01).

## Guess review (2026-11-12, shadow mode, DEPLOYED 21:20 UTC, reviewer awaiting credit)

**Reviewer status (2026-11-13): blocked on credit.** Dig pipeline runs 43313041176 and 43474499665 built fine but every reviewer call failed with HTTP 400; d1c5a12 labels refusals by status plus Anthropic's error type, and the second run logged `18 calls failed (400:credit x18)`: the workspace behind `ANTHROPIC_API_KEY` has no credit. Fix: add credit in the Anthropic Console, then run the "Dig pipeline" Action by hand (no code change). Expect the log line `Review (shadow): N refused guesses, M newly reviewed, K the reviewer would accept, 0 calls failed` and rows in the admin table. Failure labels: `<status>:credit`, `<status>:<error_type>`, `network` (twice), `response` (unusable reply). Words never appear in logs. 49 refused guesses were waiting as of 11-13. Also fixed by the 11-12 content work: the 12:30 UTC scheduled run had failed with `1 dates could not be built`; later runs build clean.

Pushed to master as 543deee at 21:19 UTC; production served the new server about a minute later. Verified in production: a valid `miss` event returns 204, and a bad guess, a bad prompt and a wrong day each return 400; the client chunk that sends `miss` is served; `/dig` and `/api/dig/today` are fine. One junk test guess (`deploycheckxq`, prompt 6, 2026-11-12) sits in `curio:dig:rej:2026-11-12:6`; it is typed once and not a word, so the reviewer logs it without asking. **Not yet verified:** the admin table (needs Sam's sign-in; expect "No reviews yet.") and a real wrong guess played in a browser on production. **The reviewer is OFF until the `ANTHROPIC_API_KEY` GitHub secret is added**; the next Mon or Thu pipeline run then records the first verdicts.

Wrong guesses now go out as they are made (`miss` event, `newMisses` in `lib/dig/client.ts`), not on `finish`, so a player who walks away mid-dig still counts. `finish` carries an empty `rejected` list (the server still accepts old clients' lists). The day's `rejSample` coin is flipped once per dig. Same-key spellings and a refresh mid-dig are not double-counted.
After adjudication, `scripts/dig/review.ts` sends each refused real word (most typed first, 20 a prompt, 60 calls a run, claude-haiku-5-5) to a reviewer that sees only the prompt text and the word, never our verdict or sources. Our reason (`not-a-word`, `blocked`, `unusable`, `not-in-sources`) and its verdict go in `curio:dig:verdicts`. Blocked words and single-typed non-words are logged without asking. **Nothing here changes an answer list.** The admin page ("Refused guesses, reviewed blind") lists the words it would accept, most confident first.
Public logs: the run prints counts only (`Review (shadow): …`). Words appear only on the admin page.
Next (not built): auto-accept. It would let a confident reviewer "yes" replace the "must be in a source list" rule in `adjudicate.ts`, keeping the lexicon, blocklist, `usable` and cap checks. Turn it on only after reading a week or two of admin verdicts and agreeing the reviewer is right.
