# Curio — Handover

Last updated: 2026-10-04, after the weekly demand report (see "Demand report
(weekly, internal)"). Before that, 2026-10-03 fixed and deployed two pieces of
user feedback: signed-in readers were being asked to join the email, and
people didn't notice today's puzzle. See "This session (2026-10-03, cont.):
signed-in pitch + puzzle visibility" below. Earlier the same day,
first-party traffic sources shipped. Threads + Instagram (2026-09-29) are
deployed but post nothing until the owner adds tokens; see "Threads +
Instagram: owner setup". This doc
exists so a fresh Claude Code session (or a human) can pick up without
re-deriving all of the above from git log.

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

> **Superseded 2026-10-04:** Collection did become favourites-only; see
> "This session (2026-10-04): Collection = favourites, History = archive"
> below. The reasoning is kept as history.

The owner delegated the call. `/collection` keeps its counts subline and
language band: they only ever count words already shown, never unseen
ones, so they pass the archive-vs-backlog rule. Turning Collection into
favourites would be a redesign outside the pre-launch phase. Favourites
remain the "Favorites" filter inside `/history`.

### 2026-09-26 — The shared schedule: no more A-to-Z march

A date's word is `WORDS[daysSinceStart(date) % WORDS.length]`, locked in
Redis (`curio:wordoftheday:<date>`) the first time it's resolved. The
`WORDS` literal is in approval order: 0–25 hand-picked, then alphabetical
batches — so until 2026-09-26 the daily word marched A to Z. The owner
ruled that out. `lib/words.ts`'s "Launch schedule" block now reorders every
never-served position (index 269 = 2026-09-27 onward) in place at module
load: a 27-word hand-picked opening run for the friends-and-family launch
(dinner, fiasco, sideburns, ketchup, jeans, panic, silhouette, …), then the
rest in a stable pseudo-random order keyed per slug. Positions 0–268
(everything served through 2026-09-26) are untouched and tested. A newly
approved word lands somewhere in the shuffled tail and shifts only
not-yet-served days. To change the opening run, edit `LAUNCH_OPENERS` —
but only words whose day hasn't been served yet, and before 00:00 UTC of
the first day you want to affect (a day's word locks on first view).

Phase 3 (Bluesky) format chosen 2026-09-26: **(a)** teaser first, then
`word · lineage arrows`, then `#etymology #wordoftheday`, with the link in
an embed card — fits 300 graphemes for every word in the bank (max 291,
"wine").

### 2026-09-28 — Phase 3 shipped: Bluesky link cards

Format (a) as chosen above, plus the card itself: the link moved out of
the post text into a Bluesky external embed, with the story's own title
(`lib/storyTitle.ts`'s `storyPageTitle(word)` — the same string the story
page's `<title>`/`og:title` use, so the card and the page it opens can't
drift apart) and a fixed description, `CARD_DESCRIPTION` in
`lib/blueskyPost.ts`: "One word's origin story, every morning. No feed, no
backlog." — not the teaser, since that's already the post's first line.

The rule for any future reordering: **Future days can be hand-reordered safely by permuting only
positions after today's index** (268 on 2026-09-26) — that leaves every past
date's formula result unchanged, locked or not (`lib/wordsLocking.test.ts`
pins this). Moving words into or out of past positions is protected for
display by the locks, but `/play`'s windows use the formula, not the
locks. A dated schedule file would be the cleaner long-term mechanism if
front-loading becomes a regular need.

### 2026-09-29 — Threads and Instagram are channels, and the tokens are the on switch

Once a day the shared word goes to **Threads** (a text post with a link
card) and to **Instagram** (a 4–6 slide carousel of 1080×1350 JPEGs), both
built only from the word's stored, reviewed fields: no new facts are
written. The owner approved the plan's proposed defaults as written on
2026-09-29 (channels, timing, text formats, the `sharp` dependency and the
on-switch below); the plan
(`docs/superpowers/plans/2026-09-29-threads-instagram.md`) holds them in
full.

- **A separate cron, `0 10 * * *`** (`/api/cron/social`), not bolted onto
  the 09:00 digest. Hobby fires a daily cron anywhere in its scheduled
  hour, so posts land 10:00–10:59 UTC, after the email and Bluesky post. A
  slow Instagram upload can therefore never delay email.
- **The tokens are the on switch.** It deploys with no Meta tokens set:
  both posters then only log what they would have posted, like Bluesky
  without its app password. Nothing posts until the owner has reviewed the
  real slides at `https://curioword.com/social/carousel/<slug>/<n>`, set
  the four env vars and redeployed. It's also the off switch: removing a
  channel's token in Vercel and redeploying stops that channel, even
  though Redis still holds a refreshed copy.
- Per-channel day locks, like email and Bluesky, so a repeated run can't
  double-post; `?repost=threads|instagram` forces one channel (see
  "Re-sending the Threads / Instagram posts by hand (production)").

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
UNSUBSCRIBE_SECRET        # node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
AUTH_SECRET               # node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
BLUESKY_IDENTIFIER        # curiodaily.bsky.social — public handle, not a secret
BLUESKY_APP_PASSWORD      # generated in Bluesky's own Settings -> App Passwords, never the account login password
# Optional since 2026-09-29: without them /api/cron/social only logs what it would post.
THREADS_USER_ID           # the Threads account's numeric user id
THREADS_ACCESS_TOKEN      # long-lived; refreshed weekly into Redis in production (lib/metaTokens.ts)
INSTAGRAM_USER_ID         # the professional Instagram account's numeric user id
INSTAGRAM_ACCESS_TOKEN    # long-lived; refreshed weekly into Redis in production (lib/metaTokens.ts)
```

`ANTHROPIC_API_KEY` (for `npm run content:rewrite`) is deliberately **not**
in that list — it's local/dev-only tooling for the content pipeline, never
needed by the deployed app, and isn't set in Vercel.

The four Threads/Instagram vars are the on switch for those channels: with
either of a channel's two vars missing it logs `[curio:threads:dev-fallback]` /
`[curio:instagram:dev-fallback]` and posts nothing. The Vercel value is
only the *seed* for the token: in production `lib/metaTokens.ts` keeps the
live copy in Redis and refreshes it weekly, so replacing the Vercel value
(after a revoked token, say) is how you re-seed it; everywhere else the env
value is used as-is and Redis is never touched. See "Threads + Instagram:
owner setup" for how the owner creates them.

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
that route being safe. `/api/cron/social` (2026-09-29) fails closed the same
way, through the shared `authorizeCron` in `lib/cronAuth.ts`, and its
`?repost=` override needs the secret to be set too (without it, 401).

`UNSUBSCRIBE_SECRET` (added 2026-09-27) fails closed the same way, but
unconditionally in production, not just on a missing check: the digest
route reads it before claiming any lock, and if it's unset it sends
nothing, posts nothing, and logs loudly instead. It signs every
unsubscribe link and `List-Unsubscribe` header (`lib/unsubscribeToken.ts`),
so changing its value doesn't just fail future sends — it breaks every
unsubscribe link already sent under the old value. Don't rotate it the
way `CRON_SECRET` is to be rotated below; there's no cheap re-send to recover
those links.

**Important:** local dev and production point at the *same* Upstash
database (there's only one Upstash instance for this whole project).
Testing locally with real credentials writes real data — favorites,
subscriptions, accounts — into the same store production reads from. This
has been fine at this project's traffic level, but don't assume local
testing is sandboxed. The one deliberate exception is the daily send's run
locks and pending set (`lib/digestRuns.ts`): they only use Redis when
`VERCEL_ENV === "production"`, so a local `curl localhost:3000/api/cron/send-daily`
can't claim production's day locks (which would make the real 09:00 run
skip everyone) or overwrite its pending set.

## Deploying

```bash
vercel deploy --prod
```

The directory is already linked (`.vercel/project.json`, gitignored). All
the required production env vars are already set in Vercel — you're not
starting from scratch. The exception is the four optional Threads/Instagram
vars, which the owner sets themselves (they're the on switch for those
channels; see "Threads + Instagram: owner setup"). Confirm the link before deploying if anything seems off:

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
  Production's, so a local `curl` to the prod cron 401s. As of 2026-09-27
  the daily send is idempotent per UTC day, so Vercel → Settings → Cron
  Jobs → **Run** is now a no-op on a day that has already run (it can't
  add query parameters, so it can't trigger `?force=1` or
  `?resend=failed` either) — see "Re-sending the digest by hand
  (production)" below for how to actually trigger a deliberate re-send.

### Re-sending the digest by hand (production)

**Where the secret comes from.** The production `CRON_SECRET` is a
*sensitive* Vercel variable: neither the dashboard nor `vercel env pull`
can show it. **Pending until the deploy step (plan Task 9): nothing has
been rotated yet.** Task 9 rotates it once, to a value the owner keeps in
their password manager as "Curio CRON_SECRET (production)"; until then no
such entry exists and the current production value can't be read back, so
these commands can't be run. `.env.local`'s `CRON_SECRET` is a
different, local-only value. The rotation (and, if the stored one is ever
lost, any later one) is `vercel env add CRON_SECRET production --sensitive
--force` and a redeploy; Vercel Cron picks up the new value automatically.

**Loading it into a Git Bash shell without it landing in shell history:**

```bash
read -rs CURIO_CRON_SECRET && export CURIO_CRON_SECRET   # paste, then Enter
```

**Commands** (same UTC day as the send; each prints the JSON response):

```bash
# Only today's failed recipients who are still subscribed. Never posts to Bluesky. Safe to repeat.
curl -sS -H "Authorization: Bearer $CURIO_CRON_SECRET" "https://curioword.com/api/cron/send-daily?resend=failed"

# Every subscriber again. Bluesky posts only if it hasn't already today.
curl -sS -H "Authorization: Bearer $CURIO_CRON_SECRET" "https://curioword.com/api/cron/send-daily?force=1"

# Every subscriber again AND a second Bluesky post.
curl -sS -H "Authorization: Bearer $CURIO_CRON_SECRET" "https://curioword.com/api/cron/send-daily?force=1&bluesky=1"

# Bluesky only, no email at all — for a day whose post failed or went out wrong.
curl -sS -H "Authorization: Bearer $CURIO_CRON_SECRET" "https://curioword.com/api/cron/send-daily?repost=bluesky"
```

**Reading the response:** `attempted`/`sent`/`failed` are this run's email
counts, `bluesky` is whether this run posted, and `alreadyRan: { email,
bluesky }` says which channels were skipped because today's lock was
already held. `failed > 0` → run `?resend=failed`.

Invocation timed out / no JSON response → the set holds exactly the
not-yet-confirmed addresses; run `?resend=failed` (an in-flight batch at
the moment of the kill may be re-sent — check Resend's email log for
today first if that matters).

Today's not-yet-confirmed addresses are in Upstash at
`curio:digest:failed:<YYYY-MM-DD>` (7-day TTL, inspection only; see
Amendments). A scheduled or forced run seeds it with every recipient
before sending anything, and each address leaves it as soon as its chunk
is accepted — so per-email rejections, failed chunks and anything a killed
run never reached are all still in it.

**`?repost=bluesky` (added 2026-09-28)** is the Bluesky-only re-send: it
forces just the Bluesky lock and posts once, touching no email lock and
no pending set. It **posts publicly every time it's run** (the force is
unconditional), so run it once per real re-post, not as a check. It's
rejected with 400 combined with `force`, `resend` or `bluesky=1`, and 401
without `CRON_SECRET`, same as the other overrides. Keeping the lock after
an ambiguous Bluesky failure (a throw, a network error, an unclear
response) is still the deliberately safe default: it's easy to retry a
missed post by hand with this, hard to un-send a duplicate. It always
posts **today's UTC word** and takes today's Bluesky lock, so run it
before 00:00 UTC on the same day the original post failed — the owner is
in the UK (UTC+1), so a late-evening run can cross into the next UTC day,
posting tomorrow's word early and making the 09:00 run skip Bluesky.
There's no way to re-post a past day. It also doesn't remove an earlier
post: if the post "went out wrong", delete it in the Bluesky app first.

### Re-sending the Threads / Instagram posts by hand (production)

`/api/cron/social` (the 10:00 UTC cron) takes the same `CRON_SECRET` bearer
as above. Its only override is `?repost=`, one channel at a time:

```bash
curl -sS -H "Authorization: Bearer $CURIO_CRON_SECRET" "https://curioword.com/api/cron/social?repost=threads"
curl -sS -H "Authorization: Bearer $CURIO_CRON_SECRET" "https://curioword.com/api/cron/social?repost=instagram"
```

It forces just that channel's day lock and posts once, touching the other
channel and the email/Bluesky locks not at all. The same caveats as
`?repost=bluesky`:

- **It posts today's UTC word only**, so run it before 00:00 UTC. The owner
  is in the UK (UTC+1), so a late-evening run can cross into the next UTC
  day, posting tomorrow's word early. There's no way to re-post a past day.
- **It forces the lock and posts every time you run it.** Run it once per
  real re-post, not as a check.
- **It doesn't remove an earlier post.** If a post went out wrong, delete it
  in the Threads or Instagram app first.
- **A publish whose response was lost may already be live** (a timeout or
  dropped connection after Meta accepted it). Check the account before
  reposting.
- **A carousel with boxes instead of letters** (any glyph Geist lacks:
  Han, Greek or Arabic, but also Latin letters such as ǭ or ḱ, usually in
  a story slide). This is a known residual risk.
  Those slides are never cached, and the poster warms every slide before
  posting, but if Google Fonts fails at the exact moment Meta fetches the
  slide, next/og still returns a 200 JPEG with boxes. Recover by deleting
  the post in the Instagram app, then running `?repost=instagram`.

Rejected with 400 unless it is exactly one of `threads` / `instagram`, and
with 401 without `CRON_SECRET`. Reading the response: `{ word, threads,
instagram, alreadyRan }`, where `threads`/`instagram` say whether this run
posted and `alreadyRan` says which channels a normal run skipped because
the day's lock was held. A failed post logs `[curio:threads] post failed:`
or `[curio:instagram] post failed:` with the reason (see the architecture
map for what is and isn't logged), and — like Bluesky — keeps its lock, so
a failure is retried by hand with `?repost=`, not automatically.

## Double opt-in (signup confirmation)

Built 2026-10-03 (plan: `docs/superpowers/plans/2026-10-03-double-opt-in.md`).
Anonymous signups no longer join the list straight away; the address has to
be confirmed from its inbox first.

**Flow:**

1. The form (`EmailSignupInline`: the homepage arrival hero, `/play`'s
   post-game funnel and the story-page front door) POSTs `{ email, source? }` to
   `/api/subscribe`. It stores nothing; it emails a signed link
   (subject `Confirm your Curio subscription`) and replies
   `200 { ok: true, pending: true }`.
2. The link opens `/subscribe/confirm?token=...` (noindex). That page only
   shows the masked address and a Confirm button; an invalid or expired
   token redirects to `/subscribed?ok=0`.
3. The button POSTs to `/api/subscribe/confirm?token=...`, which adds the
   subscriber and redirects with a **303** to `/subscribed?ok=1` (or `ok=0`).

**Why a button, not the link:** Outlook Safe Links and corporate mail
scanners open every link in an email. If the GET confirmed, a scanner would
confirm addresses a bot typed in. The emailed link never changes state;
only the POST does (same pattern as unsubscribe).

**Token (`lib/confirmToken.ts`):** `payloadB64.macB64`, both base64url. The
payload is JSON `{"e": normalised email, "s": traffic source, "t": issued
unix seconds}`. The MAC is HMAC-SHA256 over `"curio:confirm:v1:" + payloadB64`,
compared with `timingSafeEqual`. It reuses `UNSUBSCRIBE_SECRET` with its own
context string, so a confirm token can never pass as an unsubscribe token or
the reverse; no new environment variable. Valid for 7 days
(`CONFIRM_TTL_SECONDS`); one issued more than 300 seconds in the future is
rejected (clock-skew allowance). **Nothing is stored for an unconfirmed
address apart from a 10-minute cooldown key (`curio:confirmcooldown:<email>`)**:
the expiry lives in the token, so there is nothing to clean up.
Rotating `UNSUBSCRIBE_SECRET` invalidates outstanding confirm links as well
as unsubscribe links.

**Already subscribed, or cooling down:** `/api/subscribe` returns the same
`200 { ok: true, pending: true }`, sends nothing and counts nothing, so the
reply never reveals whether an address is on the list. The cooldown is
`curio:confirmcooldown:<normalised email>`, `SET NX EX 600` (10 minutes, one
confirmation email per address), released with `DEL` when the send fails so
the person can retry at once. It is a no-op without Upstash.

**Fail-closed paths:**

- `503` when `UNSUBSCRIBE_SECRET` is missing in production (nothing sent).
- `502` when the send fails (cooldown released).
- `sendConfirmEmail` throws in production when Resend isn't configured
  (it never logs an address or token); in dev it logs the link instead.
- A Redis error on the subscriber lookup or the cooldown claim gives a
  friendly JSON `500` ("Something went wrong on our side…") with no email
  sent; only `err.name` is logged.

**Unaffected:** signed-in readers still subscribe directly from `/account`
(their address was proven by the magic-link sign-in), and existing
subscribers are grandfathered; nobody is asked to re-confirm.

**Counters:** `request:<source>` is counted when a confirmation email is
sent. `signup:<source>` is counted only on confirmation, against the source
carried in the token, and not for an address that is already subscribed.
Requests minus signups is roughly the confirmation drop-off. `/api/traffic`
accepts only `visit` and `share`; a `signup` or `request` body is a 400.

**Browser flag:** the "subscribed here" flag that hides the email pitch is
set on `/subscribed?ok=1`, not when the form is submitted, so someone who
mistypes their address still sees the signup box next time.

## Measuring growth (traffic sources)

Vercel Web Analytics on the Hobby plan shows page views and referrers only:
no UTM parameters and no custom events
(https://vercel.com/docs/analytics/limits-and-pricing). That means the
`track()` events in `lib/analytics.ts` are dropped on Hobby, and nothing
could say which channel a signup came from. So Curio counts it itself,
first-party and with no personal data.

**What's counted** (counters only, one Redis hash per UTC day,
`curio:traffic:<YYYY-MM-DD>`):

- `visit:<source>`: one per browser tab session, sent by `TrafficBeacon`
  (in the layout) to `POST /api/traffic`. The source comes from our own
  `?utm_source=` tag (`email`, `bluesky`, `threads`, `instagram`, `share`),
  else the referrer's host (`search`, `reddit`, `hn`, or `other`), else
  `direct`. A referrer on curioword.com itself counts nothing.
- `request:<source>`: a confirmation email was sent (server-side, from
  `/api/subscribe`). Not counted for an existing subscriber or a
  cooled-down address.
- `signup:<source>`: a **confirmed** subscriber, counted server-side when
  the confirm button is pressed, against the source the signup form
  carried (inside the token). An address that is already subscribed isn't
  re-counted, so repeats no longer inflate it. Before double opt-in
  (deployed with that work) it counted every successful subscribe.
- `share:story` and `share:puzzle`: share taps. The story share URL carries
  `?utm_source=share`; the puzzle share text ends `curioword.com/play`
  (plain text, so a recipient arrives as `direct` or via their referrer).

**Rules:**

- **Production only.** Writes need `VERCEL_ENV === "production"`; anywhere
  else (including local dev, which shares production's Upstash) recording is
  a silent no-op, so testing can't inflate the numbers.
- **No personal data.** Only the field names above are stored: no emails,
  IPs, user agents or referrer URLs. The server accepts only allowlisted
  events (`/api/traffic` takes `visit` and `share` only; `request` and
  `signup` are recorded server-side) (anything else is a 400 with no write), and bots are dropped by
  user agent.
- **90-day TTL.** Every write refreshes it on that day's key, so old days
  clean themselves up.
- **Counting begins with the first production deploy of this work (no
  backfill).** There's no history for earlier days.

**Reading it:**

- `/admin` has a "Where visitors come from" section: the last 28 days by
  source (visits, requests, signups, rate), total visits / requests /
  signups, and share taps.
- `npm run traffic:report -- [days]` prints the same for 1–90 days (default
  28), plus visits by day. It is **read-only** (`HGETALL` only, never a
  write) and reads production through `UPSTASH_REDIS_REST_URL/TOKEN` in
  `.env.local`. The weekly check-in (scheduled routine
  `curio-weekly-checkin`) runs it as `-- 7` and `-- 28`. An empty table is
  normal until the first production visits are counted.

**Caveats when reading the numbers:**

- **Gmail web counts as "search" for untagged links.** Gmail on the web
  routes link clicks through `www.google.com/url`, so a click on an
  *untagged* link in Gmail web (e.g. a sign-in email) is credited to
  `search`. The digest's links are tagged `utm_source=email` and are
  unaffected.
- **Confirm-page opens count as `visit:email`.** The confirmation email's
  link carries `utm_source=email`, so opening it is counted alongside
  digest clicks.
- **Your own visits count.** The owner's visits (e.g. `/admin`) and any
  smoke-test visits are counted too, on a small base they can show.
- **`direct`'s signup rate is inflated.** A signup from a tab with no
  recorded arrival (an internal-referrer tab, or storage failing) falls
  back to `direct` with no matching visit.

## Threads + Instagram: owner setup

**Posting is off until the four env vars are set in Vercel Production and
the app is redeployed.** The tokens are the on switch: deployed without
them, `/api/cron/social` runs at 10:00 UTC and only logs what it would
post. Claude never does any of these steps (no accounts, no handling
credentials):

1. **Instagram:** create or choose a **professional** Instagram account for
   Curio (Creator or Business), and set its bio link to
   `https://curioword.com/?utm_source=instagram` (captions can't carry
   clickable links; the tag is how `/admin` and `traffic:report` attribute
   Instagram visits).
2. **Threads:** create a Threads profile. Threads profiles are made from an
   Instagram account.
3. **Meta app:** at developers.facebook.com, create an app with two use
   cases: **Access the Threads API** and **Instagram API with Instagram
   Login**. Add the Curio Instagram and Threads accounts as testers, then
   accept the invites in each app. The app can stay in development mode for
   posting to your own tester accounts. If Meta asks for App Review before
   `*_content_publish` works, stop and tell Claude; that's a blocker to plan
   around.
4. **Tokens:** generate a **long-lived** token for each channel with the
   right scopes (Threads: `threads_basic`, `threads_content_publish`;
   Instagram: `instagram_business_basic`,
   `instagram_business_content_publish`). Note each account's user ID.
5. **Vercel:** add the tokens and IDs to Production as sensitive variables.
   Claude can run `vercel env add <NAME> production --sensitive` with the
   owner pasting each value at the prompt:
   - `THREADS_USER_ID`
   - `THREADS_ACCESS_TOKEN`
   - `INSTAGRAM_USER_ID`
   - `INSTAGRAM_ACCESS_TOKEN`

   Then redeploy; env changes only reach a new deployment.

Review the real slides before step 5: `npm run social:preview -- 7` lists
the next days' posts and slide URLs, and
`https://curioword.com/social/carousel/<slug>/<n>` renders each slide once
the branch is deployed.

**After the tokens are live:**

- **The first post** is the next 10:xx UTC cron run. Or post straight away
  with one `?repost=threads` and one `?repost=instagram` (see "Re-sending
  the Threads / Instagram posts by hand").
- **Expect `[curio:<channel>] token refresh failed: HTTP 400` on the first
  production run(s).** A fresh seed counts as "age unknown", so it tries to
  refresh at once, and Meta refuses to refresh a token less than 24h old.
  This is harmless: it posts with the seed token, and retries the refresh
  daily until it succeeds (then weekly).
- **If the cron doesn't run for 60 days, both tokens expire** (a refresh
  only happens on a run). Posts then fail with Meta's session-expired
  error in `[curio:<channel>] post failed:`. To recover, generate a new
  long-lived token, replace it in Vercel and redeploy. The changed env
  value re-seeds Redis automatically.
- **To turn a channel off**, remove its `*_ACCESS_TOKEN` from Vercel
  Production and redeploy. The stored copy in Redis is then ignored.

## Demand report (weekly, internal)

A weekly Markdown report on which words have real search demand and which
story pages earn Google impressions. It's internal tooling only: no
route, page or component reads it. It's built by `npm run demand:report`
(`scripts/demandReport.ts` and `scripts/demand/`). The design is in
`docs/superpowers/specs/2026-10-03-demand-report-design.md`.

- **Sources** (both free):
  - English Wiktionary monthly pageviews for every word, last 12 complete
    months, user agents only.
  - Google Search Console for the last 28 days, by page, query, and page
    and query, read-only through a service account.
- **Where it's published:**
  <https://github.com/SamxJames/curio-reports/blob/main/latest.md>, a
  private repo. Dated JSON snapshots are in `snapshots/`.
  - Never publish it to `curio-web`. Every push to `master` is a
    production deploy, and this repo is public.
  - For the same reason the script logs counts only: Actions logs on a
    public repo are public.
- **Schedule:** `.github/workflows/demand-report.yml`, Mondays 06:00 UTC
  (clear of the 09:00 digest cron), plus manual dispatch:
  `gh workflow run demand-report.yml --repo SamxJames/curio-web`.
  - A failed run shows as failed and publishes nothing. The script writes
    nothing until every source has succeeded.
- **Running it locally:** `npm run demand:report`. Output goes to
  `.reports/demand/` (gitignored), or use `-- --out <dir>`.
  - It reads `GSC_SERVICE_ACCOUNT_KEY` from `.env.local`. Without it, the
    Search Console half is skipped and the report says so.
  - A full run takes a few minutes: about 1,150 Wikimedia requests,
    throttled to about 10 a second.
- **Secrets:** `GSC_SERVICE_ACCOUNT_KEY` (the base64 of the service
  account's JSON key) and `REPORTS_REPO_TOKEN` (a fine-grained token,
  Contents read and write on `curio-reports` only, expires yearly).
  - Setup and **rotation for both** are in `docs/demand-report-setup.md`.
  - Neither belongs in Vercel; the deployed app never uses them.
- **Wiktionary caveat:** a Wiktionary page covers every language's entry
  for that spelling, so these views are a proxy for interest in the word,
  not a count of English etymology searches.
  - Capitalised words count their exact-case page first (`December`, not
    the Danish/Swedish `december`).
- **Search Console caveats:** its data lags by a few days (the window ends
  3 days before the run), and Google leaves rare queries out of
  query-level data.
- **The report informs decisions; it doesn't make them.** Title,
  metadata and internal-link changes are separate work.

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
  `curio:subscriber:`/`curio:hour:` keys, the Auth.js adapter's
  `curio:auth:` keys, `curio:wordoftheday:` (the word-locking layer), or
  `curio:digest:` (the daily-send locks and failure set, below), or
  `curio:social:` (the refreshed Threads/Instagram tokens,
  `curio:social:token:<channel>`, production only) — if you
  add new Redis keys, keep using one of these prefixes, not a bare new one.
  The social channels' day locks live under `curio:digest:` with the others:
  `curio:digest:threads:<day>` and `curio:digest:instagram:<day>`.
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
  Auth.js's provider config. As of 2026-09-27 it builds the unsubscribe URL
  via `absoluteUrl()`/`siteUrl()` from `lib/siteUrl.ts` instead of spelling
  out its own `CURIO_SITE_URL ?? localhost` fallback — the last deferred
  item from 2026-09-20's siteUrl cleanup, closed because this session
  rewrote the unsubscribe URL anyway. `sendDailyDigests` now sends through
  `lib/digestSend.ts`'s batch sender rather than looping single sends.
- `lib/unsubscribeToken.ts` (new, 2026-09-27) — HMAC-SHA256 unsubscribe
  tokens (`normaliseEmail`, `unsubscribeSecret`, `signUnsubscribeToken`,
  `verifyUnsubscribeToken`, `maskEmail`). Pure `node:crypto`, no Resend
  import, so the unsubscribe route/page don't pull in the email client.
  `unsubscribeSecret()` returns `null` if `UNSUBSCRIBE_SECRET` is
  unset outside dev, which is what makes the cron route's fail-closed
  check possible.
- `lib/digestSend.ts` (new, 2026-09-27) — the sequential, rate-limit-aware
  Resend batch sender (`sendInBatches`, chunks of 100, retry-after-aware
  backoff, capped retries). Knows nothing about Resend's client directly
  or about words/subscribers — it's the reusable "send N single-recipient
  emails safely" primitive `lib/email.ts` calls into.
- `lib/digestRuns.ts` (new, 2026-09-27) — per-UTC-day run locks
  (`claimRun`, `releaseRun`) for the email, Bluesky, Threads and Instagram
  channels (the last two added 2026-09-29), plus the
  day's pending set of not-yet-confirmed recipients (`seedPending`,
  `removeFailures`, `getFailures`). Redis-backed (`SET NX EX`) only when
  `VERCEL_ENV === "production"` — local dev shares production's Upstash,
  so anywhere else it's an in-memory `Set`/`Map`, even with Upstash
  configured. A second run against the same `next dev` process is still a
  no-op, but a restart forgets it.
- `components/EtymologyLineage.tsx` — the "Latin → Italian → English"
  breadcrumb, driven by `WordEntry.lineage` (an array of language names,
  see below).
- `lib/collection.ts` — pure aggregation/formatting for `/collection`
  (language-count stats, month grouping, date formatting) — see "Your
  collection" below.
- `lib/blueskyPost.ts` (new, 2026-09-28) — the pure builders, no
  `@atproto/api` import: `buildBlueskyPost(word)` (the ≤300-grapheme post
  text — teaser, then word · lineage, then the hashtags, no URL; only the
  teaser is ever truncated) and `buildStoryCard(word)` (the link card:
  UTM-tagged story URL, `storyPageTitle`'s title, `CARD_DESCRIPTION`, and
  the story's Open Graph image URL as `thumbUrl`). Split out of
  `lib/bluesky.ts` because the `tsx` preview script crashed loading
  `@atproto/api` — its `multiformats` dependency is ESM-only, and a
  `lib/package.json` `{type: module}` workaround was rejected since it
  would change module semantics for everything else in `lib/`. If you add
  a new pure Bluesky helper, it goes here, not in `lib/bluesky.ts`.
- `lib/bluesky.ts` — re-exports `lib/blueskyPost.ts`'s builders (so
  existing importers keep working unchanged) and keeps the network side:
  `postDailyWordToBluesky` builds the post and the card, then posts with
  an `app.bsky.embed.external` embed carrying the card's link, title and
  description, plus a thumbnail uploaded from the story's OG image
  (`uploadThumb`) — any failure there (fetch error, non-image, over
  `THUMB_MAX_BYTES`, upload rejected) just posts without a `thumb` and
  logs a warning; the daily post never fails over its picture. Uses
  `lib/siteUrl.ts` throughout now, wrapped in try/catch with a
  `console.error` on failure (the daily cron runs unattended — this is the
  only signal a real posting failure would ever surface). Same "log
  instead of send when unconfigured" fallback as `lib/email.ts`/`lib/db.ts`
  when `BLUESKY_IDENTIFIER`/`BLUESKY_APP_PASSWORD` aren't set.
- `lib/blueskyPreview.ts` (new, 2026-09-28) — `buildBlueskyPreview(from,
  days)`, feeding `npm run bluesky:preview -- [days] [from]`
  (`scripts/previewBlueskyPosts.ts`). Read-only: it uses the plain
  calendar formula (`getWordForDate`), never `resolveTodayWord`/Redis,
  because resolving a future day would lock its word just by previewing
  it. Prints each of the next N UTC days' exact post text, grapheme count
  and card, plus a caveat that these are what will post unless `WORDS` or
  `LAUNCH_OPENERS` change before that day arrives.
- `lib/socialPost.ts` (new, 2026-09-29) — the pure builders for Threads and
  Instagram, no network: `buildThreadsPost(word)` (teaser, then `word ·
  lineage`, then `#etymology`, under Threads' 500-character limit),
  `buildInstagramCaption(word)` (teaser, `word · lineage`, "The full story
  is at curioword.com (link in bio)." and five hashtags),
  `buildCarouselSlides(word)` (the 4–6 slides: hook, word, one to three
  story slides of `origin` split by `splitSentences`, outro) and
  `socialStoryUrl` (the story link, tagged `utm_source=<channel>`).
  Every sentence is a stored `WordEntry` field or a fixed Curio string, so
  nothing is generated. `CAROUSEL_SIZE` is 1080×1350.
- `lib/carouselImage.tsx` (new, 2026-09-29) — `renderSlidePng(slide)`
  draws one slide with `next/og`'s `ImageResponse` and `lib/ogTheme.ts`
  colours. Font size steps down for long story sentences. Slides use the
  renderer's default Geist regular — `fontWeight: 600` renders as regular,
  the same as the story share images — and any glyph Geist lacks comes
  from Google Fonts at render time: other scripts (163 of the 1,147
  `origin` texts have some) and Latin-extended or IPA letters such as
  fiasco's ǭ. Measured 2026-09-30, 334 slides across 304 words need such a
  glyph. ketchup's 膎汁 renders fine. A lone story slide (705 of 1,147 words have
  one) carries no "1 / 1" label (2026-09-30). The fixed words on the slides
  live in `SLIDE_COPY` (`lib/socialPost.ts`).
- `app/social/carousel/[slug]/[slide]/route.ts` (new, 2026-09-29) —
  `/social/carousel/<slug>/<n>` serves one slide as **JPEG**: the PNG from
  `renderSlidePng` goes through `sharp`, because Instagram accepts JPEG
  only. Instagram fetches each slide from a public URL at publish time,
  so this route has to be live and deterministic; 404 for an unknown slug
  or a slide number out of range. **Not** disallowed in robots.txt
  (2026-09-30): a fetcher that honours robots could be turned away, and
  Instagram has to fetch these. Every response, 200 and 404 alike, sends
  `X-Robots-Tag: noindex` instead, and `/social/` isn't in the sitemap.
  **Caching:** a slide whose text is printable ASCII plus only
  `· → — – ‘ ’ “ ” …` is `public, max-age=3600, s-maxage=86400`. Any other
  character (`needsFallbackFont(slideText(slide))`, 2026-09-30) makes it
  `no-store`: 902 slides across 783 words (897 story slides, 5 word
  slides), measured 2026-09-30. The reason is that Geist is `next/og`'s
  only bundled font, anything it lacks is a Google Fonts download, and
  `next/og` swallows a failed download (it only `console.error`s "Failed
  to load dynamic font") and draws boxes with a 200, and a CDN must not
  keep that copy for Meta. The rule is a deliberately conservative
  allowlist, not a script check: the old "outside Latin, Common or
  Inherited script" rule missed Latin letters Geist lacks (ǭ, ḱ, ʰ, …) on
  157 slides. So it also catches letters such as ō or é that Geist does
  have (568 of the 902 slides need no download); those slides just aren't
  cached. `lib/socialPost.test.ts`
  reads Geist's cmap from `node_modules/next` to check both that every
  allowlisted character is in Geist and that every slide in the bank with
  a character Geist lacks is flagged, so a Next upgrade that changes Geist
  fails a test. `sharp` (0.35.4) became
  an explicit dependency; Next already pulled it in optionally.
- `lib/metaGraph.ts` (new, 2026-09-29) — the plumbing shared by
  `lib/threads.ts` and `lib/instagram.ts`: `call` (a fetch with a 15s
  timeout that throws on a non-OK response), `form` (urlencoded POST
  body), `SafeError` and `failureReason`. **The logging policy, worth
  knowing before you touch a `console.error` here:** the status-poll URLs
  carry `access_token` in their query string, so a raw fetch error could
  echo a token. A `SafeError` (our own messages, and the message from
  Meta's error JSON) is logged in full; any other error (a fetch rejection,
  a timeout) is logged by *name only*; and as a backstop the raw and
  URL-encoded token is redacted from whatever is logged. `lib/metaTokens.ts`
  follows the same rule: an HTTP status or error name only. **A rejected
  token lookup is logged as `token lookup failed (<ErrorName>)`**
  (`tokenLookupFailed`), never with its message, because `@upstash/redis`
  builds its error message from the failed command's body (`…, command
  was: [...]`), and a failing `set` of the token record contains the live
  token. The redaction backstop can't catch that: the token isn't known
  yet when the lookup fails. `containerId` (2026-09-30, used by both
  posters) turns a create call's 200 without an `id` into "no container
  id".
- `lib/metaTokens.ts` (new, 2026-09-29) — `getMetaToken(channel)`. Meta's
  long-lived tokens last 60 days from their last refresh and can be
  refreshed once 24h old, so in production (`VERCEL_ENV === "production"`)
  it keeps the live token in Redis at `curio:social:token:<channel>` and
  refreshes it weekly on the daily run. The Vercel env value is the seed
  **and the off switch**. When it changes, the stored copy re-seeds from
  it and is treated as due for refresh. When it's removed, `getMetaToken`
  returns null before reading Redis, so that channel stops posting even
  though Redis still holds a token (2026-09-30). If a refresh fails it logs, keeps the old token and
  retries tomorrow. Everywhere else (local, preview) it just returns the
  env value and never reads or writes Redis, so a local run can't rotate
  production's token. It can reject if Redis is down.
- `lib/threads.ts` (new, 2026-09-29) — `postDailyWordToThreads(word)`:
  create a TEXT container with `link_attachment` (Threads builds the link
  card from the story page's own Open Graph tags), poll its status about
  30s, then publish. **Never throws**: the token lookup is inside the
  `try` too, since `getMetaToken` can reject. A failure logs
  `[curio:threads] post failed:` and returns `{ posted: false }`;
  unconfigured logs `[curio:threads:dev-fallback]`. Success logs
  `[curio:threads] posted`, without the text, so the post is on record
  even if the other channel later gets the function killed. With a token
  and user id present, it refuses to post if `siteUrl()` is localhost, in
  **every** environment (2026-09-30), so a local `.env.local` holding real
  tokens can't post a localhost link either. It logs `CURIO_SITE_URL points to
  localhost — not posting`.
- `lib/instagram.ts` (new, 2026-09-29) — `postDailyCarouselToInstagram(word)`:
  one child container per slide (created in order, from the public slide
  URLs), a CAROUSEL container with the caption, a status poll (every 5s, up
  to 60s, not Meta's suggested 5 minutes, because the images are fetched as
  each child is created) and `media_publish`. The never-throws,
  dev-fallback, success log, localhost guard and "no container id" check
  all match Threads. **Warm-up (2026-09-30):** before any Meta call it GETs
  every slide URL itself, in order, with a 15s timeout each. It needs a 200
  with `content-type: image/jpeg`, and otherwise stops with `slide <n> not
  ready: <status>` before anything is created on Instagram. The dev fallback and
  `npm run social:preview` never warm anything.
- `lib/cronAuth.ts` (new, 2026-09-29) — `authorizeCron(req)`, the bearer
  check shared by `/api/cron/send-daily` and `/api/cron/social`: fails
  closed (401) without `CRON_SECRET` in production, and returns the secret
  so a route can require it for its manual overrides. Pulled out of
  send-daily, whose behaviour is unchanged.
- `app/api/cron/social/route.ts` (new, 2026-09-29) — the 10:00 UTC social
  cron (`vercel.json`). Claims each channel's day lock (`curio:digest:
  threads:<day>` / `instagram:<day>`), then runs both channels with
  `Promise.allSettled`, so one channel can't stop the other. The posters
  never throw, but if one ever does it maps to `posted: false` and logs
  `[curio:social] <channel> threw:` with the error name only. A lock is
  kept after a failed post (it's easy to retry by hand with `?repost=`,
  hard to un-send a duplicate). If claiming a lock itself throws, the
  locks already claimed are released. A release that fails too logs
  `[curio:social] releasing <channel> lock failed:` with the error name.
  That day then needs a `?repost=`. `maxDuration` is 300s.
- `lib/socialPreview.ts` (new, 2026-09-29) — `buildSocialPreview(from,
  days)`, feeding `npm run social:preview -- [days] [from]`
  (`scripts/previewSocialPosts.ts`). Read-only, like the Bluesky one: each
  day's Threads text and link, Instagram caption and slide URLs, from the
  plain calendar formula (never `resolveTodayWord`/Redis, so previewing
  can't lock a future day's word).
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
  surface below go through it, and as of 2026-09-27 so does `lib/email.ts`
  (see above); as of 2026-09-28, so does `lib/blueskyPost.ts` — it was the
  last file still spelling out the same fallback inline.
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
`joinedAt` was reset from 2026-09-11 to the cutover date, **2026-09-27**
(not the 2026-09-26 deploy day: that day the account had been shown its
old personal word, not the shared one), by a one-off script
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
relitigate it — reuse that pattern. (Still true 2026-10-04. The
"Favorites" tab that sat beside these two is gone: favourites live on
`/collection`.)

## Deferred / parked items (real, not forgotten)

These were surfaced during review and deliberately not fixed — each has a
reason, not just "ran out of time":

- **Daily cap on confirmation sends: done 2026-10-03.**
  - `lib/confirmDailyCap.ts` allows at most **200 confirmation emails per UTC day** across all addresses, set by the owner.
  - The count is `INCR curio:confirmsends:<UTC day>`, with an 8-day expiry, and is kept in production only.
  - Past the cap, `/api/subscribe` gives the same pending reply, sends nothing and logs `[curio:subscribe] daily confirmation cap reached` (no address).
  - The cap is checked after the existing-subscriber and per-address cooldown checks, so those requests don't use a slot.
  - `npm run traffic:report` prints the last week's confirmation sends and flags any day that hit the cap. The weekly check-in sees this.
  - The count is **attempts**: a send that then fails (502) still uses its slot, so a Resend outage could spend a day's 200. If the cap check itself errors, the person's 10-minute cooldown is released.
  - **Still open:**
    - There's no per-IP limit. One script can still use up a day's 200 slots, which delays real signups until midnight UTC but can't touch the rest of the Resend quota.
    - The sign-in send is still capped per address only.
- **Account favourites have no order** (2026-10-04). They live in an unordered
  Redis set, so favourites synced from another device land in arbitrary
  order. Proper fix: a sorted set keyed by favourite time, which needs a data
  migration, so it is parked.
- **Favourite removals don't sync across devices** (2026-10-04, pre-existing).
  Merging only ever adds, so unfavouriting on one device never reaches
  another. Parked; the sorted set above or a tombstone would be needed.
- **Dev fallbacks have no production guard** (2026-10-03, pre-existing).
  The dev-mode fallbacks in `sendSignInEmail` and `sendDailyDigests` (log
  instead of send) aren't guarded against running in production the way
  `sendConfirmEmail` is.

- **Resend quota shared between sign-in and the daily digest — partially
  addressed 2026-09-18.** `lib/signInCooldown.ts` now blocks *repeated*
  sign-in requests for the *same* address within a 60s window (see "This
  session" below). What's still unprotected: a bot iterating many *unique*
  addresses still burns the quota at one email each — this cooldown
  doesn't defend against that axis. Real rate-limiting (or a second Resend
  API key just for auth) is still the fix for that case, and is still
  judged disproportionate to build at this project's traffic level.
- **`POST /api/traffic` has no rate limit.** Each accepted event costs 2
  Upstash commands (the `HINCRBY` and `EXPIRE`, sent as one `multi()`),
  from the quota that auth, subscribers and digest locks share. It does
  require a JSON content type and refuses cross-site `Sec-Fetch-Site`, but a
  script can still send events directly. Same stance as the sign-in note
  above: judged disproportionate at this scale.
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
  adding a 5th item, for exactly this reason. Superseded 2026-10-04:
  Collection is now in the nav for everyone, and History is reached from
  Today and Collection instead.)
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
  `@atproto/api`. The word+URL length concern this bullet used to note is
  gone as of 2026-09-28: the link moved into the card, so the post text is
  just `teaser + word · lineage + hashtags`, measured across all 1,147
  words at a maximum of 291 graphemes (`lib/bluesky.test.ts`).
- **Double opt-in on `/api/subscribe`** (2026-09-27 email hardening) —
  **done 2026-10-03** (plan: `docs/superpowers/plans/2026-10-03-double-opt-in.md`;
  see "Double opt-in (signup confirmation)"). Deployed 2026-10-03 (20:24 UTC);
  the daily cap followed at 20:35 UTC. Known limits, left as they are:
  - Timing and outage side channels can reveal whether an address is
    subscribed: a new address waits on a Resend send (or gets a 502), while
    an existing one returns fast.
  - The limit is per address only (10-minute cooldown); there is no per-IP
    throttle.
  - A double-click on Confirm can double-count a signup.
  - A transient Redis error on confirm shows the "link may have expired"
    copy.
- **The unverified inbox-placement effect of `List-Unsubscribe` /
  `List-Unsubscribe-Post`** (2026-09-27) — judge this after a few weeks of
  real sends, alongside tightening `_dmarc`'s `p=none` to `quarantine`
  (see "Domain cutover").
- **The Resend account's real rate limit** (2026-09-27) — the sender is
  sequential in chunks of 100, which the plan's flags note makes the
  documented 10 req/s limit close to moot at this subscriber count, but
  the owner hasn't independently confirmed the account's actual limit
  under Resend → Settings → Usage.
- **Instagram's worst-case run is longer than the function's ceiling**
  (2026-09-29). Every Meta call has a 15s timeout, so if they all hang the
  Instagram run adds up to ~360s against `maxDuration` 300. The slide
  warm-up (2026-09-30: up to 6 GETs at 15s each) can add another 90s. It fails safe:
  Vercel kills the function before `media_publish`, nothing posts, and the
  day's lock stays claimed, so you recover with `?repost=instagram`. The
  realistic run takes ~30–90s, so this was left alone rather than
  shortening the timeouts for a case that would most likely mean Meta is
  down anyway.
- **Claude-written slide copy (v2) via the content pipeline** (2026-09-29).
  The carousel is built only from stored fields (`origin` split a sentence
  per slide), which is why it needed no new content review. Slides written
  for the medium would need to go through the content pipeline with the
  owner's review, like the rest of the word bank, not be generated at post
  time.
- **An unrecognised override value falls through to a normal scheduled
  run** (2026-09-27) — e.g. `?force=true` (not `1`) is silently treated as
  no override at all, not rejected. Still requires `CRON_SECRET` for any
  override path, so this isn't an auth gap, just a quietly-ignored typo.

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

> **Item 1 superseded 2026-10-04:** `/collection` is no longer signed-in
> only, no longer a shelf of every word shown, and no longer has a History
> tab. See the 2026-10-04 section below. The rest of this session's items
> are unaffected.

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

Two phases of a pre-launch brief (the front door on story pages followed
in the next section; Phase 3, Bluesky link cards, is still to come):

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
  The owner chose to deploy mid-day on 2026-09-26 anyway (pre-launch,
  two users); the reset ran straight after, and a re-run confirmed it was
  a no-op.

## This session (2026-09-26, cont.): a front door on story pages

Phase 2 of the pre-launch brief. Plan:
`docs/superpowers/plans/2026-09-26-story-front-door.md` (its "Brief"
holds the owner's choices). Search visitors land on `/story/[slug]`, and
nothing there said what Curio is.

- **The front door** (`components/StoryFrontDoor.tsx`) comes right after
  the story, before "More words". It is one line, "This is Curio: one
  word's origin story, every morning. No feed, no backlog." (the owner
  picked it from three drafts), plus the existing `EmailSignupInline`.
  It's in the static HTML; only hiding happens after hydration.
- **Who doesn't see it:** a browser that confirmed a subscription
  (`curio:subscribed` in localStorage, set on `/subscribed?ok=1` since
  double opt-in, 2026-10-03; formerly set on form success), a browsing
  session that arrived from a digest email (`curio:arrivedFromEmail` in
  sessionStorage), and (since 2026-10-03) anyone signed in. Digest story links now
  carry `utm_source=email&utm_medium=email&utm_campaign=daily-word`
  (`lib/email.ts` `digestStoryUrl`). The email arrival is session-only on
  purpose: a forwarded digest link would otherwise hide the pitch for
  good from the person it was forwarded to (a final-review finding).
  Both flags are display hints only, and unsubscribing doesn't clear
  them.
- **"Today's word is ___ →"** sits in the bottom block, where "Browse
  all words →" (→ `/history`, a personal view) used to be, and only shows
  on words that aren't today's. `/api/story/[slug]/date` now returns
  `today: { slug, word }` next to `date`, and `lib/useStoryDay.ts` makes
  the one request per view that feeds both the date line and this link.
  `StoryDate` is presentational now. The pages stay ● SSG, 1,147 paths.
- **Removed, not re-pointed:** "Browse all words". "All words A–Z →"
  (→ `/words`) already renders on every story page, because
  `getRelatedWords` always returns alphabetical neighbours.
- **Coupling to keep in mind (superseded by double opt-in, 2026-10-03):**
  `EmailSignupInline` no longer calls `markSubscribedHere()`; the flag is
  set on `/subscribed?ok=1` by `components/MarkSubscribedHere.tsx`, so
  call order there no longer matters. `StoryFrontDoor` still pins itself
  open with `flushSync` for `onSubscribed()`. Vitest has no DOM, so no
  test covers it.
- **Known, accepted:** a subscriber sees the front door collapse just
  after hydration. It's below the fold, so it doesn't count toward CLS.
  If it ever matters, a pre-paint `data-subscribed` attribute (like
  `SessionHintInit`) would fix it.
- Tests: 200 → 205. Lint: the same 3 pre-existing warnings.
- Tooling note: the browser pane's `preview_start` always launches from
  the main checkout's `.claude/launch.json`, even in a worktree session.
  So the live checks ran after the local fast-forward merge to `master`,
  before pushing.

## This session (2026-09-27): email hardening

A 2026-09-26 review found the daily digest unsafe to point at even a few
dozen family-and-friends subscribers: it sent one email per subscriber in
an unthrottled loop (no Resend batching, no rate-limit handling), a
second cron run in the same day would just re-send to everyone, and the
unsubscribe token was a plain unsigned `base64(email)`. Plan:
`docs/superpowers/plans/2026-09-27-email-hardening.md` (its "Brief" and
"Amendments at approval" hold the owner's decisions; "What I found, and
flags" holds the ones this session had to pick and the proposed rulings —
almost all approved as written). 9 tasks via the `superpowers`
subagent-driven-development process, TDD per task, plus a final
whole-branch review and fix wave.

**Fix 1 — a digest fan-out that respects Resend's limits.**
`lib/digestSend.ts` sends through `resend.batch.send` in sequential
chunks of 100 (Resend's documented max), retrying a 429/5xx with
`retry-after`-aware backoff, capped at ~3 retries; anything still failing
after that counts as `failed`, never thrown. Each email in a batch keeps
its own `to`, unsubscribe link and `List-Unsubscribe` headers — never
`cc`/`bcc`, never several subscribers sharing a `to`. The dev fallback
(`RESEND_API_KEY` unset) still logs-instead-of-sends, but now logs a
subject and a **count**, not each address — the old per-address log line
is gone, in line with "never log subscriber addresses."

**Fix 2 — signed, scanner-safe, one-click unsubscribe.**
`lib/unsubscribeToken.ts` replaces the old `base64(email)` with
`base64url(normalisedEmail) + "." + base64url(hmac)`, HMAC-SHA256 over a
new `UNSUBSCRIBE_SECRET`, verified with `crypto.timingSafeEqual`. A
legacy unsigned token is rejected outright — see "Old emails' unsubscribe
links now go to `ok=0`" below. `GET /api/unsubscribe` only ever redirects to
`/unsubscribe?token=…`, a `noindex` confirm page (masked address, one
`components/ui/Button` that POSTs); `POST` is the only thing that can
actually unsubscribe, whether from that page's form or a mail client's
RFC 8058 one-click (`List-Unsubscribe=One-Click` body, token in the query
string). Repeating a POST for an address that's already gone still
returns success (a real test asserts this against `lib/db.ts`'s local-JSON
store, not a mock).

**Idempotency and the partial-failure/re-send story.** The email run and
the Bluesky post each claim their own per-UTC-day Redis lock
(`curio:digest:run:<day>` / `curio:digest:bluesky:<day>`, `SET NX EX`)
before sending — a second run that day, including Vercel's own manual
**Run** button, is a no-op. A partial failure does **not** release the
lock (that would re-send to everyone who already got it); instead a
7-day `curio:digest:failed:<day>` Redis set holds everyone not yet
confirmed sent — seeded with every recipient before a scheduled or forced
run sends, each address removed as its chunk is accepted (see "The
final-review fix wave" below).
`?resend=failed` (requires `CRON_SECRET`) re-sends only to addresses
still in that set **and** still subscribed, never posts to Bluesky, and
removes each address from the set as its own chunk succeeds (`SREM` per
chunk, not a replace at the end) — so re-running `?resend=failed` after
one that died partway can't double-send. `?force=1` re-sends email to
everyone; Bluesky only re-posts if `&bluesky=1` is added too (unrecognised
combinations, like `bluesky=1` without `force=1`, are a 400). The
response always carries `alreadyRan: { email, bluesky }`, each true only
when that channel was skipped because the lock was already held — a
`resend=failed` run reports both `false`, since it bypasses the email
lock by design and never touches Bluesky.

**The Task 6 fix round (after review).** `releaseRun(channel, day)` was
added to `lib/digestRuns.ts`: if the route claims one lock and then the
next claim throws, it releases what it actually claimed (best-effort,
logged not thrown) and returns 500, instead of stranding the day as
"already ran" with nothing sent. `recordFailures` failing is now logged
without failing the response — the counts still come back. The email
result is settled and its failures recorded **before** the Bluesky result
is awaited, even though both start concurrently — a hung or slow Bluesky
call can no longer delay (or, via an unhandled rejection, silently drop)
recording that day's email failures. (The end-of-run `recordFailures`
this paragraph describes was replaced by seeding in the final-review fix
wave below.)

**The final-review fix wave.** A whole-branch review found four issues:
- *A local cron run could cancel production's send.* Local dev shares
  production's Upstash, so a local `curl` would have claimed production's
  day locks and wiped its failure set. `lib/digestRuns.ts` now uses Redis
  only when `VERCEL_ENV === "production"`, in memory otherwise.
- *A hung or killed send left nothing to recover from.* The failure set
  was only written at the end of the run. Now a scheduled or forced run
  seeds it with every recipient (`seedPending`) right after claiming its
  locks and before sending, and every mode removes each accepted chunk
  (`onSent` → `removeFailures`). The set means "not yet confirmed sent",
  so a run killed at 300s leaves exactly the unsent addresses for
  `?resend=failed`. A seed failure releases the locks this run claimed and
  returns 500 with nothing sent or posted. Each Resend batch request now
  times out after 30s (`BATCH_TIMEOUT_MS` in `lib/email.ts`) as a
  retryable error, and a 409 `concurrent_idempotent_requests` is retried
  (both reuse the same idempotency key).
- *A test race:* the real-store one-click unsubscribe test moved into
  `lib/db.test.ts`, so only one test file writes `.data/subscribers.json`.
- *An unredacted log:* the whole-send-rejected fallback now passes its
  error through `redactAddresses()`.

**The dev-lock behaviour.** Outside production (`VERCEL_ENV` not
`"production"`), even with Upstash configured, the run locks and the
pending set live in the dev server process's memory
(`resetDigestRunsMemory()` for tests) — a second run against the same
`next dev` is still a no-op, a restart forgets everything. `force` still
needs a `CRON_SECRET` even locally, so a forced local run needs one in
`.env.local` (already there, deliberately different from Production's).

**The one-click-400 choice.** The brief said an invalid token "goes to
`/unsubscribed?ok=0`" — fine for a browser form POST, meaningless for a
one-click POST, which comes from a mailbox provider's server with no
redirect to follow. Ruling: an invalid one-click POST returns **400** and
changes nothing; an invalid *form* POST still redirects to
`/unsubscribed?ok=0` as specified.

**Old emails' unsubscribe links now go to `ok=0`.** Every digest sent
before this deploy, including the morning of 2026-09-27 itself, carries
the old unsigned `base64(email)` token. Rejecting legacy tokens (approved
in the brief) means those links now land on `/unsubscribed?ok=0`, which
already tells the reader to reply to a digest instead. Accepted with two
subscribers total (the owner and their spouse).

**Test and lint counts.** 205 → 309 tests (28 files). Lint: the same 3
pre-existing warnings as every prior session
(`lib/puzzle.test.ts:3`, `scripts/approveDraft.test.ts:36,211`).

This was done via the `superpowers` subagent-driven-development process,
one task per commit (`git log 6b15a47..HEAD`), plus a final whole-branch
review whose four Important findings were fixed in one wave (prod-only
locks, the pending set seeded before sending, the 30s batch timeout, the
test race on `.data/subscribers.json`, one unredacted log line).

### Verification

Done 2026-09-28, before any push or deploy:

- **Clean install:** `rm -rf node_modules .next && npm ci`, then
  `npm test` (309/309, 28 files), `npm run lint` (the same 3 warnings),
  `npm run build` (passes; `/story/[slug]` still `●` at 1,147 paths,
  `/unsubscribe` and `/api/unsubscribe` `ƒ`). `app/account/page.tsx` is
  byte-identical to before this work, so the account email toggle is
  unchanged.
- **Real local send** to the owner's own Gmail, through a restricted
  sending-only Resend key, with Upstash commented out of `.env.local`
  (local JSON store holding only that address) and Bluesky unconfigured.
  The cron returned `sent 1 of 1`; a second run returned
  `alreadyRan: { email: true, bluesky: true }` and sent nothing.
- **"Show original":** both `List-Unsubscribe` and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click` present, and both
  DKIM signatures' `h=` lists cover them (Gmail/Yahoo only honour
  one-click on signed headers). DKIM/SPF/DMARC pass. Single recipient;
  the plain-text part carries the same unsubscribe URL.
- **Unsubscribe flow:** opening the GET link on its own landed on
  `/unsubscribe` showing `s***@gmail.com` and removed nothing; the button
  removed the address (`/unsubscribed?ok=1`). A signature tampered in the
  middle, and another address's payload with this signature, were both
  rejected (form → `ok=0`, one-click → 400, confirm page → `ok=0`) with the
  address still subscribed. A valid one-click POST returned 200 and
  removed it; repeating it returned 200. A legacy `base64(email)` token
  goes to `ok=0`.
- **Gotcha found while testing:** flipping only the *last* character of
  the signature often isn't tampering. A 32-byte HMAC's final base64url
  character carries 4 data bits plus 2 padding bits that decoding
  discards, so e.g. `…CAI` and `…CAJ` are the same signature for the same
  address. Not a vulnerability (it can't target a different address), but
  flip a middle character when testing by hand.
- **Noticed, not changed:** Resend click and open tracking are on for the
  sending domain used in the test: the HTML body's links (including the
  body's Unsubscribe link) were wrapped in an `awstrack.me` redirect,
  plus a tracking pixel. The `List-Unsubscribe` header isn't wrapped, and
  the wrapped body link still lands on the confirm page. Whether Curio
  wants tracking is an owner decision; it's a per-domain setting in
  Resend, so check the `curioword.com` domain's settings.
- **Production, deployed 2026-09-28 17:42 UTC (commit `1225383`).**
  `UNSUBSCRIBE_SECRET` was added and `CRON_SECRET` rotated in Vercel
  Production beforehand, per "Deploy" in
  `docs/superpowers/plans/2026-09-27-email-hardening.md` (Task 9).
  Non-sending production smoke checks passed: a bad-token GET redirects
  via the confirm page to `ok=0`; `robots.txt` has `Disallow:
  /unsubscribe`; a bad one-click POST returns 400; the cron without the
  secret returns 401. **First real scheduled run, 2026-09-29, verified
  in Resend's email log:** all 3 digests were accepted at 09:06:56 UTC
  within 10 ms of each other (one batch request), each single-recipient,
  all `delivered`, no duplicates, no failures. (The runtime log itself
  wasn't readable by then: Vercel Hobby keeps runtime logs only briefly,
  so check the cron's JSON/log within the hour, or use Resend's log
  afterwards.) One of the 3 production subscribers is a leftover test
  address, `samfillingham00+task8verify@gmail.com`.

## This session (2026-09-28): Bluesky link cards (Phase 3)

Phase 3 of the pre-launch brief, the last one — see "Decisions" above for
what shipped and why. Plan:
`docs/superpowers/plans/2026-09-28-bluesky-link-cards.md` (its "Brief"
holds the owner's decisions and this session's findings). 5 tasks via the
`superpowers` subagent-driven-development process, TDD per task:

1. **The post text and the card, as pure builders** — `buildBlueskyPost`
   dropped its URL argument entirely (format (a): teaser, then word ·
   lineage, then hashtags, nothing else) and `buildStoryCard` was added
   for the link, title, description and thumbnail. **Re-measured across
   all 1,147 words with `Intl.Segmenter`: the format tops out at 291
   graphemes ("wine", 8 languages), never truncating the word or
   lineage** — the owner's proposed defaults (Decisions 1–3 above) held up
   against the real word bank.
2. **The link card posts with a thumbnail** — `postDailyWordToBluesky`
   uploads the story's own Open Graph image as the embed's `thumb`; a
   failed fetch, wrong content type, oversized image or failed upload logs
   a warning and posts the card without one, never blocking the post
   itself.
3. **`npm run bluesky:preview -- [days] [from]`** — read-only, prints the
   next N days' exact post text and card, so the owner can read what will
   post before anything goes out. **Still pending (Task 6):** running it
   against production (`CURIO_SITE_URL=https://curioword.com npm run
   bluesky:preview -- 7`) and getting the owner's sign-off on those 7
   posts — nothing deploys until that happens.
4. **`?repost=bluesky`** (Decision 4, included) — a Bluesky-only re-post
   for the cron, closing the "no Bluesky-only re-send" gap the
   2026-09-27 session's Known limitation had left; see "Re-sending the
   digest by hand (production)" above.
5. **Docs** (this section).

**The pure/network split, worth knowing if you touch either file:** the
pure builders live in `lib/blueskyPost.ts` (no `@atproto/api` import).
`lib/bluesky.ts` re-exports them and keeps the network code. Reason: the
`tsx` preview script crashed loading `@atproto/api`, because its
`multiformats` dependency is ESM-only. A `lib/package.json` `{type:
module}` workaround was tried and rejected — it would have changed module
semantics for all of `lib/`, not just the Bluesky files. Add new pure
Bluesky logic to `lib/blueskyPost.ts`, not `lib/bluesky.ts`.

**This branch's base:** an unpushed local-master commit, a puzzle change
(`17d6f4b`), deploys together with this branch — the third clue now also
shows "N letters, starts with X"
(`buildLetterHint` in `lib/puzzle.ts`), and "Guess N of 3" sits above the
guess box. The rules are unchanged: a wrong guess or "I need another
clue" both use a turn.

**Test and lint counts.** 313 → 327 tests. Lint: the same 3 pre-existing
warnings as every prior session (`lib/puzzle.test.ts:3`,
`scripts/approveDraft.test.ts:36,211`).

This was done via the `superpowers` subagent-driven-development process,
one task per commit (`git log 8c6dfd7..HEAD`), with a reviewed fix round
folded into Task 3 (the `lib/blueskyPost.ts` split above). The
whole-branch review, preview approval and deploy are Task 6, still ahead.

### Verification

Done.

- **Preview approved, then deployed.** The owner approved the 7-day `bluesky:preview`, and the work deployed on 2026-09-29 at 20:32 UTC (`098c271`).
- **Live posts checked on 2026-10-02**, via Bluesky's public `app.bsky.feed.getAuthorFeed`. The first three posts in the new format all match the preview: `ketchup` (09-30), `jeans` (10-01) and `panic` (10-02). Each one has:
  - the text in format (a), with no URL;
  - both `#etymology` and `#wordoftheday` as real tag facets;
  - an `app.bsky.embed.external` card titled "{word}: the origin of the word — Curio", linking to the UTM-tagged story, with the word's image as thumbnail.
- `ketchup` got the account's first like.
- The 09-29 `sideburns` post, which went out before this deployed, is in the old format, as expected.

## This session (2026-09-29): Threads + Instagram

The owner asked to post the daily word on more channels and to make
"word journey" carousels, reusing reviewed content only. Plan:
`docs/superpowers/plans/2026-09-29-threads-instagram.md` (its "Brief"
holds the checked facts and the owner's decisions). Built on branch
`social` via the `superpowers` subagent-driven-development process, TDD per
task, one commit per task (`git log a4f4710..HEAD`). **Not merged or
deployed yet**, and nothing posts until the owner sets the tokens — see
"Threads + Instagram: owner setup".

**What landed** (details in the architecture map): the pure post and slide
builders (`lib/socialPost.ts`); slide rendering and the JPEG route
(`lib/carouselImage.tsx`, `/social/carousel/<slug>/<n>`); weekly token
refresh into Redis (`lib/metaTokens.ts`); the shared Graph API plumbing
(`lib/metaGraph.ts`) and the two posters (`lib/threads.ts`,
`lib/instagram.ts`); shared cron auth (`lib/cronAuth.ts`); the 10:00 UTC
`/api/cron/social`; and `npm run social:preview`.

**Checked facts** (Meta's docs, 2026-09-29; the plan's Brief has the full
list):

- **Instagram takes JPEG only**, which is why slides go through `sharp`.
  A carousel holds up to 10 items, and later images are cropped to the
  first one's aspect ratio (hence every slide is 1080×1350).
- **Media must be at a public URL at publish time** — Meta cURLs each slide
  — so the slide route has to be deployed and reachable (and allowed in
  robots.txt), and the posters refuse to run if `CURIO_SITE_URL` would give a
  localhost URL. Since 2026-09-30 that applies in every environment, not just production.
- **Tokens last 60 days** and can be refreshed once 24h old (each refresh
  buys another 60), hence the weekly refresh in `lib/metaTokens.ts`.
  Limits (250 Threads posts and 100 API-published Instagram posts per 24h)
  are nowhere near one post a day.
- **Hobby crons** run at most once a day, anywhere within the scheduled hour
  (±59 min), so posts land 10:00–10:59 UTC.
- **Unverified:** that Threads treats a post's single hashtag as its topic
  tag (Meta's docs page 404'd), which is why the Threads text carries just
  `#etymology`. The first real post will show how it renders; changing it is
  a one-line edit in `buildThreadsPost`.

**Decisions:** all of the plan's proposed defaults were approved as
written on 2026-09-29 — see "2026-09-29 — Threads and Instagram are
channels" under Decisions. Out of scope, deliberately: video/Reels, X,
Mastodon, AI-written slide copy, replies or other engagement, analytics.
Meta's AI-label rules target photorealistic AI media, so typographic cards
don't trigger them; the owner can add a bio line anyway if they want to be
open about how the stories are written.

**Things that shipped beyond the plan text:**

- `lib/metaGraph.ts` and its log-safety policy (architecture map): tokens
  travel in status-poll URLs, so non-Meta errors are logged by name only.
- Token lookup sits inside each poster's `try`, so a Redis outage is a
  logged failure, not a throw into the cron.
- The social cron runs both channels with `Promise.allSettled`, and
  `authorizeCron` is shared with send-daily.
- Instagram's "no container id" guard and the worst-case timing (Deferred
  items).
- **Final-review fixes (2026-09-30)**, all in the architecture map:
  - a token lookup failure is logged by error name only, since Upstash
    error messages can carry the token;
  - an unset env token turns a channel off even with a token in Redis;
  - slides needing a Google Font are `no-store`, and Instagram warms every
    slide before its first Meta call;
  - `/social/` is allowed in robots.txt, with `X-Robots-Tag: noindex` on
    the route instead;
  - `[curio:<channel>] posted` success logs;
  - the localhost guard applies in every environment;
  - failed lock releases are logged;
  - Threads now uses the "no container id" check;
  - no "1 / 1" label on a lone story slide.

**Test and lint counts.** 330 → 397 tests, then 441 after the final-review
fixes. Lint: the same 3 pre-existing warnings as every prior session.

### Verification

Pending — filled in after the live slide review, token setup and the first real posts.

## This session (2026-10-03): first-party traffic sources

The owner wanted to know where visitors and signups come from, now that
there are four channels (email, Bluesky, Threads, Instagram) plus search.
Vercel Hobby's analytics can't say (see "Measuring growth (traffic
sources)"). Plan: `docs/superpowers/plans/2026-10-03-traffic-sources.md`.
Built on branch `feat/traffic-sources` via `superpowers` subagent-driven
development, one commit per task. **Deployed 2026-10-03 18:48 UTC
(commit 3734ca0).**

**What landed:**

- `lib/traffic.ts`: the pure model. `classifySource`, the allowlist
  (`parseTrafficEvent`), bot detection and `summarizeTraffic`.
- `lib/trafficStats.ts` and `POST /api/traffic`: production-only daily
  counters with a 90-day TTL, and the read side (`getTrafficDays`).
- `TrafficBeacon` in the layout: one visit per tab session. `/api/subscribe`
  now takes `{ email, source? }` and counts a signup on success (a recording
  failure can't fail the subscribe).
- Story share URL gets `?utm_source=share`; the puzzle share's last line is
  now `curioword.com/play` (still plain text, three lines).
- `/admin` "Where visitors come from", and the read-only
  `npm run traffic:report -- [days]`.
- The Instagram bio link in "Threads + Instagram: owner setup" is now
  `https://curioword.com/?utm_source=instagram`, so Instagram visits are
  attributed (the owner sets it in the app; Claude doesn't).

**Caveats to remember when reading the numbers:**

- A visit is one per browser tab session, not per person. Signups count
  confirmed subscribers only (from the double opt-in deploy on); an
  existing address subscribing again isn't re-counted.
- Counts are production-only and begin with the first production deploy
  (no backfill), so the first days are partial. There's no history before it.
- Also see the caveats list in "Measuring growth (traffic sources)": Gmail
  web counting as `search` for untagged links, the owner's own visits
  counting, and `direct`'s inflated signup rate.
- The puzzle share arrives as `direct` unless the app the recipient taps it
  in sends a referrer.

**Test and lint counts.** 488 tests passing at the end of the
session's last task. Lint: the same pre-existing warnings as before.

### Verification

**Smoke checks: done 2026-10-03, about 18:55 UTC, against production.**

`POST https://curioword.com/api/traffic` responses:

| Request | Response |
|---|---|
| Bot user agent | 204 |
| Off-allowlist source | 400 |
| `text/plain` body | 415 |
| `sec-fetch-site: cross-site` | 403 |

After those four requests, `npm run traffic:report -- 1` still showed 0 days with data, so none of them wrote anything. Then one real browser visit to `https://curioword.com/?utm_source=share` appeared as `share 1` for 2026-10-03.

**That `share` visit on 2026-10-03 was Claude's smoke test, not a real share.** Before the deploy, local-dev visits and a story "Copy link" tap were checked in the browser pane:
- one visit POST per tab session;
- none on reload;
- the copied URL carried `?utm_source=share`;
- the share tap was posted.

Being local dev, none of these wrote to Redis.

Still to check:
- The `/admin` section needs the owner's sign-in.
- First real numbers: the weekly check-in reports them.

## This session (2026-10-03, cont.): signed-in pitch + puzzle visibility

Two bits of real-user feedback, done directly (no plan doc). **Deployed
2026-10-03 (commit 714c3e2)** by pushing `master`.

**1. Signed-in readers were asked to join the email.** The story-page
front door (`StoryFrontDoor`) and the post-game block in `PuzzleGame`
only checked the local `curio:subscribed` flag, never the session. A
signed-in reader on a new browser, or one who had signed up some other
way, got the "join" pitch. Both now hide for `useSession()` status
`"authenticated"`. While the session is still `"loading"`, the element
carries `signed-in:hidden`, so the pre-paint session hint hides it with no
flash. The pitch is still in the prerendered HTML, so signed-out
visitors and crawlers see it as before. Signed-in readers manage the
email from `/account` (which has its own subscribe/unsubscribe).
Signing in does **not** subscribe anyone. Hiding the pitch is about
recognising the reader, not because they're already on the list.

**2. Today's puzzle was easy to miss.** Before this, it was one faint
`text-xs` link on Today and on story pages. Now:

- `Header` has a **Puzzle** nav link (`/play`) after Today. To fit it at
  375px when signed in (Today · Puzzle · Collection · Account · theme),
  the header's mobile padding went `px-6` → `px-4` and the nav gap
  `gap-5` → `gap-3`. Both go back to the old values at `sm:`. Before that
  change it overflowed by about 23px.
- `TodayHero`: a **Play today's puzzle** pill beside "Read the full
  story". It uses `Button`'s secondary-variant classes on a `Link`.
- `StoryView`: the bottom link is now `text-sm font-medium text-accent`.
- `ArrivalHero`: "Or play today's puzzle →" under "Find out more". It
  calls `markOnboarded()` on click, like the other arrival links.

### Verification

Done in the local dev server, in a browser signed in as the owner:

- The story page rendered no front door and no email input.
- A cookie-less fetch of the same page still had the pitch, with
  `signed-in:hidden`.
- The header scrollWidth equalled the 375px viewport.

Typecheck and lint were clean. The main tree's tests passed. Vitest also
picks up `.worktrees/double-opt-in` and `.worktrees/demand-report`, which
have 13 failures of their own. Those are the stray-worktree noise
described in the workflow notes below, not this change.

After the deploy, `curioword.com/story/silhouette` served the Puzzle nav
link, the new story-page link and the `signed-in:hidden` classes. The
signed-in experience in production was not clicked through.

## This session (2026-10-03, later): double opt-in

Before any public promotion (see `docs/launch-kit.md`), anonymous signups
now confirm by email. Plan: `docs/superpowers/plans/2026-10-03-double-opt-in.md`.
Built on branch `feat/double-opt-in`, one commit per task. **Deployed 2026-10-03 at 20:24 UTC
(commit 5c2b1ad); the 200/day cap followed at 20:35 UTC (d2186bb).** Design details are in
"Double opt-in (signup confirmation)".

**What landed:**

- `lib/confirmToken.ts` (stateless signed 7-day token, context
  `curio:confirm:v1:`) and `lib/confirmCooldown.ts` (10-minute per-address
  cooldown).
- `POST /api/subscribe` now emails a link instead of subscribing;
  `sendConfirmEmail` / `confirmUrl` in `lib/email.ts`.
- `/subscribe/confirm` (button page), `POST /api/subscribe/confirm` (303 to
  `/subscribed?ok=1|0`) and `/subscribed`; both pages noindex and in
  `DISALLOWED_PATHS`.
- Counters: new `request:<source>`; `signup:<source>` only on confirmation;
  `/api/traffic` no longer accepts `signup`.
- The "subscribed here" browser flag moved to `/subscribed?ok=1`.

**Verification: done in production on 2026-10-03.**

Smoke checks against curioword.com:
- `/api/traffic` with a `signup` body returns 400.
- `/api/subscribe` with a non-string email returns 400.
- A garbage token sends both the confirm page and the confirm POST to `/subscribed?ok=0`.

Real send to the owner's `samfillingham00+optin@gmail.com`:
- The confirmation email went out at 20:36 UTC, and Resend shows it delivered.
- A second signup straight after got the same pending reply, and no second email was sent.
- The owner opened the link and pressed Confirm.
- The subscriber record appeared at 20:53 UTC.
- `traffic:report` showed request 1, signup 1 (both `direct`; the request was made with curl), confirm-page visit 1 (`email`) and cap slots 1/200.

That address is now a real subscriber. The owner can unsubscribe it from its first digest.

## This session (2026-10-04): Collection = favourites, History = archive

The owner asked whether the difference between Collection and History was
clear. It wasn't (Collection had a History tab inside it, and History had a
Favorites tab). They said Collection should be favourites only, and
approved the proposal. Plan:
`docs/superpowers/plans/2026-10-03-collection-favourites.md`. Each idea now
has one home.

**Collection (`/collection`)**

- Shows only favourites, **newest first**. No sign-in is needed.
- Favourites come from the localStorage store (`useFavorites` in
  `lib/storage.ts`). For a signed-in reader `AccountFavoritesSync`, mounted
  in the layout, syncs that store from the account.
- The page is **static**. `app/collection/page.tsx` no longer calls
  `auth()`, so it prerenders (○ in the build output). The client
  component, `components/CollectionScreen.tsx`, asks `/api/words` for the
  favourited words rather than importing `lib/words.ts` (all 1,147 entries)
  into the client bundle.
- The language band and chips are drawn from the favourites.
  `computeLanguageStats` in `lib/collection.ts` takes any list of words
  with a `lineage`. Counting favourites is fine under the
  archive-never-backlog rule, because the person chose them.
- A "Past words" link goes to `/history`. It is hidden while loading, so
  before favourites have loaded the page shows only its heading.
- A signed-in reader on a fresh device has nothing in localStorage until
  `AccountFavoritesSync` pulls the account's favourites. While the store is
  empty and the session is loading, or signed in and the pull has not
  settled, the page stays in that heading-only loading state, so it never
  flashes "Nothing here yet". `markAccountFavoritesPulled` /
  `useAccountFavoritesPulled` in `lib/storage.ts` carry that flag, and the
  sync marks it on failure too, so the page cannot hang.

**`GET /api/words?slugs=a,b,c`** (`app/api/words/route.ts`)

- Returns `{ words: CollectionWord[] }` in request order.
- Takes up to 500 slugs, counted after de-duplication, and answers 400
  above that. A missing or empty `slugs` gives `{ words: [] }`.
- Unknown slugs and duplicates are dropped.
- Each word has exactly seven fields: `slug`, `word`, `respelling`,
  `partOfSpeech`, `teaser`, `related`, `lineage` (the `CollectionWord`
  type in `lib/collection.ts`).
- `Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800`.
  It is public story content, nothing personal.

**History (`/history`)**

- The archive. Signed in, it has "My days" and "All words". Signed out it
  shows only "All words" and no tab bar.
- It is not in the nav. Today has a "Past words →" link and so does
  Collection.
- The Favorites tab is gone. Hearts stay on every row, so favouriting from
  the archive is how a word gets into Collection.
- `/collection?tab=history` redirects to `/history` (`next.config.ts`,
  temporary redirect). The query string carries over, so it lands on
  `/history?tab=history`. `/history` ignores it.

**Nav.** Today · Puzzle · Collection · Account (or Sign in), the same for
everyone. Expected to fit at 375px; verify in the browser check.

**Admin retention metric.** `recordUserSeen` no longer fires on
`/collection`, because that page is static. A signed-in visit to
Today, History, a story page (via `/api/story/[slug]/date`) or the puzzle
(`/api/play-state`) still records it. Someone who only ever opens
Collection no longer counts as active, so retention can read slightly low.

### Known limitations

- Account favourites live in an unordered Redis set. Favourites synced from
  another device therefore land in arbitrary order, so "newest first" only
  holds for favourites made on this device. The closing note's "most
  recent" word can be arbitrary for synced ones.
- A removal on one device never reaches another, because merging only
  adds. This was true before, but Collection makes it more visible.

Both are parked in "Deferred / parked items" near the top of this file.

### Verification

_To be filled in after the browser check:_ signed-out empty state,
favouriting a word on a story page, `/collection?tab=history`, `/history`
signed out, and the header at 375px.

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
