# Clear email offer (2026-10-18)

## Why
Check-in 2026-10-12: 0 email signups from 91 visits. The sample is tiny (about 30-50 real prospects), but the product
has three visible weaknesses:
- The button says "Join" and nothing says what you get.
- A returning visitor (the strongest intent) never sees the offer: `TodayHero` has none.
- Signed-in people are never offered the email anywhere except `/account`. Both non-owner sign-ins skipped it.

Approved by Sam 2026-10-18, including: **signed-in users subscribe in one tap, no confirmation email** (their
magic-link sign-in already proved the address; the tap is explicit consent).

## What users see
One client component, `components/SignupOffer.tsx`, used everywhere the email is offered. Hosts keep their own pitch line
above it; `SignupOffer` renders the action plus the promise line.

| Viewer | Shown |
|---|---|
| Signed out, not `hasSubscribedHere`, not arrived from email this session | Email field + **"Get tomorrow's word"** button |
| Signed in, `GET /api/subscribe/me` says not subscribed | One **"Email me the daily word"** button |
| Signed in and subscribed, or subscribed here, or arrived from email | Nothing |
| Session loading | Nothing (`signed-in:hidden` pre-paint hint as today, so no flash) |

Promise line under either action: "One short email each morning. Free; stop anytime. See a sample →" (link to
`/sample-email`, new tab). "Each morning", not "9am UK": the cron runs at 09:00 UTC, firing anywhere in the hour.

After a signed-out submit: unchanged ("Almost there. Check your inbox for a link to confirm.").
After a signed-in tap: "Done. Tomorrow's word arrives in your inbox. Manage it in Account." (link `/account`), and
`markSubscribedHere()` so other offers on this browser hide.

Placements (prop `placement`): `arrival` (ArrivalHero), `today` (TodayHero, new, a quiet block below "Past words"),
`story` (StoryFrontDoor), `play` (PuzzleGame post-game). `/account`'s existing subscribe action counts as `account`.

StoryFrontDoor and PuzzleGame stop hiding the offer for signed-in users; `SignupOffer` decides instead.
`EmailSignupInline` gains `placement` and the new copy; it stays the signed-out form inside `SignupOffer`.

## Sample email
`app/sample-email/route.ts`: GET returns the real digest HTML (`buildDigestHtml`, exported from `lib/email.ts`) for
today's word via `resolveTodayWord()`, with the unsubscribe link replaced by `#`, `Content-Type: text/html`,
`X-Robots-Tag: noindex`. Not in the sitemap.

## Server
- `GET /api/subscribe/me`: `auth()`; signed out → 401; else `{ subscribed: boolean }` from `getSubscriberByEmail`.
  Redis error → 500 JSON. `Cache-Control: no-store`.
- `POST /api/subscribe/me`: body `{ placement?, source? }`. Signed out → 401. Uses the **session's** email only
  (never one from the body). Already subscribed → `{ ok: true }` without re-counting. Else `upsertSubscriber(email)`,
  then (fail-soft) record `signup:<source>` and `signup-at:<placement>`. Invalid source → `direct`; invalid placement →
  not recorded. Redis error on subscribe → 500 JSON.
- `/account` subscribe action: also records `signup-at:account` (fail-soft), only when not already subscribed.

## Attribution
- `lib/traffic.ts`: `SIGNUP_PLACEMENTS = ["arrival","today","story","play","account"] as const`, `isSignupPlacement`.
  New events `{ kind: "request-at" | "signup-at"; placement }`, field `request-at:<p>` / `signup-at:<p>` in the existing
  `curio:traffic:<day>` hash. Not accepted by `parseTrafficEvent` (server-recorded only, like request/signup).
- `summarizeTraffic` adds `placements: { placement, requests, signups }[]` (only placements with activity, in
  `SIGNUP_PLACEMENTS` order). Existing fields unchanged.
- `/api/subscribe` accepts `placement`; when valid, records `request-at:<p>` beside `request:<source>` and signs it
  into the confirm token.
- `lib/confirmToken.ts`: optional `p` in the payload. `ConfirmClaim` gains `placement?: SignupPlacement`. A token without
  `p` (every link already sent) verifies exactly as before; an invalid `p` is dropped, not a rejection. Context stays
  `v1`.
- `/api/subscribe/confirm`: records `signup-at:<p>` when the claim has one.
- `AdminDashboard` and `scripts/trafficReport.ts` show a "by placement" table (requests, signups).

## Principle check
Archive, never backlog: promises tomorrow's word only. No counts, no urgency, no "don't miss".

## Testing
- Unit: `/api/subscribe/me` GET and POST (signed out, not subscribed, already subscribed, session email used not body,
  Redis error, placement/source validation, fail-soft traffic); `/api/subscribe` placement recording; confirm token with
  and without `p`, invalid `p`; confirm route records placement; `summarizeTraffic` placements; `parseTrafficEvent`
  rejects the new kinds; `/sample-email` returns noindex HTML with no real unsubscribe link.
- Browser (dev server, real Tab/clicks): each placement signed out; signed in (Sam signs in in the browser pane) shows the one-tap
  button, tap subscribes, offers then hide; 375px width.

## Not doing
Pop-ups; any change to double opt-in for signed-out visitors; new `/account` copy; welcome email for one-tap.
