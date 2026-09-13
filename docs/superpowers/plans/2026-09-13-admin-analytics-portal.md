# Admin Analytics Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a private `/admin` page, visible only to the site owner, that shows real usage: subscriber and account growth over time, favorites/puzzle engagement, daily-email delivery/open/click metrics from Resend, and 1/7/30-day rolling account retention.

**Architecture:** Every Redis-backed data source this app already has gets a new read-only accessor next to its existing code (`lib/db.ts` for subscribers, `lib/userData.ts` for accounts/favorites/puzzle plays) — no new datastore, no new write paths except one small addition (a per-account `lastSeen` date, needed because retention can't be computed from data that was never recorded). All the actual math — bucketing dates into daily/cumulative counts, tallying puzzle outcomes, computing rolling retention — lives in one new pure, fully-tested module (`lib/adminStats.ts`), mirroring this codebase's existing split between untestable Redis glue and testable pure logic (see `lib/words.ts`'s `getDigestWordForSubscriber`, added 2026-09-13, for the same pattern). Email engagement comes from Resend's account-level metrics endpoint via a new best-effort module (`lib/resendMetrics.ts`), following `lib/bluesky.ts`'s existing convention for optional external services: never configured or never reachable degrades to "unavailable," never a crash. `app/admin/page.tsx` is a server component that gates on the signed-in session's email, fetches everything in parallel, and hands plain data down to a new presentational component, `components/AdminDashboard.tsx`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Vitest 5, `@upstash/redis` (already installed), Resend's REST API via plain `fetch` (the installed `resend` npm SDK, v6.27.0, has no metrics method as of writing — confirmed by searching its type declarations on 2026-09-13). No new dependencies.

**Spec:** No separate written spec — requirements come from the user's own request ("create an analytics portal? tracking usage, use key standard metrics for retention, email click through rate etc"), scoped down during planning to what's actually buildable from data this app has (or can start recording today). Four decisions were made explicit rather than left implicit:

- **Flagged decision A (retention has no history to backfill):** This app has never recorded when a signed-in account was last active, so classic fixed-cohort Day-N retention curves ("of everyone who joined on March 3rd, how many came back on March 10th?") can't be computed for anyone who joined before this ships — there's no historical data to backfill. This plan instead computes **rolling retention**: of the accounts old enough to have had a full window to return (joined at least N days ago), what fraction were active at all within the last N days? It's a standard, continuously-computable simplification of the same idea, and it starts producing real numbers the moment the first account crosses the window age — but it's not the same statistic as a cohort chart, and the plan's `computeRollingRetention` doc comment says so. If you specifically want fixed-cohort curves later, that's a bigger feature (storing a join-date cohort table and tracking it forward) — flag it if so.
- **Flagged decision B (Resend metrics endpoint isn't wrapped by the installed SDK):** `GET https://api.resend.com/emails/metrics` is a real, documented Resend endpoint (verified against Resend's own docs on 2026-09-13 — exact path, params, and response shape below), but the installed `resend` npm package (6.27.0) doesn't expose a method for it. This plan calls it directly with `fetch` and a hand-written response parser, treating any non-2xx response or unexpected shape as "metrics unavailable" (returns `null`) rather than throwing — an external API changing shape on us should degrade one card on the dashboard, not break the page.
- **Flagged decision C (where "last seen" gets recorded):** account activity is recorded from the three pages that already call `auth()` and already know the signed-in user's id — Today (`app/page.tsx`), Collection (`app/collection/page.tsx`), and the story page (`app/story/[slug]/page.tsx`) — not from a new global middleware. This covers every real "the user did something" surface the app currently has, but it means a future new authenticated page must remember to call `recordUserSeen` too; nothing enforces that automatically. Flag it if you'd rather add a `middleware.ts` now to make this automatic — it's a reasonable choice, just a bigger and riskier one (global middleware touches every request in the app, including ones that don't need a session check today) for a one-person side project's `/admin` page.
- **Flagged decision D (no charting library):** at this app's current scale (WORDS.length is 8, the whole subscriber list is well under 100), a growth "chart" is more honestly a short table than a line graph. This plan renders everything as stat tiles and tables in the existing serif/sans design language, with no new dependency. If growth data later gets large enough that a table stops being readable, a charting library is a reasonable follow-up — not needed for v1.

## Global Constraints

- **Do not modify `app/api/cron/send-daily/route.ts` or `lib/bluesky.ts` in any task below.** Standing rule for this codebase — this plan has no reason to touch either, and no task here does.
- `/admin` is gated by comparing the signed-in session's email to `process.env.ADMIN_EMAIL` (exact string match). Anonymous visitors redirect to `/login`; signed-in visitors whose email doesn't match redirect to `/` — never a distinguishing error message that reveals the page exists to someone probing it.
- Every new Redis write (`recordUserSeen`) must be fire-and-forget and best-effort, exactly like the existing `syncPlayStateToAccount`/`toggleFavorite` pattern in `lib/storage.ts` — a failure must never block page rendering or throw into a Server Component.
- Every new Redis *read* added for this plan follows the existing `if (!redis) return <empty>` fallback convention (`lib/userData.ts`'s existing functions) — no Upstash configured means the portal shows zeros, not a crash.
- Retention numbers must render "not enough data yet" (not `0%`, not `NaN%`) when there's no eligible cohort for that window.
- The Resend metrics fetch must never throw out of `app/admin/page.tsx` — any failure (missing key, network error, non-2xx, unparseable body) resolves to `null`, and the dashboard shows "unavailable" for that card.
- No new dependencies (no charting library, no new HTTP client — use the platform `fetch`).
- Match existing code style: short doc comments explaining *why*; existing Tailwind tokens only (`ink`, `ink-soft`, `accent`, `line`, `font-serif`, `font-sans`); reuse `lib/collection.ts`'s `pluralize`/`capitalize`/`WIDE_DOT`/`formatShortDate` for consistent number/date formatting instead of re-deriving them.
- Package manager is npm (`package-lock.json` committed). Deploy process: `git push origin master` (Vercel's Git integration auto-deploys) — this repo has no PR review step; commits land directly on `master`.

---

## File Structure

New files:
- `lib/adminStats.ts` — pure, fully-tested computation: bucketing dates into daily/cumulative counts, tallying puzzle-play outcomes into a histogram, computing rolling retention. Takes plain data in, returns plain data out — no Redis, no `Date.now()` without an explicit `today` parameter, so every function here is trivially testable.
- `lib/adminStats.test.ts` — Vitest unit tests for every function in `lib/adminStats.ts`.
- `lib/resendMetrics.ts` — `parseEmailMetricsResponse` (pure, tested) plus `getEmailMetrics` (best-effort network call, untested — matches `lib/bluesky.ts`'s existing convention of not unit-testing the network call itself).
- `lib/resendMetrics.test.ts` — Vitest unit tests for `parseEmailMetricsResponse` only.
- `app/admin/page.tsx` — the gated route: checks the session, fetches every data source in parallel, runs it through `lib/adminStats.ts`, renders `AdminDashboard`.
- `components/AdminDashboard.tsx` — presentational component: stat tiles, growth tables, retention cards, email metric cards, puzzle-engagement bars.

Modified files:
- `lib/db.ts` — add `getAllSubscriberRecords()`, returning full `Subscriber` records (including `createdAt`) instead of just email strings, for growth-by-day bucketing.
- `lib/db.test.ts` — new test for `getAllSubscriberRecords`.
- `lib/userData.ts` — add `recordUserSeen`, `getUserLastSeen`, `getAllUserLastSeen`, `getAllUserJoinDates`, `getAllUserActivity`, `getFavoritesSummary`, `getAllPlayStates`. None of these get dedicated unit tests, matching every existing function in this file today — `redis` is always `null` in the test environment (no Upstash configured for Vitest), so there's no local fallback path to exercise, exactly like `getUserJoinedAt`/`getUserFavorites`/etc. already in this file.
- `app/page.tsx`, `app/collection/page.tsx`, `app/story/[slug]/page.tsx` — each fires `recordUserSeen(session.user.id)` for a signed-in visitor, fire-and-forget.
- `.env.example` — document `ADMIN_EMAIL`.

---

### Task 1: Subscriber growth data + pure date-bucketing

**Files:**
- Modify: `lib/db.ts`
- Modify: `lib/db.test.ts`
- Create: `lib/adminStats.ts`
- Create: `lib/adminStats.test.ts`

**Interfaces:**
- Produces: `getAllSubscriberRecords(): Promise<Subscriber[]>` (exported from `lib/db.ts`) — consumed by `app/admin/page.tsx` (Task 6).
- Produces: `bucketDatesByDay(dates: string[]): DailyCount[]` and `cumulativeGrowth(daily: DailyCount[]): CumulativeCount[]` (exported from `lib/adminStats.ts`) — consumed by `app/admin/page.tsx` (Task 6) for both subscriber growth and account growth.

- [ ] **Step 1: Write the failing test for `getAllSubscriberRecords`**

Add to `lib/db.test.ts`, inside the existing file (new `describe` block, same file that already imports from `./db`):

```ts
import { getAllSubscriberRecords } from "./db";
```

(add this named import to the existing `import { getAllSubscribers, removeSubscriber, upsertSubscriber } from "./db";` line at the top)

```ts
describe("getAllSubscriberRecords", () => {
  const testEmails = ["admin-stats-a@example.com", "admin-stats-b@example.com"];

  afterEach(async () => {
    for (const email of testEmails) {
      await removeSubscriber(email);
    }
  });

  it("returns full records, not just email addresses", async () => {
    await upsertSubscriber(testEmails[0], 3);
    await upsertSubscriber(testEmails[1], 21);

    const records = await getAllSubscriberRecords();
    const emails = records.map((r) => r.email);

    expect(emails).toEqual(expect.arrayContaining(testEmails));
    for (const record of records.filter((r) => testEmails.includes(r.email))) {
      expect(typeof record.createdAt).toBe("string");
      expect(record.createdAt.length).toBeGreaterThan(0);
    }
  });

  it("omits a subscriber after they unsubscribe", async () => {
    await upsertSubscriber(testEmails[0], 9);
    await removeSubscriber(testEmails[0]);

    const records = await getAllSubscriberRecords();

    expect(records.map((r) => r.email)).not.toContain(testEmails[0]);
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `npx vitest run lib/db.test.ts`
Expected: FAIL — `getAllSubscriberRecords` is not exported from `./db`.

- [ ] **Step 3: Implement `getAllSubscriberRecords`**

Add to `lib/db.ts`, directly below the existing `getAllSubscribers` function:

```ts
/** Every subscriber's full record (not just the email), for the admin
 * portal's growth-by-signup-date view — getAllSubscribers only returns
 * email strings because that's all the daily cron ever needed. */
export async function getAllSubscriberRecords(): Promise<Subscriber[]> {
  if (redis) {
    const keys = await redis.keys(`${SUBSCRIBER_PREFIX}*`);
    if (keys.length === 0) return [];
    const records = await Promise.all(keys.map((key) => redis!.hgetall<Subscriber>(key)));
    return records.filter((r): r is Subscriber => !!r?.email);
  }
  const db = await readLocalDb();
  return Object.values(db);
}
```

- [ ] **Step 4: Run the test, confirm it passes**

Run: `npx vitest run lib/db.test.ts`
Expected: PASS (4 tests: 2 existing + 2 new).

- [ ] **Step 5: Write the failing tests for `bucketDatesByDay` and `cumulativeGrowth`**

Create `lib/adminStats.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { bucketDatesByDay, cumulativeGrowth } from "./adminStats";

describe("bucketDatesByDay", () => {
  it("returns an empty list for no dates", () => {
    expect(bucketDatesByDay([])).toEqual([]);
  });

  it("collapses repeated dates into one row with the right count", () => {
    const result = bucketDatesByDay(["2026-09-01", "2026-09-01", "2026-09-01"]);
    expect(result).toEqual([{ date: "2026-09-01", count: 3 }]);
  });

  it("sorts distinct dates ascending regardless of input order", () => {
    const result = bucketDatesByDay(["2026-09-03", "2026-09-01", "2026-09-02"]);
    expect(result.map((r) => r.date)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
  });

  it("counts each distinct date independently", () => {
    const result = bucketDatesByDay(["2026-09-01", "2026-09-02", "2026-09-02"]);
    expect(result).toEqual([
      { date: "2026-09-01", count: 1 },
      { date: "2026-09-02", count: 2 },
    ]);
  });
});

describe("cumulativeGrowth", () => {
  it("returns an empty list for no daily counts", () => {
    expect(cumulativeGrowth([])).toEqual([]);
  });

  it("runs a total across dates in order", () => {
    const daily = [
      { date: "2026-09-01", count: 3 },
      { date: "2026-09-02", count: 1 },
      { date: "2026-09-03", count: 5 },
    ];
    expect(cumulativeGrowth(daily)).toEqual([
      { date: "2026-09-01", total: 3 },
      { date: "2026-09-02", total: 4 },
      { date: "2026-09-03", total: 9 },
    ]);
  });
});
```

- [ ] **Step 6: Run the tests, confirm they fail**

Run: `npx vitest run lib/adminStats.test.ts`
Expected: FAIL — `./adminStats` doesn't exist yet.

- [ ] **Step 7: Implement `lib/adminStats.ts`**

Create `lib/adminStats.ts`:

```ts
// Pure computation for the admin analytics portal (app/admin/page.tsx). No
// Redis, no ambient `new Date()` — every function here takes plain data (and
// an explicit `today` where "now" matters) and returns plain data, so all of
// it is trivially unit-testable without mocking anything. The actual data
// fetching (Redis scans, the Resend API call) lives next to the data it
// reads: lib/db.ts, lib/userData.ts, lib/resendMetrics.ts.

export type DailyCount = { date: string; count: number };

/** Buckets a list of YYYY-MM-DD dates into one row per distinct date,
 * sorted oldest first. A date with zero occurrences simply doesn't appear
 * — this is a sparse "days something happened" list, not a zero-filled
 * calendar; a table doesn't need empty rows the way a chart's x-axis
 * would, and this app's own tables (lib/collection.ts's month grouping)
 * already only render months that actually have entries. */
export function bucketDatesByDay(dates: string[]): DailyCount[] {
  const counts = new Map<string, number>();
  for (const date of dates) {
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type CumulativeCount = { date: string; total: number };

/** Running total across an already-sorted list of daily counts — turns "3
 * signups on day A, 1 on day B" into "3 total after day A, 4 total after
 * day B," for a growth-over-time view. */
export function cumulativeGrowth(daily: DailyCount[]): CumulativeCount[] {
  let total = 0;
  return daily.map(({ date, count }) => {
    total += count;
    return { date, total };
  });
}
```

- [ ] **Step 8: Run the tests, confirm they pass**

Run: `npx vitest run lib/adminStats.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 9: Commit**

```bash
git add lib/db.ts lib/db.test.ts lib/adminStats.ts lib/adminStats.test.ts
git commit -m "feat: add subscriber-record access and pure date-bucketing for the admin portal"
```

---

### Task 2: Account activity — last-seen instrumentation

**Files:**
- Modify: `lib/userData.ts`
- Modify: `app/page.tsx`
- Modify: `app/collection/page.tsx`
- Modify: `app/story/[slug]/page.tsx`

**Interfaces:**
- Consumes: `redis` from `./redis` (already imported in `lib/userData.ts`).
- Produces: `recordUserSeen(userId: string, date?: Date): Promise<void>`, `getUserLastSeen(userId: string): Promise<string | null>`, `getAllUserLastSeen(): Promise<Record<string, string>>`, `getAllUserJoinDates(): Promise<Record<string, string>>`, `getAllUserActivity(): Promise<UserActivity[]>` where `UserActivity = { userId: string; joinedAt: string; lastSeen: string | null }` — all exported from `lib/userData.ts`, consumed by `app/admin/page.tsx` (Task 6) and `lib/adminStats.ts`'s `computeRollingRetention` (Task 3, which takes `{ joinedAt, lastSeen }` pairs — the same shape `UserActivity` already carries).

This task has no dedicated unit tests — see the File Structure section above for why (`redis` is always `null` in this project's test environment, matching every other function already in `lib/userData.ts`). Correctness here is verified by the build/typecheck in Step 4 and by manually checking `/admin` once it exists (Task 6) against a real signed-in session.

- [ ] **Step 1: Add the new functions to `lib/userData.ts`**

Add below the existing `joinedKey`/`recordUserJoined`/`getUserJoinedAt` block:

```ts
function lastSeenKey(userId: string): string {
  return `curio:user:${userId}:lastSeen`;
}

/** Records that a signed-in account was active today (UTC calendar date) —
 * feeds the admin portal's retention metrics. Deliberately not awaited by
 * its callers (see app/page.tsx, app/collection/page.tsx,
 * app/story/[slug]/page.tsx): a failed write here must never block or
 * break page rendering, mirroring lib/storage.ts's fire-and-forget account
 * sync. Skips the write once today's date is already stored, so visiting
 * the same page many times in a day costs one extra GET and no SET after
 * the first. */
export async function recordUserSeen(userId: string, date: Date = new Date()): Promise<void> {
  if (!redis) return;
  const dateStr = date.toISOString().slice(0, 10);
  const key = lastSeenKey(userId);
  const existing = await redis.get<string>(key);
  if (existing === dateStr) return;
  await redis.set(key, dateStr);
}

export async function getUserLastSeen(userId: string): Promise<string | null> {
  if (!redis) return null;
  return redis.get<string>(lastSeenKey(userId));
}

// `curio:user:<id>:<suffix>` — every scan below needs to recover the
// userId from the key name, and every id is a crypto.randomUUID() (no
// colons), so slicing off the fixed prefix/suffix is safe.
const USER_KEY_PREFIX = "curio:user:";

function parseUserKey(key: string, suffix: string): string {
  return key.slice(USER_KEY_PREFIX.length, key.length - suffix.length);
}

/** Every account's last-seen date, keyed by userId. Empty when Upstash
 * isn't configured. */
export async function getAllUserLastSeen(): Promise<Record<string, string>> {
  if (!redis) return {};
  const keys = await redis.keys(`${USER_KEY_PREFIX}*:lastSeen`);
  if (keys.length === 0) return {};
  const values = await redis.mget<string[]>(...keys);
  const result: Record<string, string> = {};
  keys.forEach((key, i) => {
    const value = values[i];
    if (value) result[parseUserKey(key, ":lastSeen")] = value;
  });
  return result;
}

/** Every account's join date, keyed by userId — the same data
 * getUserJoinedAt reads one account at a time, scanned across every
 * account for the admin portal's growth and retention views. */
export async function getAllUserJoinDates(): Promise<Record<string, string>> {
  if (!redis) return {};
  const keys = await redis.keys(`${USER_KEY_PREFIX}*:joinedAt`);
  if (keys.length === 0) return {};
  const values = await redis.mget<string[]>(...keys);
  const result: Record<string, string> = {};
  keys.forEach((key, i) => {
    const value = values[i];
    if (value) result[parseUserKey(key, ":joinedAt")] = value;
  });
  return result;
}

export type UserActivity = { userId: string; joinedAt: string; lastSeen: string | null };

/** Every account with a recorded join date, paired with its last-seen date
 * (or null if it's never been recorded — true for every account until it
 * next visits a page that calls recordUserSeen). The shape
 * lib/adminStats.ts's computeRollingRetention consumes directly. */
export async function getAllUserActivity(): Promise<UserActivity[]> {
  const [joinDates, lastSeen] = await Promise.all([getAllUserJoinDates(), getAllUserLastSeen()]);
  return Object.entries(joinDates).map(([userId, joinedAt]) => ({
    userId,
    joinedAt,
    lastSeen: lastSeen[userId] ?? null,
  }));
}
```

- [ ] **Step 2: Wire `recordUserSeen` into the three signed-in pages**

In `app/page.tsx`, add the import and a fire-and-forget call once the signed-in `userId` is known:

```ts
import { getUserJoinedAt, recordUserSeen } from "@/lib/userData";
```

(replace the existing `import { getUserJoinedAt } from "@/lib/userData";` line)

```ts
  const session = await auth();
  if (session?.user?.id) void recordUserSeen(session.user.id);
  const joinedAtStr = session?.user?.id ? await getUserJoinedAt(session.user.id) : null;
```

(insert the `recordUserSeen` line right after the existing `const session = await auth();` line, before the `joinedAtStr` line)

In `app/collection/page.tsx`, add the import and call right after the existing redirect check:

```ts
import { getUserJoinedAt, recordUserSeen } from "@/lib/userData";
```

(replace the existing `import { getUserJoinedAt } from "@/lib/userData";` line)

```ts
  const session = await auth();
  if (!session?.user) redirect("/login");
  void recordUserSeen(session.user.id);
```

In `app/story/[slug]/page.tsx`, add the import and call right after the existing session read:

```ts
import { getUserJoinedAt, recordUserSeen } from "@/lib/userData";
```

(replace the existing `import { getUserJoinedAt } from "@/lib/userData";` line)

```ts
  const session = await auth();
  if (session?.user?.id) void recordUserSeen(session.user.id);
  const joinedAtStr = session?.user?.id ? await getUserJoinedAt(session.user.id) : null;
```

(insert the `recordUserSeen` line right after the existing `const session = await auth();` line, before the `joinedAtStr` line — note `story/[slug]/page.tsx` already has a `joinedAtStr` line in this exact shape from personalization, so this is a one-line insert above it)

- [ ] **Step 3: Verify the app still builds and typechecks**

Run: `npm run build`
Expected: builds cleanly, no TypeScript errors, same route list as before this task.

- [ ] **Step 4: Commit**

```bash
git add lib/userData.ts app/page.tsx app/collection/page.tsx "app/story/[slug]/page.tsx"
git commit -m "feat: record signed-in account activity for retention tracking"
```

---

### Task 3: Rolling retention (pure, tested)

**Files:**
- Modify: `lib/adminStats.ts`
- Modify: `lib/adminStats.test.ts`

**Interfaces:**
- Consumes: `UserActivity` shape from `lib/userData.ts` (Task 2) — `{ joinedAt: string; lastSeen: string | null }` (this function only needs those two fields, so it's typed structurally rather than importing `UserActivity` itself, keeping `lib/adminStats.ts` free of a dependency on `lib/userData.ts`).
- Produces: `computeRollingRetention(users, windowDays, today): RetentionResult` where `RetentionResult = { eligible: number; active: number; rate: number | null }` — consumed by `app/admin/page.tsx` (Task 6).

- [ ] **Step 1: Write the failing tests**

Add to `lib/adminStats.test.ts`:

```ts
import { bucketDatesByDay, cumulativeGrowth, computeRollingRetention } from "./adminStats";
```

(replace the existing `import { bucketDatesByDay, cumulativeGrowth } from "./adminStats";` line)

```ts
describe("computeRollingRetention", () => {
  const today = new Date("2026-09-13T00:00:00Z");

  it("returns a null rate when no account is old enough to be eligible", () => {
    const users = [{ joinedAt: "2026-09-10", lastSeen: "2026-09-12" }]; // joined 3 days ago
    const result = computeRollingRetention(users, 7, today);
    expect(result).toEqual({ eligible: 0, active: 0, rate: null });
  });

  it("counts an eligible account as active when last seen within the window", () => {
    const users = [{ joinedAt: "2026-08-01", lastSeen: "2026-09-10" }]; // joined 43 days ago, seen 3 days ago
    const result = computeRollingRetention(users, 7, today);
    expect(result).toEqual({ eligible: 1, active: 1, rate: 1 });
  });

  it("counts an eligible account as inactive when never seen", () => {
    const users = [{ joinedAt: "2026-08-01", lastSeen: null }];
    const result = computeRollingRetention(users, 7, today);
    expect(result).toEqual({ eligible: 1, active: 0, rate: 0 });
  });

  it("counts an eligible account as inactive when last seen outside the window", () => {
    const users = [{ joinedAt: "2026-08-01", lastSeen: "2026-08-15" }]; // seen ~29 days ago
    const result = computeRollingRetention(users, 7, today);
    expect(result).toEqual({ eligible: 1, active: 0, rate: 0 });
  });

  it("computes a fractional rate across a mixed cohort", () => {
    const users = [
      { joinedAt: "2026-08-01", lastSeen: "2026-09-12" }, // eligible, active
      { joinedAt: "2026-08-01", lastSeen: "2026-08-02" }, // eligible, inactive
      { joinedAt: "2026-09-10", lastSeen: "2026-09-12" }, // not eligible yet
    ];
    const result = computeRollingRetention(users, 7, today);
    expect(result).toEqual({ eligible: 2, active: 1, rate: 0.5 });
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `npx vitest run lib/adminStats.test.ts`
Expected: FAIL — `computeRollingRetention` is not exported.

- [ ] **Step 3: Implement `computeRollingRetention`**

Add to `lib/adminStats.ts`:

```ts
export type RetentionResult = { eligible: number; active: number; rate: number | null };

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Rolling retention": of the accounts old enough to have had a full
 * `windowDays` to come back (joined at least that many days ago), what
 * fraction were active at all within the last `windowDays`? This is a
 * simplified, continuously-computable stand-in for classic fixed-cohort
 * Day-N retention (see this plan's Flagged Decision A) — it starts
 * producing real numbers the moment the first account crosses the window
 * age, at the cost of not being a true same-cohort curve. `rate` is `null`
 * (never `0`) when there's no eligible account yet, so the UI can show
 * "not enough data" instead of a misleading 0%. */
export function computeRollingRetention(
  users: { joinedAt: string; lastSeen: string | null }[],
  windowDays: number,
  today: Date
): RetentionResult {
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const cutoff = todayUtc - windowDays * DAY_MS;

  const eligible = users.filter((u) => Date.parse(u.joinedAt + "T00:00:00Z") <= cutoff);
  const active = eligible.filter(
    (u) => u.lastSeen !== null && Date.parse(u.lastSeen + "T00:00:00Z") > cutoff
  );

  return {
    eligible: eligible.length,
    active: active.length,
    rate: eligible.length === 0 ? null : active.length / eligible.length,
  };
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `npx vitest run lib/adminStats.test.ts`
Expected: PASS (11 tests: 6 from Task 1 + 5 new).

- [ ] **Step 5: Commit**

```bash
git add lib/adminStats.ts lib/adminStats.test.ts
git commit -m "feat: add rolling-retention computation"
```

---

### Task 4: Engagement aggregation — favorites and puzzle plays

**Files:**
- Modify: `lib/userData.ts`
- Modify: `lib/adminStats.ts`
- Modify: `lib/adminStats.test.ts`

**Interfaces:**
- Consumes: `PlayState` type from `./storage` (already imported in `lib/userData.ts`).
- Produces: `getFavoritesSummary(): Promise<{ accountsWithFavorites: number; totalFavorites: number }>` and `getAllPlayStates(): Promise<PlayState[]>` (exported from `lib/userData.ts`); `summarizePuzzleEngagement(states: PlayState[]): PuzzleEngagementSummary` (exported from `lib/adminStats.ts`, pure) where `PuzzleEngagementSummary = { totalPlays: number; solved: number; failed: number; inProgress: number; histogram: [number, number, number, number] }` — all consumed by `app/admin/page.tsx` (Task 6).

`getFavoritesSummary` and `getAllPlayStates` get no dedicated unit tests, for the same reason as Task 2 (`redis` is always `null` in this test environment). `summarizePuzzleEngagement` is pure and fully tested below.

- [ ] **Step 1: Add the Redis-scanning functions to `lib/userData.ts`**

Add below the existing `importFavoritesOnce` function:

```ts
/** Account-level favoriting activity across every signed-in account — how
 * many accounts have favorited at least one word, and how many favorites
 * exist in total. Scans rather than maintaining a running counter because
 * this app's account count is small enough that a scan is cheap and a
 * running counter is one more thing that can drift out of sync. */
export async function getFavoritesSummary(): Promise<{
  accountsWithFavorites: number;
  totalFavorites: number;
}> {
  if (!redis) return { accountsWithFavorites: 0, totalFavorites: 0 };
  const keys = await redis.keys(`${USER_KEY_PREFIX}*:favorites`);
  if (keys.length === 0) return { accountsWithFavorites: 0, totalFavorites: 0 };
  const counts = await Promise.all(keys.map((key) => redis!.scard(key)));
  return {
    accountsWithFavorites: counts.filter((c) => c > 0).length,
    totalFavorites: counts.reduce((sum, c) => sum + c, 0),
  };
}

/** Every signed-in account's synced puzzle play state, across every date
 * they've played — the server-side, cross-device counterpart to
 * lib/storage.ts's local-only PuzzleStats, used only for the admin
 * portal's aggregate view (not shown to the account itself). */
export async function getAllPlayStates(): Promise<PlayState[]> {
  if (!redis) return [];
  const keys = await redis.keys(`${USER_KEY_PREFIX}*:play:*`);
  if (keys.length === 0) return [];
  const values = await redis.mget<PlayState[]>(...keys);
  return values.filter((v): v is PlayState => v !== null);
}
```

- [ ] **Step 2: Write the failing test for `summarizePuzzleEngagement`**

Add to `lib/adminStats.test.ts`:

```ts
import {
  bucketDatesByDay,
  cumulativeGrowth,
  computeRollingRetention,
  summarizePuzzleEngagement,
} from "./adminStats";
import type { PlayState } from "./storage";
```

(replace the existing `import { bucketDatesByDay, cumulativeGrowth, computeRollingRetention } from "./adminStats";` line)

```ts
function playState(overrides: Partial<PlayState>): PlayState {
  return {
    puzzleDate: "2026-09-13",
    cluesRevealed: 1,
    status: "playing",
    cluesUsedToSolve: null,
    ...overrides,
  };
}

describe("summarizePuzzleEngagement", () => {
  it("returns all zeros for no plays", () => {
    expect(summarizePuzzleEngagement([])).toEqual({
      totalPlays: 0,
      solved: 0,
      failed: 0,
      inProgress: 0,
      histogram: [0, 0, 0, 0],
    });
  });

  it("tallies solved plays into the histogram by clues used", () => {
    const states = [
      playState({ status: "solved", cluesUsedToSolve: 1 }),
      playState({ status: "solved", cluesUsedToSolve: 1 }),
      playState({ status: "solved", cluesUsedToSolve: 3 }),
    ];
    const result = summarizePuzzleEngagement(states);
    expect(result.solved).toBe(3);
    expect(result.histogram).toEqual([2, 0, 1, 0]);
  });

  it("tallies failed plays into the histogram's 4th slot", () => {
    const states = [playState({ status: "failed" }), playState({ status: "failed" })];
    const result = summarizePuzzleEngagement(states);
    expect(result.failed).toBe(2);
    expect(result.histogram).toEqual([0, 0, 0, 2]);
  });

  it("counts in-progress plays separately, with no histogram entry", () => {
    const states = [playState({ status: "playing" })];
    const result = summarizePuzzleEngagement(states);
    expect(result.inProgress).toBe(1);
    expect(result.histogram).toEqual([0, 0, 0, 0]);
  });

  it("counts totalPlays as every play regardless of status", () => {
    const states = [
      playState({ status: "solved", cluesUsedToSolve: 2 }),
      playState({ status: "failed" }),
      playState({ status: "playing" }),
    ];
    expect(summarizePuzzleEngagement(states).totalPlays).toBe(3);
  });
});
```

- [ ] **Step 3: Run the tests, confirm they fail**

Run: `npx vitest run lib/adminStats.test.ts`
Expected: FAIL — `summarizePuzzleEngagement` is not exported.

- [ ] **Step 4: Implement `summarizePuzzleEngagement`**

Add to `lib/adminStats.ts`:

```ts
import type { PlayState } from "./storage";

export type PuzzleEngagementSummary = {
  totalPlays: number;
  solved: number;
  failed: number;
  inProgress: number;
  // [clues-to-solve-on-1, on-2, on-3, failed] — same shape as the
  // client-side PuzzleStats histogram (lib/storage.ts), aggregated across
  // every signed-in account's synced play state instead of one device.
  histogram: [number, number, number, number];
};

export function summarizePuzzleEngagement(states: PlayState[]): PuzzleEngagementSummary {
  const histogram: [number, number, number, number] = [0, 0, 0, 0];
  let solved = 0;
  let failed = 0;
  let inProgress = 0;

  for (const state of states) {
    if (state.status === "solved" && state.cluesUsedToSolve) {
      solved++;
      histogram[state.cluesUsedToSolve - 1]++;
    } else if (state.status === "failed") {
      failed++;
      histogram[3]++;
    } else {
      inProgress++;
    }
  }

  return { totalPlays: states.length, solved, failed, inProgress, histogram };
}
```

(add the `import type { PlayState } from "./storage";` line to the top of `lib/adminStats.ts`, alongside its other imports)

- [ ] **Step 5: Run the tests, confirm they pass**

Run: `npx vitest run lib/adminStats.test.ts`
Expected: PASS (16 tests: 11 from Tasks 1+3 + 5 new).

- [ ] **Step 6: Verify the app still builds**

Run: `npm run build`
Expected: builds cleanly, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add lib/userData.ts lib/adminStats.ts lib/adminStats.test.ts
git commit -m "feat: add favorites and puzzle-play engagement aggregation"
```

---

### Task 5: Email metrics via Resend

**Files:**
- Create: `lib/resendMetrics.ts`
- Create: `lib/resendMetrics.test.ts`

**Interfaces:**
- Produces: `parseEmailMetricsResponse(json: unknown): EmailMetricsTotals | null` (pure, tested) and `getEmailMetrics(days: number, now?: Date): Promise<EmailMetricsTotals | null>` (best-effort, untested — matches `lib/bluesky.ts`'s convention) where `EmailMetricsTotals = { sent: number; delivered: number; opened: number; clicked: number; openRate: number | null; clickRate: number | null }` — consumed by `app/admin/page.tsx` (Task 6).

- [ ] **Step 1: Write the failing tests**

Create `lib/resendMetrics.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseEmailMetricsResponse } from "./resendMetrics";

describe("parseEmailMetricsResponse", () => {
  it("parses a well-formed response", () => {
    const json = {
      object: "metrics",
      totals: { sent: 18, delivered: 18, opened: 8, clicked: 3, open_rate: 44.4, click_rate: 16.7 },
    };
    expect(parseEmailMetricsResponse(json)).toEqual({
      sent: 18,
      delivered: 18,
      opened: 8,
      clicked: 3,
      openRate: 44.4,
      clickRate: 16.7,
    });
  });

  it("returns null when the response has no totals object", () => {
    expect(parseEmailMetricsResponse({ object: "metrics" })).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(parseEmailMetricsResponse(null)).toBeNull();
    expect(parseEmailMetricsResponse("not json")).toBeNull();
    expect(parseEmailMetricsResponse(undefined)).toBeNull();
  });

  it("coerces missing or non-numeric count fields to 0 rather than throwing", () => {
    const json = { totals: { sent: 5 } }; // delivered/opened/clicked all missing
    expect(parseEmailMetricsResponse(json)).toEqual({
      sent: 5,
      delivered: 0,
      opened: 0,
      clicked: 0,
      openRate: null,
      clickRate: null,
    });
  });

  it("leaves rate fields as null (not 0) when missing, since 0% and 'unknown' are different", () => {
    const json = { totals: { sent: 5, delivered: 5, opened: 0, clicked: 0 } };
    const result = parseEmailMetricsResponse(json);
    expect(result?.openRate).toBeNull();
    expect(result?.clickRate).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `npx vitest run lib/resendMetrics.test.ts`
Expected: FAIL — `./resendMetrics` doesn't exist yet.

- [ ] **Step 3: Implement `lib/resendMetrics.ts`**

Create `lib/resendMetrics.ts`:

```ts
// Resend's account-level email engagement metrics
// (GET https://api.resend.com/emails/metrics — verified against Resend's
// own API docs on 2026-09-13: query params start_date/end_date/metrics as
// ISO dates and a comma-separated metric list, response shape
// { totals: { sent, delivered, opened, clicked, open_rate, click_rate, ... } }).
// Not wrapped by the installed `resend` npm SDK (6.27.0 has no metrics
// method as of writing), so this calls the REST endpoint directly with
// `fetch`, following lib/bluesky.ts's existing best-effort convention for
// optional external services: unconfigured or unreachable degrades to
// `null`, never a thrown error.

export type EmailMetricsTotals = {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  openRate: number | null;
  clickRate: number | null;
};

/** Defensively parses Resend's /emails/metrics response into our own
 * shape. This is an external API's JSON, not a type-checked SDK return
 * value — anything missing or unexpected coerces to a safe default (0 for
 * counts, null for rates) rather than throwing, so a malformed or
 * evolving response degrades one dashboard card instead of crashing the
 * whole admin page. */
export function parseEmailMetricsResponse(json: unknown): EmailMetricsTotals | null {
  if (typeof json !== "object" || json === null) return null;
  const totals = (json as Record<string, unknown>).totals;
  if (typeof totals !== "object" || totals === null) return null;
  const t = totals as Record<string, unknown>;

  const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const rate = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  return {
    sent: count(t.sent),
    delivered: count(t.delivered),
    opened: count(t.opened),
    clicked: count(t.clicked),
    openRate: rate(t.open_rate),
    clickRate: rate(t.click_rate),
  };
}

const RESEND_METRICS_URL = "https://api.resend.com/emails/metrics";

/** Fetches account-level email engagement totals for the last `days`
 * days. Returns `null` (never throws) when RESEND_API_KEY isn't
 * configured, the request fails, or the response can't be parsed — the
 * admin page renders "unavailable" for that card rather than crashing. */
export async function getEmailMetrics(
  days: number,
  now: Date = new Date()
): Promise<EmailMetricsTotals | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  const endDate = now.toISOString().slice(0, 10);
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  try {
    const url = new URL(RESEND_METRICS_URL);
    url.searchParams.set("start_date", startDate);
    url.searchParams.set("end_date", endDate);
    url.searchParams.set("metrics", "sent,delivered,opened,clicked,open_rate,click_rate");

    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) {
      console.error(`[curio:resend-metrics] request failed with status ${res.status}`);
      return null;
    }
    return parseEmailMetricsResponse(await res.json());
  } catch (err) {
    console.error("[curio:resend-metrics] fetch failed:", err);
    return null;
  }
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `npx vitest run lib/resendMetrics.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/resendMetrics.ts lib/resendMetrics.test.ts
git commit -m "feat: add best-effort email engagement metrics from Resend"
```

---

### Task 6: The `/admin` route and dashboard UI

**Files:**
- Create: `components/AdminDashboard.tsx`
- Create: `app/admin/page.tsx`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `auth` from `@/lib/auth`; `getAllSubscriberRecords` from `@/lib/db`; `getAllUserActivity`, `getFavoritesSummary`, `getAllPlayStates` from `@/lib/userData`; `getEmailMetrics` from `@/lib/resendMetrics`; `bucketDatesByDay`, `cumulativeGrowth`, `summarizePuzzleEngagement`, `computeRollingRetention` from `@/lib/adminStats` — every one of these already exists after Tasks 1-5.
- Also reuses (in `AdminDashboard.tsx`): `pluralize`, `capitalize`, `WIDE_DOT`, `formatShortDate` from `@/lib/collection`, for consistent number/date formatting with the rest of the app.

The component is written before the route below so the build is never in a broken intermediate state within this task.

- [ ] **Step 1: Document `ADMIN_EMAIL` in `.env.example`**

Add to `.env.example`, after the `AUTH_SECRET` block:

```
# Email address allowed to view /admin (the analytics portal). Must match
# a signed-in account's email exactly. Leave unset to lock /admin out
# entirely (every signed-in visitor gets redirected away).
ADMIN_EMAIL=
```

- [ ] **Step 2: Create `components/AdminDashboard.tsx`**

```tsx
import type { CumulativeCount, PuzzleEngagementSummary, RetentionResult } from "@/lib/adminStats";
import type { EmailMetricsTotals } from "@/lib/resendMetrics";
import { pluralize, capitalize, WIDE_DOT, formatShortDate } from "@/lib/collection";

type Props = {
  subscriberCount: number;
  accountCount: number;
  subscriberGrowth: CumulativeCount[];
  accountGrowth: CumulativeCount[];
  favorites: { accountsWithFavorites: number; totalFavorites: number };
  puzzleEngagement: PuzzleEngagementSummary;
  retention: { day1: RetentionResult; day7: RetentionResult; day30: RetentionResult };
  emailMetrics7d: EmailMetricsTotals | null;
  emailMetrics30d: EmailMetricsTotals | null;
};

export default function AdminDashboard({
  subscriberCount,
  accountCount,
  subscriberGrowth,
  accountGrowth,
  favorites,
  puzzleEngagement,
  retention,
  emailMetrics7d,
  emailMetrics30d,
}: Props) {
  return (
    <div className="mx-auto max-w-[720px] px-5 pt-[30px] pb-[60px]">
      <h1 className="font-serif text-[32px] leading-[1.05] font-normal tracking-[-0.015em]">
        Analytics
      </h1>
      <p className="mt-2 font-sans text-[10.5px] tracking-[0.12em] text-ink-soft uppercase">
        {subscriberCount} {pluralize(subscriberCount, "subscriber")}
        {WIDE_DOT}
        {accountCount} {pluralize(accountCount, "account")}
      </p>

      <Section title="Growth">
        <GrowthTable label="Subscribers" rows={subscriberGrowth} />
        <div className="mt-6">
          <GrowthTable label="Accounts" rows={accountGrowth} />
        </div>
      </Section>

      <Section title="Retention">
        <p className="font-serif text-[13.5px] leading-[1.5] text-ink-soft italic">
          Of accounts old enough to qualify, the share active within the window — see this
          plan&rsquo;s Flagged Decision A for why this isn&rsquo;t a fixed-cohort chart.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <RetentionTile label="1-day" result={retention.day1} />
          <RetentionTile label="7-day" result={retention.day7} />
          <RetentionTile label="30-day" result={retention.day30} />
        </div>
      </Section>

      <Section title="Engagement">
        <StatRow
          label="Accounts with a favorite"
          value={`${favorites.accountsWithFavorites} (${favorites.totalFavorites} total)`}
        />
        <StatRow label="Puzzle plays" value={`${puzzleEngagement.totalPlays}`} />
        <StatRow label="Puzzles solved" value={`${puzzleEngagement.solved}`} />
        <StatRow label="Puzzles failed" value={`${puzzleEngagement.failed}`} />
        <StatRow label="Puzzles in progress" value={`${puzzleEngagement.inProgress}`} />
        {puzzleEngagement.totalPlays > 0 && (
          <div className="mt-3 flex h-[24px] gap-[2px]">
            {puzzleEngagement.histogram.map((count, i) => (
              <div
                key={i}
                title={i < 3 ? `Solved on clue ${i + 1}: ${count}` : `Failed: ${count}`}
                style={{ flexGrow: count || 0.02, flexShrink: 1, flexBasis: 0 }}
                className={i === 3 ? "bg-ink-soft/40" : "bg-accent"}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title="Daily email">
        <div className="grid grid-cols-2 gap-6">
          <EmailMetricsCard label="Last 7 days" metrics={emailMetrics7d} />
          <EmailMetricsCard label="Last 30 days" metrics={emailMetrics30d} />
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-[36px] border-t border-line pt-[24px]">
      <h2 className="font-serif text-[18px] italic">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-t border-line py-2 first:border-t-0">
      <span className="font-sans text-[11px] tracking-[0.06em] text-ink-soft">{label}</span>
      <span className="font-serif text-[15px]">{value}</span>
    </div>
  );
}

function GrowthTable({ label, rows }: { label: string; rows: CumulativeCount[] }) {
  const recent = rows.slice(-14); // most recent 14 days with any signups
  return (
    <div>
      <h3 className="font-sans text-[9.5px] tracking-[0.18em] text-ink-soft uppercase">{label}</h3>
      {recent.length === 0 ? (
        <p className="mt-2 font-serif text-[13.5px] text-ink-soft italic">No signups yet.</p>
      ) : (
        <div className="mt-2">
          {recent.map((row) => (
            <div
              key={row.date}
              className="flex items-baseline justify-between border-t border-line py-1.5 first:border-t-0"
            >
              <span className="font-sans text-[10.5px] tracking-[0.06em] text-ink-soft">
                {formatShortDate(row.date)}
              </span>
              <span className="font-serif text-[13px]">{row.total} total</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RetentionTile({ label, result }: { label: string; result: RetentionResult }) {
  return (
    <div className="border border-line px-3 py-3 text-center">
      <div className="font-sans text-[9px] tracking-[0.12em] text-ink-soft uppercase">{label}</div>
      <div className="mt-1 font-serif text-[22px]">
        {result.rate === null ? (
          <span className="text-[13px] text-ink-soft italic">Not enough data</span>
        ) : (
          `${Math.round(result.rate * 100)}%`
        )}
      </div>
      {result.rate !== null && (
        <div className="mt-0.5 font-sans text-[9px] text-ink-soft">
          {result.active} / {result.eligible}
        </div>
      )}
    </div>
  );
}

function EmailMetricsCard({ label, metrics }: { label: string; metrics: EmailMetricsTotals | null }) {
  return (
    <div>
      <h3 className="font-sans text-[9.5px] tracking-[0.18em] text-ink-soft uppercase">{label}</h3>
      {metrics === null ? (
        <p className="mt-2 font-serif text-[13.5px] text-ink-soft italic">
          {capitalize("email metrics unavailable.")}
        </p>
      ) : (
        <div className="mt-2">
          <StatRow label="Sent" value={`${metrics.sent}`} />
          <StatRow label="Delivered" value={`${metrics.delivered}`} />
          <StatRow
            label="Opened"
            value={metrics.openRate === null ? `${metrics.opened}` : `${metrics.opened} (${metrics.openRate.toFixed(1)}%)`}
          />
          <StatRow
            label="Clicked"
            value={metrics.clickRate === null ? `${metrics.clicked}` : `${metrics.clicked} (${metrics.clickRate.toFixed(1)}%)`}
          />
        </div>
      )}
    </div>
  );
}
```

(`CumulativeCount`, `PuzzleEngagementSummary`, and `RetentionResult` are already exported from `lib/adminStats.ts` from Tasks 1, 3, 4 above; `EmailMetricsTotals` is already exported from `lib/resendMetrics.ts` from Task 5 — nothing further needed for the types this component imports.)

- [ ] **Step 3: Create `app/admin/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAllSubscriberRecords } from "@/lib/db";
import { getAllUserActivity, getFavoritesSummary, getAllPlayStates } from "@/lib/userData";
import { getEmailMetrics } from "@/lib/resendMetrics";
import {
  bucketDatesByDay,
  cumulativeGrowth,
  summarizePuzzleEngagement,
  computeRollingRetention,
} from "@/lib/adminStats";
import AdminDashboard from "@/components/AdminDashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin — Curio" };

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // No distinguishing error for a signed-in-but-wrong-email visitor — a
  // plain redirect home doesn't confirm this page exists at all.
  if (!session.user.email || session.user.email !== process.env.ADMIN_EMAIL) redirect("/");

  const now = new Date();
  const [subscribers, userActivity, favorites, playStates, emailMetrics7d, emailMetrics30d] =
    await Promise.all([
      getAllSubscriberRecords(),
      getAllUserActivity(),
      getFavoritesSummary(),
      getAllPlayStates(),
      getEmailMetrics(7, now),
      getEmailMetrics(30, now),
    ]);

  const subscriberGrowth = cumulativeGrowth(
    bucketDatesByDay(subscribers.map((s) => s.createdAt.slice(0, 10)))
  );
  const accountGrowth = cumulativeGrowth(bucketDatesByDay(userActivity.map((u) => u.joinedAt)));
  const puzzleEngagement = summarizePuzzleEngagement(playStates);
  const retention = {
    day1: computeRollingRetention(userActivity, 1, now),
    day7: computeRollingRetention(userActivity, 7, now),
    day30: computeRollingRetention(userActivity, 30, now),
  };

  return (
    <AdminDashboard
      subscriberCount={subscribers.length}
      accountCount={userActivity.length}
      subscriberGrowth={subscriberGrowth}
      accountGrowth={accountGrowth}
      favorites={favorites}
      puzzleEngagement={puzzleEngagement}
      retention={retention}
      emailMetrics7d={emailMetrics7d}
      emailMetrics30d={emailMetrics30d}
    />
  );
}
```

- [ ] **Step 4: Run the full verification pass**

Run: `npm run lint`
Expected: 0 errors (the same 2 pre-existing warnings from before this plan — `lib/puzzle.test.ts` and `scripts/approveDraft.test.ts` — and nothing new).

Run: `npx vitest run`
Expected: every test passes (the full suite, including every test added in Tasks 1, 3, 4, 5 of this plan).

Run: `npm run build`
Expected: builds cleanly. `/admin` appears in the route list as dynamic (`ƒ`), matching the `export const dynamic = "force-dynamic"` set above.

- [ ] **Step 5: Commit**

```bash
git add app/admin/page.tsx components/AdminDashboard.tsx .env.example
git commit -m "feat: add the gated /admin analytics dashboard"
```

---

## After merging

Set `ADMIN_EMAIL` in Vercel's project Environment Variables (Production) to the account email you'll sign in with — without it, `/admin` redirects everyone away, including you. This is a plain, non-sensitive env var (not a secret to protect), matching this codebase's existing `.env.example` conventions.

Retention numbers will read "Not enough data" for every window until the first accounts cross the 1/7/30-day age thresholds from whenever this ships — there's no historical `lastSeen` data to backfill (Flagged Decision A). Check back in a week for the 7-day numbers to mean anything.
