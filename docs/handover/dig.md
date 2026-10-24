# Curio: curio dig (the daily word game)

> Written 2026-10-24 at the end of the Phase 6 build. Design: `docs/rarity-game/architecture.md` (its two "Changes made" lists override the sections below them). How days are made: `docs/rarity-game/pipeline-design.md`. Plan: `docs/superpowers/plans/2026-10-24-dig-game.md`.

## What it is

A daily word game at `curioword.com/dig`, written "curio dig" in lowercase. Seven prompts a day ("a fruit", "a word English took from Arabic"). The player names a word that fits. Common words land in the topsoil; rarer ones dig deeper, and each prompt hides one fossil in the bedrock. The score becomes a depth in metres, and from 50 finishers the end screen shows a percentile. Free, no login, the same dig for everyone, a new one at midnight UTC. "No timer" is a setting. Past days are playable at `/dig/<date>/play`.

It does not touch the daily word. It does not push unread-ness: no counts of unplayed days, no streaks (see the product principle in `AGENTS.md`).

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
| `DIG_REDIS_REST_URL`, `DIG_REDIS_REST_TOKEN` | GitHub Actions secrets (always); Vercel (only for a separate database) | The pipeline reads only these two. On Vercel they are optional: without them the site uses its normal `UPSTASH_REDIS_REST_*` client. |
| `DIG_SEED_SALT` | GitHub Actions secret | Secret seed for the daily draw. Required (16+ characters) with `--publish`; local runs use a fixed dev string. |
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
| `curio:dig:funnel:<date>` | hash | Events | Funnel counters (`land:<source>`, `start`, `finish`, `share:*`, `story`, `signup`, `past:start`) | 90 d (same) |
| `curio:dig:rej:<date>:<0-6>` | hash | `finish` event | Rejected guess (normalised) to count | 35 d (same) |
| `curio:dig:claim:<date>:<0-6>` | hash | `claim` event | "This should count" guess to count | 35 d (same) |
| `curio:dig:health:last` | string | Health cron | Heartbeat (ISO time) the pipeline checks | none |
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

## The kill line

The median of daily `start` over days 22 to 28 after launch. **Below 20 means stop.** Daily players are the `start` count for that date.

Read it on the admin page, in the "curio dig" section (funnel table and kill-line row). It appears once all seven window days have passed, and a day with no events counts as 0 starts.
