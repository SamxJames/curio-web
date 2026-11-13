# Curio: Handover

Last updated: 2026-11-12. Read this first; it's deliberately short. Open a file in `docs/handover/` only when the
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

## Current state (2026-11-12)
- **Git/deploy state (2026-11-12):** origin/master = local master = b10ce4e = production (deploy 21:21 UTC). CI green on
  the last 4 pushes (`ci.yml` verified). Local master was hard-reset to origin; old head tagged
  `backup/local-master-2026-11-12` (80f8f00, a redundant rebuild of 543deee). Merged worktrees and branches cleaned up.
  Kept: worktree `worktree-search-watch` (8 UNMERGED commits: demand report Search Console trend, drop detection,
  URL-inspection index sample). Empty `.claude/worktrees/dig-guess-review` is locked by an open process: delete after
  closing the terminal. Old `stash@{0}` (task7-wip-check-preexisting, Sep) untouched.
- **Dig pipeline workflow is INTERMITTENT.** Scheduled "Dig pipeline" failed 2026-11-09 and 2026-11-12: "Date
  2026-12-22 salt 7: no usable fossil for prompt 1" (exit 1, ~15 min). The manual `workflow_dispatch` run on 11-12
  passed on retry. Future date, so players are not affected (`/api/dig/today` serves dig #6). Watch the next scheduled
  run; see `docs/handover/dig.md` for the pipeline.
- **Dig guess review deployed (master 543deee; labels d1c5a12; details in `docs/handover/dig.md` "Guess review").**
  Wrong guesses go out live as `miss` events (abandoned digs count); a blind AI reviewer of refused words runs in shadow
  mode (changes no answer list) with an admin table. **Reviewer is blocked on Anthropic credit:** the `ANTHROPIC_API_KEY`
  Actions secret exists (added 11-12 21:25 UTC) but run 43474499665 (11-13) logged `18 calls failed (400:credit x18)`.
  **Sam: add credit to the key's Anthropic workspace, then rerun the Dig pipeline** (no code change needed). Pipeline builds
  are green (buffer 45 days, 0 dates failed); 49 refused guesses found so far, so real players are guessing. Dig has been
  live since 2026-11-07. Unverified: admin table render (needs sign-in), a real browser wrong guess on production.
- **Gemini research done and triaged (local, uncommitted):** prompts `docs/research/2026-11-12-gemini-prompts.md`,
  triaged outcomes `docs/research/2026-11-12-gemini-outcomes.md`. Nothing needs building before launch (most was already
  built, broke archive-never-backlog or the 11-07 no-mass-noindex decision, or assumed a premium tier / red accent).
  Verified on a real iPhone (dark mode): etymology lineage wraps cleanly; homepage has one primary button and a quiet
  "Also today" strip. Accent is amber; `--danger` is a separate token. Kept items are in Open threads.
- **Signup measurement + guards shipped (origin/master a039145, 2026-11-12; offer-seen counter and story offer verified
  in production).** New `offer-at:<placement>` traffic event (once per placement per tab
  session at >=50% visible: `SignupOffer` IntersectionObserver, `lib/signupOffer.offerIsShown`,
  `lib/trafficClient.claimOfferSeen`); `traffic:report` shows offers seen + requests per 100 offers seen. Story page
  `SignupOffer` now after the FIRST section (`StoryView`). Guard layer `scripts/guards` (`npm run guard`, 19 tests: tokens,
  no raw button/input outside `components/ui`, archive-never-backlog copy), `npm run typecheck`, `npm run check`.
  Zero-signup finding: signup is NOT broken (`confirmsends` counts pre-send; form submits fine on a fresh phone-size
  guest); the gap was no denominator. 0 of ~250 visits is ~8% likely at a true 1%, so "probably a leak" is unproven.
  Untested: real end-to-end signup (email + confirm link) and the signing-secret 503 path. Detail: `history.md` 2026-11-12.
- **Dig pre-launch release is live (master 1df6b26, 8 commits from `feat/dig-prelaunch`, Vercel production verified
  2026-11-12: deploy ready, new strings served, no errors for 30 min).** Native share sheet (`lib/shareOrCopy.ts`),
  challenge copy "Can you go deeper?" + `utm_source=challenge` + expired-link message, fairer rejection wording with an
  inline "should count" claim, tighter phone end screen, `/dig` preloads `/api/dig/today` with one 800ms retry
  (`lib/dig/loadDay.ts`), new share/funnel counters and admin cohort columns (fields in `docs/handover/dig.md`).
  Share-rate for the 12-04 gate = Shared ÷ New finishers; counts start 2026-11-12.
- **Launch kit:** `docs/launch/2026-11-dig-launch.md`: pre-flight Sun 11-15, r/SideProject 11-17, r/DailyWordGames 11-19,
  Show HN Tue 11-24, retry 12-01 if needed. Pre-flight item 7 (new): confirm Upstash plan command cap and Vercel alerts
  (~25 Redis commands per player, so 2,000 visitors is ~50,000). New section 7: unverified extra channels (r/WebGames,
  Indie Hackers, game directories; Dense Discovery may be a paid 200-character classified, check before 11-23). Plan: `docs/superpowers/plans/2026-11-08-dig-prelaunch-release.md`.
- **Week 1 launch readiness is live (master 4432331, deployed and verified in production 2026-11-07).** Merged with
  another session's 15 dig placement/first-run commits. `/dig` rules + pitch are in the server HTML; challenge links
  (`?vs=<day>.<tiers>&utm_source=challenge`, nothing stored, friend comparison on the end screen); pipeline
  disclaimers removed at render by `lib/storyText.ts` (story pages, email, RSS, OG image, social carousel, Collection;
  `lib/words.ts` untouched); `/play` rules line; utm_source reddit/hn/newsletter/challenge; `/admin` "Dig cohorts"
  (start `first`, finish `isNew`, key `curio:dig:cohort:<first>`, `COHORT_START` 2026-11-08).
- **Strategy:** `docs/strategy/2026-11-07-roadmap.md` (lead with dig, hand launch, judge retention). Plan
  `docs/superpowers/plans/2026-11-07-week1-launch-readiness.md`; spec `.../specs/2026-11-07-week1-launch-readiness-design.md`.
- **Dig kill line REPLACED, read 2026-12-04:** >=200 first-time finishers, day-7 return >=15%, share/challenge >=15%.
  Under 200 = launch failed, re-launch; low return = Curio on autopilot, build Same Brain. Details: `docs/handover/dig.md`.
- **Google: do NOT mass-noindex.** Freeze story titles/descriptions/template for 6 weeks, deepen ~50 pages, earn links,
  read 2026-12-18 (impressions >500/week, 472 not-indexed falling, 748 indexed on 11-08). Manual actions and Security issues both clear (11-08). Evidence in `docs/handover/history.md` (2026-11-07).
- **Not yet done (roadmap items):** pause daily Threads/IG auto-posts; the content freeze.
- **curio dig is open since 2026-11-07** (`DIG_LAUNCH_DATE`), retention release 1 live (return counter, postcard end
  screen, "Tomorrow" hint, dig line in email and posts). Rival to differentiate from: Wonderhop.
- **/play improvements (67c94e8, 3ca0885, live):** letter tiles, "close" guesses forgiven (up to 2 free), a "Tried" list;
  /play and dig cross-link once dig is open.
- **Prod side effects of testing:** my test plays left one /play solve on Sam's account (2026-11-06) and one dig finish (2026-11-07).
- **Clear email offer (branch `feat/clear-email-offer`, 2026-10-19):** one `SignupOffer` everywhere ("Get tomorrow's
  word", promise line, `/sample-email`), a new offer on the returning homepage, one-tap subscribe for signed-in readers
  (no confirmation email, Sam's call), and signup counts per placement (`request-at:`/`signup-at:` in the traffic hash;
  "by placement" in `/admin` and `traffic:report`). Details: `docs/handover/growth.md`, `architecture.md`.
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
- GSC: impressions fell ~1,300 (09-30) to ~300 (10-09). Page indexing shows 302 crawled-not-indexed and 170
  discovered-not-indexed; advised NOT to click Validate fix. Watch in the Monday demand report.
- Double opt-in and the 200/day confirmation cap are live. Weekly check-in state: `../checkins/state.md`.
- Vercel: the MCP connector sees the team but not its projects; the **Vercel CLI** (logged in) works, including Web
  Analytics: `vercel api "/v1/query/web-analytics/visits/count?projectId=etymology-app&teamId=<team>&since=..&until=.."`.

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
- **Dig pipeline workflow:** intermittent "no usable fossil for prompt 1" (date 2026-12-22 salt 7); manual run passed on
  retry. Find the cause before that date arrives.
- **Dig reviewer:** 14 of 14 Anthropic calls fail with HTTP 400 (key in place). Likely out of credit on the Anthropic
  account; confirm from the `400:credit` label once the other session's `scripts/dig/review.ts` edits are pushed.
- **After the 12-18 GSC read and freeze end:** related-word links ("Down the rabbit hole") on story pages (pull, not push).
- **Parked until after the 12-04 gate:** dig prominence on the homepage, embeddable widget, sibling products.
- **Git housekeeping:** decide merge-or-park for `worktree-search-watch` (8 unmerged commits); delete the locked empty
  `dig-guess-review` folder; open SEO weekly PRs #2/#3/#4 (small `lib/words.ts` teaser edits): recommend hold under the
  6-week story-text freeze.
- **Signup:** read offer-seen numbers (`npm run traffic:report -- 7`) after 1-2 days.
- **Tooling candidates not installed:** cc-safety-net, ccusage, mcp-gsc (needs uvx/Python + Google OAuth). Rejected: ravenseat,
  open-design-agent-kit, OpenSpec, Spec Kit, Claude Squad, Vibe Kanban, Postiz (`decisions.md`).
- **Dig:** real iPhone + Android test. Read the kill line 2026-12-04. The dig/health cron check is not done (needs
  `CRON_SECRET`). Remove the `dig-prelaunch-prod` entry in `.claude/launch.json` (worktree already gone).
- **Dig minors (deferred):** cohort hashes never expire; caption hardcodes 8 Nov; "back" counts read slightly high;
  `useNarrow` ignores rotation; `markShared` may over-count if storage is blocked.
- **Dig deferred:** personalised previews, returning-player intro, sticky Next, other Puzzle items, scoring page.
- **SEO:** IndexNow should send only new/changed URLs; narrow noindex candidates (127 never-crawled stories); deepen
  ~50 stories; read GSC 2026-12-18. Don't click Validate fix.
- **Pause Threads/IG auto-posts** (roadmap item, not done).
- **2026-10-15:** verify the first IndexNow run in Vercel logs: `[curio:indexnow] 2026-10-15: submitted ~1214 URLs (HTTP 200|202)`.
- Clue rewrite for the remaining 945 words (`clues:rewrite`, review sample + `tooHard`, `clues:apply -- --keep-today`);
  a real Dle Hunt user comment says clue 1 gives the word away. Revisit the clue rules if synced plays show most solves on clue 1 or failures above ~20%.
- Next language-sheet batch: `languages:facts -- --limit 30`, draft, review, approve (Proto-West Germanic has no usable source).
- Submit remaining launch-kit entries; "root word" phrasing in titles.
- Small UX: "clue progression (clue 1 hardest)" is unclear; ask Sam what was meant.
- Parked with reasons: `docs/handover/parked.md`.

## Waiting on Sam
- Real phone signup in a private tab with your own email (email arrives, confirm link works), then re-run `traffic:report`.
- Check credit and billing on the Anthropic account behind `ANTHROPIC_API_KEY`: every reviewer call returns HTTP 400,
  most likely "credit balance too low". The secret itself is added.
- Decide whether to install the 3 tooling candidates; merge-or-park `worktree-search-watch`; SEO PRs #2/#3/#4 (hold?).
- Launch pre-flight Sun 11-15 (Reddit 11-17/11-19, Show HN 11-24).
- Real iPhone + Android test (tell me the date; finishes add test players to the counts).
- Confirm Upstash plan + Vercel usage notifications (~25 Redis cmds/player).
- Five-stranger test before Show HN (add: "what do you think 'rarer ones dig deeper' means?") · launch-kit pre-flight (subreddit rules, 5 unverified newsletter targets,
  free/no-login wording, your own answer to "is this AI?") · weeks 2-3 hand launch.
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
