# Curio: Handover

Last updated: 2026-10-05. Read this first; it's deliberately short. Open a file in `docs/handover/` only when the
task touches that area. **Keep this file under ~200 lines:** current state, gotchas and pointers only. Put session
detail in `docs/handover/history.md` and depth in the topic files.

## What this is
A daily word-etymology app: one word a day and its origin story, an optional email digest, magic-link accounts with
synced favourites, a Collection (favourites) and a History (archive), a daily puzzle (`/play`), and automated posts to
Bluesky (with Threads and Instagram built but switched off). Positioning: **"one word, one story, every day: no feed, no
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

## Current state (2026-10-05)
- Language panel (Collection → language chip → "About") is merged. `lib/languages/data.ts` is **empty** until Sam
  reviews the first batch, so no "About" links show yet. Next: `languages:facts -- --limit 30` → draft → review →
  approve (see `docs/handover/language-panel.md`).
- Local `master` is **2 commits ahead of origin** (language facts enrichment). Pushing them deploys.
- Worktrees `.worktrees/lang-panel` and `.worktrees/lang-sources` are merged and can be removed.
- Threads/Instagram are off until Meta tokens are set (`operations.md` → "Threads + Instagram: owner setup").
- Double opt-in and the 200/day confirmation cap are live. The launch kit (`docs/launch-kit.md`) is ready to submit.
- Friends-and-family onboarding is under way. The weekly check-in state is in `../checkins/state.md`.

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
- Client components may only `import type` from `lib/words.ts` (the value is ~13k lines). Same rule for
  `lib/languages/data.ts`: the panel loads it with `next/dynamic`. Never hand-edit `data.ts`/`sheetIndex.ts`.
- Redis keys must use an existing prefix: `curio:subscriber|hour|auth|user|wordoftheday|digest|social|traffic|confirm*`.
- Auth.js's default session has **no `user.id`**; `lib/auth.ts` adds it. `useShowArrival` must check resolved
  `"unauthenticated"`, not `!== "authenticated"`.
- `:focus-visible` must use **longhand** outline properties (Lightning CSS drops `var()` in the shorthand). Verify with real Tab presses.
- Cloudflare DNS records for Vercel/Resend must be **grey-cloud (DNS only)**.
- Meta logging: never log raw fetch errors or Upstash error messages (they can contain tokens). See `architecture.md` → `lib/metaGraph.ts`.
- Clean up after verifying: stop dev servers, `rm -rf .next`, remove merged worktrees (they confuse lint/vitest).
- No Python on this machine; write scripts in Node/tsx.

## Decisions in force (full reasoning: `docs/handover/decisions.md`)
- **One shared daily word for everyone** (2026-09-26). Revisit ~4 weeks after F&F launch.
- Launch schedule: hand-picked openers, then a stable shuffle (`LAUNCH_OPENERS` in `lib/words.ts`); no A–Z march.
- Collection = favourites only; History = the archive, not in the nav (2026-10-04).
- Threads/IG tokens are the on/off switch. Bluesky format: teaser · word + lineage · hashtags, link in a card.
- No retroactive history backfill, ever.
- The demand report lives in a private repo and public Actions logs print counts only.

## Open threads
- First language-sheet batch (Sam reviews).
- Submit the launch kit; themed collection pages (pSEO); "root word" phrasing in titles (demand report: ~593 pages
  have impressions, 5 clicks in 28 days).
- Small UX: header wordmark crowding at 375px; signing in mid-visit changes the word; mobile email-provider buttons;
  clue progression (clue 1 hardest → 3 strong hint).
- Parked with reasons (favourite ordering and removal sync, rate limits, Auth.js key TTLs, ...): `docs/handover/parked.md`.

## Waiting on Sam
- Meta tokens for Threads/IG · Vercel connector access to `etymology-app` / Web Analytics · tighten `_dmarc` to
  `quarantine` after a few weeks of clean sends · `REPORTS_REPO_TOKEN` expires ~2027-10-04.

## Doc map
| File | Open it when... |
|---|---|
| `docs/handover/operations.md` | env vars, deploying, DNS/domain, manual digest/social re-sends, Meta setup |
| `docs/handover/architecture.md` | touching any `lib/`/`app/` module, the word bank or the content pipeline, auth |
| `docs/handover/growth.md` | double opt-in, traffic attribution, demand report |
| `docs/handover/language-panel.md` | language sheets and their pipeline |
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
