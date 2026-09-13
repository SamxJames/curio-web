# Analytics, Email Subject, Clues Field & Daily Puzzle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Add Vercel Analytics/Speed Insights plus a thin custom-event wrapper so there's finally visibility into whether anything works; (2) change the daily digest's email subject from naming the word up front to a truncated teaser, so curiosity survives to the open; (3) add a `clues` field to `WordEntry` (three standalone, progressively-revealing clues) and teach the content pipeline to generate it; (4) ship `/play`, an anonymous-playable daily puzzle built on those clues, word-selection gated to words shown 30+ days ago, with a Wordle-style spoiler-free share result; (5) quiet cross-links tying `/play` back into the daily product.

**Architecture:** Parts 1-2 are small, independent additions to existing files (`app/layout.tsx`, `lib/email.ts`) with no shared state. Part 3 adds one field to the `WordEntry`/`DraftEntry` types, hand-backfills the real content, and mirrors the change into both content-pipeline validation sites (matching this codebase's existing dual-trust-boundary pattern — see `docs/superpowers/plans/2026-09-12-daily-send-arrival-bluesky-content.md`'s Task 8/9 ruling). Part 4 is the bulk of this plan: a new pure module (`lib/puzzle.ts`) owns eligibility/selection/guess-matching/share-text logic (parameterized over a word list for testability, mirroring `lib/words.ts`'s existing `today: Date = new Date()` injection pattern); `lib/storage.ts` gains puzzle play-state (synced to account, mirroring favorites) and puzzle stats (local-only — see Flagged Decision D); a new `/api/play-state` route mirrors `/api/favorites`; a new `components/PuzzleGame.tsx` client component drives the whole flow, reusing an extracted `components/EmailSignupInline.tsx` for its post-game signup (the same component `ArrivalHero` uses, satisfying the "reusing the arrival page's component" requirement literally rather than by copy). Part 5 adds two quiet `Link`s and one new OG image route. Nothing in this plan touches `app/api/cron/send-daily/route.ts` or `lib/bluesky.ts` — confirmed by file-level review of every task below.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4, Vitest 5. New for this plan: `@vercel/analytics`, `@vercel/speed-insights` (both free on Hobby, both cookieless by design — no consent banner needed).

**Spec:** No separate written spec — requirements come from the user's own message dated 2026-09-12 (five numbered items). Four decisions were left implicit or contain a factual mismatch; each is resolved below and must be confirmed (or amended) before execution:

- **Flagged decision A (word count):** the spec says "Backfill the 10 existing entries," but `lib/words.ts`'s `WORDS` array currently has **8** entries, not 10 (verified by reading the file directly before writing this plan). This plan backfills all 8 real entries; there is no discrepancy to reconcile in code, just a note that the spec's "10" was likely a misremembering.
- **Flagged decision B (share domain):** the spec's share-text example shows `curiodaily.app` as a literal bare domain, but the app's actual current domain is `etymology-app-orcin.vercel.app` (per `handover.md`) — `curiodaily.app` isn't registered/configured anywhere in this codebase today. This plan derives the bare domain from `CURIO_SITE_URL` (stripping the protocol) rather than hardcoding `curiodaily.app`, so the share text always names wherever the app actually lives; if `curiodaily.app` is registered later and `CURIO_SITE_URL` is updated to match, the share text updates automatically with zero code changes. If you'd rather hardcode the literal string now (e.g. because the domain purchase is imminent), say so and Task 5 changes by one line.
- **Flagged decision C (puzzle numbering):** "Curio puzzle #142" needs a number. This plan reuses the same day-count `getWordForDate` already uses (`daysSinceStart`, anchored to `2026-01-01`) rather than introducing a second anchor date — so the *first* puzzle number a real player ever sees won't be "#1"; it'll be however many days have passed since 2026-01-01 by the time the word bank is deep enough to open `/play` (see Decision below). If you want puzzle numbering to start fresh at 1 from whenever `/play` actually launches, that needs a new stored anchor date and Task 5 changes accordingly — flag it now if so.
- **Flagged decision D (what syncs to account):** the spec's account-sync sentence ("Signed-in users: persist to their record too, same pattern as favourites") sits directly under the *today's play state* paragraph, not under the *Stats* section. This plan syncs only today's play state to the account (mirroring `toggleFavorite`'s fire-and-forget pattern); the stats panel (games played, clue-count histogram) is local-only, per-device, with no server sync and no new Redis key for it. If you actually want lifetime stats to follow a signed-in player across devices too, that's a real scope addition (a new sync path, a merge-not-overwrite strategy) — say so and it becomes its own task.

## Global Constraints

- **Do not modify `app/api/cron/send-daily/route.ts` or `lib/bluesky.ts` in any task below.** The user explicitly asked that these not be touched as a side effect of this work. `lib/email.ts` (Part 2) is explicitly in scope — it's used by the cron route but isn't the route itself.
- No cookies, no consent banner, no third-party analytics that would require one. Vercel Web Analytics and Speed Insights are both cookieless.
- The custom event helper must stay a thin wrapper (one function, one place) so swapping analytics providers later touches one file.
- `clues` is a fixed 3-tuple (`[string, string, string]`), never a variable-length array.
- Clue 1 must never contain the answer word, its direct translation, or a word sharing a visible stem with it. Clue 3 may name cognates. No clue (1, 2, or 3) may ever contain the answer word itself or its rough stem — enforced mechanically by a test; the stricter "direct translation" rule for clue 1 specifically is enforced by hand-authorship (Task 3) and by the rewrite-pipeline's prompt instructions (Task 4), not by a mechanical test — the two are different kinds of rule (see Task 3's note on why).
- The puzzle's word pool must never include today's shared word, and must be empty (not a fallback to a recent word) when no word has gone 30+ days unshown.
- The share result must never reveal the word, the clue text, or the specific guesses made — only the puzzle number, a 3-square result grid, and the bare domain.
- No streak counter, anywhere, ever, even as an "obvious" addition. Games-played count and a clue-count histogram only.
- The share text's domain line is plain text, never a link — `navigator.share`/clipboard text only, no `url` field, so no platform renders a preview card.
- Match the existing code style: short doc comments explaining *why*, existing Tailwind tokens only (no new colors), existing patterns for Redis fallback (`if (!redis) return ...`) and localStorage pub-sub (`lib/storage.ts`'s `listeners`/`notify`/`subscribe`).
- Package manager is npm (`package-lock.json` committed).
- Deploy process: `git push origin master` (Vercel's Git integration auto-deploys).

---

## File Structure

New files:
- `lib/puzzle.ts` — pure puzzle logic: eligibility, deterministic daily selection, near-miss guess matching, result-grid/share-text building. Parameterized over a word list (`words: WordEntry[] = WORDS`) for testability.
- `lib/puzzle.test.ts` — Vitest unit tests, including a synthetic 40-word fixture list to exercise the 30-day eligibility threshold (the real 8-word `WORDS` array can never leave the empty-pool state, so testing the *non-empty* case needs a larger synthetic list).
- `lib/email.test.ts` — Vitest unit tests for `buildDigestSubject`'s truncation.
- `lib/analytics.ts` — the thin custom-event wrapper.
- `components/EmailSignupInline.tsx` — the pill-shaped email capture form, extracted from `ArrivalHero.tsx` so `/play`'s post-game funnel can reuse it verbatim.
- `components/PuzzleGame.tsx` — the whole `/play` interactive flow: clue reveal, guess input, solved/failed states, share button, stats panel, story-page funnel + signup.
- `app/play/page.tsx` — the `/play` route (server component: computes today's puzzle, renders `PuzzleGame` or the "not open yet" state).
- `app/play/opengraph-image.tsx` — non-spoiling OG image for `/play` (puzzle number only, no word/clue content).
- `app/api/play-state/route.ts` — `GET`/`POST` for a signed-in account's today's-puzzle play state, mirroring `app/api/favorites/route.ts`'s shape.

Modified files:
- `app/layout.tsx` — mount `<Analytics />` and `<SpeedInsights />`.
- `components/ArrivalHero.tsx` — its inline email form becomes a call to `EmailSignupInline`; fires `track("arrival_view")` on mount and `track("signup_submitted")` on success (via `EmailSignupInline`'s own `onSubscribed` callback, not duplicated).
- `components/StoryView.tsx` — fires `track("story_view")` on mount; gains a quiet link to `/play`.
- `components/CollectionScreen.tsx` — fires `track("collection_view")` on mount.
- `components/TodayHero.tsx` — gains a quiet link to `/play`.
- `lib/email.ts` — `buildDigestSubject` (new, exported, pure) replaces the inline subject string in `sendDailyDigest`.
- `lib/words.ts` — `WordEntry` gains `clues: [string, string, string]`; all 8 `WORDS` entries backfilled; `daysSinceStart` becomes exported (needed by `lib/puzzle.ts` for the puzzle-number calculation).
- `lib/words.test.ts` — new `describe("WORDS clues")` block.
- `lib/storage.ts` — new play-state functions (`getPlayState`/`usePlayState`/`savePlayState`, account-synced) and new stats functions (`getPuzzleStats`/`usePuzzleStats`/`recordPuzzleResult`, local-only).
- `lib/userData.ts` — `getUserPlayState`/`setUserPlayState`, keyed `curio:user:<id>:play:<date>`.
- `scripts/rewriteEtymology.ts` — `DraftEntry` gains `clues`; `buildRewritePrompt` asks for it; `parseRewriteResponse` validates it.
- `scripts/approveDraft.ts` — `validateDraft` validates `clues` (mirroring the same checks, per the existing dual-trust-boundary pattern); `appendDraftToWordsFile` writes it.
- `scripts/rewriteEtymology.test.ts` / `scripts/approveDraft.test.ts` — new cases for `clues`.

---

### Task 1: Analytics

**Files:**
- Modify: `package.json` (add `@vercel/analytics`, `@vercel/speed-insights`)
- Create: `lib/analytics.ts`
- Modify: `app/layout.tsx`
- Modify: `components/ArrivalHero.tsx`, `components/StoryView.tsx`, `components/CollectionScreen.tsx` (fire one event each, on mount)

**Interfaces:**
- Produces: `track(event: AnalyticsEvent, props?: Record<string, string | number | boolean>): void` — consumed by the three components in this task, and later by `components/PuzzleGame.tsx`/`components/EmailSignupInline.tsx` (Task 8) for free, since `signup_submitted` fires from the shared signup component.

- [ ] **Step 1: Install the dependencies**

```bash
npm install @vercel/analytics @vercel/speed-insights
```

- [ ] **Step 2: Create the event helper**

Create `lib/analytics.ts`:

```ts
import { track as vercelTrack } from "@vercel/analytics";

/** Every custom event this app fires, in one place — adding a new one
 * means adding a name here, not inventing a new string at the call site. */
export type AnalyticsEvent =
  | "arrival_view"
  | "signup_submitted"
  | "story_view"
  | "collection_view";

/** Thin wrapper around Vercel Analytics' custom-event API — the only place
 * in the app that imports `@vercel/analytics` directly, so swapping
 * providers later means rewriting this one function, not every call site.
 * Analytics failing (blocked script, ad blocker, etc.) must never break
 * the feature it's attached to. */
export function track(event: AnalyticsEvent, props?: Record<string, string | number | boolean>): void {
  try {
    vercelTrack(event, props);
  } catch {
    // best-effort only
  }
}
```

- [ ] **Step 3: Mount Analytics and Speed Insights**

In `app/layout.tsx`, add two imports near the top and mount both components inside `<body>`, after `<Footer />` (order doesn't matter functionally — Vercel's components render nothing visible):

```tsx
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
```

```tsx
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <SessionProvider>
          <Header />
          <AccountFavoritesSync />
          <main className="flex-1">{children}</main>
          <Footer />
        </SessionProvider>
        <Analytics />
        <SpeedInsights />
      </body>
```

- [ ] **Step 4: Fire `arrival_view` and `signup_submitted` in `ArrivalHero`**

In `components/ArrivalHero.tsx`, add the import and a mount-time effect, and fire the submitted event alongside the existing success handling:

```tsx
import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
```

```tsx
export default function ArrivalHero({ word, date }: { word: WordEntry; date: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    track("arrival_view");
  }, []);
```

In `handleSubmit`, right after the existing `setStatus("success");` line (before the `markOnboarded()` timeout that already exists there — see `docs/superpowers/plans/2026-09-12-daily-send-arrival-bluesky-content.md` for why that timeout exists, don't touch it):

```tsx
      setStatus("success");
      track("signup_submitted");
      setTimeout(() => markOnboarded(), 2000);
```

- [ ] **Step 5: Fire `story_view` in `StoryView`**

In `components/StoryView.tsx`, add the import and a mount effect:

```tsx
import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
```

```tsx
export default function StoryView({ word, date }: { word: WordEntry; date?: string }) {
  useEffect(() => {
    track("story_view");
  }, []);

  const favorited = useClientOnlyValue(() => isFavorite(word.slug), false);
```

- [ ] **Step 6: Fire `collection_view` in `CollectionScreen`**

In `components/CollectionScreen.tsx`, add the import and a mount effect inside the default-exported `CollectionScreen` component (not the sub-components):

```tsx
import { useEffect, useMemo, useState } from "react";
import { track } from "@/lib/analytics";
```

```tsx
export default function CollectionScreen({
  entries,
  tab,
}: {
  entries: HistoryDay[];
  tab: Tab;
}) {
  useEffect(() => {
    track("collection_view");
  }, []);

  const [activeLanguage, setActiveLanguage] = useState<string | null>(null);
```

- [ ] **Step 7: Verify**

```bash
npm run lint
npm run build
```

Expected: both clean. With the dev server running, visit `/`, a story page, and `/collection` (signed in) — confirm no console errors from the Analytics/Speed Insights scripts (they no-op quietly outside a real Vercel deployment; actual event delivery can only be confirmed in the Vercel dashboard after this deploys, which is expected and fine for this task's verification).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json lib/analytics.ts app/layout.tsx components/ArrivalHero.tsx components/StoryView.tsx components/CollectionScreen.tsx
git commit -m "feat: add Vercel Analytics/Speed Insights and a custom event helper"
```

---

### Task 2: Email subject line

**Files:**
- Modify: `lib/email.ts` (add `buildDigestSubject`, use it in `sendDailyDigest`)
- Create: `lib/email.test.ts`

**Interfaces:**
- Produces: `buildDigestSubject(teaser: string, maxLength?: number): string` — consumed only by `sendDailyDigest` in the same file.

- [ ] **Step 1: Write the failing tests**

Create `lib/email.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildDigestSubject } from "./email";

describe("buildDigestSubject", () => {
  it("returns a short teaser unchanged", () => {
    expect(buildDigestSubject("A short teaser.")).toBe("A short teaser.");
  });

  it("truncates a long teaser to the max length, breaking on a word boundary", () => {
    const teaser =
      "Venice once made incoming ships wait offshore for exactly forty days — no more, no less.";
    const subject = buildDigestSubject(teaser, 60);
    expect(subject.length).toBeLessThanOrEqual(61); // 60 + the ellipsis character
    expect(subject.endsWith("…")).toBe(true);
    // No partial word before the ellipsis: strip it and confirm what's left
    // doesn't end mid-word (the char before the ellipsis, if not itself the
    // ellipsis, must be preceded by a word boundary in the original text).
    const withoutEllipsis = subject.slice(0, -1);
    expect(teaser.startsWith(withoutEllipsis)).toBe(true);
    expect(teaser[withoutEllipsis.length]).toMatch(/\s/);
  });

  it("never leaves dangling punctuation immediately before the ellipsis", () => {
    // Constructed so the naive word-boundary cut would land right after a comma.
    const teaser = "A word for something, done in a very particular and quite specific way, historically.";
    const subject = buildDigestSubject(teaser, 30);
    expect(subject.endsWith("…")).toBe(true);
    expect(subject).not.toMatch(/[.,;:!?—–-]…$/);
  });

  it("uses a 60-character default when no maxLength is given", () => {
    const teaser = "T".repeat(100);
    const subject = buildDigestSubject(teaser);
    expect(subject.length).toBeLessThanOrEqual(61);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx vitest run lib/email.test.ts
```

Expected: fails — `buildDigestSubject` is not exported from `lib/email.ts` yet.

- [ ] **Step 3: Implement `buildDigestSubject`**

Add to `lib/email.ts`, after the existing `decodeUnsubscribeToken` function:

```ts
const DEFAULT_SUBJECT_MAX_LENGTH = 60;

/** Truncates a teaser to a safe email-subject length, breaking on a word
 * boundary (never mid-word) and stripping any trailing punctuation left
 * dangling right before the ellipsis — "...arrived," followed by "…" reads
 * worse than "...arrived…". Returns the teaser unchanged if it already
 * fits. */
export function buildDigestSubject(
  teaser: string,
  maxLength: number = DEFAULT_SUBJECT_MAX_LENGTH
): string {
  if (teaser.length <= maxLength) return teaser;
  const truncated = teaser
    .slice(0, maxLength)
    .replace(/\s+\S*$/, "")
    .replace(/[\s.,;:!?—–-]+$/, "");
  return `${truncated}…`;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npx vitest run lib/email.test.ts
```

Expected: all four pass.

- [ ] **Step 5: Use it in `sendDailyDigest`**

In `lib/email.ts`, change:

```ts
  const subject = `${word.word} — today's word from Curio`;
```

to:

```ts
  // The word itself stays prominent in the body (the <h1> in the HTML, the
  // first line of the plain-text version) — only the subject line changed,
  // so curiosity about the *teaser* survives long enough to get the email
  // opened, instead of being spent in the inbox preview.
  const subject = buildDigestSubject(word.teaser);
```

(This line lives inside `sendDailyDigest`, well after `buildDigestSubject`'s own definition earlier in the file — no reordering needed.)

- [ ] **Step 6: Verify**

```bash
npm run build
npx vitest run
```

Expected: both clean, full suite passes. With the dev server running (no `RESEND_API_KEY` set locally, so the dev fallback logs instead of sending):

```bash
curl -s http://localhost:3000/api/cron/send-daily
```

Wait — **do not run this against a real deployment with real subscribers configured; only run it locally where `RESEND_API_KEY` is unset**, so it hits the dev-fallback log path. Confirm the dev server's console log line (`[curio:email:dev-fallback] would send "..."`) now shows the truncated teaser as the subject, not the word name.

- [ ] **Step 7: Commit**

```bash
git add lib/email.ts lib/email.test.ts
git commit -m "feat: daily digest subject uses a truncated teaser instead of the word"
```

---

### Task 3: Add a `clues` field to `WordEntry`

**Files:**
- Modify: `lib/words.ts` (whole `WORDS` array, plus the `WordEntry` type and export `daysSinceStart`)
- Modify: `lib/words.test.ts` (new describe block)

**Interfaces:**
- Produces: `WordEntry.clues: [string, string, string]` — consumed by Task 4 (content pipeline) and Task 8 (`PuzzleGame`). `daysSinceStart(date: Date): number` becomes exported — consumed by Task 5 (`lib/puzzle.ts`).

- [ ] **Step 1: Add `clues` to the `WordEntry` type**

In `lib/words.ts`, change:

```ts
export type WordEntry = {
  slug: string;
  word: string;
  respelling: string;
  partOfSpeech: string;
  /** A one-sentence hook shown on the Today page — distinct from `origin`
   * (the full explanation shown on the story page) so clicking through
   * reveals new text rather than repeating what was just read. Written from
   * the same facts as origin/journey/related, just condensed and rephrased,
   * never introducing anything not already established there. */
  teaser: string;
  origin: string;
  journey: string;
  related: string;
  /** The languages this word passed through, oldest first, ending in
   * "English" — only languages explicitly named in this entry's own
   * origin/journey/related text, in the order they're introduced. Powers
   * the etymology lineage breadcrumb (components/EtymologyLineage.tsx). */
  lineage: string[];
};
```

to:

```ts
export type WordEntry = {
  slug: string;
  word: string;
  respelling: string;
  partOfSpeech: string;
  /** A one-sentence hook shown on the Today page — distinct from `origin`
   * (the full explanation shown on the story page) so clicking through
   * reveals new text rather than repeating what was just read. Written from
   * the same facts as origin/journey/related, just condensed and rephrased,
   * never introducing anything not already established there. */
  teaser: string;
  origin: string;
  journey: string;
  related: string;
  /** The languages this word passed through, oldest first, ending in
   * "English" — only languages explicitly named in this entry's own
   * origin/journey/related text, in the order they're introduced. Powers
   * the etymology lineage breadcrumb (components/EtymologyLineage.tsx). */
  lineage: string[];
  /** Three STANDALONE clues for the /play puzzle (lib/puzzle.ts) — unlike
   * origin/journey/related, each must make sense read in isolation, since
   * only one is shown at a time. Ordered most-to-least oblique: clue[0]
   * must not name the word, its direct translation, or any word sharing a
   * visible stem with it; clue[2] may name cognates and get close to
   * giving the word away outright, but (like all three) must never contain
   * the word itself or its stem — see lib/words.test.ts's "WORDS clues"
   * block for the mechanical half of that check, and this comment for the
   * editorial half a test can't fully capture. */
  clues: [string, string, string];
};
```

- [ ] **Step 2: Backfill all 8 entries**

Add a `clues` field to every object in the `WORDS` array, using the exact text below for each (derived only from that entry's own existing `origin`/`journey`/`related` text — no new etymological facts).

`quarantine`:
```ts
    clues: [
      "A European port city once forced incoming ships to sit offshore for a set stretch of time before anyone could disembark.",
      "Venice imposed this on ships from plague-affected ports in the 1300s — specifically, a wait of exactly forty days.",
      "The Italian phrase behind it literally means “forty days”; quarter and quart are distant cousins, both from the Latin word for four.",
    ],
```

`salary`:
```ts
    clues: [
      "Roman soldiers' pay was once connected, in a roundabout way, to an everyday seasoning.",
      "That seasoning was salt — this word's Latin ancestor was built directly from the Latin word for it.",
      "The same Latin word for salt also gives English salad, sauce, and sausage — and lives on in the phrase “worth one's salt.”",
    ],
```

`disaster`:
```ts
    clues: [
      "This word for a sudden catastrophe was once a literal verdict handed down by the position of the sky.",
      "Its two Italian building blocks mean “bad” and “star” — misfortune was once blamed directly on an unlucky alignment overhead.",
      "The “star” half also shows up in astronomy and astronaut; the “bad” half resurfaces in disgrace and discord.",
    ],
```

`clue`:
```ts
    clues: [
      "In an ancient Greek myth, a hero unwound a ball of thread behind him so he could find his way back out of a maze.",
      "That myth is where this word for a hint that helps you solve something comes from — it was originally the literal thread itself.",
      "It's spelled almost like its own ancestor, clew — today surviving only as a sailing term for the corner of a sail.",
    ],
```

`muscle`:
```ts
    clues: [
      "To Roman anatomists, a flexing body part looked like a small animal moving just beneath the skin.",
      "That resemblance is Latin for “little mouse” — the nickname stuck so well it became the official word for it.",
      "The same Latin root for “mouse” gives us the small rodent itself, and much later, the computer accessory named after it.",
    ],
```

`robot`:
```ts
    clues: [
      "This word for a mechanical worker was invented for a 1920s stage play, not borrowed from everyday speech.",
      "Its Czech root means forced labor or drudgery, coined by the writer Karel Čapek.",
      "That root is related to an old Slavic word for slave — English has no native relatives for it at all, making this one of the few everyday words borrowed wholesale from Czech.",
    ],
```

`avocado`:
```ts
    clues: [
      "This fruit's original name in Nahuatl referred to a rather personal part of the body — a nod to how it hangs in pairs from the tree.",
      "Spanish speakers reshaped that word, and a later mix-up with the Spanish word for lawyer helped push it toward its modern form — which is also why English once called it an “alligator pear.”",
      "Guacamole comes from the very same Nahuatl root, just combined with the word for sauce.",
    ],
```

`companion`:
```ts
    clues: [
      "This word for someone who's with you started as a description of a very specific shared activity.",
      "Literally, in Latin, it means “one who breaks bread with you” — together plus the word for bread.",
      "That same root for bread also gives us pantry, where it was kept, and — through French — company and accompany.",
    ],
```

Place each entry's `clues` array immediately after its `lineage` field, matching the type's field order.

- [ ] **Step 3: Export `daysSinceStart`**

Change:

```ts
function daysSinceStart(date: Date): number {
```

to:

```ts
export function daysSinceStart(date: Date): number {
```

- [ ] **Step 4: Write the new test block**

Add to `lib/words.test.ts`, after the existing `describe("WORDS content", ...)` block:

```ts
describe("WORDS clues", () => {
  it("every entry has exactly 3 clues", () => {
    for (const word of WORDS) {
      expect(word.clues).toHaveLength(3);
      for (const clue of word.clues) {
        expect(clue.length).toBeGreaterThan(0);
      }
    }
  });

  it("no clue contains the answer word or its rough stem, case-insensitively", () => {
    for (const word of WORDS) {
      const lowerWord = word.word.toLowerCase();
      // A deliberately crude stem — strips one common suffix if present.
      // This is a mechanical safety net, not a linguistic guarantee: it
      // catches the easy mistake of a clue containing "salary"/"salaries",
      // not every possible morphological relative. Editorial judgment
      // (never naming the word, its direct translation, or a visible
      // cognate in clue 1 specifically) is enforced by hand-authorship and
      // by the rewrite pipeline's prompt (scripts/rewriteEtymology.ts),
      // not by this test.
      const stem = lowerWord.replace(/(ing|tion|ed|es|s|y)$/i, "");
      for (const clue of word.clues) {
        const lowerClue = clue.toLowerCase();
        expect(lowerClue).not.toContain(lowerWord);
        expect(lowerClue).not.toContain(stem);
      }
    }
  });
});
```

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
npx vitest run lib/words.test.ts
```

Expected: all pass, including the two new tests.

- [ ] **Step 6: Verify the build**

```bash
npm run build
```

Expected: clean — the `[string, string, string]` tuple type on every `WORDS` entry must satisfy the type checker.

- [ ] **Step 7: Commit**

```bash
git add lib/words.ts lib/words.test.ts
git commit -m "feat: add clues field to WordEntry, backfill the 8 existing entries"
```

---

### Task 4: Teach the content pipeline to generate `clues`

**Files:**
- Modify: `scripts/rewriteEtymology.ts` (`DraftEntry`, `buildRewritePrompt`, `parseRewriteResponse`)
- Modify: `scripts/rewriteEtymology.test.ts`
- Modify: `scripts/approveDraft.ts` (`validateDraft`, `appendDraftToWordsFile`)
- Modify: `scripts/approveDraft.test.ts`

**Interfaces:**
- Consumes: `WordEntry.clues` shape (Task 3).
- Produces: `DraftEntry.clues: [string, string, string]` — consumed by `scripts/approveDraft.ts`.

- [ ] **Step 1: Add `clues` to `DraftEntry`**

In `scripts/rewriteEtymology.ts`, change:

```ts
export type DraftEntry = {
  slug: string;
  word: string;
  respelling: string;
  partOfSpeech: string;
  teaser: string;
  origin: string;
  journey: string;
  related: string;
  lineage: string[];
};
```

to:

```ts
export type DraftEntry = {
  slug: string;
  word: string;
  respelling: string;
  partOfSpeech: string;
  teaser: string;
  origin: string;
  journey: string;
  related: string;
  lineage: string[];
  clues: [string, string, string];
};
```

- [ ] **Step 2: Ask for `clues` in the prompt**

In `buildRewritePrompt`, change the JSON shape description from:

```ts
  "lineage": ["array of language names, oldest first, always ending with \\"English\\" — only languages actually named in the facts above, in the order they appear in the word's history"]
}`;
```

to:

```ts
  "lineage": ["array of language names, oldest first, always ending with \\"English\\" — only languages actually named in the facts above, in the order they appear in the word's history"],
  "clues": [
    "clue 1 (most oblique): must NOT contain the word \\"${word}\\" itself, its direct translation, or any word sharing a visible stem with it — describe the underlying fact obliquely instead",
    "clue 2 (more revealing): may state the direct translation or an additional fact from above, but still must not contain \\"${word}\\" itself",
    "clue 3 (nearly a giveaway): may name a cognate or related word, but must still never contain \\"${word}\\" itself"
  ]
}`;
```

(The `${word}` interpolations are inside the template literal `buildRewritePrompt` already returns — this is a string *describing* the constraint to Claude, not runtime validation; Step 3 below is the actual enforcement.)

- [ ] **Step 3: Validate `clues` in `parseRewriteResponse`**

In `scripts/rewriteEtymology.ts`, after the existing `teaser === origin` check and before the `return`:

```ts
  const teaser = parsed.teaser as string;
  const origin = parsed.origin as string;
  if (teaser === origin) {
    throw new Error(`Draft for "${word}" has a "teaser" identical to its "origin" — they must differ.`);
  }

  if (!Array.isArray(parsed.clues) || parsed.clues.length !== 3 || !parsed.clues.every((c) => typeof c === "string" && c.trim())) {
    throw new Error(`Draft for "${word}" has an invalid "clues" field (must be exactly 3 non-empty strings).`);
  }
  const clues = parsed.clues as [string, string, string];
  const lowerWord = word.toLowerCase();
  const stem = lowerWord.replace(/(ing|tion|ed|es|s|y)$/i, "");
  for (const [i, clue] of clues.entries()) {
    const lowerClue = clue.toLowerCase();
    if (lowerClue.includes(lowerWord) || lowerClue.includes(stem)) {
      throw new Error(`Draft for "${word}" has a clue (index ${i}) containing the answer word or its stem: "${clue}"`);
    }
  }

  return {
    slug: word,
    word,
    respelling: parsed.respelling as string,
    partOfSpeech: parsed.partOfSpeech as string,
    teaser,
    origin,
    journey: parsed.journey as string,
    related: parsed.related as string,
    lineage,
    clues,
  };
```

- [ ] **Step 4: Update the tests**

In `scripts/rewriteEtymology.test.ts`, update the `validJson` fixture in the `parseRewriteResponse` describe block to include `clues`:

```ts
  const validJson = JSON.stringify({
    respelling: "BANGK",
    partOfSpeech: "noun",
    teaser: "A word for money-holding and riverbanks alike, from the very same root.",
    origin: "From Middle English banke, ultimately from Old Norse banki.",
    journey: "The word split into two senses that still share one spelling today.",
    related: "A distant cousin of bench, from the same Germanic root for a raised shelf.",
    lineage: ["Old Norse", "Middle English", "English"],
    clues: [
      "A raised shelf of ground and a place to keep your money share more than you'd think.",
      "Old Norse for a raised shelf of ground is the shared root behind both senses.",
      "A distant cousin of bench, from the same Germanic root.",
    ],
  });
```

Update the existing `it("parses a valid response...")` test to also assert on `clues`:

```ts
  it("parses a valid response into a DraftEntry with the given slug/word", () => {
    const draft = parseRewriteResponse(validJson, "bank");
    expect(draft.slug).toBe("bank");
    expect(draft.word).toBe("bank");
    expect(draft.respelling).toBe("BANGK");
    expect(draft.lineage).toEqual(["Old Norse", "Middle English", "English"]);
    expect(draft.clues).toHaveLength(3);
  });
```

Add two new tests, after the existing `it("throws if lineage doesn't end in English", ...)` test:

```ts
  it("throws if clues isn't exactly 3 non-empty strings", () => {
    const badClues = JSON.stringify({
      respelling: "BANGK",
      partOfSpeech: "noun",
      teaser: "A teaser sentence here.",
      origin: "Origin text.",
      journey: "Journey text.",
      related: "Related text.",
      lineage: ["English"],
      clues: ["Only one clue."],
    });
    expect(() => parseRewriteResponse(badClues, "bank")).toThrow(/clues/i);
  });

  it("throws if a clue contains the answer word", () => {
    const spoilerClue = JSON.stringify({
      respelling: "BANGK",
      partOfSpeech: "noun",
      teaser: "A teaser sentence here.",
      origin: "Origin text.",
      journey: "Journey text.",
      related: "Related text.",
      lineage: ["English"],
      clues: [
        "This clue accidentally mentions bank directly.",
        "A second clue.",
        "A third clue.",
      ],
    });
    expect(() => parseRewriteResponse(spoilerClue, "bank")).toThrow(/clue/i);
  });
```

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
npx vitest run scripts/rewriteEtymology.test.ts
```

Expected: all pass (6 original + 2 new = 8).

- [ ] **Step 6: Mirror the validation in `scripts/approveDraft.ts`**

In `scripts/approveDraft.ts`, `validateDraft` currently ends with the `teaser === origin` check before `return d as DraftEntry;`. Add, right before that `return`:

```ts
  if (!Array.isArray(d.clues) || d.clues.length !== 3 || !d.clues.every((c) => typeof c === "string" && c.trim())) {
    throw new Error('Draft has an invalid "clues" field (must be exactly 3 non-empty strings).');
  }
  const lowerWord = (d.word as string).toLowerCase();
  const stem = lowerWord.replace(/(ing|tion|ed|es|s|y)$/i, "");
  for (const [i, clue] of d.clues.entries()) {
    const lowerClue = (clue as string).toLowerCase();
    if (lowerClue.includes(lowerWord) || lowerClue.includes(stem)) {
      throw new Error(`Draft's clue (index ${i}) contains the answer word or its stem: "${clue}"`);
    }
  }
```

- [ ] **Step 7: Write `clues` when appending**

In `appendDraftToWordsFile`'s `entryLiteral` template, add a line after `lineage`:

```ts
  const entryLiteral = `  {
    slug: ${JSON.stringify(draft.slug)},
    word: ${JSON.stringify(draft.word)},
    respelling: ${JSON.stringify(draft.respelling)},
    partOfSpeech: ${JSON.stringify(draft.partOfSpeech)},
    teaser: ${JSON.stringify(draft.teaser)},
    origin: ${JSON.stringify(draft.origin)},
    journey: ${JSON.stringify(draft.journey)},
    related: ${JSON.stringify(draft.related)},
    lineage: ${JSON.stringify(draft.lineage)},
    clues: ${JSON.stringify(draft.clues)},
  },
`;
```

- [ ] **Step 8: Update `scripts/approveDraft.test.ts`**

Add `clues` to the `validDraft` fixture at the top of the file:

```ts
const validDraft = {
  slug: "bank",
  word: "bank",
  respelling: "BANGK",
  partOfSpeech: "noun",
  teaser: "A word for money-holding and riverbanks alike, from the very same root.",
  origin: "From Middle English banke, ultimately from Old Norse banki.",
  journey: "The word split into two senses that still share one spelling today.",
  related: "A distant cousin of bench, from the same Germanic root for a raised shelf.",
  lineage: ["Old Norse", "Middle English", "English"],
  clues: [
    "A raised shelf of ground and a place to keep your money share more than you'd think.",
    "Old Norse for a raised shelf of ground is the shared root behind both senses.",
    "A distant cousin of bench, from the same Germanic root.",
  ],
};
```

Add one new test to the `describe("validateDraft", ...)` block:

```ts
  it("rejects a draft whose clue contains the answer word", () => {
    expect(() =>
      validateDraft({ ...validDraft, clues: ["This one says bank outright.", "clue two", "clue three"] })
    ).toThrow(/clue/i);
  });
```

And confirm the existing `appendDraftToWordsFile` test's assertions still pass unmodified — it already checks for `slug: "bank"` presence, which is unaffected by the new `clues` line being written alongside it; no change needed to that test's body, just re-running it after Step 7's change.

- [ ] **Step 9: Run the tests and confirm they pass**

```bash
npx vitest run scripts/approveDraft.test.ts
```

Expected: all pass (5 original + 1 new = 6).

- [ ] **Step 10: Full verification**

```bash
npm run lint
npx vitest run
npm run build
```

Expected: all clean.

- [ ] **Step 11: Commit**

```bash
git add scripts/rewriteEtymology.ts scripts/rewriteEtymology.test.ts scripts/approveDraft.ts scripts/approveDraft.test.ts
git commit -m "feat: content pipeline generates and validates the clues field"
```

---

### Task 5: `lib/puzzle.ts` — eligibility, selection, guess matching, share text

**Files:**
- Create: `lib/puzzle.ts`
- Create: `lib/puzzle.test.ts`

**Interfaces:**
- Consumes: `WORDS`, `WordEntry`, `getWordForDate`, `daysSinceStart` (Task 3's export) — all `lib/words.ts`.
- Produces: `PUZZLE_MIN_DAYS_SINCE_SHOWN: number`, `getEligiblePuzzleWords(today?, words?): WordEntry[]`, `type Puzzle = { word: WordEntry; puzzleNumber: number }`, `getPuzzleForDate(today?, words?): Puzzle | null`, `getTodayPuzzle(): Puzzle | null`, `isCorrectGuess(guess: string, answer: string): boolean`, `buildPuzzleResultGrid(cluesUsedToSolve: 1 | 2 | 3 | null): string`, `buildPuzzleShareText(puzzleNumber: number, cluesUsedToSolve: 1 | 2 | 3 | null, siteUrl: string): string` — all consumed by Task 8 (`app/play/page.tsx`, `components/PuzzleGame.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `lib/puzzle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  PUZZLE_MIN_DAYS_SINCE_SHOWN,
  getEligiblePuzzleWords,
  getPuzzleForDate,
  isCorrectGuess,
  buildPuzzleResultGrid,
  buildPuzzleShareText,
} from "./puzzle";
import { WORDS, daysSinceStart } from "./words";
import type { WordEntry } from "./words";

function makeWord(slug: string): WordEntry {
  return {
    slug,
    word: slug,
    respelling: slug.toUpperCase(),
    partOfSpeech: "noun",
    teaser: "",
    origin: "",
    journey: "",
    related: "",
    lineage: ["English"],
    clues: ["clue one", "clue two", "clue three"],
  };
}

// A synthetic 40-word list — large enough for its rotation period (40 days)
// to comfortably exceed PUZZLE_MIN_DAYS_SINCE_SHOWN (30), which the real
// WORDS array (8 entries, a rotation period far shorter than 30 days)
// cannot do. This is the only way to test the "pool becomes non-empty"
// path without waiting for real content to reach 30+ entries.
const LARGE_WORD_LIST: WordEntry[] = Array.from({ length: 40 }, (_, i) => makeWord(`word-${i}`));

describe("getEligiblePuzzleWords", () => {
  it("is empty for the real (small) WORDS array, on any date", () => {
    // WORDS.length is currently well under 30, so its rotation period is
    // too short for any word to ever go 30 days unshown — this is the
    // exact "not open yet" condition getPuzzleForDate relies on.
    const today = new Date("2027-06-01T00:00:00Z");
    expect(getEligiblePuzzleWords(today, WORDS)).toEqual([]);
  });

  it("is non-empty for a large enough synthetic word list", () => {
    const today = new Date("2026-01-01T00:00:00Z");
    const pool = getEligiblePuzzleWords(today, LARGE_WORD_LIST);
    expect(pool.length).toBeGreaterThan(0);
  });

  it("never includes today's own word", () => {
    const today = new Date("2026-01-01T00:00:00Z");
    // Same rotation formula getPuzzleForDate uses internally, applied here
    // directly to LARGE_WORD_LIST (getWordForDate itself is hardcoded to
    // the real WORDS array's length, so it can't be reused for a
    // synthetic list) — this independently derives "today's word" for the
    // assertion rather than trusting the implementation's own answer.
    const index =
      ((daysSinceStart(today) % LARGE_WORD_LIST.length) + LARGE_WORD_LIST.length) %
      LARGE_WORD_LIST.length;
    const todaysWord = LARGE_WORD_LIST[index];
    const pool = getEligiblePuzzleWords(today, LARGE_WORD_LIST);
    expect(pool.map((w) => w.slug)).not.toContain(todaysWord.slug);
  });

  it("excludes a word shown fewer than PUZZLE_MIN_DAYS_SINCE_SHOWN days ago", () => {
    const today = new Date("2026-01-01T00:00:00Z");
    const poolToday = getEligiblePuzzleWords(today, LARGE_WORD_LIST);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const poolTomorrow = getEligiblePuzzleWords(tomorrow, LARGE_WORD_LIST);
    // The word shown exactly PUZZLE_MIN_DAYS_SINCE_SHOWN - 1 days before
    // "tomorrow" must be excluded from tomorrow's pool even if it was
    // included in today's (rotation shifts eligibility by exactly one slot
    // per day for a list this size).
    expect(poolToday).not.toEqual(poolTomorrow);
  });
});

describe("getPuzzleForDate", () => {
  it("returns null when the pool is empty", () => {
    const today = new Date("2027-06-01T00:00:00Z");
    expect(getPuzzleForDate(today, WORDS)).toBeNull();
  });

  it("returns the same puzzle for the same date, called twice", () => {
    const today = new Date("2026-03-01T00:00:00Z");
    const a = getPuzzleForDate(today, LARGE_WORD_LIST);
    const b = getPuzzleForDate(today, LARGE_WORD_LIST);
    expect(a).toEqual(b);
  });

  it("can return a different puzzle on a different date", () => {
    const day1 = new Date("2026-03-01T00:00:00Z");
    const day2 = new Date("2026-03-02T00:00:00Z");
    const a = getPuzzleForDate(day1, LARGE_WORD_LIST);
    const b = getPuzzleForDate(day2, LARGE_WORD_LIST);
    expect(a?.word.slug).not.toBe(b?.word.slug);
  });

  it("gives every puzzle a positive puzzleNumber", () => {
    const today = new Date("2026-03-01T00:00:00Z");
    const puzzle = getPuzzleForDate(today, LARGE_WORD_LIST);
    expect(puzzle?.puzzleNumber).toBeGreaterThan(0);
  });
});

describe("isCorrectGuess", () => {
  it("matches an exact guess", () => {
    expect(isCorrectGuess("quarantine", "quarantine")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isCorrectGuess("Quarantine", "quarantine")).toBe(true);
  });

  it("tolerates surrounding and collapsed whitespace", () => {
    expect(isCorrectGuess("  quarantine  ", "quarantine")).toBe(true);
  });

  it("tolerates a simple trailing plural on the guess", () => {
    expect(isCorrectGuess("companions", "companion")).toBe(true);
  });

  it("tolerates a simple trailing plural on the answer", () => {
    expect(isCorrectGuess("bus", "buses")).toBe(true);
  });

  it("rejects an unrelated word", () => {
    expect(isCorrectGuess("banana", "quarantine")).toBe(false);
  });

  it("rejects an empty guess", () => {
    expect(isCorrectGuess("   ", "quarantine")).toBe(false);
  });
});

describe("buildPuzzleResultGrid", () => {
  it("marks the solving clue and leaves the rest unused", () => {
    expect(buildPuzzleResultGrid(1)).toBe("🟫⬜⬜");
    expect(buildPuzzleResultGrid(2)).toBe("⬜🟫⬜");
    expect(buildPuzzleResultGrid(3)).toBe("⬜⬜🟫");
  });

  it("marks every square failed when never solved", () => {
    expect(buildPuzzleResultGrid(null)).toBe("⬛⬛⬛");
  });
});

describe("buildPuzzleShareText", () => {
  it("includes the puzzle number, the grid, and the bare domain", () => {
    const text = buildPuzzleShareText(142, 1, "https://etymology-app-orcin.vercel.app");
    expect(text).toContain("Curio puzzle #142");
    expect(text).toContain("🟫⬜⬜");
    expect(text).toContain("etymology-app-orcin.vercel.app");
    expect(text).not.toContain("https://");
    expect(text).not.toContain("http://");
  });

  it("never reveals the word or clue text", () => {
    // buildPuzzleShareText's signature doesn't even accept a word or clue
    // argument — this test documents that constraint rather than probing
    // for a leak that structurally cannot occur.
    const text = buildPuzzleShareText(1, null, "https://example.com");
    expect(text.split("\n")).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx vitest run lib/puzzle.test.ts
```

Expected: fails — `lib/puzzle.ts` doesn't exist yet.

- [ ] **Step 3: Implement `lib/puzzle.ts`**

```ts
import { WORDS, type WordEntry, daysSinceStart } from "./words";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A word only becomes eligible for the daily puzzle once this many days
 * have passed since it last ran as the shared daily word — keeps the
 * puzzle from spoiling something a player might have just read on Today or
 * in the Bluesky post. With `words.length` words cycling through Today
 * every `words.length` days, the eligible pool is necessarily empty until
 * the word bank comfortably exceeds this number — see getPuzzleForDate's
 * null case. */
export const PUZZLE_MIN_DAYS_SINCE_SHOWN = 30;

/** The word shown on `date` under the same deterministic rotation
 * getWordForDate uses, but parameterized over an arbitrary word list —
 * getWordForDate itself is hardcoded to the real WORDS array, so this
 * local equivalent is what makes lib/puzzle.ts's functions testable
 * against a synthetic list without needing 30+ real words. Produces
 * identical results to getWordForDate when `words` is the real WORDS
 * array, since it's the exact same formula. */
function wordForDateFrom(words: WordEntry[], date: Date): WordEntry {
  const index = ((daysSinceStart(date) % words.length) + words.length) % words.length;
  return words[index];
}

/** How many days before `today` (1 = yesterday) `word` was last shown under
 * `wordForDateFrom`, or null if it wasn't shown at all within the search
 * window. The window is one full rotation or PUZZLE_MIN_DAYS_SINCE_SHOWN,
 * whichever is longer — either is enough to prove "not recently shown". */
function daysSinceLastShown(word: WordEntry, today: Date, words: WordEntry[]): number | null {
  const searchWindow = Math.max(words.length, PUZZLE_MIN_DAYS_SINCE_SHOWN);
  for (let i = 1; i <= searchWindow; i++) {
    const past = new Date(today.getTime() - i * DAY_MS);
    if (wordForDateFrom(words, past).slug === word.slug) return i;
  }
  return null;
}

/** Words eligible to appear as today's puzzle: shown at least
 * PUZZLE_MIN_DAYS_SINCE_SHOWN days ago, excluding today's own word (which
 * would fail that threshold anyway, having been shown zero days ago, but
 * is excluded explicitly for clarity). `words` defaults to the real WORDS
 * array; tests pass a larger synthetic list to exercise the non-empty
 * case, which the real (currently 8-word) list cannot reach. */
export function getEligiblePuzzleWords(
  today: Date = new Date(),
  words: WordEntry[] = WORDS
): WordEntry[] {
  const todayWord = wordForDateFrom(words, today);
  return words.filter((w) => {
    if (w.slug === todayWord.slug) return false;
    const days = daysSinceLastShown(w, today, words);
    return days !== null && days >= PUZZLE_MIN_DAYS_SINCE_SHOWN;
  });
}

export type Puzzle = { word: WordEntry; puzzleNumber: number };

/** Today's puzzle, or null if the eligible pool is empty (the word bank
 * isn't deep enough yet — this is the honest "not open yet" case /play
 * renders, never a fallback to a recent word). Deterministic and global:
 * the same calendar day always selects the same word for every player,
 * the same seeded-rotation approach getWordForDate uses for the shared
 * word-of-the-day, cycling through the CURRENTLY eligible pool without
 * repeating until it's been exhausted once. The pool's own membership can
 * shift day to day as the underlying daily rotation continues (a word
 * ages back out of eligibility once it's shown on Today again) — this is
 * a deliberately simple rotation, not a long-term perfect-non-repeat
 * guarantee across pool membership changes. */
export function getPuzzleForDate(
  today: Date = new Date(),
  words: WordEntry[] = WORDS
): Puzzle | null {
  const pool = getEligiblePuzzleWords(today, words);
  if (pool.length === 0) return null;
  const dayCount = daysSinceStart(today);
  const index = ((dayCount % pool.length) + pool.length) % pool.length;
  // Human-facing puzzle numbers start at 1, reusing the same anchor date
  // getWordForDate does rather than introducing a second one — see this
  // plan's Flagged decision C for what that means for the first real
  // puzzle's number.
  return { word: pool[index], puzzleNumber: dayCount + 1 };
}

export function getTodayPuzzle(): Puzzle | null {
  return getPuzzleForDate(new Date());
}

function normalizeGuess(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function stripSimplePlural(s: string): string {
  if (s.endsWith("es") && s.length > 3) return s.slice(0, -2);
  if (s.endsWith("s") && s.length > 2) return s.slice(0, -1);
  return s;
}

/** Accepts near-misses — case, surrounding/collapsed whitespace, and a
 * simple trailing "-s"/"-es" plural in either direction — as a correct
 * guess, without attempting full fuzzy matching. */
export function isCorrectGuess(guess: string, answer: string): boolean {
  const g = normalizeGuess(guess);
  const a = normalizeGuess(answer);
  if (!g) return false;
  if (g === a) return true;
  return stripSimplePlural(g) === a || g === stripSimplePlural(a);
}

const RESULT_SQUARES = 3;

/** The result grid for a share: 🟫 marks which clue solved it, ⬜ marks
 * unused clues, ⬛⬛⬛ marks a total failure. Never reveals the word, clue
 * text, or how many wrong guesses were made beyond the clue count. */
export function buildPuzzleResultGrid(cluesUsedToSolve: 1 | 2 | 3 | null): string {
  if (cluesUsedToSolve === null) return "⬛".repeat(RESULT_SQUARES);
  return Array.from({ length: RESULT_SQUARES }, (_, i) =>
    i === cluesUsedToSolve - 1 ? "🟫" : "⬜"
  ).join("");
}

/** The full share text — puzzle number, the result grid, and the bare
 * domain as plain text (deliberately not a link: a real URL would let
 * social platforms render a preview card, which this share is designed to
 * avoid — see this plan's Global Constraints). Derived from `siteUrl`
 * rather than hardcoded, so it always names this app's actual current
 * domain (see Flagged decision B). */
export function buildPuzzleShareText(
  puzzleNumber: number,
  cluesUsedToSolve: 1 | 2 | 3 | null,
  siteUrl: string
): string {
  const domain = siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const grid = buildPuzzleResultGrid(cluesUsedToSolve);
  return `Curio puzzle #${puzzleNumber}\n${grid}\n${domain}`;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npx vitest run lib/puzzle.test.ts
```

Expected: all pass.

- [ ] **Step 5: Verify against the full suite and build**

```bash
npm run lint
npx vitest run
npm run build
```

Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add lib/puzzle.ts lib/puzzle.test.ts
git commit -m "feat: add lib/puzzle.ts — eligibility, selection, guess matching, share text"
```

---

### Task 6: Play-state and stats storage

**Files:**
- Modify: `lib/storage.ts`

**Interfaces:**
- Produces: `type PlayState`, `getPlayState(puzzleDate: string): PlayState | null`, `usePlayState(puzzleDate: string): PlayState | null`, `savePlayState(state: PlayState): void`, `type PuzzleStats`, `getPuzzleStats(): PuzzleStats`, `usePuzzleStats(): PuzzleStats`, `recordPuzzleResult(cluesUsedToSolve: 1 | 2 | 3 | null): void` — all consumed by Task 8 (`components/PuzzleGame.tsx`).

- [ ] **Step 1: Add play-state storage**

In `lib/storage.ts`, add after the existing `hasOnboarded`/`useHasOnboarded`/`markOnboarded` block:

```ts
const PLAY_STATE_KEY_PREFIX = "curio:play:"; // one key per puzzle date, e.g. curio:play:2026-10-15

export type PlayState = {
  puzzleDate: string; // YYYY-MM-DD — which puzzle this state belongs to
  cluesRevealed: 1 | 2 | 3;
  status: "playing" | "solved" | "failed";
  cluesUsedToSolve: 1 | 2 | 3 | null; // set only once status leaves "playing"
};

function playStateKey(puzzleDate: string): string {
  return `${PLAY_STATE_KEY_PREFIX}${puzzleDate}`;
}

export function getPlayState(puzzleDate: string): PlayState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(playStateKey(puzzleDate));
    return raw ? (JSON.parse(raw) as PlayState) : null;
  } catch {
    return null;
  }
}

export function usePlayState(puzzleDate: string): PlayState | null {
  return useSyncExternalStore(subscribe, () => getPlayState(puzzleDate), () => null);
}

/** Persists today's play state locally (so a reload doesn't reset progress
 * or let the puzzle be replayed) and, best-effort, to the signed-in
 * account — mirroring toggleFavorite's fire-and-forget sync above. Local
 * state already reflects the change regardless of whether the sync
 * succeeds. */
export function savePlayState(state: PlayState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(playStateKey(state.puzzleDate), JSON.stringify(state));
  notify();
  void syncPlayStateToAccount(state);
}

async function syncPlayStateToAccount(state: PlayState): Promise<void> {
  try {
    await fetch("/api/play-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
  } catch {
    // best-effort; nothing to do here (also swallows the 401 for signed-out users)
  }
}
```

- [ ] **Step 2: Add local-only puzzle stats storage**

Immediately after the play-state block:

```ts
const PUZZLE_STATS_KEY = "curio:puzzleStats";

// [clues-to-solve-on-1, on-2, on-3, failed] — index 3 is "failed", not a
// 4th clue. No streak field, ever — see this plan's Global Constraints.
export type PuzzleStats = { played: number; histogram: [number, number, number, number] };

const EMPTY_STATS: PuzzleStats = { played: 0, histogram: [0, 0, 0, 0] };

export function getPuzzleStats(): PuzzleStats {
  if (typeof window === "undefined") return EMPTY_STATS;
  try {
    const raw = window.localStorage.getItem(PUZZLE_STATS_KEY);
    return raw ? (JSON.parse(raw) as PuzzleStats) : EMPTY_STATS;
  } catch {
    return EMPTY_STATS;
  }
}

export function usePuzzleStats(): PuzzleStats {
  return useSyncExternalStore(subscribe, () => getPuzzleStats(), () => EMPTY_STATS);
}

/** Records one completed puzzle (solved on a given clue, or failed) into
 * the local, per-device stats histogram. Local-only by design — see this
 * plan's Flagged decision D for why this doesn't sync to the account the
 * way play state does. Call this exactly once per puzzle completion (the
 * caller — components/PuzzleGame.tsx — only calls it from the actual
 * guess-submission handler, never from an effect that could re-fire on a
 * reload of an already-completed puzzle). */
export function recordPuzzleResult(cluesUsedToSolve: 1 | 2 | 3 | null): void {
  if (typeof window === "undefined") return;
  const stats = getPuzzleStats();
  const index = cluesUsedToSolve === null ? 3 : cluesUsedToSolve - 1;
  const histogram = [...stats.histogram] as [number, number, number, number];
  histogram[index] += 1;
  const next: PuzzleStats = { played: stats.played + 1, histogram };
  window.localStorage.setItem(PUZZLE_STATS_KEY, JSON.stringify(next));
  notify();
}
```

- [ ] **Step 3: Verify**

```bash
npm run lint
npx tsc --noEmit
```

Expected: both clean. There's no route or component consuming these yet (Tasks 7-8 add them) — lint/typecheck is sufficient verification for this task; `/api/play-state` doesn't exist until Task 7, so `savePlayState`'s fetch call has nothing to hit yet locally, which is fine (it fails silently into the existing catch block, exactly as the favorites equivalent does before `/api/favorites` existed in the original accounts plan).

- [ ] **Step 4: Commit**

```bash
git add lib/storage.ts
git commit -m "feat: add localStorage-backed play-state and puzzle-stats storage"
```

---

### Task 7: Server-side play-state persistence

**Files:**
- Modify: `lib/userData.ts`
- Create: `app/api/play-state/route.ts`

**Interfaces:**
- Consumes: `redis` (`lib/redis.ts`), `auth()` (`lib/auth.ts`), `PlayState` type (Task 6, `lib/storage.ts`).
- Produces: `getUserPlayState(userId: string, puzzleDate: string): Promise<PlayState | null>`, `setUserPlayState(userId: string, puzzleDate: string, state: PlayState): Promise<void>` — consumed by `app/api/play-state/route.ts`.

- [ ] **Step 1: Add the storage functions to `lib/userData.ts`**

Add at the end of the file, and add `import type { PlayState } from "./storage";` at the top alongside the existing `import { redis } from "./redis";`:

```ts
function playStateKey(userId: string, puzzleDate: string): string {
  return `curio:user:${userId}:play:${puzzleDate}`;
}

export async function getUserPlayState(userId: string, puzzleDate: string): Promise<PlayState | null> {
  if (!redis) return null;
  return redis.get<PlayState>(playStateKey(userId, puzzleDate));
}

export async function setUserPlayState(
  userId: string,
  puzzleDate: string,
  state: PlayState
): Promise<void> {
  if (!redis) return;
  await redis.set(playStateKey(userId, puzzleDate), state);
}
```

- [ ] **Step 2: Create the API route**

Create `app/api/play-state/route.ts`, mirroring `app/api/favorites/route.ts`'s shape:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserPlayState, setUserPlayState } from "@/lib/userData";
import type { PlayState } from "@/lib/storage";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const puzzleDate = req.nextUrl.searchParams.get("date");
  if (!puzzleDate) {
    return NextResponse.json({ error: "Missing date query param." }, { status: 400 });
  }
  const state = await getUserPlayState(session.user.id, puzzleDate);
  return NextResponse.json({ state });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as PlayState | null;
  if (!body?.puzzleDate || !body.status) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  await setUserPlayState(session.user.id, body.puzzleDate, body);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verify**

```bash
npm run lint
npm run build
```

Expected: both clean.

Signed out:

```bash
curl -s -w "\n%{http_code}\n" "http://localhost:3000/api/play-state?date=2026-10-15"
```

Expected: `{"error":"Not signed in."}` and `401`.

Signed in (existing session from earlier testing — get the session cookie from devtools, same approach the original accounts plan used):

```bash
curl -s -w "\n%{http_code}\n" "http://localhost:3000/api/play-state?date=2026-10-15" -H "Cookie: authjs.session-token=<paste value>"
```

Expected: `{"state":null}` and `200` (nothing saved yet).

```bash
curl -s -w "\n%{http_code}\n" -X POST http://localhost:3000/api/play-state \
  -H "Content-Type: application/json" \
  -H "Cookie: authjs.session-token=<paste value>" \
  -d '{"puzzleDate":"2026-10-15","cluesRevealed":2,"status":"solved","cluesUsedToSolve":2}'
```

Expected: `{"ok":true}` and `200`. Repeat the `GET` — expected the same object back under `"state"`.

- [ ] **Step 4: Commit**

```bash
git add lib/userData.ts app/api/play-state/route.ts
git commit -m "feat: add server-side play-state persistence for signed-in accounts"
```

---

### Task 8: `/play` page and `PuzzleGame`

**Files:**
- Create: `components/EmailSignupInline.tsx` (extracted from `ArrivalHero.tsx`)
- Modify: `components/ArrivalHero.tsx` (use the extracted component)
- Create: `components/PuzzleGame.tsx`
- Create: `app/play/page.tsx`

**Interfaces:**
- Consumes: everything from Tasks 5-7 (`lib/puzzle.ts`, `lib/storage.ts`'s play-state/stats functions), `lib/analytics.ts`'s `track` (Task 1).
- Produces: `<EmailSignupInline onSubscribed?: () => void />` — consumed by both `ArrivalHero` and `PuzzleGame`. `<PuzzleGame word={WordEntry} puzzleNumber={number} />` — consumed only by `app/play/page.tsx`.

- [ ] **Step 1: Extract `EmailSignupInline` from `ArrivalHero`**

Create `components/EmailSignupInline.tsx` with exactly the pill-input-plus-button form `ArrivalHero` already has (moved, not changed — visual output must be byte-identical):

```tsx
"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";

type Status = "idle" | "submitting" | "success" | "error";

/** The single-field email capture pill — used on the arrival hero (first
 * homepage view) and, unmodified, on /play's post-game funnel. Fires the
 * same "signup_submitted" event from both places, since it's genuinely the
 * same action either way. */
export default function EmailSignupInline({ onSubscribed }: { onSubscribed?: () => void }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMessage("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setStatus("success");
      track("signup_submitted");
      onSubscribed?.();
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (status === "success") {
    return (
      <p className="font-sans text-sm text-ink-soft">You&apos;re in. Your first word arrives tomorrow.</p>
    );
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          required
          aria-label="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="min-w-0 flex-1 rounded-full border border-line bg-paper-raised px-4 py-2.5 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="shrink-0 rounded-full bg-accent px-5 py-2.5 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {status === "submitting" ? "Joining…" : "Join"}
        </button>
      </form>
      {status === "error" && <p className="mt-2 font-sans text-sm text-danger">{errorMessage}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Use it from `ArrivalHero`**

In `components/ArrivalHero.tsx`, remove the local `email`/`status`/`errorMessage` state and `handleSubmit` function (`EmailSignupInline` now owns all of that) and the now-unused `Status` type. This removes the component's only use of `useState`, so change the React import from `import { useEffect, useState } from "react";` (added in Task 1) to just `import { useEffect } from "react";` — otherwise `useState` becomes an unused import and fails lint. Replace the inline `<form>`/error-paragraph block with:

```tsx
import EmailSignupInline from "./EmailSignupInline";
```

```tsx
          <EmailSignupInline onSubscribed={() => setTimeout(() => markOnboarded(), 2000)} />
```

The component keeps its `useEffect(() => track("arrival_view"), [])` from Task 1 and its `markOnboarded()`-on-click-through links unchanged — only the subscribe form itself moves out. Read the whole current file before editing so the diff is exact; the surrounding wordmark/header/tagline/archive-link markup is untouched.

- [ ] **Step 3: Create `PuzzleGame`**

Create `components/PuzzleGame.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Share } from "lucide-react";
import type { WordEntry } from "@/lib/words";
import { isCorrectGuess, buildPuzzleShareText } from "@/lib/puzzle";
import {
  usePlayState,
  savePlayState,
  usePuzzleStats,
  recordPuzzleResult,
  type PlayState,
} from "@/lib/storage";
import { useSession } from "next-auth/react";
import EmailSignupInline from "./EmailSignupInline";

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

const CLUE_LABELS = ["First clue", "Second clue", "Third clue"] as const;

export default function PuzzleGame({
  word,
  puzzleNumber,
}: {
  word: WordEntry;
  puzzleNumber: number;
}) {
  const puzzleDate = todayDateString();
  const localState = usePlayState(puzzleDate);
  const stats = usePuzzleStats();
  const { status: sessionStatus } = useSession();
  const [guess, setGuess] = useState("");
  const [wrongFlash, setWrongFlash] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Fresh state for a puzzle date this browser has no local record of yet.
  const state: PlayState = localState ?? {
    puzzleDate,
    cluesRevealed: 1,
    status: "playing",
    cluesUsedToSolve: null,
  };

  // Pull down a signed-in account's saved state for today's puzzle once,
  // if this browser has no local record yet (e.g. they played on another
  // device) — mirrors AccountFavoritesSync's pull-on-sign-in idea, scoped
  // to just today's puzzle rather than a whole reconciliation flow.
  useEffect(() => {
    if (sessionStatus !== "authenticated" || localState) return;
    fetch(`/api/play-state?date=${puzzleDate}`)
      .then((res) => (res.ok ? res.json() : { state: null }))
      .then((data: { state: PlayState | null }) => {
        if (data.state) savePlayState(data.state);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, puzzleDate]);

  function handleGuess(e: React.FormEvent) {
    e.preventDefault();
    if (state.status !== "playing" || !guess.trim()) return;
    attemptGuess(guess);
    setGuess("");
  }

  function handleNeedAnotherClue() {
    if (state.status !== "playing" || state.cluesRevealed >= 3) return;
    savePlayState({ ...state, cluesRevealed: (state.cluesRevealed + 1) as 2 | 3 });
  }

  function attemptGuess(rawGuess: string) {
    if (isCorrectGuess(rawGuess, word.word)) {
      const cluesUsed = state.cluesRevealed;
      savePlayState({ ...state, status: "solved", cluesUsedToSolve: cluesUsed });
      recordPuzzleResult(cluesUsed);
      return;
    }

    setWrongFlash(true);
    setTimeout(() => setWrongFlash(false), 600);

    if (state.cluesRevealed >= 3) {
      savePlayState({ ...state, status: "failed", cluesUsedToSolve: null });
      recordPuzzleResult(null);
      return;
    }

    savePlayState({ ...state, cluesRevealed: (state.cluesRevealed + 1) as 2 | 3 });
  }

  async function handleShare() {
    const siteUrl = window.location.origin;
    const text = buildPuzzleShareText(puzzleNumber, state.cluesUsedToSolve, siteUrl);
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        // user dismissed the share sheet
      }
      return;
    }
    await navigator.clipboard.writeText(text);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  const isDone = state.status === "solved" || state.status === "failed";

  return (
    <div className="mx-auto max-w-[640px] px-6 py-16">
      <p className="font-sans text-xs tracking-wide text-ink-faint">Puzzle #{puzzleNumber}</p>
      <h1 className="mt-3 font-serif text-3xl">Guess the word</h1>

      {!isDone && (
        <div className="mt-8 space-y-4">
          {Array.from({ length: state.cluesRevealed }, (_, i) => (
            <div key={i}>
              <p className="font-sans text-xs tracking-wide text-ink-faint">{CLUE_LABELS[i]}</p>
              <p className="mt-1 font-serif text-lg leading-relaxed text-ink">{word.clues[i]}</p>
            </div>
          ))}

          <form onSubmit={handleGuess} className="mt-6 flex gap-2">
            <input
              type="text"
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              placeholder="Type your guess…"
              aria-label="Your guess"
              className="min-w-0 flex-1 rounded-md border border-line bg-transparent px-3 py-2.5 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent"
            />
            <button
              type="submit"
              className="shrink-0 rounded-md bg-accent px-4 py-2.5 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90 cursor-pointer"
            >
              Guess
            </button>
          </form>
          {wrongFlash && (
            <p className="font-sans text-sm text-danger">Not quite — here&apos;s another clue.</p>
          )}
          {state.cluesRevealed < 3 && (
            <button
              type="button"
              onClick={handleNeedAnotherClue}
              className="font-sans text-xs text-ink-faint underline underline-offset-2 transition-colors hover:text-ink-soft cursor-pointer"
            >
              I need another clue
            </button>
          )}
        </div>
      )}

      {isDone && (
        <div className="mt-8">
          <p className="font-sans text-sm text-ink-soft">
            {state.status === "solved" ? "Solved it." : "This one got away."}
          </p>
          <h2 className="mt-2 font-serif text-4xl">{word.word}</h2>
          <p className="mt-1 font-sans text-sm text-ink-soft">
            {word.respelling} &middot; {word.partOfSpeech}
          </p>

          <Link
            href={`/story/${word.slug}`}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90"
          >
            Read the full story &rarr;
          </Link>

          <button
            type="button"
            onClick={handleShare}
            className="mt-6 flex items-center gap-2 font-sans text-sm text-ink-soft transition-colors hover:text-ink cursor-pointer"
          >
            <Share size={15} strokeWidth={1.75} />
            {shareCopied ? "Copied" : "Share your result"}
          </button>

          <div className="mt-10 border-t border-line pt-6">
            <p className="font-sans text-sm text-ink-soft">
              One word, one story, every day — get tomorrow&apos;s in your inbox.
            </p>
            <div className="mt-4">
              <EmailSignupInline />
            </div>
          </div>

          <div className="mt-10 border-t border-line pt-6">
            <h2 className="font-sans text-xs tracking-wide text-ink-faint">Your stats</h2>
            <p className="mt-2 font-sans text-sm text-ink-soft">
              {stats.played} {stats.played === 1 ? "game" : "games"} played
            </p>
            <div className="mt-3 space-y-1">
              {(["1 clue", "2 clues", "3 clues", "Not solved"] as const).map((label, i) => (
                <div key={label} className="flex items-center gap-3 font-sans text-xs text-ink-soft">
                  <span className="w-16 shrink-0">{label}</span>
                  <div className="h-2 flex-1 bg-line">
                    <div
                      className="h-2 bg-accent"
                      style={{
                        width: stats.played > 0 ? `${(stats.histogram[i] / stats.played) * 100}%` : "0%",
                      }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right">{stats.histogram[i]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create the honest "not open yet" state and the page**

Create `app/play/page.tsx`:

```tsx
import PuzzleGame from "@/components/PuzzleGame";
import { getTodayPuzzle } from "@/lib/puzzle";

export const metadata = { title: "Daily puzzle — Curio" };

export default function PlayPage() {
  const puzzle = getTodayPuzzle();

  if (!puzzle) {
    return (
      <div className="mx-auto max-w-[640px] px-6 py-16">
        <p className="font-sans text-xs tracking-wide text-ink-faint">Puzzle</p>
        <h1 className="mt-3 font-serif text-3xl">Not open yet</h1>
        <p className="mt-4 max-w-[46ch] font-serif text-lg leading-relaxed text-ink-soft">
          The daily puzzle needs a deeper word bank before it can promise a
          fair game every day without repeating too soon. Check back once
          Curio&apos;s collection has grown.
        </p>
      </div>
    );
  }

  return <PuzzleGame word={puzzle.word} puzzleNumber={puzzle.puzzleNumber} />;
}
```

- [ ] **Step 5: Verify**

```bash
npm run lint
npm run build
```

Expected: both clean.

With the dev server running, visit `/play`: since the real `WORDS` array has only 8 entries (well under the 30-day threshold), expected the "Not open yet" state, not a game — this confirms the honest-empty-state requirement is actually live, not just unit-tested. Confirm `/` still renders `ArrivalHero` correctly (clear `localStorage` first) with the extracted `EmailSignupInline` working exactly as before — submit an email, confirm the "You're in" message and the eventual swap to the normal Today page (the 2-second delayed `markOnboarded()` from the prior plan must still work, since `ArrivalHero` still owns that timing, just via `EmailSignupInline`'s `onSubscribed` callback now instead of its own inline handler).

To manually verify the actual game flow (impossible via the real word bank right now), temporarily edit `lib/puzzle.ts`'s `getTodayPuzzle` to call `getPuzzleForDate(new Date(), someLargerTestArray)` — **do not commit this** — play through solving on each of the 3 clues and failing outright, confirm the share text via `console.log(buildPuzzleShareText(...))` in the browser devtools matches the expected format, then revert the temporary edit (`git checkout lib/puzzle.ts`) before committing this task.

- [ ] **Step 6: Commit**

```bash
git add components/EmailSignupInline.tsx components/ArrivalHero.tsx components/PuzzleGame.tsx app/play/page.tsx
git commit -m "feat: add the /play daily puzzle page"
```

---

### Task 9: `/play` OG image

**Files:**
- Create: `app/play/opengraph-image.tsx`

**Interfaces:**
- Consumes: `getTodayPuzzle` (Task 5, `lib/puzzle.ts`).

- [ ] **Step 1: Create the OG image**

Create `app/play/opengraph-image.tsx`, following the visual pattern of `app/opengraph-image.tsx` (same colors, same structure) but showing only the puzzle number — never the word, a clue, or anything else that would spoil the game for someone who sees a shared link before clicking it:

```tsx
import { ImageResponse } from "next/og";
import { getTodayPuzzle } from "@/lib/puzzle";

export const alt = "Curio — Daily Puzzle";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Deliberately generic: this must never show the word, a clue, or any
// other spoiler, since a shared /play link is exactly the case where the
// recipient hasn't played yet. Only the puzzle number (a non-spoiling
// fact) and the site's existing tagline appear.
export default function Image() {
  const puzzle = getTodayPuzzle();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#f1ece0",
          color: "#24302b",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, color: "#5b665f", letterSpacing: 1 }}>
          CURIO
        </div>
        <div style={{ display: "flex", fontSize: 88, fontWeight: 600, marginTop: 20 }}>
          {puzzle ? `Daily Puzzle #${puzzle.puzzleNumber}` : "Daily Puzzle"}
        </div>
        <div style={{ display: "flex", fontSize: 32, color: "#5b665f", marginTop: 24 }}>
          One word. One story. Every day.
        </div>
      </div>
    ),
    { ...size }
  );
}
```

- [ ] **Step 2: Verify**

```bash
npm run build
```

Expected: clean, and the route list includes `/play/opengraph-image`.

With the dev server running, visit `http://localhost:3000/play/opengraph-image` directly in the browser: expected a rendered PNG showing "CURIO" / "Daily Puzzle" (no number today, since the real word bank means `getTodayPuzzle()` returns `null`) / the tagline — confirms it degrades sensibly rather than crashing when there's no puzzle yet.

- [ ] **Step 3: Commit**

```bash
git add app/play/opengraph-image.tsx
git commit -m "feat: add a non-spoiling OG image for /play"
```

---

### Task 10: Cross-links

**Files:**
- Modify: `components/TodayHero.tsx`
- Modify: `components/StoryView.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Add a quiet link on the Today hero**

In `components/TodayHero.tsx`, add one `Link` after the existing "Read the full story" link:

```tsx
      <Link
        href={`/story/${word.slug}`}
        className="mt-10 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90"
      >
        Read the full story
      </Link>

      <Link
        href="/play"
        className="mt-4 font-sans text-xs text-ink-faint transition-colors hover:text-ink-soft"
      >
        Feeling curious? Try today&apos;s puzzle &rarr;
      </Link>
```

- [ ] **Step 2: Add a quiet link on the story page**

In `components/StoryView.tsx`, add one `Link` at the very end, after the existing "Browse all words" link's closing `</div>`:

```tsx
      <div className="mt-12 border-t border-line pt-8">
        <Link
          href="/history"
          className="font-sans text-sm text-ink-soft transition-colors hover:text-ink"
        >
          Browse all words &rarr;
        </Link>
      </div>

      <div className="mt-4">
        <Link
          href="/play"
          className="font-sans text-xs text-ink-faint transition-colors hover:text-ink-soft"
        >
          Try today&apos;s puzzle &rarr;
        </Link>
      </div>
```

- [ ] **Step 3: Verify**

```bash
npm run lint
npm run build
```

Expected: both clean. With the dev server running, visit `/` and any `/story/[slug]` page: confirm both quiet links appear and navigate to `/play` (which shows "Not open yet" today, as established in Task 8 — that's expected, not a bug in this task).

- [ ] **Step 4: Confirm the cron/Bluesky constraint held for the whole plan**

```bash
git diff --stat master -- app/api/cron/send-daily/route.ts lib/bluesky.ts
```

Expected: no output (empty diff) — neither file was touched by any task in this plan, per the Global Constraints.

- [ ] **Step 5: Commit**

```bash
git add components/TodayHero.tsx components/StoryView.tsx
git commit -m "feat: add quiet cross-links between Today/story pages and /play"
```
