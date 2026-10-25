# Curio: Handover

Last updated: 2026-10-18. Read this first; it's deliberately short. Open a file in `docs/handover/` only when the
task touches that area. **Keep this file under ~200 lines:** current state, gotchas and pointers only. Put session
detail in `docs/handover/history.md` and depth in the topic files.

## What this is
A daily word-etymology app: one word a day and its origin story, an optional email digest, magic-link accounts with
synced favourites, a Collection (favourites) and a History (archive), a daily puzzle (`/play`), and automated posts to
Bluesky, Threads and Instagram. Positioning: **"one word, one story, every day: no feed, no
backlog to catch up on."** The product principle **archive, never backlog** is in `AGENTS.md` (always loaded). Test
every feature against it.

## Essentials
- **Live:** https://curioword.com. `www.` and `etymology-app-orcin.vercel.app` redirect there with a 308.
- **Vercel project:** `etymology-app` (*not* `-orcin`). **Pushing `master` deploys to production.**
- **GitHub:** `SamxJames/curio-web` (public). `master` is the only long-lived branch.
- **Stack:** Next.js 16 (App Router, Turbopack; read `AGENTS.md`, this isn't the Next.js you know), React 19,
  TypeScript, Tailwind v4, Vitest, Upstash Redis, Resend, Auth.js v5 beta with the Upstash adapter.
- **Commands:** `npm ci` · `npm run dev` · `npm run lint` · `npx vitest run` · `npm run build`.
  Reports: `npm run traffic:report -- 7`, `npm run demand:report`. Previews: `npm run social:preview -- 7`, `bluesky:preview`.
- **Env:** `.env.local` (ask Sam, or `vercel env pull`). The full list and why each matters: `docs/handover/operations.md`.
- **Crons (UTC, Hobby fires anywhere in the hour):** 09:00 digest + Bluesky (`/api/cron/send-daily`), 10:00 Threads/IG
  (`/api/cron/social`). Mondays 06:00: demand report (GitHub Action → private `SamxJames/curio-reports`).

## Current state (2026-10-18)
- **curio dig (2026-10-25, branch `worktree-rarity-game`, not merged or deployed):** the daily word game at `/dig`.
  Built and reviewed. Content supply is the constraint, and Sam loosened the floors and repeat waits on 2026-10-24.
  Everything is in `docs/handover/dig.md`, including the launch checklist (GitHub secrets, `DIG_ALERT_TO`, `DIG_LAUNCH_DATE`).
- **Shipped 2026-10-18 (merge 3438c64 + eb742d0):** puzzle clue rewrite. 202 of 1,147 words have new clues (clue 1 = what
  the word is + a history fact, clue 2 = modern meaning, clue 3 = nearly a giveaway); the other 945 still have the old
  history-only clues. Pipeline: `npm run clues:rewrite` then `npm run clues:apply -- --keep-today` (plan:
  `docs/superpowers/plans/2026-10-13-clue-rewrite.md`, task 5 "full run" not done). Guesses accept UK/US spellings.
  Also 2026-10-14 (a63d9a0): sharing is the primary action on the finished-puzzle screen (experiment: puzzle share taps).
- **Shipped 2026-10-13/14 (merge 4a0e473, deployed, 7/7 live checks pass):** `/feed.xml` RSS (last 30 days, also a 2nd
  sitemap in robots.txt, `utm_source=rss` traffic source); story meta descriptions "Etymology of <word>: ..." (og stays the
  teaser); canonicals on /play, /history, /attribution; footer Languages link; hand-set sitemap lastmod (`PAGES_UPDATED` in
  `lib/seoRoutes.ts`); IndexNow ping from the 09:00 send-daily cron (`lib/indexNow.ts`; Bing/Yandex etc., not Google).
  Plan: `docs/superpowers/plans/2026-10-13-indexnow-feed-seo-fixes.md`. First IndexNow run is unverified (see Open threads).
- Language panel has **87 approved sheets** (Classical Persian held back). Story titles name the source language. Signing in
  returns you to the page you were on. Pipeline: `docs/handover/language-panel.md`.
- **Language pages live** (2026-10-12): `/language/{slug}` for every approved sheet with >=3 words (61), `/languages`
  index, story lineage links, sitemap 1,210. Module `lib/languages/pages.ts`; view `components/LanguagePanelView.tsx`.
- Homepage has WebSite + Organization JSON-LD and a canonical (`buildSiteJsonLd` in `lib/storyJsonLd.ts`).
- Threads + Instagram ON since 2026-10-11 (Meta app "Curio Poster", @curio.word.daily); 10:00 UTC cron.
- GSC daily impressions fell ~1,300 (09-30) to ~300 (10-09); watch it in the Monday demand report.
- Double opt-in and the 200/day confirmation cap are live. Weekly check-in state: `../checkins/state.md`.
- Vercel: the MCP connector sees the team but not its projects; the **Vercel CLI** (logged in) works, including Web
  Analytics: `vercel api "/v1/query/web-analytics/visits/count?projectId=etymology-app&teamId=<team>&since=..&until=.."`.
- Stale branch `brand-assets` (local + origin) has no commits beyond master; safe to delete.

## Gotchas (each one has bitten before)
- `vercel link --project <name>` **silently creates a new empty project** if the name is wrong. Run `vercel project ls` first.
- **Local dev uses production's Upstash.** Local testing writes real data. Locks, traffic counters and Meta tokens only
  touch Redis when `VERCEL_ENV === "production"`.
- `CURIO_SITE_URL` is baked in at **build** time (1,147 static story pages, sitemap, JSON-LD). If it's missing, localhost ships everywhere.
- `CRON_SECRET` and `UNSUBSCRIBE_SECRET` fail closed in production. **Never rotate `UNSUBSCRIBE_SECRET`**: that breaks
  every unsubscribe and confirm link already sent. `.env.local`'s `CRON_SECRET` ≠ production's.
- Manual `?repost=` / `?force=1` runs post **today's UTC word** and post every time. Sam is UTC+1, so late-evening runs cross days.
- Word of the day = `WORDS[daysSinceStart % length]`, **locked in Redis on first view**. App code must use
  `resolveTodayWord`/`resolveHistory*`, never raw `getWordForDate`. Reorder only positions after today's index.
- Client components may only `import type` from `lib/words.ts` (the value is ~13k lines), or from any module that
  imports its values (`lib/puzzle.ts`: client code uses `lib/puzzleGuess.ts`). Same rule for
  `lib/languages/data.ts`: the panel loads it with `next/dynamic`. Never hand-edit `data.ts`/`sheetIndex.ts`.
- Redis keys must use an existing prefix: `curio:subscriber|hour|auth|user|wordoftheday|digest|social|traffic|confirm|dig*`.
- Auth.js's default session has **no `user.id`**; `lib/auth.ts` adds it. `useShowArrival` must check resolved
  `"unauthenticated"`, not `!== "authenticated"`.
- `:focus-visible` must use **longhand** outline properties (Lightning CSS drops `var()` in the shorthand). Verify with real Tab presses.
- Cloudflare DNS records for Vercel/Resend must be **grey-cloud (DNS only)**.
- Meta logging: never log raw fetch errors or Upstash error messages (they can contain tokens). See `architecture.md` → `lib/metaGraph.ts`.
- Clean up after verifying: stop dev servers, `rm -rf .next`, remove merged worktrees (they confuse lint/vitest).
- vitest and eslint skip `.claude/**` (worktrees), so the main checkout's suite no longer sweeps them.
- No Python on this machine; write scripts in Node/tsx.

## Decisions in force (full reasoning: `docs/handover/decisions.md`)
- **One shared daily word for everyone** (2026-09-26). Revisit ~4 weeks after F&F launch.
- Launch schedule: hand-picked openers, then a stable shuffle (`LAUNCH_OPENERS` in `lib/words.ts`); no A–Z march.
- Collection = favourites only; History = the archive, not in the nav (2026-10-04).
- Themed pages = language pages only (2026-10-12); topic themes would need tagging 1,147 words.
- Threads/IG tokens are the on/off switch. Bluesky format: teaser · word + lineage · hashtags, link in a card.
- No retroactive history backfill, ever.
- Sitemap lastmod is hand-set per page type, never a build timestamp (2026-10-13).
- The demand report lives in a private repo and public Actions logs print counts only.

## Open threads
- **2026-10-15:** verify the first IndexNow run in Vercel logs: look for `[curio:indexnow] 2026-10-15: submitted ~1214 URLs (HTTP 200|202)`.
- Clue rewrite for the remaining 945 words (`clues:rewrite`, review sample + `tooHard`, `clues:apply -- --keep-today`).
  Revisit the clue rules if synced plays show most solves on clue 1 or failures above ~20%.
- Watch GSC for the feed and language pages. Next language-sheet batch: `languages:facts -- --limit 30`, draft, review,
  approve (Proto-West Germanic still has no usable source).
- Submit remaining launch-kit entries; "root word" phrasing in titles.
- Small UX: "clue progression (clue 1 hardest)" is unclear, since clues already run hardest-first; ask Sam what was meant.
- Parked with reasons: `docs/handover/parked.md`.

## Waiting on Sam
- Add curioword.com to Bluesky/Threads/IG bios · submit remaining
  launch-kit entries · tighten `_dmarc` to `quarantine` later ·
  `REPORTS_REPO_TOKEN` expires ~2027-10-04.

## Doc map
| File | Open it when... |
|---|---|
| `docs/handover/operations.md` | env vars, deploying, DNS/domain, manual digest/social re-sends, Meta setup |
| `docs/handover/architecture.md` | touching any `lib/`/`app/` module, the word bank or the content pipeline, auth |
| `docs/handover/growth.md` | double opt-in, traffic attribution, demand report |
| `docs/handover/language-panel.md` | language sheets and their pipeline |
| `docs/handover/dig.md` | curio dig (the daily word game): code map, Redis keys, env vars, launch checklist, kill line |
| `docs/handover/decisions.md` | before changing product behaviour |
| `docs/handover/parked.md` | before "fixing" something that looks wrong |
| `docs/handover/history.md` | archaeology only |
| `docs/design-system.md` | any UI work (also referenced from `AGENTS.md`) |
| `docs/superpowers/plans/`, `specs/` | the plan behind a past feature |

## Working conventions
- Multi-file features: superpowers brainstorming → writing-plans (`docs/superpowers/plans/YYYY-MM-DD-*.md`) →
  subagent-driven-development in a worktree → requesting-code-review → finishing-a-development-branch. Small tweaks:
  just do them directly.
- Verify against real behaviour (clean `npm ci`, a real browser, production after deploy), not just code review.
- At the end of a session, update **Current state / Open threads** here (replace, don't append) and add a dated entry to
  `docs/handover/history.md`.
