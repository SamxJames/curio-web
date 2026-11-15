# Dig "yesterday's answer" post (Bluesky + Threads)

Date: 2026-11-15. Branch `feat/dig-reveal-post`. Origin: growth-marketer ranking, experiment #1.

## Why
Automated marketing that targets the 12-04 kill line (dig finishers, shares) and compounds: each post links to an
indexable `/dig/<date>` answer page that already exists. The current word posts only carry a bare dig line.

## What it does
On alternate days (odd dig day number), the 10:00 UTC social cron posts one extra short post to Bluesky and Threads:

> Yesterday's curio dig asked “Name a beverage”. The rarest answer: kvass. <fossil fact, trimmed>
> <link to /dig/<yesterday>?utm_source=bluesky|threads&utm_medium=social&utm_campaign=dig-reveal>

Past days only (nothing manufactured). Frame as a word story. Never "you missed", never counts of people,
never "streak" or "played" (say "dug"/"asked"). Do not touch `lib/words.ts`.

## Safety
- Off by default: posts only when env `DIG_REVEAL_POSTS === "on"` (Sam flips it). Deploying changes nothing public.
- Existing gating still applies (Bluesky env vars, Threads/Meta token, localhost-site guard).
- Idempotent per UTC day via `claimRun` with new channels `bluesky-reveal`, `threads-reveal`.
- Reveal failure must never break the existing Threads/Instagram word posts (isolate with allSettled / try-catch).
- Logs print counts/status only, never response bodies or tokens (repo is public).

## Files
1. `lib/dig/revealText.ts` (pure, no server imports): `type DigReveal = { date: string; number: number; prompt: string; fossilWord: string; fact: string }`,
   `isRevealDay(number)`, `buildBlueskyReveal(reveal)` (<=300 graphemes, link as its own paragraph so facets work, same
   hashtag style as `lib/blueskyPost.ts`, use `Intl.Segmenter` like it does), `buildThreadsReveal(reveal)` (<=500 bytes
   like `lib/socialPost.ts`), `revealUrl(date, source)` -> `/dig/<date>` with utm_source/utm_medium=social/utm_campaign=dig-reveal.
   Truncate the fact at a word boundary with an ellipsis; if still over budget drop the fact.
2. `lib/dig/reveal.ts` (server only): `getYesterdayReveal(now)` using `readDay`, `decodeDay`, `digLaunchDate`, `isPastDay`,
   `dayNumber`, `dayKey`/`DAY_MS`; reads `prompts[0]`; returns null (never throws) when the dig is not open, no launch
   date, yesterday missing, or it is not a reveal day.
3. `lib/digestRuns.ts`: add `"bluesky-reveal" | "threads-reveal"` to `Channel` and `RUN_KEY_PREFIX`
   (`curio:digest:bluesky-reveal:`, `curio:digest:threads-reveal:`; keep an existing prefix family).
4. `lib/bluesky.ts`: `postRevealToBluesky(reveal)` reusing the existing agent/login, localhost guard and dev-fallback;
   link card via the existing external-embed pattern with thumb `/dig/<date>/opengraph-image` (if the helper makes that
   awkward, a text post with a link facet is acceptable).
5. `lib/threads.ts`: `postRevealToThreads(reveal)` reusing the existing create/publish flow with text only.
6. `app/api/cron/social/route.ts`: after the existing posts, if `DIG_REVEAL_POSTS === "on"` and a reveal exists, claim and
   post each reveal channel. Support `?repost=bluesky-reveal|threads-reveal` like the existing repost handling. Keep the
   existing 400 message accurate.
7. Previews: `scripts/previewBlueskyPosts.ts`/`lib/blueskyPreview.ts` and `lib/socialPreview.ts` show the reveal text
   (use a sample reveal when no real day is available).
8. Tests (vitest, node env): `lib/dig/revealText.test.ts` (length limits, link facet, odd/even day, no banned words),
   `lib/dig/reveal.test.ts` (null cases, happy path with mocked readDay), route test additions in
   `app/api/cron/social/route.test.ts` (flag off = nothing, flag on = claims + posts, failure isolated, repost),
   `lib/bluesky.test.ts` / `lib/threads.test.ts` additions, and add the new strings to `lib/dig/copyAudit.test.tsx`.
9. Docs: add a short "Daily reveal post" section to `docs/handover/dig.md` and `docs/handover/operations.md` (env var
   `DIG_REVEAL_POSTS`, channels, how to repost). Keep `handover.md` under 200 lines.

## Done when
`npm ci`, `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run guard`, `npm run build` all pass in the worktree;
preview scripts print a sample reveal within limits; nothing posts anywhere during testing (no production env).
