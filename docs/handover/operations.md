# Curio: operations

> Split out of handover.md on 2026-10-05, text unchanged. "Below"/"above" references may point to a sibling file in docs/handover/. Env vars, deploying, domain/DNS, manual re-sends, Threads/Instagram owner setup.



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
