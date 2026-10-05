# Curio: decisions

> Split out of handover.md on 2026-10-05, text unchanged. "Below"/"above" references may point to a sibling file in docs/handover/. Product and architecture decisions with reasoning. Don't relitigate without new evidence.



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
