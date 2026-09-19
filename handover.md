# Curio — Handover

Last updated: 2026-09-19, after a session that consolidated the design system: token cleanup in `app/globals.css`, five new `components/ui/` primitives migrated across the app, five WCAG contrast fixes, three new aria-live regions, and a new `docs/design-system.md`. This doc exists so
a fresh Claude Code session (or a human) can pick up without re-deriving
all of the above from git log.

## What this is

Curio is a daily-word-etymology app: one word a day, its origin story, an
optional email digest, accounts with synced favorites and a personalized
word order, and (as of this session) a personal "collection" view and a
Bluesky presence. Tagline/positioning: **"one word, one story, every day —
no feed, no backlog to catch up on."** That positioning is a real
constraint, not just marketing copy — it's already shaped a couple of
decisions below (see "Rejected: retroactive history backfill").

**Live at:** https://etymology-app-orcin.vercel.app
**Vercel project:** `etymology-app` (⚠️ not literally named
`etymology-app-orcin` — that's just its domain, which got a random suffix
from a name collision. See "Vercel gotcha" below if you ever need to
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
CURIO_FROM_EMAIL          # "Curio <onboarding@resend.dev>" in prod today
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
lot less forgiving than the same fallback landing in an email.

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
error. The live domain is `etymology-app-orcin.vercel.app`, but the
project itself is named `etymology-app` (domain got a random suffix from a
name collision when it was created). If you ever need to re-link, use
`vercel project ls` first to find the real project name behind a domain —
don't assume the domain and the project name match.

## Architecture map

- `lib/words.ts` — the word content (`WORDS: WordEntry[]`) and all the
  date/rotation logic. This is the single most important file to read
  before touching anything content- or history-related. Key exports:
  - `getTodayWord()` / `getHistory()` — the shared, calendar-based
    experience every anonymous visitor sees (same word for everyone on a
    given date).
  - `getWordForUser(userId, joinedAt, today?)` / `getHistoryForUser(...)`
    — the *personalized* experience for signed-in accounts: a seeded
    shuffle of `WORDS` unique to that user id (`getPersonalOrder`),
    advancing one word per day since they joined. Pure, deterministic,
    fully unit-tested in `lib/words.test.ts`.
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
- `lib/userData.ts` — per-account server data: join date (anchors
  personalization) and favorites (Redis Set), all keyed
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
  reduced header) at signed-in users on a fresh browser before this was
  fixed. `app/layout.tsx`'s `<SessionProvider>` is now fed a
  server-fetched `session` prop (2026-09-18, see "This session" below),
  which was the actual root cause of that loading window — the cold-load
  flash this guard exists for no longer happens; the guard itself stays in
  place as defense-in-depth for any client-side transition that still
  passes through `"loading"`.
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

**`/play` is now open** — the eligible pool (words not shown in 30+ days)
comfortably clears `PUZZLE_MIN_POOL_SIZE` (10) at this word count, verified
live (a real puzzle rendered, not just code review). If the word count
ever somehow dropped back under ~40, it would honestly close again — that
behavior is unchanged, just no longer reachable at 1,147.

**Important, if you ever grow `WORDS` again:** confirm `81d8203`'s
word-locking layer (see `lib/words.ts`'s "Locking layer" section, and
`resolveTodayWord`/`resolveWordForUser`/etc.) is still in place and used by
every page. Before that fix existed, growing the array retroactively
shifted the calendar-index math for every already-served date — it
actually happened once, mid-day, during the 8→26 batch. The locking layer
persists each date's word in Redis the first time it's resolved, so later
growth can't move history out from under someone who already saw it. Don't
revert to the plain `getWordForDate`/`getWordForUser`/etc. call sites in
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
`@auth/upstash-redis-adapter`), not JWT. A brand-new account gets a
personal word rotation anchored to its join date (`recordUserJoined`,
fired from an Auth.js `createUser` event) — day 0 is
`getPersonalOrder(userId)[0]`, day 1 is `[1]`, etc., wrapping every
`WORDS.length` days. Anonymous visitors and anonymous email subscribers
are completely unaffected by any of this — they keep seeing the shared,
calendar-based word-of-the-day exactly as before accounts existed. That
separation was a deliberate constraint from the start and should stay
that way unless the user explicitly asks to change it.

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
5. A batch of outstanding-debt fixes: server-fed session in the root layout (kills the sign-in loading flash), an O(n) rewrite of the puzzle eligibility scan, a per-email cooldown on magic-link sign-in requests, test coverage for `postDailyWordToBluesky`'s failure path, and pagination for `/history`'s "All words" view.

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
