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
- **Email digest** — `/api/subscribe` takes `{email, source?}`; anonymous signups confirm by email (double opt-in: a signed 7-day link, and a button on the page it opens adds the address).
  `/api/cron/send-daily` runs once a day at 09:00 UTC (`vercel.json`; the
  Hobby plan allows one run a day) and sends every subscriber the day's
  shared word through Resend's batch endpoint. It's idempotent per UTC day
  (`?resend=failed`, `?force=1` and `?force=1&bluesky=1`, all with
  `CRON_SECRET`, for deliberate re-sends; see `handover.md`). Every digest
  carries a signed unsubscribe link plus `List-Unsubscribe` / one-click
  headers; opening the link shows a confirm page, and only its button (or a
  mail app's one-click) unsubscribes.
- **Light/dark mode** — follows system preference by default; the header
  toggle cycles System → Light → Dark, stored in `localStorage`.
- **Attribution** (`/attribution`) — the CC BY-SA notice for Wiktionary /
  Wiktextract content, linked from the footer. This was an open compliance
  item on the mobile app too — it's included from the start here rather
  than left for later.
- **Bluesky** (`@curiodaily.bsky.social`) — the same daily cron posts the
  word: a teaser, then `word · lineage arrows`, then `#etymology
  #wordoftheday` (format (a)), with the story link moved out of the text
  into a link card (the story's own title, a fixed description, and its
  Open Graph image as a thumbnail). `npm run bluesky:preview -- [days]
  [from]` prints what the next days' posts will look like, read-only, for
  review before anything goes out.
- **Threads + Instagram** — a separate daily cron, `/api/cron/social` at
  10:00 UTC, posts the same word to Threads (a text post with a link card)
  and to Instagram (a 4–6 slide 1080×1350 carousel, built only from the
  word's stored fields and served as JPEG from
  `/social/carousel/<slug>/<n>`). Each channel is idempotent per UTC day,
  with `?repost=threads|instagram` (`CRON_SECRET`) for a deliberate
  re-post. Nothing posts until the four `THREADS_*` / `INSTAGRAM_*` env
  vars are set — without them the cron only logs, and removing a token
  turns its channel off again — and the tokens are refreshed weekly into
  Redis in production. `npm run social:preview --
  [days] [from]` prints the next days' posts and slide URLs, read-only, for
  review. Setup and operations are in `handover.md`.
- **Traffic sources** — first-party, counts-only tracking of where visits and
  signups come from (email, Bluesky, Threads, Instagram, search, share and
  so on), production writes only. `/admin` shows it; `npm run traffic:report
  -- [days]` prints it, read-only. See "Measuring growth" in `handover.md`.

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
configures the two daily crons: the digest at 09:00 UTC and the
Threads/Instagram posts at 10:00 UTC):

1. Push this to a git repo, import it into Vercel.
2. Set the environment variables from `.env.example` in the Vercel project
   settings — at minimum `RESEND_API_KEY`, `CURIO_FROM_EMAIL`,
   `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `CURIO_SITE_URL`
   (your production domain), `CRON_SECRET`, and `UNSUBSCRIBE_SECRET`
   (required: without it the daily send refuses to run). Optionally, the
   four `THREADS_*` / `INSTAGRAM_*` vars: without them the social cron only
   logs, so they're what switches those posts on.
3. Vercel Cron picks up `vercel.json` automatically on deploy — no extra
   configuration needed.
4. Create a free Upstash Redis database and a Resend account/domain to get
   the real credentials.

## Open items / next stage

- Port the real word bank over from the mobile project's content pipeline
  (currently only 8 placeholder entries).
- Wire up real Upstash + Resend credentials and send a real test digest.
- Decide on a production domain for `CURIO_SITE_URL` and sender address.
- No automated tests yet.
