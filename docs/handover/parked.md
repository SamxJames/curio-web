# Curio: deferred and parked items

> Split out of handover.md on 2026-10-05, text unchanged. "Below"/"above" references may point to a sibling file in docs/handover/. Known issues deliberately not fixed, each with its reason.



## Deferred / parked items (real, not forgotten)

These were surfaced during review and deliberately not fixed — each has a
reason, not just "ran out of time":

- **Header wordmark crowding at 375px** (2026-10-04). "Curio" sits flush against "Today" on a phone. Nothing overflows; it's a small gap fix in `components/Header.tsx`.
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
