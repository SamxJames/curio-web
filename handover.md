# Curio — Handover

Last updated: 2026-09-26, after the move to `curioword.com` and the switch to one shared daily word for everyone — see "Decisions" and "This session (2026-09-26)" below. This doc exists so
a fresh Claude Code session (or a human) can pick up without re-deriving
all of the above from git log.

## What this is

Curio is a daily-word-etymology app: one word a day, its origin story, an
optional email digest, accounts with synced favorites and a History of
the shared words since they joined, a personal "collection" view and a
Bluesky presence. Tagline/positioning: **"one word, one story, every day —
no feed, no backlog to catch up on."** That positioning is a real
constraint, not just marketing copy — it's already shaped a couple of
decisions below (see "Rejected: retroactive history backfill").

## Product principle: archive, never backlog

Curio may let people *pull* any word — the story pages, the A–Z list and
related-word links are fine. Curio must never *push* unread-ness. That
rules out:

- counts of words not yet seen, or "X of 1,147";
- "you missed" messaging;
- streaks, or completion percentages;
- manufactured history for days a user didn't experience.

Test every future feature against this rule. (Also in `AGENTS.md`, which
`CLAUDE.md` imports.)

## Decisions

### 2026-09-26 — Chose a shared word (A) over per-account rotation (B)

Why:
- The family-and-friends launch depends on "did you see today's word?".
- The puzzle can only avoid recent *and* upcoming daily words if the
  schedule is shared.
- Bluesky, email, the site and story pages must agree on the day's word.
- It removes the slot-0 join-day pin workaround and a second code path.
- A shared word lets us judge word quality per day.

Revisit ~4 weeks after the F&F launch, if:
1. Dud days visibly lower next-day returns → fix by reordering the shared
   schedule, not per-user rotation.
2. 2+ users report "I'd already read today's word" → build a "You read
   this on <date>" note.
3. Near-zero social mentions after week 2 → consider hybrids, not B.
4. The shared cycle nears wrap-around (currently 2029-02-21 at 1,147
   words).

### 2026-09-26 — `/collection` stays as it is

The owner delegated the call. `/collection` keeps its counts subline and
language band: they only ever count words already shown, never unseen
ones, so they pass the archive-vs-backlog rule. Turning Collection into
favourites would be a redesign outside the pre-launch phase. Favourites
remain the "Favorites" filter inside `/history`.

### 2026-09-26 — How the shared schedule works (reported, not changed)

A date's word is `WORDS[daysSinceStart(date) % WORDS.length]`, locked in
Redis (`curio:wordoftheday:<date>`) the first time it's resolved. `WORDS`
positions 0–25 are the original hand-picked words; 26–1,146 are
alphabetical (batch-append order), so from 2026-09-27 the schedule marches
alphabetically (czar, dagger, dahlia, …). All days 2026-01-01..2026-09-26
are locked. **Future days can be hand-reordered safely by permuting only
positions after today's index** (268 on 2026-09-26) — that leaves every past
date's formula result unchanged, locked or not (`lib/wordsLocking.test.ts`
pins this). Moving words into or out of past positions is protected for
display by the locks, but `/play`'s windows use the formula, not the
locks. A dated schedule file would be the cleaner long-term mechanism if
front-loading becomes a regular need.

**Live at:** https://curioword.com (since 2026-09-26 — see "Domain
cutover" below; `www.curioword.com` and the old
`etymology-app-orcin.vercel.app` both 308-redirect here)
**Vercel project:** `etymology-app` (⚠️ not literally named
`etymology-app-orcin` — that was just its original vercel.app domain, which
got a random suffix from a name collision. See "Vercel gotcha" below if you ever need to
re-link this directory.)
**GitHub remote:** `github.com/SamxJames/curio-web`, `master` is the
default and only branch. Vercel's Git integration auto-deploys `master` to
production on every push — this wasn't wired up for most of this project's
life (see "Vercel gotcha" below for the related, separate `vercel link`
footgun) and wasn't discovered to be disconnected until this session;
reconnecting it plus one push is what finally made push-to-deploy work.
Feature work in this session went through a git worktree
(`.claude/worktrees/<name>/`, created via the platform's own worktree
tooling, not a manually-managed `.worktrees/` directory) merged back to
`master` locally, then pushed — not a GitHub PR.

## Tech stack

Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4,
Vitest, `@upstash/redis`, Resend (email), `next-auth@5.0.0-beta.32` +
`@auth/upstash-redis-adapter` (magic-link auth).

## Running it locally

```bash
npm ci
npm run dev      # http://localhost:3000
npm run lint
npx vitest run
npm run build
```

You'll need a `.env.local` (gitignored, never committed) for anything
touching accounts/email/favorites — anonymous browsing works with zero env
vars (falls back to local-file storage, see `lib/db.ts`). Ask the user for
the real values, or `vercel env pull` if you're authenticated to the
project — **do not** expect to find real credentials anywhere in this repo
or in a memory file; they're intentionally not written down anywhere
persistent. Required vars, from `.env.example`:

```
RESEND_API_KEY
CURIO_FROM_EMAIL          # "Curio <hello@curioword.com>" in prod since 2026-09-26
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
CURIO_SITE_URL            # http://localhost:3000 locally
CRON_SECRET
AUTH_SECRET               # node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
BLUESKY_IDENTIFIER        # curiodaily.bsky.social — public handle, not a secret
BLUESKY_APP_PASSWORD      # generated in Bluesky's own Settings -> App Passwords, never the account login password
```

`ANTHROPIC_API_KEY` (for `npm run content:rewrite`) is deliberately **not**
in that list — it's local/dev-only tooling for the content pipeline, never
needed by the deployed app, and isn't set in Vercel.

`CURIO_SITE_URL` matters more than it used to: `lib/bluesky.ts` builds the
public Bluesky post's link from it (falling back to `http://localhost:3000`
if unset, same as `lib/email.ts` already did) — a missing value in
production would publish a localhost link to a public timeline, which is a
lot less forgiving than the same fallback landing in an email. **As of
2026-09-20, it also matters for the build itself**, not just runtime
requests: `app/layout.tsx`'s `metadataBase`, `app/sitemap.ts`,
`app/robots.ts`, every story page's canonical URL and its `DefinedTerm`
JSON-LD all resolve `lib/siteUrl.ts`'s `siteUrl()` at `next build` time,
and 1,147 story pages are now static. A missing `CURIO_SITE_URL` on a
Production build doesn't just risk one bad link at request time — it bakes
`http://localhost:3000` into all 1,147 prerendered pages' canonicals,
sitemap entries and structured data. Confirm it's set in Vercel before any
build you intend to actually deploy.

`CRON_SECRET` also matters more than it used to: `/api/cron/send-daily`
fails closed (401) when it's unset **and** `NODE_ENV === "production"` —
added this session, since an unauthenticated hit on that route now sends a
real digest to every subscriber *and* posts to the real Bluesky account,
not just a read. Confirm it's actually set in Vercel before relying on
that route being safe.

**Important:** local dev and production point at the *same* Upstash
database (there's only one Upstash instance for this whole project).
Testing locally with real credentials writes real data — favorites,
subscriptions, accounts — into the same store production reads from. This
has been fine at this project's traffic level, but don't assume local
testing is sandboxed.

## Deploying

```bash
vercel deploy --prod
```

The directory is already linked (`.vercel/project.json`, gitignored). All
production env vars are already set in Vercel — you're not starting from
scratch. Confirm the link before deploying if anything seems off:

```bash
cat .vercel/project.json   # should show projectName: "etymology-app"
```

### Vercel gotcha (already happened once this session)

`vercel link --project <name> --yes` **silently creates a new empty
project** if no project with that exact literal name exists — it does not
error. The original vercel.app domain is `etymology-app-orcin.vercel.app`, but the
project itself is named `etymology-app` (domain got a random suffix from a
name collision when it was created). If you ever need to re-link, use
`vercel project ls` first to find the real project name behind a domain —
don't assume the domain and the project name match.

## Domain cutover (2026-09-26)

Curio moved from `etymology-app-orcin.vercel.app` to **`curioword.com`**
(registered at Cloudflare Registrar) right before the family-and-friends
launch, so Google never split indexing across two hosts.

- **DNS lives at Cloudflare**, not Vercel. Records: `A @ 76.76.21.21`,
  `CNAME www cname.vercel-dns.com`, Resend's `resend._domainkey` TXT,
  `send` MX + TXT (SPF), `rsend` CNAME, `_dmarc` TXT (`p=none` — tighten
  to `quarantine` after a few weeks of clean sends), a
  `google-site-verification` TXT, and Cloudflare Email Routing's own apex
  MX/SPF. **Every Vercel/Resend record must be "DNS only" (grey cloud).**
  Cloudflare proxies new records by default; proxied, Vercel can't issue
  certs and Resend can't verify `rsend`. This bit the first attempt.
- **Vercel:** `curioword.com` is primary; `www.curioword.com` and
  `etymology-app-orcin.vercel.app` are project domains with a 308 redirect
  to it (path and query preserved), set via `vercel api
  /v9/projects/<id>/domains/<name> -X PATCH`. The Vercel MCP connector
  could see the team but not its projects, so the CLI was used throughout.
- **Env (Production):** `CURIO_SITE_URL=https://curioword.com`,
  `CURIO_FROM_EMAIL=Curio <hello@curioword.com>`. Resend domain
  `curioword.com` is verified (us-east-1).
- **Search Console:** Domain property for `curioword.com` with the sitemap
  submitted.
- **Verified live:** canonicals, `og:url`, `og:image`, `DefinedTerm`
  JSON-LD, `robots.txt` and all 1,152 sitemap `<loc>`s use
  `curioword.com`; magic link and a manually-triggered digest delivered
  from `hello@curioword.com`; the Bluesky post links to `curioword.com`.
- **Gotcha:** `.env.local`'s `CRON_SECRET` does **not** match
  Production's, so a local `curl` to the prod cron 401s. To trigger a real
  digest by hand, use Vercel → Settings → Cron Jobs → Run (it posts to
  Bluesky too — the 2026-09-26 test run made a second post that day).

## Architecture map

- `lib/words.ts` — the word content (`WORDS: WordEntry[]`) and all the
  date/rotation logic. This is the single most important file to read
  before touching anything content- or history-related. Key exports:
  - `getWordForDate()` / `getHistory()` — the pure calendar formula; app
    code goes through the locked `resolveTodayWord(now?)` /
    `resolveHistory()` instead (same word for everyone on a given date).
  - `resolveHistorySince(joinedAt, today?)` — an account's History: the
    shared-calendar days since it joined, through the same locks as
    `resolveHistory`. There is no per-account rotation since 2026-09-26
    (see "Decisions").
  - `getUniqueWordsMostRecent()` — one entry per word, most-recently-seen
    first, deduped. This is what "All words"/"All" on the History page
    actually shows — see "Known limitation: 8 words" below for why this
    function exists at all.
- `lib/auth.ts` — Auth.js config. Magic-link sign-in via a **custom**
  `sendVerificationRequest` (not the library default — see `lib/email.ts`).
  Has a `declare module "next-auth"` type augmentation and a custom
  `session` callback because **Auth.js's default session callback does
  NOT include `user.id`** — this bit the original implementation and is
  worth knowing if `session.user.id` ever seems to vanish after a library
  upgrade.
- `lib/db.ts` — anonymous email-subscribe storage (`Subscriber`, keyed by
  email, Redis-backed with a local-JSON fallback for zero-env-var dev).
  Completely separate system from accounts; the two are only *linked* by
  looking up a signed-in user's own email against this store (see
  `app/account/page.tsx`) — there's no persisted link record.
- `lib/userData.ts` — per-account server data: join date (where the
  account's History starts) and favorites (Redis Set), all keyed
  `curio:user:<id>:...`. Never collides with `lib/db.ts`'s
  `curio:subscriber:`/`curio:hour:` keys or the Auth.js adapter's
  `curio:auth:` keys — if you add new Redis keys, keep using one of these
  three prefixes, not a bare new one.
- `lib/storage.ts` — client-side localStorage (favorites, theme,
  onboarded flag). Favorites here are the *fast local cache* for every
  visitor, signed in or not; `toggleFavorite` fires a best-effort
  background sync to the account when signed in
  (`components/AccountFavoritesSync.tsx` handles the reverse direction —
  pulling account favorites down on sign-in, and a one-time offer to push
  up whatever was already favorited locally before the account existed).
- `lib/email.ts` — all outbound email (daily digest + the sign-in magic
  link) goes through here, sharing one branded HTML template shell
  (`buildShell`). If you touch the sign-in email, this is the file, not
  Auth.js's provider config.
- `components/EtymologyLineage.tsx` — the "Latin → Italian → English"
  breadcrumb, driven by `WordEntry.lineage` (an array of language names,
  see below).
- `lib/collection.ts` — pure aggregation/formatting for `/collection`
  (language-count stats, month grouping, date formatting) — see "Your
  collection" below.
- `lib/bluesky.ts` — `buildBlueskyPost` (pure, tested) builds the ≤300-char
  post text (truncates the teaser, never the word or link);
  `postDailyWordToBluesky` does the real `@atproto/api` login/post, wrapped
  in try/catch with a `console.error` on failure (the daily cron runs
  unattended — this is the only signal a real posting failure would ever
  surface). Same "log instead of send when unconfigured" fallback as
  `lib/email.ts`/`lib/db.ts` when `BLUESKY_IDENTIFIER`/`BLUESKY_APP_PASSWORD`
  aren't set.
- `lib/useShowArrival.ts` — the one shared "should this visitor see the
  first-time arrival hero" hook, consumed by both `components/Header.tsx`
  and `components/HomeContent.tsx` so they can't independently drift.
  Deliberately requires the *resolved* `status === "unauthenticated"`, not
  `!== "authenticated"` — the latter also matches `useSession()`'s
  transient `"loading"` state, which flashed the arrival hero (and its
  reduced header) at signed-in users on a fresh browser. **As of
  2026-09-20, `app/layout.tsx` no longer feeds `<SessionProvider>` a
  server-fetched `session` prop** — that read cookies in the root layout
  and silently forced every route in the app to render dynamically (see
  "This session (2026-09-20)" below). The `"loading"` window this guard
  exists for is back, but only on `/`: `app/page.tsx` (already dynamic,
  already calls `auth()`) renders `components/ServerSessionMarker.tsx`,
  and this hook consults its `data-server-session` attribute *only* while
  `status === "loading"`, falling through to the real `useSession()` value
  everywhere else. Every other route just waits out `"loading"` like
  before 2026-09-18 ever existed.
- `components/ArrivalHero.tsx` / `TodayHero.tsx` / `HomeContent.tsx` — the
  homepage now renders `HomeContent`, a client component that picks between
  `ArrivalHero` (first-time anonymous visitors — merged word + pitch +
  email capture, replacing the old `OnboardingBanner`) and `TodayHero` (the
  original hero content, extracted unchanged). `ArrivalHero`'s subscribe
  success message is intentionally delayed via `setTimeout` before calling
  `markOnboarded()` — calling it immediately flips `useShowArrival()` and
  unmounts `ArrivalHero` in the same render commit, so the confirmation
  message would never paint. This was a real bug, found and fixed during
  this session; if you ever touch this flow, re-verify the message is
  actually visible, don't assume a synchronous "mark done then show
  success" order works.
- `scripts/extractEtymology.ts` / `rewriteEtymology.ts` / `approveDraft.ts`
  — the content pipeline, see "Growing the word list" below.
- `lib/day.ts` — the one clock (2026-09-26): `dayKey`/`dayStart`/`formatDay`,
  always UTC. Home, the digest, Bluesky, `/play`, story-page dates and
  History all derive and format "today" through it; `app/sharedDay.test.ts`
  drives the real home/cron/story-date paths at the 00:00 UTC boundary to
  prove they agree. Don't add a bare `toLocaleDateString` or
  `toISOString().slice(0, 10)` for a user-facing day anywhere else.
- `lib/siteUrl.ts` — the one place `CURIO_SITE_URL` (+ `http://localhost:3000`
  fallback) gets read for building absolute URLs (`siteUrl()`,
  `absoluteUrl(path)`). `app/layout.tsx`'s `metadataBase` and every new SEO
  surface below go through it. `lib/email.ts` and `lib/bluesky.ts` still
  spell out the same fallback inline — deliberately not refactored this
  session, see "Deferred" under "This session (2026-09-20)".
- `lib/seoRoutes.ts` — `PUBLIC_ROUTES` (the 5 crawlable routes: `/`,
  `/history`, `/words`, `/play`, `/attribution`), `DISALLOWED_PATHS` (the
  account/auth/API paths blocked in `robots.txt` and left out of the
  sitemap), `buildSitemapEntries()` (consumed by `app/sitemap.ts`) and
  `buildRobots()` (consumed by `app/robots.ts`) — the one source of truth
  so the sitemap, `robots.txt` and the app's actual route structure can't
  drift apart.
- `lib/relatedWords.ts` — `getRelatedWords(slug)`, the deterministic
  inter-story linking (see "This session (2026-09-20)" below for why it's
  split into `peers`/`neighbours` rather than one prose-matched list).
  Builds a lazy, process-lifetime index (sorted-by-word array +
  language buckets) once, not per page, since all 1,147 story pages
  prerender in one build.
- `lib/storyJsonLd.ts` — `buildStoryJsonLd(word)` (schema.org `DefinedTerm`,
  not `Article` — see the design spec for why) and `serializeJsonLd()` (the
  `<`-escaping needed to embed JSON safely inside a `<script>` tag).
- `app/api/story/[slug]/date/route.ts` — the route handler that now owns
  everything session-dependent for a story page: the shared "featured on"
  date and the `recordUserSeen` side effect that used to live
  in the page body. Exists so `app/story/[slug]/page.tsx` itself never
  calls `auth()`/reads cookies/hits Redis, which is what keeps the page
  statically prerenderable. Fetched client-side by
  `components/StoryDate.tsx`, which reserves the line's height so a date
  arriving after hydration (or never, for ~884 of 1,147 words) doesn't
  shift the headword.
- `components/SessionHintInit.tsx` / `components/ServerSessionMarker.tsx`
  — the two inline pre-hydration scripts (same `ThemeInit` pattern) that
  replaced feeding `<SessionProvider>` a server-fetched session prop. See
  "This session (2026-09-20)" below for what each does and why there are
  two of them.

## Data model: `WordEntry`

```ts
type WordEntry = {
  slug: string;
  word: string;
  respelling: string;
  partOfSpeech: string;
  teaser: string;    // one sentence, shown on Today — must differ from origin
  origin: string;    // full explanation, shown on the story page
  journey: string;
  related: string;
  lineage: string[]; // e.g. ["Latin", "Italian", "English"] — always ends "English"
};
```

`teaser` and `lineage` were both added this session (previously just
origin/journey/related existed). Every entry has both, and
`lib/words.test.ts` asserts that: every `teaser !== origin`, and every
`lineage` ends in `"English"`. If you add a new word, you need both fields
or the tests fail.

## Word bank: 1,147 words, content pipeline run to completion

`WORDS` had 8 entries for most of this project's life. As of 2026-09-18 it
has **1,147** — grown in two real batches (26 after the first, a further
1,121 after running the full remaining candidate list). Source lists:
`curio-word-candidates.txt` (1,317 candidates, categorized in
`curio-word-candidates-by-category.md`) and `curio-reserve-words.txt`
(3,209 more, unused so far — attrition never ran high enough to need it).
Real attrition across the whole run: 1,317 candidates → 1,281 had usable
`etymology_text` (97.3%) → 1,121 survived rewrite and validation (87.5% of
those) — 160 dropped for a clue naming the answer word/stem, 36 for
genuinely no facts. Growing the content library further is still a
**content** task (needs real, accurate etymology from a real Wiktextract
dump), not a code task — don't invent etymologies to pad the list; if you
add more, the batch tooling below already exists and is proven at this
scale, real cost was ~$0.0076/word all-in (including retries).

**`/play` is now open** — the eligible pool (words not shown as the daily
word in the last 30 days *and* not scheduled in the next 30, since
2026-09-26; structural pool = `WORDS.length − 60`) comfortably clears `PUZZLE_MIN_POOL_SIZE` (10) at this word count, verified
live (a real puzzle rendered, not just code review). If the word count
ever somehow dropped back under ~40, it would honestly close again — that
behavior is unchanged, just no longer reachable at 1,147.

**Important, if you ever grow `WORDS` again:** confirm `81d8203`'s
word-locking layer (see `lib/words.ts`'s "Locking layer" section, and
`resolveTodayWord`/`resolveHistory`/`resolveHistorySince`) is still in place and used by
every page. Before that fix existed, growing the array retroactively
shifted the calendar-index math for every already-served date — it
actually happened once, mid-day, during the 8→26 batch. The locking layer
persists each date's word in Redis the first time it's resolved, so later
growth can't move history out from under someone who already saw it. Don't
revert to the plain `getWordForDate`/`getHistory` call sites in
`app/`.

**The pipeline is no longer just scaffolded — it's been run against real
content and batched for ~1,000-word scale:**

```bash
# Single word (original, still works)
npm run content:extract -- <wiktextract-dump-path> <word>   # -> facts JSON on stdout
npm run content:rewrite -- <word> <facts-json-path>          # needs ANTHROPIC_API_KEY, writes content/drafts/<word>.json
npm run content:approve -- content/drafts/<word>.json        # after a human reads and approves the draft

# Batch (added to handle hundreds of words in one pass)
npm run content:extract -- --batch <dump-path> <word-list-file> <output-json>   # one dump pass, all words
npm run content:rewrite -- --batch <facts-json-path>                            # resumable; writes content/drafts/_batch-log.json
npm run content:approve -- --batch content/drafts                              # validates ALL drafts first; aborts with nothing written if any fail
```

The real Wiktextract dump lives at `https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz`
(2.7 GB compressed, 23.1 GB decompressed — not in this repo;
`scripts/__fixtures__/sample-wiktextract.jsonl` is a hand-built fixture for
tests, not real content). Batch rewrite is resumable — it skips a word
that already has a draft file or is already in `WORDS`, so an interrupted
or multi-session run can just be re-invoked. `content:approve --batch`
also rejects (as a validation error, not a silent skip) a slug that's
already in `lib/words.ts` or duplicated within the batch, so re-running it
against a stale drafts directory can't double-append a word.

**A real bug worth knowing about if you touch `scripts/rewriteEtymology.ts`
again:** the original `callClaude` capped `max_tokens` at 1024 with no
`thinking`/`effort` configuration. Claude Sonnet 5 runs adaptive thinking
by default, and thinking tokens count against that same cap — in the first
real batch run this truncated or fully swallowed 14 of 20 responses before
anyone even got to see thin-facts or invented-content problems. Fixed by
raising `max_tokens` to 4096 and setting `output_config: {effort: "low"}`
(this is a formulaic rewrite task, not one that benefits from heavy
reasoning). If a future model swap or prompt change brings back truncated
JSON or "no text content block" errors, check this first before assuming
it's a facts or prompt problem.

`content:rewrite` calls the Claude API and costs real money per word — with
the fix above, real measured cost is ~$0.0064/word on Sonnet 5
(~923 input / ~452 output tokens average), so ~$6-8 for 1,000 words
including retries. It never invents facts beyond what's extracted, and
never skips a thin entry — both are enforced in the prompt text
(`scripts/rewriteEtymology.ts`'s `buildRewritePrompt`). `content:approve`
is the only thing that ever touches the real `lib/words.ts`, and only for
drafts a human has already read — it validates each draft against the
exact invariants `lib/words.test.ts` checks, then re-runs that test file
once per batch (not once per word). If you ever edit
`scripts/approveDraft.ts`'s bracket-matching logic
(`appendDraftsToWordsFile`), know that the naive `source.lastIndexOf("];")`
approach is **wrong** — `lib/words.ts` has other array literals later in
the file (e.g. inside `getHistoryForUser`) whose closing bracket also
matches that string. The current code anchors the search to start after
the literal `export const WORDS: WordEntry[] = [` text specifically; don't
regress that anchor.

**Things that were flagged as "cheap now, expensive later," first checked
at 26 words — now genuinely live at 1,147, not hypothetical:**
- **Bundle size:** still verified fine — every Client Component that
  touches `lib/words.ts` imports only `import type { WordEntry }` /
  `import type { HistoryDay }`, never the `WORDS` value itself, and every
  page that reads `WORDS` is a Server Component. `import type` is erased
  at compile time, so none of `WORDS`'s content (now ~13,000 lines) ships
  to the browser. No architecture change needed unless that import pattern
  changes.
- **`/history`'s "All words" tab has no pagination — and now actually
  renders up to 1,147 `<li>`s.** `HistoryList.tsx` groups by month past 30
  entries (readability), but doesn't cap total DOM nodes. Checked live: it
  still rendered and scrolled fine in a quick manual pass, but this is the
  first time it's genuinely been tested at real scale rather than reasoned
  about. Worth a proper look (pagination, or windowing) if it ever feels
  sluggish on a real device — proposed approach unchanged: cap eagerly
  rendered groups behind "show more," with search bypassing the cap.
- **`lib/bluesky.ts`'s `buildBlueskyPost` doesn't bound `word + url`
  itself** — still true, still not a practical risk (the math needs a
  ~94+ character single headword; nothing in the real 1,147-word bank gets
  remotely close). Theoretical gap, unaddressed, low priority.
- **`lib/puzzle.ts`'s eligibility scan was O(n²) — fixed 2026-09-18.** The
  old per-word `daysSinceLastShown` (~56ms per `getEligiblePuzzleWords`
  call at 1,147 words, ×2 per `/play` render) is gone, replaced by
  `daysSinceShownMap`: one O(n) pass building a slug→days-since-shown map,
  reused via O(1) lookup for every word. Measured post-fix: ~0.35ms per
  call at 1,147 words. See "This session" below.

## Accounts / auth system, in one paragraph

Passwordless magic-link sign-in (Resend email, no passwords stored).
Session strategy is `"database"` (Upstash-backed via
`@auth/upstash-redis-adapter`), not JWT. Every visitor, account holder,
digest recipient, `/play` and Bluesky get the same shared calendar word on
a given date. An account's `joinedAt` (`recordUserJoined`, fired from
Auth.js's `createUser` event) marks where its History starts — shared
days from then to today, as a neutral dated list — and favorites sync
across devices.

**Reversed 2026-09-26, at the owner's explicit request** (see
"Decisions"): accounts used to get a per-account shuffled rotation
(`getPersonalOrder`, with a slot-0 pin for the join day). The code is
gone; its data is not: `curio:user:<id>:wordFor:<date>` keys are left in
Redis, unread and unwritten, as a cheap revert path — safe to delete in a
later cleanup. There was exactly one account at the cutover (the owner's;
the owner's spouse is an email subscriber, not an account). Its
`joinedAt` was reset to the cutover date by a one-off script
(`scripts/resetJoinedAt.ts`, deleted after it ran — see git history; the
pre-reset value is in the local, gitignored `backups/`), so its History
starts clean instead of showing shared words it was never shown. Accepted
side effect: the admin portal shows that account joining on the cutover
date.

## Rejected: retroactive history backfill

When a new account's History looked sparse (1 entry on day 1), the
tempting fix was to backfill fake history so it looked fuller
immediately. **Rejected on purpose** — manufacturing days of history the
user didn't actually experience directly contradicts the app's own "no
backlog to catch up on" pitch. The actual fix was splitting History into
"My days" (personal, honestly small at first, with copy explaining it
grows) and "All words" (the full shared archive, always rich, available
to everyone regardless of account age). If this comes up again, don't
relitigate it — reuse that pattern.

## Deferred / parked items (real, not forgotten)

These were surfaced during review and deliberately not fixed — each has a
reason, not just "ran out of time":

- **Resend quota shared between sign-in and the daily digest — partially
  addressed 2026-09-18.** `lib/signInCooldown.ts` now blocks *repeated*
  sign-in requests for the *same* address within a 60s window (see "This
  session" below). What's still unprotected: a bot iterating many *unique*
  addresses still burns the quota at one email each — this cooldown
  doesn't defend against that axis. Real rate-limiting (or a second Resend
  API key just for auth) is still the fix for that case, and is still
  judged disproportionate to build at this project's traffic level.
- **No TTL on Auth.js's Redis keys** (sessions/verification tokens never
  expire) — this is `@auth/upstash-redis-adapter`'s own behavior, not
  fixable without forking it. Fine at current scale; would want a
  periodic manual cleanup if the account base ever grows meaningfully.
- **`/history`'s lists had no DOM pagination, and shipped full word prose
  to the client regardless — both fixed 2026-09-18.**
  `components/HistoryList.tsx` now caps every tab (including "My days") to
  60 entries behind a "Show more" button, with an active search bypassing
  the cap so it can still surface any word; and `app/history/page.tsx` now
  projects each entry down to just `{slug, word}` before sending it to the
  client, instead of the full `WordEntry` (origin/journey/related prose
  included). See "This session" below.
- **Mobile header nav has zero spare width** (confirmed, not just
  guessed) for a 5th nav item at 375px. Any future top-level nav addition
  needs a redesign (e.g. a menu), not just another `<Link>`. (This session
  swapped "History" for "Collection" in the signed-in nav rather than
  adding a 5th item, for exactly this reason.)
- **`onboarded` state and account-linked email preferences live in two
  different systems** (localStorage vs. Redis) with no UI reconciling them
  beyond what `AccountFavoritesSync` does for favorites specifically. Not
  a bug, just worth knowing before "fixing" what looks like an
  inconsistency.
- **The delivery-hour concept is gone from the UI but `Subscriber.hour`
  still exists in `lib/db.ts`** (defaults to 9, kept for backward
  compatibility with already-written Redis hashes) — the daily cron
  ignores it entirely now (see "This session" below). Harmless dead
  weight, not worth a migration at this scale.
- **`lib/bluesky.ts`'s post-failure path now has automated test coverage
  (2026-09-18, see "This session" below)** — `lib/bluesky.test.ts` covers
  success, login failure, post failure, and unconfigured, all via a mocked
  `@atproto/api`. Still true and unaddressed: no guard for a hypothetical
  word+URL combination alone exceeding 300 characters (unlikely with the
  current word bank, still a cheap follow-up if it ever comes up).

## A real bug worth remembering (Lightning CSS + `outline` shorthand)

`app/globals.css`'s `:focus-visible` rule uses **longhand** properties
(`outline-width`/`outline-style`/`outline-color`), not the `outline`
shorthand. This is deliberate: the shorthand form
(`outline: 2px solid var(--accent)`) silently dropped the `var(--accent)`
reference somewhere in this project's Lightning CSS build pipeline — the
compiled CSS *looked* correct (`cssText` showed the right value), but
`getComputedStyle` on a real focus-visible element showed the wrong
color, and the shorthand's other sub-properties (`width`, `style`)
resolved fine while only `color` silently fell through to a default. This
was only caught by checking computed styles after real keyboard Tab
navigation — `.focus()` via JS doesn't reliably trigger `:focus-visible`
the same way, so testing this kind of thing needs actual `key: "Tab"`
input, not a scripted `.focus()` call. If you ever touch this rule, keep
it longhand, and re-verify with computed styles, not just visually.

## This session (2026-09-12)

Five things landed, roughly in this order:

1. **"Your collection" screen** (`/collection`, signed-in only) — a
   personal shelf of every word an account has been shown, with a
   flexbox "lineage band" showing which languages those words passed
   through (no charting library), tap-to-filter by language, and density
   rules (no month headers under ~9 words, a closing line pulled from the
   most recent word's `related` fact instead of generic filler). Header
   nav now shows "Collection" instead of "History" when signed in;
   `History` becomes the second tab inside `/collection` rather than being
   lost. See `components/CollectionScreen.tsx` and `lib/collection.ts`.
2. **Fixed the daily-send cron** — it called `getSubscribersForHour(new
   Date().getUTCHours())`, but Vercel Hobby-plan cron only fires once a
   day, so almost every subscriber who picked a delivery hour other than
   whenever the cron happened to land was silently never emailed. Now
   every subscriber gets the same word at the one daily run
   (`getAllSubscribers`). The delivery-hour picker was dropped from both
   the anonymous signup form and the account page as a result (see
   `HourWheel`/`AccountHourPicker` removal above).
3. **Arrival hero replaces onboarding banner** — first-time anonymous
   visitors now get one merged homepage view (word + pitch + email
   capture) instead of the word plus a separate dismissible banner. See
   `lib/useShowArrival.ts` above for the one real bug this surfaced
   (a signed-in-user flash from treating `useSession()`'s `"loading"`
   state as anonymous) and its fix.
4. **Bluesky auto-post** (`@curiodaily.bsky.social`) — the same daily cron
   run now also posts the word, teaser, and a UTM-tagged story link, via
   `@atproto/api`. Follows the existing "log instead of send when
   unconfigured" fallback pattern.
5. **Content pipeline, scaffolded but not run** — see "Growing the word
   list" above. Nobody has fed it a real Wiktextract dump yet; the 8-word
   limitation is otherwise unchanged.

This was done via the `superpowers` subagent-driven-development process
(plan: `docs/superpowers/plans/2026-09-12-daily-send-arrival-bluesky-content.md`,
9 tasks, each with its own implementer + reviewer cycle, plus a final
whole-branch review that caught the `useShowArrival` bug and a silent
Bluesky-failure gap that only showed up once all the pieces were viewed
together — worth remembering that task-scoped review can't catch
cross-task integration issues, only the final review can). The isolated
workspace this time was created with the platform's own worktree tool
(`.claude/worktrees/<name>/`), not a manually-managed `.worktrees/`
directory — if you use the same tool, know that a worktree it creates
still physically lives *inside* the main repo's directory tree, so ESLint
and Vitest **will** walk into it and double-count/corrupt results if you
run those tools from the main checkout while the worktree still exists on
disk (confirmed: lint went from 1 warning to 309 errors, tests from 51 to
102, purely from a leftover merged-but-not-yet-removed worktree). Remove
the worktree (via the platform tool, or `git worktree remove` once nothing
has it open) *before* re-verifying anything from the main checkout, not
after.

Two real plan-defects were caught and fixed during implementation, not
during planning — worth knowing if either area gets touched again:
- `components/ArrivalHero.tsx`'s subscribe success message doesn't render
  if you call `markOnboarded()` synchronously right after showing it (see
  point 3 above and `lib/useShowArrival.ts`'s architecture-map entry).
- `scripts/approveDraft.ts`'s original bracket-matching approach
  (`source.lastIndexOf("];")`) would have corrupted `lib/words.ts` — it
  found a *different* array literal's closing bracket later in the file.
  Caught by actually running the append against a throwaway entry in the
  real file (per the plan's own mandated dry-run step) rather than trusting
  the logic would work from reading it. If you're ever tempted to skip a
  "run this against the real file once" verification step because the code
  "obviously" looks right, don't — this is the second time this project's
  history has a bug that only a real dry-run caught (see the Lightning CSS
  focus-ring bug above for the first).

## This session (2026-09-18)

Five things landed, roughly in this order:

1. Added a visible "Sign in" link to the first-time arrival hero (previously unreachable except via "See the archive").
2. Cross-device magic-link handoff — a tab that requested a sign-in link now signs itself in automatically once the link is verified elsewhere (`app/api/auth/device-link/*`, `lib/deviceLink.ts`).
3. Word-of-the-day locking layer (`lib/words.ts`'s `resolve*` functions) — growing the word bank can no longer retroactively change a date's or account-day's already-served word; see the "Word bank" section above.
4. Grew the word bank from 26 to 1,147 entries via the content pipeline's full batch run.
5. A batch of outstanding-debt fixes: server-fed session in the root layout (kills the sign-in loading flash) — replaced 2026-09-20 by a pre-paint session hint so the root layout can stay static; see that session below — an O(n) rewrite of the puzzle eligibility scan, a per-email cooldown on magic-link sign-in requests, test coverage for `postDailyWordToBluesky`'s failure path, and pagination for `/history`'s "All words" view.

## This session (2026-09-19): design system consolidation

A 16-task plan (`docs/superpowers/plans/2026-09-19-design-system-consolidation.md`) that tokenized the remaining ad-hoc styling, extracted five shared UI primitives, fixed the app's real WCAG contrast failures, and documented all of it in `docs/design-system.md`. Four phases:

1. **Phase 1 — token consolidation** (`app/globals.css`'s `@theme inline` block). Added `--text-micro`/`--text-display` (type), `--tracking-headline`/`-label`/`-eyebrow`/`-eyebrow-wider`/`-section` (deliberately not named `tracking-wide`/`wider`/`widest` — those Tailwind defaults are already used elsewhere with different values and would have been silently overridden), `--leading-display`/`-body`, `--container-page`/`-form` (640px/440px, rolled out across `HistoryList`, `PuzzleGame`, `StoryView`, `Header`, `Footer`, `ArrivalHero`, `TodayHero`, `login`/`account`/`unsubscribed`, `CollectionScreen`), and `--duration-theme` (250ms, the light/dark fade — deliberately not in `@theme inline` since it doesn't back a Tailwind utility). `CollectionScreen.tsx` and `ArrivalHero.tsx` were migrated off scattered arbitrary values (`text-[10px]`, `tracking-[-0.015em]`, etc.) onto these tokens. `lib/ogTheme.ts` was pulled out to hold the OG-image hex literals that can't use CSS variables (server-rendered image generation).
2. **Phase 2 — `components/ui/` primitives**, five new files, each migrated across real call sites:
   - `Button.tsx` (`primary`/`secondary`/`ghost`/`link` variants) — 17 of 18 non-icon button call sites migrated (the one holdout is `AdminDashboard.tsx`, out of scope — see below).
   - `IconButton.tsx` (required `label` prop → mandatory `aria-label`, `min-h-11 min-w-11` tap target, optional `bordered`) — migrated `ThemeToggle.tsx` and `HistoryList.tsx`'s favorite-heart toggle.
   - `TextField.tsx` (label/error/icon support, `role="alert"` + `aria-describedby` on error) — migrated all 4 text inputs app-wide, and dropped a now-redundant `focus:border-accent` (the global `:focus-visible` ring already covers it, and the duplicate would have fired on mouse clicks too).
   - `SegmentedControl.tsx` — exports two components with different ARIA semantics: `SegmentedTabs` (`role="tablist"`/`aria-selected`, one-of-many) and `ToggleGroup` (`aria-pressed`, independent on/off). Migrated `CollectionScreen`'s language filter and `HistoryList`'s tabs/filters; also added a missing `aria-selected` to `HistoryList`'s tabs that pre-dated this work.
   - `Eyebrow.tsx` (polymorphic `span`/`p` uppercase micro-label) — migrated 10 of 15 in-scope instances (5 excluded via `AdminDashboard.tsx`, same exclusion as `Button`).
   - `components/AdminDashboard.tsx` is the **one deliberate, permanent exclusion** from all of Phase 2 and Phase 3 — internal tooling, not part of the design system. Don't treat it as a reference and don't "fix" it as a drive-by.
3. **Phase 3 — 5 measured WCAG contrast fixes + 3 new aria-live regions.** (The plan's own early draft said "four" fixes in a couple of places — that was stale; the actual, verified count is **five**.) Approved values (see `docs/design-system.md` §1 for the full ratio table):
   - `--ink-faint` darkened `#8a9089` → `#5b665f` (light, now **5.07:1** on `paper`) and `#7d7666` → `#b0a891` (dark, now **7.75:1**) — it now renders identically to `--ink-soft` in both themes; the two token names stay separate because they mark different semantic roles (secondary vs. tertiary text) even though currently visually identical.
   - `--accent-button` added (`#7a4f1e` light / `var(--accent)` dark) so `Button`'s `primary` fill hits **6.01:1** text contrast with `text-paper` on top — plain `--accent` (`#9c6b30`) didn't clear it.
   - `--line-strong` added (`#8c806a` light / `#6b6250` dark) for borders on interactive controls (`Button secondary`, `IconButton` bordered state, `TextField`'s input border), clearing the 3:1 non-text ratio at **3.29:1** (light) / **3.05:1** (dark) — plain `--line` stays as-is for purely decorative dividers.
   - Three new `aria-live` regions (`app/login/page.tsx`, `components/EmailSignupInline.tsx`, `components/PuzzleGame.tsx`): sign-in and signup error messages now use `role="alert"`, the signup success message and the puzzle's solved/missed outcome now use `role="status"`, and the puzzle's "wrong guess" flash now uses `role="alert"` — all previously silent to screen reader users on state change.
4. **Phase 4 — `docs/design-system.md`** written and fact-checked against the actual code (not the original plan) — the canonical reference for tokens, all five primitives' props/variants/real call-site examples, and the non-obvious rules (pill-by-default radius with one deliberate `!rounded-md` exception on `HistoryList`'s "Show more" button; serif-for-reading/sans-for-everything-else split; the `AdminDashboard.tsx` exclusion).

This was done via the `superpowers` subagent-driven-development process (plan + specs under `docs/superpowers/plans/2026-09-19-design-system-consolidation.md` and `docs/superpowers/specs/`), one task per commit, `git log` has each task's individually-reviewed commit. If you add new UI, read `docs/design-system.md` first — a new arbitrary Tailwind value or a hand-rolled `<button>`/`<input>` outside `components/ui/` should be treated as a regression now, not a shortcut (see `AGENTS.md`'s new "Design system" pointer section).

## This session (2026-09-20): search discoverability

Before this session, effectively none of Curio's 1,147 word-story pages
were discoverable: no `sitemap.xml`, no `robots.txt`, every route in the
app rendered dynamically (`ƒ`), and `/history` — the only index — could
only ever show the ≤263 words the shared calendar had reached so far, 60
of them before a client-side "Show more". Plan:
`docs/superpowers/plans/2026-09-20-search-discoverability.md`, spec:
`docs/superpowers/specs/2026-09-20-search-discoverability-design.md`, 9
tasks via the `superpowers` subagent-driven-development process, one
implementer + reviewer cycle per task plus a final whole-branch review
that caught three more Important findings once every piece was visible
together (see below) — the ledger at
`.superpowers/sdd/2026-09-20-search-discoverability/progress.md` has every
ruling in full if any of this needs re-deriving.

**The root-layout finding, prominently, because it's the one silent
regression risk this session leaves behind:** `app/layout.tsx`'s
`await auth()` (added 2026-09-18 to feed `<SessionProvider>` a
server-resolved session) reads cookies, and reading cookies in the root
layout opts *every* route that shares it into dynamic rendering — not
just `/`, which legitimately needs it, but `/attribution`, `/login`,
`/words` and all 1,147 `/story/[slug]` pages too, none of which ever
called `auth()` themselves. Removing that call (and `/story/[slug]`'s own
independent `auth()` call — both had to go) is what let Next actually
prerender the story pages. **If anyone adds a server-side `auth()`,
`cookies()` or `headers()` call back to the root layout, every route
silently goes dynamic again — there is no error, no warning, nothing in
the diff that flags it. The build's route table (`● ○ ƒ` next to each
route) is the only place it shows up.** Check it after touching
`app/layout.tsx`, every time.

What landed, in task order:

1. **`sitemap.xml` + `robots.txt`** (`lib/seoRoutes.ts`, `app/sitemap.ts`,
   `app/robots.ts`) — `PUBLIC_ROUTES` (5 crawlable routes) and
   `DISALLOWED_PATHS` (account/auth/API paths) are the one source of truth
   both files read, so they can't drift apart from each other or from the
   real route structure.
2. **Root layout + story page stop calling `auth()`** (see above) —
   `SessionProvider` now resolves the session purely client-side again.
3. **The session hint, replacing nav flicker on `/`.** Dropping server-side
   `auth()` reintroduced the exact nav-flicker problem the 2026-09-18
   server-session change had fixed: `useSession()` reports `"loading"` on
   every cold load until its client-side `/api/auth/session` fetch
   resolves, and the header has to render *something* in the meantime.
   The plan's original design was a `useSyncExternalStore`-based hook
   (`useSessionStatus`) reading an optimistic `localStorage` "was signed
   in" flag — **this was reviewed, found to have two real bugs, and
   replaced.** `useSyncExternalStore`'s server snapshot is `false` during
   hydration by construction, so the hint literally could not affect first
   paint (the signed-in nav would still flash in after a hydration swap,
   breaking the "no flicker" promise the user had approved), and mapping
   `"loading"` → `"unauthenticated"` reintroduced the exact regression
   `useShowArrival`'s guard exists to prevent: a first load on a new
   device after signing in (no hint written yet) flashed the arrival hero
   at a signed-in user. **What actually shipped instead** is the repo's
   existing `ThemeInit` pattern: `components/SessionHintInit.tsx` is an
   inline `<script>` in `<head>` that reads `localStorage`'s
   `curio:signedIn` (`SESSION_HINT_KEY` in `lib/storage.ts`) *before*
   hydration and sets `html[data-signed-in]`; `app/globals.css` adds a
   `signed-in:` Tailwind custom variant keyed off that attribute; and
   `components/Header.tsx` renders **both** nav pairs (signed-in and
   signed-out) whenever `useSession()` is `"loading"`, letting CSS — not a
   post-hydration render — pick the right one before the user ever sees a
   frame. Header's own effect is the *only* writer of the hint, firing
   once `useSession()` actually resolves. It is display-only by
   construction (a plain CSS attribute selector, nothing gating an API
   call), and `components/AccountFavoritesSync.tsx` and
   `components/PuzzleGame.tsx` deliberately keep reading `useSession()`
   directly rather than the hint — same reasoning `lib/useShowArrival.ts`
   already used before this session. `lib/useSessionStatus.ts` and the
   original hook were deleted, not left dead in the tree.
4. **Story pages become purely static** (`app/story/[slug]/page.tsx`,
   `app/api/story/[slug]/date/route.ts`, `components/StoryDate.tsx`) — the
   personalized/shared "featured on" date and the `recordUserSeen` side
   effect moved out of the page body into a route handler the client
   fetches after mount, so the page itself never touches `auth()`,
   cookies or Redis. Result: `/story/[slug]` went from `ƒ` (dynamic) to
   `●` SSG, 1,147 paths prerendered. **Correcting an overstatement in the
   original plan prose:** the 263-key Redis `mget` inside
   `resolveHistory()` is gone from the static page itself *and* from
   every crawler (crawlers don't run JavaScript, so `StoryDate`'s fetch
   never fires for them) — but it has **not** been eliminated for human
   traffic. A signed-out human visitor still triggers it, once per story
   page they load, via that same client-side date fetch; only the
   page-render cost moved off the request path, not the Redis read
   itself.
5. **`/words`**, a static A–Z index of all 1,147 words (previously only
   `/history` existed, capped at ≤263). Linked from the footer and from
   `/history`.
6. **Canonical URLs + real metadata** on story pages — `lib/siteUrl.ts`
   centralizes the `CURIO_SITE_URL` origin; `generateMetadata` sets a
   relative `alternates.canonical` (resolved against `metadataBase`) and a
   real per-word `<meta name="description">` from `teaser` (every teaser
   in the bank is ≤151 characters, so nothing truncates). Page-level
   `openGraph` restates `type`/`siteName` explicitly, because Next
   replaces a layout's `openGraph` wholesale rather than merging it —
   omitting them would have silently dropped `og:type`/`og:site_name` from
   all 1,147 pages.
7. **`DefinedTerm` JSON-LD** (`lib/storyJsonLd.ts`) on every story page —
   `DefinedTerm`, not `Article`: Curio's story pages have no author, no
   publication date and no article body, and `Article` would require
   inventing at least one of them.
8. **Deterministic inter-page linking** (`lib/relatedWords.ts`), replacing
   the plan's original idea of matching headwords inside the `related`
   prose sentence — measured across all 1,147 entries, prose matching only
   covered 19.3% of pages and produced false positives on incidental
   English words (`salary → phrase`, `clue → sail`), so it was rejected
   before implementation. What shipped instead groups words by
   `WordEntry.lineage`'s most specific shared source language, plus a
   same-sorted-list alphabetical prev/next that forms a single cycle
   through all 1,147 words (guaranteeing every page has at least two
   outbound links, including the 65 words with no language peer at all).
   **The final whole-branch review caught that this was rendered under one
   heading, "More words from {language}", which is false whenever the
   neighbours don't share that language — true on 1,017 of 1,082 labelled
   pages (1,808 of 6,133 total links).** Fixed by splitting the return
   value into `peers` (rendered under "From {language}" — every peer
   genuinely shares it, tested) and `neighbours` (rendered separately
   under "Nearby, A–Z"). Measured: 0 words end up with zero inbound links
   from this block; every page has 2–6 outbound links.

**Two more Important findings from the final whole-branch review, both
fixed** (the same kind of cross-task integration bug that only a
whole-branch review catches — see the 2026-09-12 session below for the
first time this happened):
- Anonymous first-timers landing on `/` had to wait out the client-side
  `/api/auth/session` fetch before flipping to the arrival hero, because
  losing server-side `auth()` in the root layout also removed the signal
  that used to make that flip happen right after hydration. Fixed by
  `app/page.tsx` (already dynamic, already calling its own `auth()`)
  rendering `components/ServerSessionMarker.tsx` — a second inline
  pre-hydration script, separate from the session hint, setting
  `html[data-server-session="in"|"out"]` — which `lib/useShowArrival.ts`
  consults *only* while `useSession()` is `"loading"`. **Parked
  limitation, ruled acceptable:** the marker script only executes on a
  cold (full-navigation) load of `/`; a client-side `Link` navigation
  into `/` inserts the same script via `dangerouslySetInnerHTML`, which
  browsers never execute. That path just falls back to the ordinary
  `"loading"`-wait behavior every other route already has — safe, not
  faster, and `useSession()` has normally already resolved by the time of
  a follow-on client navigation anyway.
- `app/sitemap.ts`'s comment hardcoded "1,151 URLs / 4 public routes",
  which the `/words` addition (task 5) had already made stale (1,152 / 5).
  Fixed by dropping the hardcoded counts from the comment entirely and
  keeping only the 50,000-URL ceiling note, so it can't go stale again the
  next time `WORDS` grows.

**Final, controller-verified build state:** route table shows `●
/story/[slug]` at 1,147 paths, `○ /words`, `○ /attribution`, `○ /login`,
`○ /_not-found`, `○ /sitemap.xml`, `○ /robots.txt`; `/` and
`/api/story/[slug]/date` stay `ƒ` (correctly — both have a real reason to
be dynamic). Sitemap: 1,152 `<loc>` entries. Tests: 194/194. Lint: the
same 3 pre-existing warnings from before this session
(`lib/puzzle.test.ts:3`, `scripts/approveDraft.test.ts:36,211`) — no new
ones.

**Signed-in verification.** Implementers verified every signed-out path
live and the hint's pre-hydration read by seeding `curio:signedIn=1` in a
signed-out browser, but could not create accounts or click magic links on
the user's behalf — accounts run on the shared production Upstash, so
"sign in" means a real session in real prod data. The controller ran the
one signed-in check after all 8 feature tasks, with **the user signing
in themselves** in the browser pane, then verified: all 11
personal-rotation words return the correct personal date via
`/api/story/<slug>/date` (decisive cases — `client`, shared date
2026-07-24, personal date Mon Sep 14; `citrus`, shared date 2026-07-20,
personal date Sat Sep 12); the real sign-in wrote `curio:signedIn=1`, and
the static `/attribution` HTML painted Today/Collection/Account on the
very first frame; the related-words block at 375px in both themes with no
horizontal overflow; anonymous `/` carries `data-server-session="out"`,
`/attribution` carries no marker at all (only `/` sets one). **The
fresh-private-window arrival-hero check was not done in an actual browser
window** — the available browser profile was already signed in, so
instead the controller verified the server marker and
`useShowArrival`'s consult-only-while-loading logic by reading the code
and confirming the attribute/state-machine directly, not by observing a
real signed-out first-timer's first paint.

**Deferred, with reasons** (see the ledger for the full list — these are
the ones worth knowing about):
- **No `cacheComponents`/PPR migration.** It's the "proper" Next 16 answer
  to a static shell with a streamed session, but it's an app-wide change
  touching every uncached read across `/`, `/history`, `/play`,
  `/collection` and `/admin` — disproportionate to, and much riskier than,
  this task.
- **`lib/email.ts` and `lib/bluesky.ts` still spell out the
  `CURIO_SITE_URL` + localhost fallback inline**, rather than using the
  new `lib/siteUrl.ts`. `app/layout.tsx` does use it now. Refactoring two
  outbound-message code paths mid-SEO-task risked more than it saved;
  left alone on purpose.
- **Date-format options are duplicated** across the date route,
  `app/page.tsx` and `lib/email.ts` — moved around by this branch, not
  newly introduced.
- **`StoryView`'s "Browse all words →" link still points at `/history`**
  (capped at ≤263 words) sitting right next to the new "All words A–Z →"
  link that points at `/words` (all 1,147). This is a copy/IA decision
  left for the user, not an oversight.
- **The story-page date is now JavaScript-dependent** (fetched by
  `StoryDate` after mount) — a deliberate trade for making the page
  statically prerenderable; a no-JS visitor (or a crawler) never sees the
  "featured on" line at all.
- **Google Rich Results Test and Search Console sitemap submission are
  post-deploy items** — both need a real public URL to run against and
  can't be verified from a local build.

This was done via the `superpowers` subagent-driven-development process,
one task per commit (`git log 8149041..HEAD`), plus the final whole-branch
review and fix wave described above.

## This session (2026-09-26): domain cutover + one shared word

Two phases of a pre-launch brief (a third, Bluesky link cards, and a
front door on story pages are still to come):

- **Phase 0 — `curioword.com`** (see "Domain cutover" above).
- **Phase 1 — one shared word for everyone.** Plan:
  `docs/superpowers/plans/2026-09-26-shared-daily-word.md` (its "Brief"
  holds the owner's decisions and amendments). Via subagent-driven
  development, 8 tasks + a final whole-branch review and one fix wave:
  1. `lib/day.ts`, the one UTC clock.
  2. `resolveHistorySince`, plus tests that past shared days are
     immutable.
  3. Home, `/history`, `/collection` and the story date read the shared
     calendar. Copy changed: "Your word · {date}" / "{date}" → "Today's
     word · {date}"; History's "Your personal word order — one new word a
     day since you joined. It'll grow day by day; browse all words in the
     meantime." → "Each day's word since you joined. Browse all words any
     time."; "Your first word arrives tomorrow morning." and "You're in.
     Your first word arrives tomorrow." → "Tomorrow's word arrives in the
     morning." / "You're in. Tomorrow's word arrives in the morning."
     History's date labels were also formatted in the viewer's local
     timezone (a US viewer saw each word under the previous day) — fixed.
  4. The digest sends every subscriber the shared word from one `now`;
     `getUserIdByEmail` deleted.
  5. `/play` also avoids the next 30 shared days.
  6. The per-account rotation code deleted (data kept — see "Accounts").
  7. `app/sharedDay.test.ts`, the cross-surface consistency suite.
  8. `scripts/resetJoinedAt.ts` (dry run by default, backup first,
     idempotent, `--dry-run` + `--apply` rejected).
  Tests: 197 → 208. Lint: the same 3 pre-existing warnings.
- **Deploy-day note:** adding the next-30 exclusion changes `/play`'s
  eligible pool, so the puzzle answer changes on the UTC day this
  deploys; a player who solved it earlier that day sees their solved state
  against a different word. Deploying just after 00:00 UTC avoids it.

## Workflow notes for whoever picks this up

- Two sessions so far have used the `superpowers` subagent-driven-development
  process for larger, multi-file features: 2026-09-10 (accounts — plan at
  `docs/superpowers/plans/2026-09-10-user-accounts.md`) and 2026-09-12 (the
  four-item batch described above — plan at
  `docs/superpowers/plans/2026-09-12-daily-send-arrival-bluesky-content.md`).
  `git log` has the individually-reviewed commits either produced.
  Everything else (the 2026-09-11 UX review round and 8-item batch, the
  Collection screen at the start of the 2026-09-12 session) was done
  directly, one item at a time, verified live after every change, committed
  in logical chunks — not through that heavier process. Match whichever
  scale fits the next ask; don't default to the heavy process for a small
  tweak.
- **Always verify claims against live behavior, not just code review** —
  three separate sessions now have each caught at least one real,
  non-obvious bug (a Redis peer-dependency conflict only visible on a
  genuinely clean `npm ci`; the Lightning CSS focus-ring bug below; the
  `ArrivalHero` success-message and `approveDraft.ts` bracket-matching bugs
  above) specifically by re-checking against a clean environment or a real
  dry-run, after the code *looked* correct and a naive implementer had
  already moved on. All would have shipped silently otherwise.
- Local dev servers and `.next` build artifacts were consistently cleaned
  up after each verification pass in every session so far (`Stop-Process`,
  `rm -rf .next`) — do the same; a stray dev server, `.next` directory, or
  (2026-09-12's addition to this list) a merged-but-not-removed worktree
  left inside the repo has repeatedly caused false-positive lint/test noise
  (ESLint and Vitest both walk into anything not gitignored cleanly from
  their own cwd).
- `.env.local`, `.vercel/`, `.worktrees/`, `.claude/` are all gitignored
  and none currently exist in a fresh clone — recreate `.env.local`
  yourself (ask the user for values) and re-run `vercel link --project
  etymology-app --yes` (not `etymology-app-orcin` — see the Vercel gotcha
  above) before deploying from a new checkout.

## Where the conversation was headed next

The 2026-09-11 session ended mid-brainstorm on "how could Curio be
improved, ensuring improvements are achievable" (product/UX quality first,
monetization later). Two of that thread's angles now have partial answers
from this session: the content-volume question (only 8 words) has a
scaffolded pipeline waiting for someone to actually run it against a real
dump (see "Growing the word list" above), and the "your own shelf of
words" idea materialized as the Collection screen. Still open from that
list: search/browse-by-letter (partially done — History has a search
input), and a "send this word to a friend" low-friction share flow. The
Bluesky presence and the arrival-hero/cron work that filled most of this
session came from a separate, explicit ask — not a continuation of that
brainstorm — so don't assume they closed out its open questions.
