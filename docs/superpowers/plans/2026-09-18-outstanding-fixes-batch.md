# Outstanding Fixes Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the highest-value items from `handover.md`'s "Deferred / parked items" list, now that the word bank is genuinely at scale (1,147 words): (1) kill the sign-in loading flash by feeding the root layout's `SessionProvider` a server-fetched session, (2) rewrite `/play`'s O(n²) puzzle-eligibility scan to O(n) before it becomes an actual problem, (3) add a cheap per-email cooldown on magic-link sign-in to protect the Resend quota the daily digest shares, (4) cover `postDailyWordToBluesky`'s untested failure path, (5) cap `/history`'s "All words" tab behind pagination now that it renders 1,147 `<li>`s, and (6) bring `handover.md` up to date.

**Architecture:** Five independent, single-concern changes, each touching its own small slice of the codebase (root layout, `lib/puzzle.ts`, a new `lib/signInCooldown.ts` following the existing Redis NX+TTL pattern from `lib/deviceLink.ts`/`lib/userData.ts`, `lib/bluesky.test.ts`, `components/HistoryList.tsx`), plus a final documentation task. No new architecture, no new dependencies — every fix reuses a pattern already established in this codebase.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Vitest 5, `@upstash/redis`, `next-auth@5.0.0-beta.32`, `@atproto/api` (already a dependency, mocked in Task 4's tests).

**Spec:** No separate written spec — requirements come from a codebase sweep reported to the user, and their instruction to "prioritise by value added for each change, use superpowers and get this done." Six items were surfaced; this plan implements the five judged worth doing now (below) and explicitly drops three as out of scope (see Global Constraints).

## Global Constraints

- No new npm dependencies. Every task reuses an existing library or pattern already in this codebase.
- Redis-backed features must no-op gracefully (never throw) when Upstash isn't configured — match the existing `if (!redis) return ...` fallback pattern used throughout `lib/userData.ts`, `lib/deviceLink.ts`, `lib/words.ts`.
- `npx vitest run`, `npm run lint`, and `npm run build` must all stay clean after every task.
- Match existing code style: short doc comments explaining *why* (not *what*), no new abstractions beyond what each task needs.
- Explicitly OUT of scope for this batch (assessed and dropped, not forgotten): no TTL on Auth.js's own Redis session/token keys (an `@auth/upstash-redis-adapter` limitation, not fixable without forking it); removing the dead `Subscriber.hour` field (cosmetic, not worth the migration risk); the two open product ideas from the 2026-09-11 brainstorm (share-to-a-friend, browse-by-letter) — those are feature ideas, not debt, and weren't asked for.
- Deploy process matches what's already established: commit per task, then `git push origin master` once the whole batch is verified (Vercel's Git integration auto-deploys `master`) — confirm with the user before the final push, matching this session's existing practice.

---

## File Structure

New files:
- `lib/signInCooldown.ts` — `claimSignInSend(email)`, a Redis NX+TTL claim protecting the shared Resend quota from repeated sign-in requests for the same address.
- `lib/signInCooldown.test.ts` — Vitest unit tests, mocked Redis (same pattern as `lib/wordsLocking.test.ts`).

Modified files:
- `app/layout.tsx` — `RootLayout` becomes `async`, fetches the session via `auth()`, passes it to `<SessionProvider session={session}>`.
- `lib/puzzle.ts` — replaces the O(n²) `daysSinceLastShown` (called once per word) with a single O(n) pass over the lookback window that builds a `slug -> days-since-shown` map once; `getEligiblePuzzleWords` reads from that map instead of re-scanning per word. Same public API, same results.
- `lib/puzzle.test.ts` — adds one regression test pinning the O(n) behavior at a much larger synthetic word count.
- `lib/auth.ts` — `sendVerificationRequest` calls `claimSignInSend(email)` before `sendSignInEmail`; skips the send (Auth.js still reports its normal success to the client either way) when the claim fails.
- `lib/bluesky.test.ts` — adds tests for `postDailyWordToBluesky`'s success, login-failure, post-failure, and unconfigured paths, with `@atproto/api` mocked.
- `components/HistoryList.tsx` — adds a `PAGE_SIZE`-capped view with a "Show more" button for the unfiltered browse view; an active search bypasses the cap entirely.
- `handover.md` — final update: fixes the stale "Last updated" date and documents this batch.

---

### Task 1: Feed the root layout a server-fetched session

**Files:**
- Modify: `app/layout.tsx:1-59` (whole file)

**Interfaces:**
- Consumes: `auth()` from `@/lib/auth` (already exported, already used identically in `app/page.tsx`, `app/history/page.tsx`, etc.) — returns `Promise<Session | null>`.
- Produces: nothing new consumed by later tasks — this task is self-contained.

- [ ] **Step 1: Make `RootLayout` async and pass a server-fetched session to `SessionProvider`**

Replace the full contents of `app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ThemeInit from "@/components/ThemeInit";
import AccountFavoritesSync from "@/components/AccountFavoritesSync";
import { auth } from "@/lib/auth";
// Self-hosted (not next/font/google) so the app builds without reaching
// fonts.googleapis.com at build time — works the same in dev, CI, and prod.
import "@fontsource/newsreader/400.css";
import "@fontsource/newsreader/500.css";
import "@fontsource/newsreader/600.css";
import "@fontsource/newsreader/700.css";
import "@fontsource/newsreader/400-italic.css";
import "@fontsource/work-sans/400.css";
import "@fontsource/work-sans/500.css";
import "@fontsource/work-sans/600.css";
import "./globals.css";

// Same env var lib/email.ts already uses for absolute links in emails.
// Without metadataBase, Next.js resolves the OG image routes' relative URLs
// against http://localhost:3000 in every environment — including
// production — which would silently break link previews everywhere.
const SITE_URL = process.env.CURIO_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Curio — one word, one story, every day",
  description:
    "A daily word's origin story, delivered once a day. No feed, no firehose — just one word.",
  openGraph: {
    type: "website",
    siteName: "Curio",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Feeding SessionProvider a server-resolved session means useSession()
  // never has to pass through a transient "loading" state on a cold load —
  // without this, lib/useShowArrival.ts had to specifically guard against
  // that state being mistaken for "signed out" (see its doc comment). This
  // removes the underlying flash instead of just working around it.
  const session = await auth();

  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <ThemeInit />
      </head>
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <SessionProvider session={session}>
          <Header />
          <AccountFavoritesSync />
          <main className="flex-1">{children}</main>
          <Footer />
        </SessionProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p .
```

Expected: no errors.

- [ ] **Step 3: Verify the flash is gone, live**

Start the dev server (`npm run dev` or the platform's preview tool), sign in via `/login`, then hard-reload `/`. Confirm the header shows "Account" from the very first paint — no flicker showing "Sign in" first, then swapping to "Account" a moment later. This is a UI-timing property no automated test can capture; it needs an actual visual check with a real session cookie present.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "fix: feed the root layout a server session, killing the sign-in loading flash"
```

---

### Task 2: Rewrite the puzzle eligibility scan from O(n²) to O(n)

**Files:**
- Modify: `lib/puzzle.ts:35-92`
- Modify: `lib/puzzle.test.ts` (add one new test to the existing `describe("getEligiblePuzzleWords", ...)` block)

**Interfaces:**
- Consumes: `WORDS`, `WordEntry`, `daysSinceStart`, `hashSeed`, `mulberry32` from `./words` (unchanged imports).
- Produces: `getEligiblePuzzleWords(today?, words?)` — same exported signature and return type as before (`WordEntry[]`), consumed unchanged by `rawPuzzlePick`/`getPuzzleForDate` later in the same file and by every existing test in `lib/puzzle.test.ts`.

- [ ] **Step 1: Confirm the existing suite passes before touching anything (baseline)**

```bash
npx vitest run lib/puzzle.test.ts
```

Expected: all tests pass (this is a refactor under existing coverage, not new behavior — the existing suite is the correctness contract for Step 3).

- [ ] **Step 2: Add a regression test pinning the O(n) behavior at a much larger word count**

In `lib/puzzle.test.ts`, inside the existing `describe("getEligiblePuzzleWords", ...)` block, add:

```ts
  it("stays fast at a much larger word count (regression guard against the old O(n²) scan)", () => {
    // The old daysSinceLastShown scanned the lookback window once PER
    // word, making getEligiblePuzzleWords O(words.length * window) —
    // negligible at 8 words, ~56ms per call at the real 1,147-word bank.
    // A word list 3x that size should still resolve in well under 200ms
    // if the O(n) rewrite (one pass building a slug -> days-since-shown
    // map, reused for every word) is actually in place; the old scan at
    // this size would take multiple seconds.
    const HUGE_WORD_LIST: WordEntry[] = Array.from({ length: 3000 }, (_, i) => makeWord(`huge-${i}`));
    const today = new Date("2026-01-01T00:00:00Z");
    const start = performance.now();
    const pool = getEligiblePuzzleWords(today, HUGE_WORD_LIST);
    const elapsed = performance.now() - start;
    expect(pool.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(200);
  });
```

- [ ] **Step 3: Run it and confirm it currently passes (the old O(n²) code is well under 200ms even at 3,000 synthetic words on modern hardware, so this step is a baseline, not a failing-test step — the real regression check is Step 5 after the rewrite lands, plus the timing margin itself)**

```bash
npx vitest run lib/puzzle.test.ts
```

Expected: passes. (This particular test can't be written test-first as a *failing* test the way a new-behavior task would — it's a timing regression guard for a refactor. Its value is in staying in the suite after Step 4, not in failing beforehand.)

- [ ] **Step 4: Replace the O(n²) scan with a single O(n) pass**

In `lib/puzzle.ts`, replace the `daysSinceLastShown` function and `getEligiblePuzzleWords` function (currently lines 35-92) with:

```ts
/** Maps every slug shown within the lookback window to how many days ago
 * its FIRST (i.e. most recent) occurrence was — built in one pass over the
 * window instead of one pass per word. `searchWindow` is the same for
 * every word (it depends only on `words.length` and
 * PUZZLE_MIN_DAYS_SINCE_SHOWN, not on which word is being asked about), so
 * computing it once here and walking the window once replaces what used to
 * be an O(words.length) scan PER word — O(words.length * searchWindow)
 * overall — with a single O(searchWindow) pass whose result every word
 * then does an O(1) lookup against. Walking `i` from 1 upward and only
 * recording a slug's FIRST appearance (`!map.has(slug)`) reproduces
 * exactly what the old per-word backward scan returned: the smallest i
 * (most recent occurrence) within the window. */
function daysSinceShownMap(today: Date, words: WordEntry[]): Map<string, number> {
  const searchWindow = Math.max(words.length, PUZZLE_MIN_DAYS_SINCE_SHOWN);
  const map = new Map<string, number>();
  for (let i = 1; i <= searchWindow; i++) {
    const past = new Date(today.getTime() - i * DAY_MS);
    const slug = wordForDateFrom(words, past).slug;
    if (!map.has(slug)) map.set(slug, i);
  }
  return map;
}

/** Words eligible to appear as today's puzzle: shown at least
 * PUZZLE_MIN_DAYS_SINCE_SHOWN days ago, excluding today's own word. This
 * exclusion is REQUIRED, not decorative: `daysSinceShownMap` records each
 * slug's MOST RECENT occurrence in the window, so for today's own word it
 * doesn't record "shown 0 days ago" — it records that word's *next*
 * occurrence further back (one full rotation earlier, i.e.
 * `words.length` days ago), which for a list long enough to make the pool
 * non-empty is itself >= PUZZLE_MIN_DAYS_SINCE_SHOWN. Without this
 * explicit check, today's own word would incorrectly qualify as eligible.
 * `words` defaults to the real WORDS array; tests pass a larger synthetic
 * list to exercise the non-empty case, which the real (currently
 * 1,147-word) list clears comfortably.
 *
 * Scope note: this anti-spoiler gate protects the SHARED/anonymous daily
 * word experience specifically — it filters against getWordForDate's
 * calendar-based rotation, the one thing every player (signed in or not)
 * sees on Today and in the Bluesky post. A signed-in account also has its
 * own PERSONALIZED rotation (getWordForUser, from an earlier plan), and
 * this gate does not — and structurally cannot — account for what that
 * particular account happens to have seen recently under it. That's a
 * deliberate, accepted scope boundary: filtering per-user against each
 * account's own history would mean a different puzzle per player, which
 * breaks "the same puzzle for everyone, one shareable result grid" that
 * this whole feature is built around. So the guarantee this function
 * actually provides is "not recently shown as the shared daily word," not
 * "unspoiled for every individual player."
 *
 * Also returns an empty pool — even when the raw filtered pool is
 * non-empty — until the pool reaches PUZZLE_MIN_POOL_SIZE. A pool that's
 * merely non-empty but still small gives the daily selection either no
 * variety (pool size 1) or a repeat rate well above what's been validated
 * (see getPuzzleForDate's doc comment); this keeps /play's "not open yet"
 * state honest about when the puzzle can actually deliver on that. */
export function getEligiblePuzzleWords(
  today: Date = new Date(),
  words: WordEntry[] = WORDS
): WordEntry[] {
  const todayWord = wordForDateFrom(words, today);
  const recentlyShown = daysSinceShownMap(today, words);
  const filtered = words.filter((w) => {
    if (w.slug === todayWord.slug) return false;
    const days = recentlyShown.get(w.slug);
    return days !== undefined && days >= PUZZLE_MIN_DAYS_SINCE_SHOWN;
  });
  return filtered.length < PUZZLE_MIN_POOL_SIZE ? [] : filtered;
}
```

Leave every other function in `lib/puzzle.ts` (`wordForDateFrom`, `rawPuzzlePick`, `getPuzzleForDate`, `getTodayPuzzle`, and everything below `Puzzle`/`RawPick`) exactly as-is — only `daysSinceLastShown` (deleted, replaced by `daysSinceShownMap`) and `getEligiblePuzzleWords` change.

- [ ] **Step 5: Run the full puzzle suite and confirm everything still passes, unchanged**

```bash
npx vitest run lib/puzzle.test.ts
```

Expected: every existing test still passes (proving the rewrite is behavior-identical), and the new Step 2 test now demonstrates the O(n) timing on a synthetic 3,000-word list.

- [ ] **Step 6: Run the full suite (this file's tests interact with `lib/words.ts` fixtures elsewhere)**

```bash
npx vitest run
```

Expected: all tests pass, same count as before this task plus the one new test.

- [ ] **Step 7: Commit**

```bash
git add lib/puzzle.ts lib/puzzle.test.ts
git commit -m "perf: rewrite puzzle eligibility scan from O(n^2) to O(n)"
```

---

### Task 3: Cooldown on repeated magic-link sign-in requests

**Files:**
- Create: `lib/signInCooldown.ts`
- Create: `lib/signInCooldown.test.ts`
- Modify: `lib/auth.ts:1-41` (the `Resend({...})` provider block)

**Interfaces:**
- Produces: `claimSignInSend(email: string): Promise<boolean>` — `true` means "go ahead and send," `false` means "an email for this address was already sent within the cooldown window, skip this one." Consumed by Task 3's own change to `lib/auth.ts` only.

- [ ] **Step 1: Write the failing tests**

Create `lib/signInCooldown.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from "vitest";

// Same minimal in-memory Redis stand-in pattern as lib/wordsLocking.test.ts
// — just enough of the NX-claim semantics this module actually uses.
const { fakeRedis } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    fakeRedis: {
      store,
      set: vi.fn(async (key: string, value: string, opts?: { nx?: boolean; ex?: number }) => {
        if (opts?.nx && store.has(key)) return null;
        store.set(key, value);
        return "OK";
      }),
    },
  };
});

vi.mock("./redis", () => ({ redis: fakeRedis, usingUpstash: true }));

const { claimSignInSend } = await import("./signInCooldown");

beforeEach(() => {
  fakeRedis.store.clear();
  vi.clearAllMocks();
});

describe("claimSignInSend", () => {
  it("allows the first request for an address", async () => {
    expect(await claimSignInSend("person@example.com")).toBe(true);
  });

  it("blocks a second request for the same address within the cooldown window", async () => {
    await claimSignInSend("person@example.com");
    expect(await claimSignInSend("person@example.com")).toBe(false);
  });

  it("treats an address's case and surrounding whitespace as the same address", async () => {
    await claimSignInSend("  Person@Example.com  ");
    expect(await claimSignInSend("person@example.com")).toBe(false);
  });

  it("doesn't block a different address", async () => {
    await claimSignInSend("person@example.com");
    expect(await claimSignInSend("other@example.com")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx vitest run lib/signInCooldown.test.ts
```

Expected: fails — `lib/signInCooldown.ts` doesn't exist yet.

- [ ] **Step 3: Implement `claimSignInSend`**

Create `lib/signInCooldown.ts`:

```ts
import { redis } from "./redis";

/** Protects the Resend quota (shared with the daily digest — see
 * lib/email.ts) from being exhausted by repeated sign-in requests for the
 * same address. Claims a short-lived Redis lock the first time an address
 * asks within the window; a request for the same address before the lock
 * expires returns false and the caller (lib/auth.ts's
 * sendVerificationRequest) skips sending. Auth.js's own client response
 * stays the same "check your email" success either way — it deliberately
 * never reveals whether a given address is a real account or whether an
 * email was actually sent, and this doesn't change that. No-ops (always
 * allows sending) without Upstash configured, matching every other
 * Redis-backed feature in this app. */
const COOLDOWN_SECONDS = 60;

function cooldownKey(email: string): string {
  return `curio:signincooldown:${email.trim().toLowerCase()}`;
}

export async function claimSignInSend(email: string): Promise<boolean> {
  if (!redis) return true;
  const claimed = await redis.set(cooldownKey(email), "1", { nx: true, ex: COOLDOWN_SECONDS });
  return claimed !== null;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npx vitest run lib/signInCooldown.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Wire it into the sign-in email path**

In `lib/auth.ts`, add the import alongside the existing ones:

```ts
import { claimSignInSend } from "./signInCooldown";
```

Then replace the `Resend({...})` provider block with:

```ts
    Resend({
      // Overrides the provider's built-in sendVerificationRequest (a generic
      // "click here to sign in" template that's both off-brand and a known
      // spam signal on its own) with Curio's own branded email — see
      // sendSignInEmail's doc comment in lib/email.ts.
      async sendVerificationRequest({ identifier: email, url }) {
        // Protects the shared Resend quota from a burst of repeated
        // requests for the same address — see lib/signInCooldown.ts.
        if (!(await claimSignInSend(email))) return;
        await sendSignInEmail(email, url);
      },
    }),
```

- [ ] **Step 6: Run the full suite**

```bash
npx vitest run
```

Expected: all tests pass, including the 4 new ones.

- [ ] **Step 7: Commit**

```bash
git add lib/signInCooldown.ts lib/signInCooldown.test.ts lib/auth.ts
git commit -m "fix: cooldown repeated magic-link sign-in requests for the same address"
```

---

### Task 4: Cover `postDailyWordToBluesky`'s untested paths

**Files:**
- Modify: `lib/bluesky.test.ts` (add new tests; existing `buildBlueskyPost` tests stay unchanged)

**Interfaces:**
- Consumes: `postDailyWordToBluesky` from `./bluesky` (already exported, unmodified by this task — this task is test-only).

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `lib/bluesky.test.ts` with:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WordEntry } from "./words";

function word(teaser: string): WordEntry {
  return {
    slug: "quarantine",
    word: "quarantine",
    respelling: "KWOR-uhn-teen",
    partOfSpeech: "noun",
    teaser,
    origin: "",
    journey: "",
    related: "",
    lineage: ["Latin", "Italian", "English"],
    clues: ["", "", ""],
  };
}

const URL = "https://example.com/story/quarantine?utm_source=bluesky&utm_medium=social&utm_campaign=daily-word";

const { buildBlueskyPost } = await import("./bluesky");

describe("buildBlueskyPost", () => {
  it("includes the word, teaser, and link", () => {
    const post = buildBlueskyPost(word("A short teaser."), URL);
    expect(post).toContain("quarantine");
    expect(post).toContain("A short teaser.");
    expect(post).toContain(URL);
  });

  it("stays within 300 characters", () => {
    const longTeaser = "T".repeat(400);
    const post = buildBlueskyPost(word(longTeaser), URL);
    expect(post.length).toBeLessThanOrEqual(300);
  });

  it("truncates the teaser, never the word or link, when too long", () => {
    const longTeaser = "T".repeat(400);
    const post = buildBlueskyPost(word(longTeaser), URL);
    expect(post).toContain("quarantine");
    expect(post).toContain(URL);
    expect(post).toContain("…");
  });

  it("leaves a short teaser untruncated", () => {
    const post = buildBlueskyPost(word("Short."), URL);
    expect(post).not.toContain("…");
  });
});

// postDailyWordToBluesky's own success/failure/unconfigured paths, with the
// real @atproto/api client mocked — this is the path lib/bluesky.ts's own
// doc comment flags as running unattended in the daily cron with nobody
// watching, so a real posting failure needs to degrade gracefully (logged,
// not thrown) rather than break the rest of that cron run.
const { mockLogin, mockPost, mockDetectFacets } = vi.hoisted(() => ({
  mockLogin: vi.fn(),
  mockPost: vi.fn(),
  mockDetectFacets: vi.fn(async () => {}),
}));

vi.mock("@atproto/api", () => ({
  AtpAgent: vi.fn().mockImplementation(() => ({
    login: mockLogin,
    post: mockPost,
  })),
  RichText: vi.fn().mockImplementation(({ text }: { text: string }) => ({
    text,
    facets: undefined,
    detectFacets: mockDetectFacets,
  })),
}));

const { postDailyWordToBluesky } = await import("./bluesky");

const ORIGINAL_ENV = { ...process.env };

describe("postDailyWordToBluesky", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLUESKY_IDENTIFIER = "curiodaily.bsky.social";
    process.env.BLUESKY_APP_PASSWORD = "app-password";
    mockLogin.mockResolvedValue(undefined);
    mockPost.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("logs in, posts, and reports success when the client succeeds", async () => {
    const result = await postDailyWordToBluesky(word("A teaser."), new Date("2026-01-01T00:00:00Z"));
    expect(result).toEqual({ posted: true });
    expect(mockLogin).toHaveBeenCalledWith({
      identifier: "curiodaily.bsky.social",
      password: "app-password",
    });
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it("catches a login failure, logs it, and reports posted: false without throwing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockLogin.mockRejectedValue(new Error("invalid credentials"));

    const result = await postDailyWordToBluesky(word("A teaser."), new Date("2026-01-01T00:00:00Z"));

    expect(result).toEqual({ posted: false });
    expect(mockPost).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("[curio:bluesky] post failed:", expect.any(Error));
    consoleError.mockRestore();
  });

  it("catches a post failure, logs it, and reports posted: false without throwing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockPost.mockRejectedValue(new Error("rate limited"));

    const result = await postDailyWordToBluesky(word("A teaser."), new Date("2026-01-01T00:00:00Z"));

    expect(result).toEqual({ posted: false });
    expect(consoleError).toHaveBeenCalledWith("[curio:bluesky] post failed:", expect.any(Error));
    consoleError.mockRestore();
  });

  it("skips the network call and reports posted: false when unconfigured", async () => {
    delete process.env.BLUESKY_IDENTIFIER;
    delete process.env.BLUESKY_APP_PASSWORD;

    const result = await postDailyWordToBluesky(word("A teaser."), new Date("2026-01-01T00:00:00Z"));

    expect(result).toEqual({ posted: false });
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and confirm the new tests fail against the un-mocked baseline expectations**

```bash
npx vitest run lib/bluesky.test.ts
```

Expected: fails, since `@atproto/api` isn't mocked yet in the file as it exists before this step — this file replacement (Step 1) is both the test-writing and the mock-setup in one step, since the mock has to exist before `postDailyWordToBluesky` is imported. Run it once after Step 1 to confirm it's now green (there's no separate "implementation" step for this task — `lib/bluesky.ts` itself is correct already; this task is purely adding coverage for behavior that already exists).

Expected result after Step 1's file is in place: all tests pass, including the 4 new `postDailyWordToBluesky` tests.

- [ ] **Step 3: Run the full suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/bluesky.test.ts
git commit -m "test: cover postDailyWordToBluesky's success, failure, and unconfigured paths"
```

---

### Task 5: Paginate `/history`'s "All words" view

**Files:**
- Modify: `components/HistoryList.tsx` (whole file)

**Interfaces:**
- Consumes: `HistoryDay[]` props (`allEntries`, `personalEntries`), unchanged from before.
- Produces: nothing consumed elsewhere — this task is self-contained to one component.

- [ ] **Step 1: Add pagination state and a search bypass**

Replace the full contents of `components/HistoryList.tsx` with:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Heart, Search } from "lucide-react";
import type { HistoryDay } from "@/lib/words";
import { toggleFavorite, useFavorites } from "@/lib/storage";

type Filter = "mine" | "all" | "favorites";

/** Above this many entries, a flat list stops being scannable — split into
 * month/year sections instead. Below it, the extra headers would just be
 * visual noise for a handful of rows. */
const GROUP_THRESHOLD = 30;

/** How many entries the unfiltered browse view renders before "Show more"
 * is needed — chosen so the first page comfortably fills a screen without
 * forcing a page-load's worth of DOM for all 1,000+ words up front. A
 * search always bypasses this cap (see `isSearching` below): finding a
 * word you typed shouldn't depend on how many times you've clicked "Show
 * more" first. */
const PAGE_SIZE = 60;

function groupByMonth(entries: HistoryDay[]): { label: string; entries: HistoryDay[] }[] {
  const groups: { label: string; entries: HistoryDay[] }[] = [];
  for (const entry of entries) {
    const label = new Date(entry.date + "T00:00:00Z").toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    const current = groups[groups.length - 1];
    if (current && current.label === label) current.entries.push(entry);
    else groups.push({ label, entries: [entry] });
  }
  return groups;
}

export default function HistoryList({
  allEntries,
  personalEntries,
}: {
  /** The full shared archive — every word, in calendar order. Always
   * available, signed in or not, so a brand-new account has something rich
   * to look at on day one instead of only their (necessarily sparse) own
   * history. */
  allEntries: HistoryDay[];
  /** This account's personal word order, one entry per day since they
   * joined — present only when signed in. */
  personalEntries?: HistoryDay[] | null;
}) {
  const hasPersonal = !!personalEntries;
  const [filter, setFilter] = useState<Filter>(hasPersonal ? "mine" : "all");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const favorites = useFavorites();

  function handleToggle(slug: string) {
    toggleFavorite(slug);
  }

  const tabs: { key: Filter; label: string }[] = hasPersonal
    ? [
        { key: "mine", label: "My days" },
        { key: "all", label: "All words" },
        { key: "favorites", label: "Favorites" },
      ]
    : [
        { key: "all", label: "All" },
        { key: "favorites", label: "Favorites" },
      ];

  const activeEntries = filter === "mine" && personalEntries ? personalEntries : allEntries;
  // Favorites always reads from the shared archive's dates, regardless of
  // which tab was open before — a favorited word's "when" shouldn't change
  // depending on which list you happened to be looking at.
  const visible = filter === "favorites" ? allEntries.filter((d) => favorites.has(d.word.slug)) : activeEntries;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter((d) => d.word.word.toLowerCase().includes(q));
  }, [visible, query]);

  // A search has to be able to surface any matching word, not just ones
  // already revealed by "Show more" — so the page cap only applies to the
  // unfiltered browse view, never to search results.
  const isSearching = query.trim().length > 0;
  const paged = isSearching ? filtered : filtered.slice(0, visibleCount);
  const hasMore = !isSearching && filtered.length > visibleCount;

  // Switching tabs or starting a fresh search resets pagination — otherwise
  // "Favorites" could inherit a visibleCount left over from scrolling deep
  // into "All words", and immediately show a misleading "Show more" (or
  // none at all) relative to its own much shorter list.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter, query]);

  const groups = useMemo(
    () =>
      paged.length > GROUP_THRESHOLD
        ? groupByMonth(paged)
        : [{ label: "", entries: paged }],
    [paged]
  );

  return (
    <div className="mx-auto max-w-[640px] px-6 py-16">
      <div className="relative mb-4">
        <Search
          size={15}
          strokeWidth={1.75}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search words…"
          aria-label="Search words"
          className="w-full rounded-md border border-line bg-transparent py-2 pl-9 pr-3 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent"
        />
      </div>

      <div className="mb-6 flex items-center gap-1 font-sans text-sm">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={clsx(
              "rounded-full px-3.5 py-1.5 transition-colors cursor-pointer",
              filter === key ? "bg-paper-raised text-ink" : "text-ink-soft hover:text-ink"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {filter === "mine" && (
        <p className="mb-6 font-sans text-sm text-ink-faint">
          Your personal word order — one new word a day since you joined. It&apos;ll grow day by
          day; browse <button onClick={() => setFilter("all")} className="underline underline-offset-2 hover:text-ink cursor-pointer">all words</button> in the meantime.
        </p>
      )}

      {filtered.length === 0 && (
        <p className="font-sans text-sm text-ink-faint">
          {query.trim()
            ? `No words match “${query.trim()}.”`
            : filter === "favorites"
              ? "Nothing favorited yet — tap the heart on any story to save it here."
              : "No words yet."}
        </p>
      )}

      {groups.map(({ label, entries }) => (
        <div key={label || "ungrouped"}>
          {label && (
            <h2 className="mb-2 mt-8 font-sans text-xs tracking-wide text-ink-faint first:mt-0">
              {label}
            </h2>
          )}
          <ul>
            {entries.map(({ date, word }) => {
              const favorited = favorites.has(word.slug);
              const displayDate = new Date(date + "T00:00:00Z").toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              });
              return (
                <li key={date} className="border-b border-line py-4 first:pt-0 last:border-0">
                  <div className="flex items-center justify-between gap-4">
                    <Link href={`/story/${word.slug}`} className="min-w-0 flex-1 group">
                      <p className="font-sans text-xs text-ink-faint">{displayDate}</p>
                      <p className="mt-0.5 font-serif text-xl group-hover:text-accent transition-colors">
                        {word.word}
                      </p>
                    </Link>
                    <button
                      onClick={() => handleToggle(word.slug)}
                      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
                      className="shrink-0 rounded-full p-2 text-ink-faint transition-colors hover:text-accent cursor-pointer"
                    >
                      <Heart
                        size={16}
                        strokeWidth={1.75}
                        className={favorited ? "fill-accent text-accent" : ""}
                      />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {hasMore && (
        <button
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="mt-6 w-full rounded-md border border-line py-2.5 font-sans text-sm text-ink-soft transition-colors hover:text-ink hover:border-accent cursor-pointer"
        >
          Show more
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

```bash
npx tsc --noEmit -p .
npx eslint components/HistoryList.tsx
```

Expected: no errors.

- [ ] **Step 3: Verify live**

Start the dev server, sign in (so the "My days"/"All words"/"Favorites" tab set is showing), open `/history`, switch to "All words". Confirm: (a) only the first 60 entries render initially (check via the browser's accessibility tree or DOM node count, not a full manual count of 1,147 rows), (b) a "Show more" button is visible and clicking it reveals another 60, (c) typing a search query that matches a word past the first page (e.g. a word alphabetically or chronologically far into the list) still finds it immediately, with no "Show more" button visible while searching.

- [ ] **Step 4: Commit**

```bash
git add components/HistoryList.tsx
git commit -m "feat: paginate /history's All words view behind Show more"
```

---

### Task 6: Update `handover.md`

**Files:**
- Modify: `handover.md`

**Interfaces:** None — documentation only, depends on Tasks 1-5 actually being complete so it can describe what really landed.

- [ ] **Step 1: Fix the stale date and add a new session entry**

In `handover.md`, change line 3's `Last updated: 2026-09-12, after a session that added...` to `Last updated: 2026-09-18, after a session that grew the word bank to 1,147 entries, added the word-locking layer, cross-device sign-in, and a batch of outstanding-debt fixes (session flash, puzzle perf, sign-in cooldown, Bluesky test coverage, /history pagination).`

Add a new dated section near the end (after the existing "This session (2026-09-12)" section, before "Workflow notes for whoever picks this up"), titled `## This session (2026-09-18)`, briefly listing in the same style as the existing 2026-09-12 entry:
1. Added a visible "Sign in" link to the first-time arrival hero (previously unreachable except via "See the archive").
2. Cross-device magic-link handoff — a tab that requested a sign-in link now signs itself in automatically once the link is verified elsewhere (`app/api/auth/device-link/*`, `lib/deviceLink.ts`).
3. Word-of-the-day locking layer (`lib/words.ts`'s `resolve*` functions) — growing the word bank can no longer retroactively change a date's or account-day's already-served word; see the "Word bank" section above.
4. Grew the word bank from 26 to 1,147 entries via the content pipeline's full batch run.
5. A batch of outstanding-debt fixes: server-fed session in the root layout (kills the sign-in loading flash), an O(n) rewrite of the puzzle eligibility scan, a per-email cooldown on magic-link sign-in requests, test coverage for `postDailyWordToBluesky`'s failure path, and pagination for `/history`'s "All words" view.

- [ ] **Step 2: Commit**

```bash
git add handover.md
git commit -m "docs: update handover.md for this session's fixes batch"
```

---

## Self-Review Notes

- **Spec coverage:** all 5 prioritized items from the user-facing sweep have a task (Tasks 1-5); the explicit follow-up ask ("please update handover.md") has Task 6.
- **No placeholders:** every step has real, complete code — no "similar to Task N," no "add appropriate error handling" without showing it.
- **Type/interface consistency:** `claimSignInSend(email: string): Promise<boolean>` is defined once in Task 3 and used with that exact signature in its own test and in `lib/auth.ts`. `daysSinceShownMap(today: Date, words: WordEntry[]): Map<string, number>` is defined and consumed only within Task 2's own file. No task depends on another task's output — all five are independent and safe to dispatch in parallel.
