# Curio: architecture

> Split out of handover.md on 2026-10-05, text unchanged. "Below"/"above" references may point to a sibling file in docs/handover/. File-by-file map, data model, word bank and content pipeline, auth, CSS focus-ring bug.



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
