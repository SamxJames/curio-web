# Curio: session history

> Split out of handover.md on 2026-10-05, text unchanged. "Below"/"above" references may point to a sibling file in docs/handover/. Dated session logs, oldest first. Reference only; current state is in handover.md.



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
everyone. At 375px it doesn't overflow (scrollWidth 375), but the
"Curio" wordmark sits flush against "Today". That spacing was already
tight after the Puzzle link landed; it's parked as a small follow-up.

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

Checked 2026-10-04 on a local dev server (port 3100), served from the branch, while signed in as the owner:

- A fresh browser origin with empty localStorage pulled the account's 5 favourites through AccountFavoritesSync. `/collection` showed them newest first, with the language band built from those favourites (8 languages).
- While it loaded, only the heading showed; there was no empty-state flash.
- `/collection?tab=history` landed on `/history?tab=history`, with only "My days" and "All words" (no Favorites tab).
- Today shows "Past words →".
- At 375px the header doesn't overflow.

Not checked:
- **Signed out:** checking it would have meant signing the owner out.
- **Removing with the heart:** it would have changed the owner's real favourites in production Upstash.

Both are covered by tests and reviews.


## This session (2026-10-04, later): language panel

Built on branch `feat/lang-panel` (worktree `.worktrees/lang-panel`), not yet merged or pushed. Five tasks: types and pure helpers; map dots; the facts, draft, review and approve pipeline; the panel on Collection; these docs. Two rulings changed the plan along the way:

- The draft call leaves thinking on at medium effort with `max_tokens` 8000 and the server-side refusal fallback, rather than switching thinking off. This follows the Claude API guidance for `claude-sonnet-5-5`. Cost: a few more tokens per language.
- The generated `sheetIndex.ts` exists so Collection never imports the full sheets. The bundle-weight constraint was binding, and fixing it before any content existed was cheapest.

### Verification

Merged and pushed earlier on 2026-10-04 with empty data. See docs/handover/language-panel.md → Verification for the first content batch (2026-10-05).

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
