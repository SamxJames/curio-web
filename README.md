# Curio — website prototype

One word, one origin story, once a day — now as a website instead of the
original React Native app. See `website-pivot-brief.md` (in the project) for
the reasoning behind the pivot; this README covers what's actually built here.

## What's implemented

- **Today** (`/`) — shows the date-math-determined word of the day. No
  backend sync needed to compute it; same logic that powered the app's
  notification timing, minus the notification.
- **Story view** (`/story/[slug]`) — Origin / Journey / Related Words
  sections, favorite (heart) and share (Web Share API, falls back to
  copy-link) actions. Reachable from Today, History, or an emailed link.
- **History** (`/history`) — reverse-chronological list of every day since
  the launch date, with a Favorites filter. Favorites and browsing history
  live entirely in `localStorage` — no account needed to use Today/History.
- **Onboarding** — a first-visit modal (tagline + short pitch) with an
  inline email + delivery-hour signup, skippable. Replaces the app's
  notification-permission step.
- **Email digest** — `/api/subscribe` captures `{email, hour}`.
  `/api/cron/send-daily` (wired to run hourly via `vercel.json`) sends
  each hour's subscribers that day's word, with the Origin section inline
  and a link back to the full story. `/api/unsubscribe` handles the
  unsubscribe link every email includes.
- **Light/dark mode** — follows system preference by default; the header
  toggle cycles System → Light → Dark, stored in `localStorage`.
- **Attribution** (`/attribution`) — the CC BY-SA notice for Wiktionary /
  Wiktextract content, linked from the footer. This was an open compliance
  item on the mobile app too — it's included from the start here rather
  than left for later.

## Content

`lib/words.ts` has 8 seed entries, written in Curio's voice from general
etymological knowledge. This is a stand-in for the real content pipeline —
port over the offline Wiktextract + Haiku rewrite pass from the mobile
project to generate a full word bank, then replace the `WORDS` array (or
swap `lib/words.ts` to read from wherever that pipeline writes its output).

## Datastore & email — real vs. fallback

Both `lib/db.ts` (subscribers) and `lib/email.ts` (sending) check for
credentials and fall back to something dev-friendly if they're missing:

| | Configured | Fallback (no env vars) |
|---|---|---|
| Datastore | Upstash Redis | Local JSON file at `.data/subscribers.json` |
| Email | Resend | Logs to console instead of sending |

This means `npm run dev` works out of the box with zero setup — subscribing
writes to a local file, and the cron route logs what it *would* send. Add
real credentials (see `.env.example`) whenever you're ready to actually
send mail.

## Getting started

\`\`\`bash
npm install
cp .env.example .env.local   # optional for local dev — works without it
npm run dev
\`\`\`

Visit `http://localhost:3000`. To test the send flow locally:

\`\`\`bash
curl http://localhost:3000/api/cron/send-daily
\`\`\`

## Deploying

The natural fit is Vercel (matches Next.js, and `vercel.json` already
configures the hourly cron):

1. Push this to a git repo, import it into Vercel.
2. Set the environment variables from `.env.example` in the Vercel project
   settings — at minimum `RESEND_API_KEY`, `CURIO_FROM_EMAIL`,
   `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `CURIO_SITE_URL`
   (your production domain), and `CRON_SECRET`.
3. Vercel Cron picks up `vercel.json` automatically on deploy — no extra
   configuration needed.
4. Create a free Upstash Redis database and a Resend account/domain to get
   the real credentials.

## Open items / next stage

- Port the real word bank over from the mobile project's content pipeline
  (currently only 8 placeholder entries).
- Wire up real Upstash + Resend credentials and send a real test digest.
- Decide on a production domain for `CURIO_SITE_URL` and sender address.
- The unsubscribe link uses a base64 token (not signed/HMAC'd) — fine for
  a v1, worth hardening before wider traffic.
- No automated tests yet.
