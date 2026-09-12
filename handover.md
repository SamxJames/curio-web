# Curio — Handover

Last updated: 2026-09-12, after a session that added the Collection screen,
fixed the daily-send cron, replaced onboarding with an arrival hero, added
Bluesky auto-posting, and scaffolded a content pipeline. This doc exists so
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
  fixed. `app/layout.tsx`'s `<SessionProvider>` still isn't fed a
  server-fetched `session` prop, which is the actual root cause of that
  loading window existing at all — passing one would make the arrival/today
  decision flash-free in both directions; noted as an easy follow-up, not
  done this session.
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

## Known limitation: only 8 words

`WORDS` has 8 entries. This has been flagged repeatedly as the real
ceiling on this app right now — History's "All words" tab, the
personalized rotation, and general repeat-visit value are all capped by
it. Growing the content library is a **content** task (needs real,
accurate etymology), not a code task — don't invent etymologies to pad the
list. If a future session is asked to add words, each new entry needs
`teaser`/`lineage` populated honestly (see the existing 8 for the pattern:
`lineage` is derived only from languages the entry's own
origin/journey/related text actually names, in order, ending in English).

**The tooling to do this now exists** (scaffolded this session, not yet
run against real content):

```bash
npm run content:extract -- <wiktextract-dump-path> <word>   # -> facts JSON on stdout
npm run content:rewrite -- <word> <facts-json-path>          # needs ANTHROPIC_API_KEY, writes content/drafts/<word>.json
npm run content:approve -- content/drafts/<word>.json        # after a human reads and approves the draft
```

`content:extract` needs a real Wiktextract JSONL dump (not included in this
repo — `scripts/__fixtures__/sample-wiktextract.jsonl` is a hand-built
fixture for its own tests, not real content). `content:rewrite` calls the
Claude API and costs real money per word; it never invents facts beyond
what's extracted, and never skips a thin entry — both are enforced in the
prompt text (`scripts/rewriteEtymology.ts`'s `buildRewritePrompt`).
`content:approve` is the only thing that ever touches the real
`lib/words.ts`, and only for a draft you've already read — it validates
the draft against the exact invariants `lib/words.test.ts` checks, then
re-runs that test file. If you ever edit `scripts/approveDraft.ts`'s
bracket-matching logic (`appendDraftToWordsFile`), know that the naive
`source.lastIndexOf("];")` approach is **wrong** — `lib/words.ts` has
other array literals later in the file (e.g. inside `getHistoryForUser`)
whose closing bracket also matches that string. The current code anchors
the search to start after the literal `export const WORDS: WordEntry[] = [`
text specifically; don't regress that anchor.

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

- **Resend quota shared between sign-in and the daily digest, no rate
  limiting on `/api/auth/signin/resend`.** Low-traffic project, obscure
  URL, judged disproportionate to build real rate-limiting for. Cheapest
  future fix: a second Resend API key just for auth.
- **No TTL on Auth.js's Redis keys** (sessions/verification tokens never
  expire) — this is `@auth/upstash-redis-adapter`'s own behavior, not
  fixable without forking it. Fine at current scale; would want a
  periodic manual cleanup if the account base ever grows meaningfully.
- **`/history`'s "All" list has no pagination for very long personal
  histories** — mitigated but not eliminated by `getUniqueWordsMostRecent`
  (caps the *shared* archive at `WORDS.length`); "My days" for a
  long-tenured account will still grow forever. Month-grouping (this
  session) helps readability but doesn't cap the DOM size.
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
- **`app/layout.tsx`'s `<SessionProvider>` isn't fed a server-fetched
  `session` prop** — causes a brief `useSession()` `"loading"` window on
  every cold load that `lib/useShowArrival.ts` has to specifically guard
  against (see architecture map above). Passing the session down would
  remove the window entirely; flagged this session, not fixed.
- **`lib/bluesky.ts`'s post-failure path has no automated test coverage**,
  and there's no guard for a hypothetical word+URL combination alone
  exceeding 300 characters (unlikely with the current short word list).
  Both are cheap follow-ups, not urgent.

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
