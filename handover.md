# Curio — Handover

Last updated: 2026-09-11, after a long session that took this from a
Next.js scaffold to a deployed product with accounts and a full UX pass.
This doc exists so a fresh Claude Code session (or a human) can pick up
without re-deriving all of the above from git log.

## What this is

Curio is a daily-word-etymology app: one word a day, its origin story, an
optional email digest, and (as of this session) accounts with synced
favorites and a personalized word order. Tagline/positioning: **"one word,
one story, every day — no feed, no backlog to catch up on."** That
positioning is a real constraint, not just marketing copy — it's already
shaped a couple of decisions below (see "Rejected: retroactive history
backfill").

**Live at:** https://etymology-app-orcin.vercel.app
**Vercel project:** `etymology-app` (⚠️ not literally named
`etymology-app-orcin` — that's just its domain, which got a random suffix
from a name collision. See "Vercel gotcha" below if you ever need to
re-link this directory.)
**No GitHub remote** — this repo is local-only (`git log` is the full
history; there's no PR to look at, no other branch).

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
```

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
- **Story pages show the wrong date when reached from a personalized
  History click** (`app/story/[slug]/page.tsx` derives date from the
  *shared* calendar via `getHistory()`, not the viewer's personal day).
  Needs its own small design, not a quick fix.
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
  needs a redesign (e.g. a menu), not just another `<Link>`.
- **Onboarding banner's HourWheel is a touch/scroll-first interaction** —
  works but is a little fiddly with a mouse on desktop. Not addressed.
- **`onboarded/dismissed` state and account-linked email preferences live
  in two different systems** (localStorage vs. Redis) with no UI
  reconciling them beyond what `AccountFavoritesSync` does for favorites
  specifically. Not a bug, just worth knowing before "fixing" what looks
  like an inconsistency.

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

## Workflow notes for whoever picks this up

- This session did the big accounts feature via the `superpowers`
  subagent-driven-development process (see
  `docs/superpowers/plans/2026-09-10-user-accounts.md` for that plan, and
  `git log` for the individually-reviewed commits it produced). Everything
  since then (the UX review round and this last 8-item batch) was done
  directly, one item at a time, verified live in the Browser pane after
  every change, committed in logical chunks — not through that heavier
  process. Match whichever scale fits the next ask; don't default to the
  heavy process for a small tweak.
- **Always verify claims against live behavior, not just code review** —
  this session caught two real, non-obvious bugs (a Redis peer-dependency
  conflict that only showed up on a genuinely clean `npm ci`, and the
  Lightning CSS focus-ring bug above) specifically by re-checking against
  a clean environment / real interaction, after the code *looked* correct
  and a naive implementer had already moved on. Both would have shipped
  silently otherwise.
- Local dev servers and `.next` build artifacts were consistently cleaned
  up after each verification pass in this session (`Stop-Process`,
  `rm -rf .next`) — do the same; a stray dev server or `.next` directory
  left inside a worktree has previously caused false-positive lint/test
  noise (ESLint and Vitest both walk into it if it's not gitignored
  cleanly from their own cwd).
- `.env.local`, `.vercel/`, `.worktrees/`, `.claude/` are all gitignored
  and none currently exist in a fresh clone — recreate `.env.local`
  yourself (ask the user for values) and re-run `vercel link --project
  etymology-app --yes` (not `etymology-app-orcin` — see the Vercel gotcha
  above) before deploying from a new checkout.

## Where the conversation was headed next

The user asked for a "deep UX/UI review" (delivered, and mostly acted on
across two rounds — see git log from `295da70` through `d6cc6d5`) followed
by product brainstorming on "how could Curio be improved, ensuring
improvements are achievable" — framed explicitly as **product/UX quality
first, monetization and growth later**. That brainstorm got one round in
(the "what is Curio competing with" / single-daily-moment vs.
accumulated-collection framing) before pivoting into the concrete UX
review instead. If resuming that thread, good next angles already
identified: search/browse-by-letter (partially done — History now has a
search input), a "send this word to a friend" low-friction share flow,
and the content-volume question (only 8 words) as the thing most other
improvements are secretly capped by.
