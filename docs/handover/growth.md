# Curio: email and growth

> Split out of handover.md on 2026-10-05, text unchanged. "Below"/"above" references may point to a sibling file in docs/handover/. Double opt-in, first-party traffic counting, weekly demand report.



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
  - The workflow passes `--require-gsc`, so a missing
    `GSC_SERVICE_ACCOUNT_KEY` secret fails the run instead of quietly
    publishing a Wiktionary-only report.
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
