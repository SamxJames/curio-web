# Curio: Handover

Last updated: 2026-11-22. Read this first; it's deliberately short. Open a file in `docs/handover/` only when the
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

## Current state (2026-11-22)
- **Git/deploy:** origin/master = local master = 9b3563c (PR #8) = production (checked 2026-11-22; site, `/api/dig/today` and `/dig` 200). Open: **PR #9** (`feat/gate-readout`, weekly gate readout email + `directory` traffic source): merge by hand after CI, then check Mon 11-23 09:00 UTC. Deploy Ready on `etymology-app`,
  curioword.com and `/api/dig/today` 200, CI green, no error logs. GitHub auto-merge is disabled for the repo: merge PRs by
  hand after CI. Kept: worktree `worktree-search-watch` (8 UNMERGED commits: demand report Search Console trend, drop
  detection, URL-inspection index sample). Old `stash@{0}` (Sep) untouched. Empty folders `.claude/worktrees/dig-guess-review`
  and `dig-reveal-post` are leftovers (git already dropped the reveal worktree and branch; deleting the folder was blocked
  or locked): delete them by hand after closing terminals.
- **Dig reveal post shipped (PR #8, 9b3563c) and LIVE on Bluesky.** `DIG_REVEAL_POSTS` was added to Vercel Production ~11-16; Bluesky shows reveal posts at ~10:48 UTC on 11-18, 11-20 and 11-22 linking `/dig/<yesterday>` (checked 2026-11-22 from the public feed; Threads not checked, and Vercel keeps no log history to confirm). The next sentence is the original design: On odd dig days the 10:00 UTC social cron posts "yesterday's dig
  answer" to Bluesky and Threads (`app/api/cron/social/route.ts`, builders `lib/dig/revealText.ts`, `lib/dig/reveal.ts`, run
  channels `bluesky-reveal`/`threads-reveal`, link `/dig/<date>?utm_campaign=dig-reveal`). Posts only when env
  `DIG_REVEAL_POSTS` is exactly `on` (absent in prod; Sam sets it in Vercel Production and redeploys).
  `?repost=bluesky-reveal|threads-reveal` works only when on (409 otherwise). 1776 tests pass. Nothing run against real
  Bluesky/Threads; the link-card thumbnail `/dig/<date>/opengraph-image` was not fetched live. Docs:
  `docs/handover/dig.md`, `operations.md`; plan `docs/superpowers/plans/2026-11-15-dig-reveal-post.md`.
- **Dig pipeline fix (PR #7, e91fec4) is PROVEN:** scheduled runs 11-16 and 11-19 both logged `0 dates failed` and `Forecast: 0 of the next 30 days cannot be drawn` (fewest free themes 15; spare pool 30 then 50 themes). The draw skips prompts with
  no free fossil and a 30-day forecast fails the run if a day cannot be drawn. Players were never affected. Details and
  evidence: `docs/handover/dig.md`. Word audit PRs #5/#6 (generous "from X", fossils repeat after 4 months) also merged.
- **Dig guess review deployed (543deee; `dig.md` "Guess review").** Wrong guesses go out as `miss` events; a blind AI
  reviewer runs in shadow mode with an admin table. **Reviewer blocked on Anthropic credit** (run 43474499665 logged
  `18 calls failed (400:credit x18)`; secret exists): add credit, rerun the Dig pipeline, no code change. Unverified: admin
  table render (needs sign-in), a real browser wrong guess in production. Dig is live since 2026-11-07.
- **Signup measurement + guards (a039145):** `offer-at:<placement>` event; `traffic:report` shows offers seen and requests per
  100 offers seen. Guard layer `scripts/guards` (`npm run guard`, `typecheck`, `check`). Signup is not broken; "0 of ~250
  visits" was unproven as a leak. Untested: real end-to-end signup and the signing-secret 503 path (`history.md` 2026-11-12).
- **Dig pre-launch release live (1df6b26):** native share sheet, "Can you go deeper?" challenge copy, fairer rejection
  wording, `/dig` preloads `/api/dig/today`, share/funnel counters. Share rate for the gate = Shared / New finishers; counts
  start 2026-11-12.
- **Launch kit:** `docs/launch/2026-11-dig-launch.md`: r/SideProject 11-17, r/DailyWordGames 11-19, Show HN Tue 11-24, retry
  12-01. Pre-flight item 7: Upstash command cap and Vercel alerts (~25 Redis commands per player). Section 7: unverified
  channels (Dense Discovery may be a paid classified, check before 11-23).
- **Dig kill line, read 2026-12-04:** >=200 first-time finishers, day-7 return >=15%, share/challenge >=15%. Under 200 =
  re-launch; low return = Curio on autopilot, build Same Brain. Strategy: `docs/strategy/2026-11-07-roadmap.md`. Details: `dig.md`.
- **Dig-marketing automation ranking (growth-marketer; honest framing: existing channels reach few people, 9 Bluesky
  followers):** 1 reveal post (done); 2 directory / "Wordle alternatives" listing pipeline (Sam submits; add a `directory`
  tag to `TAGGED` in `lib/traffic.ts:35`); 3 **weekly gate readout** emailed via Resend or a GitHub Action, reusing
  `traffic:report` and the cohort code (build next); 4 newsletter pitch prep (Sam sends); 5 Typefully weekly queue (would
  replace the daily Threads/IG cron the roadmap says to pause); 6 dig-only email capture (held until after 12-04). Never
  automate Reddit or Show HN. Reasons in `decisions.md`.
- **Google: do NOT mass-noindex.** Freeze story titles/descriptions/template 6 weeks, deepen ~50 pages, earn links, read
  2026-12-18 (impressions >500/week, 472 not-indexed falling, 748 indexed on 11-08). Evidence: `history.md` (2026-11-07).
- **Not yet done (roadmap):** pause daily Threads/IG auto-posts; the content freeze.
- **Earlier shipped (detail in `history.md` and topic files):** week 1 launch readiness (4432331, challenge links, cohorts in
  `/admin`); /play improvements; clear email offer (`SignupOffer` everywhere, per-placement counts); clue rewrite for 202 of
  1,147 words; `/feed.xml`, IndexNow ping, hand-set sitemap lastmod; 87 approved language sheets and `/language/{slug}`
  pages; WebSite/Organization JSON-LD; Threads + Instagram on since 2026-10-11 (10:00 UTC cron); double opt-in with the
  200/day confirmation cap. Test plays left one /play solve (2026-11-06) and one dig finish (2026-11-07) on Sam's account.
- Weekly check-in state: `../checkins/state.md`. Vercel: the MCP connector sees the team but not its projects; the
  **Vercel CLI** (logged in) works, including Web Analytics: `vercel api "/v1/query/web-analytics/visits/count?projectId=etymology-app&teamId=<team>&since=..&until=.."`.

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
- A global unlayered `:focus-visible` rule beats Tailwind's `outline-none`; script-focused headings (`tabindex=-1`) need the explicit fix (20e5333).
- A `node_modules` junction breaks Turbopack builds in worktrees: use `npm ci`. Grep-filtered build output can hide a failed type check.
- `:focus-visible` must use **longhand** outline properties (Lightning CSS drops `var()` in the shorthand). Verify with real Tab presses.
- Cloudflare DNS records for Vercel/Resend must be **grey-cloud (DNS only)**.
- Meta logging: never log raw fetch errors or Upstash error messages (they can contain tokens). See `architecture.md` → `lib/metaGraph.ts`.
- Two sessions can ship to master in parallel: `git fetch` before finishing a branch.
- GitHub auto-merge is disabled for `SamxJames/curio-web`: merge PRs by hand after CI is green.
- `DIG_REVEAL_POSTS` must be exactly `on` (anything else, or absent, is off); turning it on needs a redeploy.
- The dig copy audit bans "streak" and "played", even negated: say "dug".
- jsdom isn't installed, so component tests run on node. Gemini CLI 0.67 never returned a reply (503/fetch failed).
- The preview tool reads the **main checkout's** `.claude/launch.json`.
- Story text in the RSC payload is still raw (disclaimers stripped at render only; not visible to readers).
- Clean up after verifying: stop dev servers, `rm -rf .next`, remove merged worktrees (they confuse lint/vitest).
- vitest and eslint skip `.claude/**` (worktrees), so the main checkout's suite no longer sweeps them.
- No Python on this machine; write scripts in Node/tsx.
- `tsc` fails on a clean checkout without `.next` types (PageProps/LayoutProps/RouteContext): use `npm run typecheck` (`next typegen` first).
- On Windows, `git worktree remove` can leave a directory locked by an open terminal/session; delete it after closing. The auto-mode classifier blocks `git reset --hard` and worktree deletion until Sam approves in chat.
- `.claude/` is gitignored (local only): Stop hook runs the guard (not yet seen firing live), deny rules for `.env*`, force-push, upstash.io.
  `curio-guest-test` launch entry + `.claude/guest-dev.cjs` = dev on :3010 with Redis and Resend blanked, for clean-guest browser tests.

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
- **Dig pipeline:** proven on 11-16 and 11-19 (see Current state). Keep reading the spare-pool line each run; the pool is thin.
- **Gate readout:** built (PR #9, `lib/dig/gate.ts`, `lib/dig/gateReadout.ts`; `dig.md` "The kill line"). After merge, confirm the first email on Mon 11-23 (Resend dashboard, `[curio:gate-readout]` in logs). Next in the ranking: directory listings (the `directory` tag is in PR #9; Sam submits), newsletter prep. Optional: drop the link from the Bluesky reveal text to leave more room for the fact.
- **Reveal post:** Bluesky confirmed live; check the Threads side (link-card thumbnail works on Bluesky: `/dig/<date>/opengraph-image` 200 PNG).
- **Dig reviewer:** blocked on Anthropic credit (`400:credit`); see Current state.
- **After the 12-18 GSC read and freeze end:** related-word links ("Down the rabbit hole") on story pages (pull, not push).
- **Parked until after the 12-04 gate:** dig prominence on the homepage, embeddable widget, sibling products, dig-only email capture.
- **Git housekeeping:** merge-or-park `worktree-search-watch`; delete the leftover empty worktree folders; SEO weekly PRs
  #2/#3/#4 (small `lib/words.ts` teaser edits): recommend hold under the story-text freeze.
- **Signup:** read offer-seen numbers (`npm run traffic:report -- 7`).
- **Tooling:** candidates not installed: cc-safety-net, ccusage, mcp-gsc. Rejected: ravenseat, open-design-agent-kit,
  OpenSpec, Spec Kit, Claude Squad, Vibe Kanban, Postiz. Skills: only grilling + grill-me are installed (grilling is one
  edit behind upstream); no more added; Karpathy-style guidelines would be a few lines in `AGENTS.md`, not a skill.
- **Dig:** real iPhone + Android test; read the kill line 2026-12-04; the dig/health cron check is not done (needs
  `CRON_SECRET`); remove the `dig-prelaunch-prod` entry in `.claude/launch.json`.
- **Dig minors/deferred:** cohort hashes never expire; caption hardcodes 8 Nov; "back" counts read high; `useNarrow` ignores
  rotation; `markShared` may over-count; personalised previews, returning-player intro, sticky Next, scoring page.
- **SEO:** IndexNow should send only new/changed URLs; narrow noindex candidates (127 never-crawled); deepen ~50 stories.
  Don't click Validate fix. Verify the first IndexNow run in logs (`[curio:indexnow] ... submitted ~1214 URLs`).
- Clue rewrite for the remaining 945 words (`clues:rewrite`, `clues:apply -- --keep-today`); a Dle Hunt user says clue 1
  gives the word away. Next language-sheet batch: `languages:facts -- --limit 30`.
- Submit remaining launch-kit entries; "root word" title phrasing; ask Sam what "clue progression (clue 1 hardest)" meant.
- Parked with reasons: `docs/handover/parked.md`.

## Waiting on Sam
- Merge PR #9 (gate readout) after CI, by hand; then confirm the Mon 11-23 email arrives.
- Check credit and billing on the Anthropic account behind `ANTHROPIC_API_KEY` (every reviewer call returns HTTP 400).
- Launch pre-flight (Reddit 11-17/11-19, Show HN 11-24): subreddit rules, 5 unverified newsletter targets, free/no-login
  wording, your own answer to "is this AI?"; five-stranger test (add: "what do you think 'rarer ones dig deeper' means?").
- Real phone signup in a private tab with your own email, then re-run `traffic:report`. Real iPhone + Android dig test (tell me the date).
- Confirm Upstash plan + Vercel usage notifications (~25 Redis cmds/player).
- Decide: the 3 tooling candidates; merge-or-park `worktree-search-watch`; SEO PRs #2/#3/#4 (hold?).
- Add curioword.com to Bluesky/Threads/IG bios; submit remaining launch-kit entries; tighten `_dmarc` to `quarantine` later;
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
