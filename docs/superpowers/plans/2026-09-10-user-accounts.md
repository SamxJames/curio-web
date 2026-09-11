# User Accounts, Server-Synced Favorites & Personalized Word Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add passwordless magic-link accounts to curio-web so signed-in users get their favorites and history synced server-side (not just in one browser's localStorage) and each account sees its own personally-shuffled word order instead of the shared calendar-based word-of-the-day — while leaving the existing anonymous email-subscribe flow untouched for people who don't want an account.

**Architecture:** Auth.js v5 (`next-auth@5.0.0-beta.32`) handles sign-in via its built-in Resend email provider (magic links, reusing the Resend integration curio-web already has) and persists users/sessions in the same Upstash Redis instance already used for anonymous subscribers, via `@auth/upstash-redis-adapter`, namespaced under its own key prefix so it can't collide with the existing `curio:subscriber:`/`curio:hour:` keys. A new `lib/userData.ts` module stores each account's join date (to anchor their personal word rotation) and their favorited slugs as a Redis Set. Word personalization is pure, dependency-free logic added to `lib/words.ts`: a deterministic seeded shuffle of the fixed word list, keyed by the account's user id, advanced one word per day since the account's join date — no new word content, no per-user Redis writes needed for the ordering itself (only the join-date anchor is persisted). Favorites stay in `localStorage` as the fast local cache for every visitor (signed in or not); for signed-in users, toggling a favorite also fires a background sync to the account, and a small client component reconciles local vs. account state once per sign-in (pulling account favorites down, and — the first time only — offering to push up whatever was already favorited on that browser before the account existed).

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4, `@upstash/redis` (already in use), Resend (already in use), `next-auth@5.0.0-beta.32`, `@auth/upstash-redis-adapter@2.11.3`, Vitest 5 (new — this project has no test runner yet).

**Spec:** No separate written spec. Requirements were gathered via clarifying questions in conversation; the decisions that resulted are captured in Global Constraints below, and each task cites which decision it implements.

## Global Constraints

- Stay on free tiers throughout: Vercel Hobby, Upstash free tier, Resend free tier. No paid upgrades, no new paid services.
- The existing anonymous email-subscribe flow (`app/api/subscribe/route.ts`, `app/api/unsubscribe/route.ts`, `app/api/cron/send-daily/route.ts`, `lib/db.ts`) must keep working exactly as it does today, unmodified in behavior — creating an account is optional, not required to receive the daily email. (Decision: keep anonymous subscribe.)
- New Redis keys must never collide with the existing `curio:subscriber:` / `curio:hour:` keys. Auth.js's own data goes under `curio:auth:` (via the adapter's `baseKeyPrefix` option); this app's own per-user data goes under `curio:user:<id>:...`.
- Local dev without `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` set must keep working for anonymous browsing, exactly as it does today (matches the existing `usingLocalFallback` pattern in `lib/db.ts`). Sign-in simply won't function without Upstash configured, and must fail with a clear error rather than crashing the whole app.
- Match the existing code style: short doc comments explaining *why* above non-obvious code (see `lib/db.ts`, `lib/email.ts`, `lib/words.ts`), and the existing Tailwind design tokens (`bg-paper`, `text-ink`, `text-ink-soft`, `text-ink-faint`, `bg-accent`, `border-line`, `text-danger`, `font-serif`, `font-sans`) — no new colors or fonts.
- Package manager is npm (`package-lock.json` is committed). Don't introduce yarn/pnpm lockfiles.
- Personalized word order (Decision: per-user shuffled order, one word per day from signup) applies **only to signed-in accounts**, shown on the website (`/` and `/history`). Anonymous visitors and anonymous email subscribers keep seeing the shared calendar-based word-of-the-day exactly as today — extending personalization to the daily *email* for accounts is out of scope for this plan (noted as a follow-up in Task 8).
- Deploy process matches what's already established for this project: `vercel deploy --prod` from `curio-web/`, new env vars set one at a time via `vercel env add <NAME> production`.

---

## File Structure

New files:
- `lib/redis.ts` — the one shared Upstash Redis client + `usingUpstash` flag, extracted so `lib/db.ts`, `lib/auth.ts`, and `lib/userData.ts` don't each duplicate the same env-var check and client construction.
- `lib/userData.ts` — server-side per-account data: join date (for personalized word anchoring) and favorited slugs (Redis Set), plus the one-time local→account favorites import.
- `lib/words.test.ts` — Vitest unit tests for the new pure word-ordering functions.
- `vitest.config.ts` — minimal Vitest config (this project has no test runner today).
- `lib/auth.ts` — Auth.js v5 configuration (`NextAuth()` call), exporting `auth`, `signIn`, `signOut`, `handlers`.
- `app/api/auth/[...nextauth]/route.ts` — Auth.js's route handler (`GET`/`POST`).
- `app/login/page.tsx` — magic-link email entry form.
- `app/account/page.tsx` — minimal account page: email, daily-email subscription status, sign-out.
- `app/api/favorites/route.ts` — `GET` (list current account's favorite slugs) / `POST` (toggle one).
- `app/api/account/import-favorites/route.ts` — one-time import of browser-local favorites into the account.
- `components/AccountFavoritesSync.tsx` — client component: on sign-in, pulls account favorites into localStorage and (once per browser) offers to push up local-only ones.

Modified files:
- `lib/db.ts` — use the shared Redis client from `lib/redis.ts`; add `getSubscriberByEmail`.
- `lib/words.ts` — add the seeded per-user shuffle and personalized word/history functions, alongside the existing shared calendar-based ones.
- `lib/storage.ts` — `toggleFavorite` also fires a background sync to the account when signed in; new `mergeFavoritesFromAccount` export.
- `app/layout.tsx` — wrap the app in `next-auth/react`'s `SessionProvider`; mount `AccountFavoritesSync`.
- `components/Header.tsx` — show "Sign in" or an "Account" link depending on session state.
- `app/page.tsx` — show the signed-in user's personalized word when there is one, else the shared word-of-the-day.
- `app/history/page.tsx` — same branching for the history list.
- `.env.example` — document the new `AUTH_SECRET` variable.
- `package.json` — new dependencies + a `test` script.

---

### Task 1: Shared Redis client

**Files:**
- Create: `lib/redis.ts`
- Modify: `lib/db.ts:1-22`, `lib/db.ts:100`

**Interfaces:**
- Produces: `redis: Redis | null` (the `@upstash/redis` client, or `null` when Upstash isn't configured), `usingUpstash: boolean` — both consumed by every later task's Redis-backed module (`lib/db.ts`, `lib/auth.ts`, `lib/userData.ts`).

- [ ] **Step 1: Create `lib/redis.ts`**

```ts
import { Redis } from "@upstash/redis";

export const usingUpstash =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

/** Shared Upstash Redis client for every server-side data module (anonymous
 * subscribers, accounts, sessions, favorites). `null` when Upstash isn't
 * configured — callers fall back to their own local-only behavior, matching
 * the pattern this file replaces in lib/db.ts. */
export const redis = usingUpstash
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;
```

- [ ] **Step 2: Point `lib/db.ts` at the shared client**

Replace `lib/db.ts` lines 1-22 (the `Redis` import through the `redis`/`useUpstash` construction):

```ts
import { Redis } from "@upstash/redis";
import { promises as fs } from "fs";
import path from "path";

export type Subscriber = {
  email: string;
  hour: number; // 0-23, in UTC
  createdAt: string;
};

const HOUR_INDEX_PREFIX = "curio:hour:"; // set of emails, per UTC hour
const SUBSCRIBER_PREFIX = "curio:subscriber:"; // hash, keyed by email

const useUpstash =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = useUpstash
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;
```

with:

```ts
import { promises as fs } from "fs";
import path from "path";
import { redis, usingUpstash } from "./redis";

export type Subscriber = {
  email: string;
  hour: number; // 0-23, in UTC
  createdAt: string;
};

const HOUR_INDEX_PREFIX = "curio:hour:"; // set of emails, per UTC hour
const SUBSCRIBER_PREFIX = "curio:subscriber:"; // hash, keyed by email
```

Everything below this point in `lib/db.ts` already refers to `redis` by name, so no other changes are needed in the body of the file.

- [ ] **Step 3: Update the `usingLocalFallback` export**

Change line 100 (near the bottom of `lib/db.ts`) from:

```ts
export const usingLocalFallback = !useUpstash;
```

to:

```ts
export const usingLocalFallback = !usingUpstash;
```

- [ ] **Step 4: Verify no regression**

```bash
npm run build
```

Expected: builds successfully, same route list as before.

Then, with the dev server running (`npm run dev`), confirm the existing subscribe flow still works:

```bash
curl -s -w "\n%{http_code}\n" -X POST http://localhost:3000/api/subscribe \
  -H "Content-Type: application/json" \
  -d '{"email":"redis-refactor-check@example.com","hour":9}'
```

Expected: `{"ok":true}` and `200` — identical to before this change.

- [ ] **Step 5: Commit**

```bash
git add lib/redis.ts lib/db.ts
git commit -m "refactor: extract shared Redis client to lib/redis.ts"
```

---

### Task 2: Personalized word-ordering logic (pure functions, TDD)

**Files:**
- Create: `vitest.config.ts`
- Create: `lib/words.test.ts`
- Modify: `lib/words.ts` (append new exports; existing exports untouched)
- Modify: `package.json` (add `vitest` devDependency + `test` script)

**Interfaces:**
- Consumes: `WORDS`, `WordEntry`, `HistoryDay`, `DAY_MS` — all already defined in `lib/words.ts`.
- Produces: `getPersonalOrder(userId: string): WordEntry[]`, `getWordForUser(userId: string, joinedAt: Date, today?: Date): WordEntry`, `getHistoryForUser(userId: string, joinedAt: Date, today?: Date): HistoryDay[]` — consumed by Task 4 (`app/page.tsx`, `app/history/page.tsx`).

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest@^5.0.0
```

- [ ] **Step 2: Add `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 3: Add the `test` script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 4: Write the failing tests**

Create `lib/words.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { WORDS, getPersonalOrder, getWordForUser, getHistoryForUser } from "./words";

describe("getPersonalOrder", () => {
  it("is deterministic for the same user id", () => {
    const a = getPersonalOrder("user-1").map((w) => w.slug);
    const b = getPersonalOrder("user-1").map((w) => w.slug);
    expect(a).toEqual(b);
  });

  it("is a permutation of the full word list", () => {
    const order = getPersonalOrder("user-1").map((w) => w.slug);
    expect(order.slice().sort()).toEqual(WORDS.map((w) => w.slug).sort());
  });

  it("differs between different user ids", () => {
    const a = getPersonalOrder("user-1").map((w) => w.slug);
    const b = getPersonalOrder("some-other-user").map((w) => w.slug);
    expect(a).not.toEqual(b);
  });
});

describe("getWordForUser", () => {
  it("returns the first word in the user's order on their join day", () => {
    const joinedAt = new Date("2026-01-01T00:00:00Z");
    const order = getPersonalOrder("user-1");
    expect(getWordForUser("user-1", joinedAt, joinedAt)).toEqual(order[0]);
  });

  it("advances one word per day", () => {
    const joinedAt = new Date("2026-01-01T00:00:00Z");
    const dayTwo = new Date("2026-01-02T00:00:00Z");
    const order = getPersonalOrder("user-1");
    expect(getWordForUser("user-1", joinedAt, dayTwo)).toEqual(order[1]);
  });

  it("wraps around after the full list length", () => {
    const joinedAt = new Date("2026-01-01T00:00:00Z");
    const wrapDay = new Date(joinedAt.getTime() + WORDS.length * 24 * 60 * 60 * 1000);
    const order = getPersonalOrder("user-1");
    expect(getWordForUser("user-1", joinedAt, wrapDay)).toEqual(order[0]);
  });
});

describe("getHistoryForUser", () => {
  it("returns one entry per day since joining, most recent first", () => {
    const joinedAt = new Date("2026-01-01T00:00:00Z");
    const today = new Date("2026-01-03T00:00:00Z");
    const history = getHistoryForUser("user-1", joinedAt, today);
    expect(history.map((d) => d.date)).toEqual(["2026-01-03", "2026-01-02", "2026-01-01"]);
  });

  it("matches getWordForUser for each day", () => {
    const joinedAt = new Date("2026-01-01T00:00:00Z");
    const today = new Date("2026-01-05T00:00:00Z");
    const history = getHistoryForUser("user-1", joinedAt, today);
    for (const day of history) {
      const expected = getWordForUser("user-1", joinedAt, new Date(day.date + "T00:00:00Z"));
      expect(day.word).toEqual(expected);
    }
  });
});
```

- [ ] **Step 5: Run the tests and confirm they fail**

```bash
npx vitest run lib/words.test.ts
```

Expected: fails to even run — `getPersonalOrder`/`getWordForUser`/`getHistoryForUser` are not exported from `lib/words.ts` yet.

- [ ] **Step 6: Implement the functions**

Append to the end of `lib/words.ts` (after the existing `getHistory` function):

```ts
/** Simple deterministic string hash (djb2 variant) → 32-bit unsigned int.
 * Doesn't need to be cryptographically strong, just a stable per-user seed
 * so the same account always gets the same shuffle back. */
function hashSeed(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

/** Mulberry32 — a small, fast, deterministic PRNG for a given seed. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic per-account shuffle of WORDS (Fisher-Yates driven by a
 * seeded PRNG) — every account gets its own fixed order, and the same
 * account always gets the same order back. */
export function getPersonalOrder(userId: string): WordEntry[] {
  const rand = mulberry32(hashSeed(userId));
  const order = [...WORDS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function daysBetweenUtcMidnights(start: Date, end: Date): number {
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.floor((endUtc - startUtc) / DAY_MS);
}

/** Personalized word-of-the-day for a signed-in account: same rotation
 * length as the shared list, shuffled per account, anchored to their join
 * date instead of the global calendar anchor used by getWordForDate. */
export function getWordForUser(userId: string, joinedAt: Date, today: Date = new Date()): WordEntry {
  const order = getPersonalOrder(userId);
  const dayIndex = daysBetweenUtcMidnights(joinedAt, today);
  const idx = ((dayIndex % order.length) + order.length) % order.length;
  return order[idx];
}

/** Every day from a user's join date through today, most recent first,
 * using their personal word order instead of the shared calendar mapping. */
export function getHistoryForUser(
  userId: string,
  joinedAt: Date,
  today: Date = new Date()
): HistoryDay[] {
  const order = getPersonalOrder(userId);
  const totalDays = daysBetweenUtcMidnights(joinedAt, today);
  const joinedUtcMidnight = Date.UTC(
    joinedAt.getUTCFullYear(),
    joinedAt.getUTCMonth(),
    joinedAt.getUTCDate()
  );
  const days: HistoryDay[] = [];
  for (let i = totalDays; i >= 0; i--) {
    const d = new Date(joinedUtcMidnight + i * DAY_MS);
    const idx = ((i % order.length) + order.length) % order.length;
    days.push({ date: d.toISOString().slice(0, 10), word: order[idx] });
  }
  return days;
}
```

- [ ] **Step 7: Run the tests and confirm they pass**

```bash
npx vitest run lib/words.test.ts
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts lib/words.test.ts lib/words.ts package.json package-lock.json
git commit -m "feat: add per-account personalized word ordering"
```

---

### Task 3: Auth.js setup — magic-link sign-in + join-date tracking

**Files:**
- Create: `lib/auth.ts`
- Create: `app/api/auth/[...nextauth]/route.ts`
- Create: `lib/userData.ts` (join-date tracking only — favorites come in Task 6)
- Modify: `lib/db.ts` (add `getSubscriberByEmail`)
- Modify: `.env.example`
- Modify: `package.json` (new dependencies)

**Interfaces:**
- Consumes: `redis`, `usingUpstash` from `lib/redis.ts` (Task 1).
- Produces: `auth(): Promise<Session | null>`, `signIn`, `signOut`, `handlers` from `lib/auth.ts` — consumed by Task 4 (personalized pages), Task 5 (sign-in UI), Task 6 (favorites API). `recordUserJoined(userId: string, date?: Date): Promise<void>`, `getUserJoinedAt(userId: string): Promise<string | null>` from `lib/userData.ts` — consumed by Task 4. `getSubscriberByEmail(email: string): Promise<Subscriber | null>` from `lib/db.ts` — consumed by Task 5's account page.

- [ ] **Step 1: Install dependencies**

```bash
npm install next-auth@5.0.0-beta.32 @auth/upstash-redis-adapter@2.11.3
```

- [ ] **Step 2: Generate an `AUTH_SECRET` and add it to `.env.local`**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Add the printed value, plus your real Upstash and Resend credentials, to a new `.env.local` in `curio-web/` (already covered by the `.env*` line in `.gitignore`, so this file is never committed):

```
UPSTASH_REDIS_REST_URL=<your value>
UPSTASH_REDIS_REST_TOKEN=<your value>
RESEND_API_KEY=<your value>
CURIO_FROM_EMAIL="Curio <onboarding@resend.dev>"
AUTH_SECRET=<the value just generated>
```

Since Upstash is a real external service, testing sign-in locally reads and writes the same Upstash database as production, just under the `curio:auth:`/`curio:user:` prefixes this plan introduces — that's expected for a low-traffic project, but worth knowing before poking around in it.

- [ ] **Step 3: Document the new variable in `.env.example`**

Add to `.env.example` (after the existing `CRON_SECRET` block):

```
# Secret Auth.js uses to sign session cookies and CSRF tokens. Generate with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
AUTH_SECRET=
```

- [ ] **Step 4: Add `getSubscriberByEmail` to `lib/db.ts`**

Append to `lib/db.ts` (after the existing `getSubscribersForHour` function, before the `usingLocalFallback` export):

```ts
export async function getSubscriberByEmail(email: string): Promise<Subscriber | null> {
  const normalizedEmail = email.trim().toLowerCase();

  if (redis) {
    const existing = await redis.hgetall<Subscriber>(SUBSCRIBER_PREFIX + normalizedEmail);
    return existing?.email ? existing : null;
  }

  const db = await readLocalDb();
  return db[normalizedEmail] ?? null;
}
```

- [ ] **Step 5: Create `lib/userData.ts` (join-date tracking)**

```ts
import { redis } from "./redis";

function joinedKey(userId: string): string {
  return `curio:user:${userId}:joinedAt`;
}

/** Records the UTC calendar date (YYYY-MM-DD) an account was created, used
 * to anchor its personalized word rotation. `nx: true` makes this a no-op
 * if it's ever called twice for the same user (e.g. a duplicate event). */
export async function recordUserJoined(userId: string, date: Date = new Date()): Promise<void> {
  if (!redis) return;
  const dateStr = date.toISOString().slice(0, 10);
  await redis.set(joinedKey(userId), dateStr, { nx: true });
}

/** UTC calendar date (YYYY-MM-DD) the account joined, or null if unknown
 * (Upstash not configured, or the record predates this feature). */
export async function getUserJoinedAt(userId: string): Promise<string | null> {
  if (!redis) return null;
  return redis.get<string>(joinedKey(userId));
}
```

- [ ] **Step 6: Create `lib/auth.ts`**

Auth.js's *default* `session` callback deliberately strips the session down to `{ name, email, image }` before it ever reaches the client — it does **not** include `id`, even with the database strategy (verified against `@auth/core@0.41.3`'s `defaultCallbacks.session`, which explicitly picks only those three fields so a database session's raw fields like the session token never leak to client JS). Every later task in this plan reads `session.user.id`, so this needs its own `session` callback that adds `id` back in — without simply spreading the whole raw session (which would also leak the session token).

```ts
import NextAuth, { type DefaultSession } from "next-auth";
import Resend from "next-auth/providers/resend";
import { UpstashRedisAdapter } from "@auth/upstash-redis-adapter";
import { redis, usingUpstash } from "./redis";
import { recordUserJoined } from "./userData";

// Auth.js's default Session type doesn't carry `id` — every page/route in
// this app needs it, so it's added by the session callback below and the
// type is widened to match here.
declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

/** Accounts require Upstash Redis (the adapter has nowhere else to persist
 * users/sessions). Without it configured, auth() always resolves to no
 * session and any sign-in attempt fails with a clear Auth.js configuration
 * error — the rest of the app (anonymous browsing, email subscribe) keeps
 * working exactly as before, matching lib/db.ts's local-fallback behavior. */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: usingUpstash ? UpstashRedisAdapter(redis!, { baseKeyPrefix: "curio:auth:" }) : undefined,
  session: { strategy: "database" },
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.CURIO_FROM_EMAIL ?? "Curio <onboarding@resend.dev>",
    }),
  ],
  callbacks: {
    // Reproduces the default callback's field selection exactly (see the
    // comment above), plus `id` — deliberately not `...session`, since the
    // raw database session also carries the session token itself.
    session({ session, user }) {
      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        },
        expires: session.expires?.toISOString?.() ?? session.expires,
      };
    },
  },
  events: {
    async createUser({ user }) {
      if (user.id) await recordUserJoined(user.id);
    },
  },
});
```

- [ ] **Step 7: Create the route handler**

`app/api/auth/[...nextauth]/route.ts`:

```ts
export { GET, POST } from "@/lib/auth";
```

- [ ] **Step 8: Verify**

Start the dev server (`npm run dev`) and check the provider list mounts:

```bash
curl -s http://localhost:3000/api/auth/providers
```

Expected: JSON containing a `"resend"` entry with `"type": "email"`.

Then, with `.env.local` populated with real Upstash + Resend credentials, use Auth.js's built-in sign-in page (no custom UI exists yet — that's Task 5) to confirm the whole chain works end to end:

1. Visit `http://localhost:3000/api/auth/signin` in the browser.
2. Submit your own email address.
3. Check the Resend dashboard (or your inbox) for a "Sign in to localhost:3000" email — confirms `RESEND_API_KEY`/`CURIO_FROM_EMAIL` wiring.
4. Click the link. Confirm you land back on the site signed in (no error page).
5. Confirm the join date was recorded — call the Upstash REST API directly:

```bash
curl -s "$UPSTASH_REDIS_REST_URL/keys/curio:user:*:joinedAt" \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN"
```

Expected: one key matching the account you just created, with today's date as its value (`GET` that specific key to see the value: `$UPSTASH_REDIS_REST_URL/get/<key>`).

Also confirm the app doesn't crash without Upstash configured: temporarily rename `.env.local`, restart the dev server, and confirm `/`, `/history`, `/story/quarantine` all still load fine (anonymous browsing unaffected). Restore `.env.local` afterward.

- [ ] **Step 9: Commit**

```bash
git add lib/auth.ts lib/userData.ts lib/db.ts app/api/auth .env.example package.json package-lock.json
git commit -m "feat: add Auth.js magic-link sign-in with Upstash-backed sessions"
```

---

### Task 4: Personalized today's-word and history pages

**Files:**
- Modify: `app/page.tsx` (entire file — small enough to replace wholesale)
- Modify: `app/history/page.tsx` (entire file)

**Interfaces:**
- Consumes: `auth()` (Task 3), `getUserJoinedAt` (Task 3), `getWordForUser`/`getHistoryForUser`/`getTodayWord`/`getHistory` (Task 2 + existing).

- [ ] **Step 1: Update `app/page.tsx`**

Replace the whole file with:

```tsx
import Link from "next/link";
import OnboardingModal from "@/components/OnboardingModal";
import { auth } from "@/lib/auth";
import { getUserJoinedAt } from "@/lib/userData";
import { getTodayWord, getWordForUser } from "@/lib/words";

export default async function TodayPage() {
  const session = await auth();
  const joinedAtStr = session?.user?.id ? await getUserJoinedAt(session.user.id) : null;
  const word =
    session?.user?.id && joinedAtStr
      ? getWordForUser(session.user.id, new Date(joinedAtStr + "T00:00:00Z"))
      : getTodayWord();

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <OnboardingModal />
      <section className="mx-auto flex max-w-[640px] flex-col items-start px-6 py-20">
        <p className="font-sans text-xs tracking-wide text-ink-faint">{today}</p>

        <h1 className="mt-6 font-serif text-6xl leading-none sm:text-7xl">
          {word.word}
        </h1>
        <p className="mt-4 font-sans text-sm text-ink-soft">
          {word.respelling} &middot; {word.partOfSpeech}
        </p>

        <p className="mt-8 max-w-[46ch] font-serif text-lg leading-relaxed text-ink-soft">
          {word.origin}
        </p>

        <Link
          href={`/story/${word.slug}`}
          className="mt-10 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90"
        >
          Read the full story
        </Link>
      </section>
    </>
  );
}
```

- [ ] **Step 2: Update `app/history/page.tsx`**

Replace the whole file with:

```tsx
import HistoryList from "@/components/HistoryList";
import { auth } from "@/lib/auth";
import { getUserJoinedAt } from "@/lib/userData";
import { getHistory, getHistoryForUser } from "@/lib/words";

export const metadata = { title: "History — Curio" };

export default async function HistoryPage() {
  const session = await auth();
  const joinedAtStr = session?.user?.id ? await getUserJoinedAt(session.user.id) : null;
  const entries =
    session?.user?.id && joinedAtStr
      ? getHistoryForUser(session.user.id, new Date(joinedAtStr + "T00:00:00Z"))
      : getHistory();

  return <HistoryList entries={entries} />;
}
```

- [ ] **Step 3: Verify**

With the dev server running and signed out (or in a private/incognito window), visit `/` and `/history` — confirm they're unchanged from before (shared calendar word-of-the-day).

Signed in (from Task 3's manual sign-in, session cookie still valid), visit `/`:
- Expected: the word shown is `getPersonalOrder(<your user id>)[0]` — i.e. the *first* word in your personal shuffle, since you joined today (day 0).

Visit `/history` signed in: expected exactly one entry (today, day 0), matching the same word.

The rotation actually advancing one word per day, and wrapping around after the full list length, is already covered by Task 2's unit tests (`getWordForUser` "advances one word per day" / "wraps around after the full list length") — no separate manual check of the day-by-day math is needed here. This step only needs to confirm the *wiring* is correct (session → joined date → the right function gets called), which the day-0 check above already does.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx app/history/page.tsx
git commit -m "feat: show personalized word/history to signed-in accounts"
```

---

### Task 5: Sign-in / sign-out UI + minimal account page

**Files:**
- Modify: `app/layout.tsx`
- Modify: `components/Header.tsx`
- Create: `app/login/page.tsx`
- Create: `app/account/page.tsx`

**Interfaces:**
- Consumes: `auth`, `signOut` (server-side, from `lib/auth.ts`), `SessionProvider`, `useSession`, `signIn` (client-side, from `next-auth/react`), `getSubscriberByEmail` (Task 3).

- [ ] **Step 1: Wrap the app in `SessionProvider`**

Replace `app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ThemeInit from "@/components/ThemeInit";
// Self-hosted (not next/font/google) so the app builds without reaching
// fonts.googleapis.com at build time — works the same in dev, CI, and prod.
import "@fontsource/newsreader/400.css";
import "@fontsource/newsreader/500.css";
import "@fontsource/newsreader/600.css";
import "@fontsource/newsreader/400-italic.css";
import "@fontsource/work-sans/400.css";
import "@fontsource/work-sans/500.css";
import "@fontsource/work-sans/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Curio — one word, one story, every day",
  description:
    "A daily word's origin story, delivered once a day. No feed, no firehose — just one word.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await auth();

  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <ThemeInit />
      </head>
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <SessionProvider session={session}>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </SessionProvider>
      </body>
    </html>
  );
}
```

(Task 7 will add one more component inside this `SessionProvider` block.)

- [ ] **Step 2: Update `components/Header.tsx`**

Replace the whole file with:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useSession } from "next-auth/react";
import ThemeToggle from "./ThemeToggle";

const NAV = [
  { href: "/", label: "Today" },
  { href: "/history", label: "History" },
];

export default function Header() {
  const pathname = usePathname();
  const { status } = useSession();

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-[640px] items-center justify-between px-6 py-5">
        <Link href="/" className="font-serif text-lg tracking-tight">
          Curio
        </Link>
        <nav className="flex items-center gap-5">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "text-sm transition-colors",
                  active ? "text-ink" : "text-ink-soft hover:text-ink"
                )}
              >
                {item.label}
              </Link>
            );
          })}
          {status === "authenticated" ? (
            <Link
              href="/account"
              className={clsx(
                "text-sm transition-colors",
                pathname === "/account" ? "text-ink" : "text-ink-soft hover:text-ink"
              )}
            >
              Account
            </Link>
          ) : status === "unauthenticated" ? (
            <Link href="/login" className="text-sm text-ink-soft transition-colors hover:text-ink">
              Sign in
            </Link>
          ) : null}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Create `app/login/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

type Status = "idle" | "submitting" | "sent" | "error";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    const result = await signIn("resend", { email, redirect: false, callbackUrl: "/" });
    setStatus(result?.error ? "error" : "sent");
  }

  if (status === "sent") {
    return (
      <section className="mx-auto max-w-[440px] px-6 py-20">
        <p className="font-sans text-sm text-ink-soft">
          Check {email} for a sign-in link. It expires in 24 hours.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[440px] px-6 py-20">
      <h1 className="font-serif text-3xl">Sign in</h1>
      <p className="mt-3 font-sans text-sm text-ink-soft">
        We&apos;ll email you a link — no password needed.
      </p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-md border border-line bg-transparent px-3 py-2.5 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
        {status === "error" && (
          <p className="font-sans text-sm text-danger">Something went wrong. Try again.</p>
        )}
        <button
          type="submit"
          disabled={status === "submitting"}
          className="w-full rounded-md bg-accent px-4 py-2.5 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {status === "submitting" ? "Sending…" : "Send sign-in link"}
        </button>
      </form>
    </section>
  );
}
```

- [ ] **Step 4: Create `app/account/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { getSubscriberByEmail } from "@/lib/db";

export const metadata = { title: "Account — Curio" };

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const subscriber = session.user.email
    ? await getSubscriberByEmail(session.user.email)
    : null;

  return (
    <section className="mx-auto max-w-[440px] px-6 py-20">
      <h1 className="font-serif text-3xl">Account</h1>
      <p className="mt-3 font-sans text-sm text-ink-soft">{session.user.email}</p>

      <div className="mt-8 border-t border-line pt-6">
        <h2 className="font-sans text-xs tracking-wide text-ink-faint">Daily email</h2>
        <p className="mt-2 font-sans text-sm text-ink-soft">
          {subscriber
            ? `Subscribed — delivered at ${subscriber.hour}:00 UTC.`
            : "Not subscribed. Sign up from the homepage to get it by email."}
        </p>
      </div>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
        className="mt-10"
      >
        <button
          type="submit"
          className="rounded-md border border-line px-4 py-2.5 font-sans text-sm text-ink-soft transition-colors hover:border-accent hover:text-ink cursor-pointer"
        >
          Sign out
        </button>
      </form>
    </section>
  );
}
```

- [ ] **Step 5: Verify**

Fully sign out (clear cookies or open a private window), visit `/`, confirm the header shows "Sign in" instead of "Today / History / Account".

Click "Sign in" → lands on `/login`. Submit your email, confirm the "Check your email" state appears without a page navigation. Check Resend for the email, click the link.

Back on the site: header now shows "Account" instead of "Sign in". Visit `/account`: confirms your email, subscription status (should say "Not subscribed" unless that email is also an anonymous subscriber from before), and a working "Sign out" button that returns you to `/` signed out.

- [ ] **Step 6: Commit**

```bash
git add app/layout.tsx components/Header.tsx app/login app/account
git commit -m "feat: add sign-in/out UI and a minimal account page"
```

---

### Task 6: Server-side favorites store + API routes

**Files:**
- Modify: `lib/userData.ts` (add favorites functions)
- Create: `app/api/favorites/route.ts`

**Interfaces:**
- Consumes: `redis` (Task 1), `auth()` (Task 3).
- Produces: `getUserFavorites(userId: string): Promise<Set<string>>`, `setUserFavorite(userId: string, slug: string, favorited: boolean): Promise<void>`, `importFavoritesOnce(userId: string, slugs: string[]): Promise<boolean>` — consumed by Task 7.

- [ ] **Step 1: Add favorites functions to `lib/userData.ts`**

Append to `lib/userData.ts`:

```ts
function favoritesKey(userId: string): string {
  return `curio:user:${userId}:favorites`;
}

function importedKey(userId: string): string {
  return `curio:user:${userId}:importedLocalFavorites`;
}

export async function getUserFavorites(userId: string): Promise<Set<string>> {
  if (!redis) return new Set();
  const slugs = await redis.smembers(favoritesKey(userId));
  return new Set(slugs);
}

export async function setUserFavorite(
  userId: string,
  slug: string,
  favorited: boolean
): Promise<void> {
  if (!redis) return;
  if (favorited) await redis.sadd(favoritesKey(userId), slug);
  else await redis.srem(favoritesKey(userId), slug);
}

/** One-time import of a browser's pre-account favorites into the account's
 * server-side set. Returns false (and imports nothing) if this account has
 * already gone through an import before, so the client's "import?" prompt
 * can only ever add slugs once per account. */
export async function importFavoritesOnce(userId: string, slugs: string[]): Promise<boolean> {
  if (!redis) return false;
  const firstTime = await redis.set(importedKey(userId), "1", { nx: true });
  if (firstTime === null) return false;
  if (slugs.length > 0) await redis.sadd(favoritesKey(userId), ...slugs);
  return true;
}
```

- [ ] **Step 2: Create `app/api/favorites/route.ts`**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserFavorites, setUserFavorite } from "@/lib/userData";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const favorites = await getUserFavorites(session.user.id);
  return NextResponse.json({ slugs: Array.from(favorites) });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as
    | { slug?: string; favorited?: boolean }
    | null;
  if (!body?.slug || typeof body.favorited !== "boolean") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  await setUserFavorite(session.user.id, body.slug, body.favorited);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verify**

Signed out:

```bash
curl -s -w "\n%{http_code}\n" http://localhost:3000/api/favorites
```

Expected: `{"error":"Not signed in."}` and `401`.

Signed in (from the browser, via `/login` from Task 5): open devtools → Application/Storage → Cookies → copy the value of the `authjs.session-token` cookie (or `__Secure-authjs.session-token` if the dev server happens to be on https). Then:

```bash
curl -s -w "\n%{http_code}\n" http://localhost:3000/api/favorites \
  -H "Cookie: authjs.session-token=<paste value>"
```

Expected: `{"slugs":[]}` and `200` (empty — nothing favorited server-side yet).

```bash
curl -s -w "\n%{http_code}\n" -X POST http://localhost:3000/api/favorites \
  -H "Content-Type: application/json" \
  -H "Cookie: authjs.session-token=<paste value>" \
  -d '{"slug":"quarantine","favorited":true}'
```

Expected: `{"ok":true}` and `200`. Repeat the `GET` — expected `{"slugs":["quarantine"]}`.

- [ ] **Step 4: Commit**

```bash
git add lib/userData.ts app/api/favorites
git commit -m "feat: add server-side favorites store and API"
```

---

### Task 7: Hybrid favorites sync (push on toggle, pull + one-time import on sign-in)

**Files:**
- Modify: `lib/storage.ts`
- Create: `components/AccountFavoritesSync.tsx`
- Create: `app/api/account/import-favorites/route.ts`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `getFavorites`, `writeSet` (existing, in `lib/storage.ts`), `getUserFavorites`, `setUserFavorite`, `importFavoritesOnce` (Task 6).
- Produces: `mergeFavoritesFromAccount(slugs: string[]): void` (new export from `lib/storage.ts`, used only by `AccountFavoritesSync`).

- [ ] **Step 1: Make `toggleFavorite` sync to the account when signed in**

In `lib/storage.ts`, add this import near the top (after the existing imports):

```ts
import { getSession } from "next-auth/react";
```

Add one line (`void syncFavoriteToAccount(...)`) to the existing `toggleFavorite` function, and add two new functions right after it:

```ts
export function toggleFavorite(slug: string): boolean {
  // Copy rather than mutate the cached Set in place — readSet/getFavorites
  // hands out that same cached reference to callers, and mutating a Set
  // that's already been returned as a snapshot would change it without a
  // new reference for useSyncExternalStore to notice.
  const next = new Set(getFavorites());
  const nowFavorited = !next.has(slug);
  if (nowFavorited) next.add(slug);
  else next.delete(slug);
  writeSet(FAVORITES_KEY, next);
  void syncFavoriteToAccount(slug, nowFavorited); // new line — everything above is unchanged
  return nowFavorited;
}

/** Best-effort background sync — local state (written just above) already
 * reflects the toggle regardless of whether this succeeds, so failures are
 * swallowed rather than surfaced. */
async function syncFavoriteToAccount(slug: string, favorited: boolean): Promise<void> {
  try {
    const session = await getSession();
    if (!session?.user) return;
    await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, favorited }),
    });
  } catch {
    // best-effort; nothing to do here
  }
}

/** Pulls account favorites into the local cache — used once per sign-in by
 * AccountFavoritesSync so a second device/browser immediately shows
 * favorites made elsewhere. Only ever adds slugs, never removes any. */
export function mergeFavoritesFromAccount(slugs: string[]): void {
  if (typeof window === "undefined") return;
  const current = getFavorites();
  const merged = new Set(current);
  let changed = false;
  for (const slug of slugs) {
    if (!merged.has(slug)) {
      merged.add(slug);
      changed = true;
    }
  }
  if (changed) writeSet(FAVORITES_KEY, merged);
}
```

- [ ] **Step 2: Create `app/api/account/import-favorites/route.ts`**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { importFavoritesOnce } from "@/lib/userData";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { slugs?: string[] } | null;
  const slugs = Array.isArray(body?.slugs) ? body.slugs.filter((s) => typeof s === "string") : [];
  const imported = await importFavoritesOnce(session.user.id, slugs);
  return NextResponse.json({ imported });
}
```

- [ ] **Step 3: Create `components/AccountFavoritesSync.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { getFavorites, mergeFavoritesFromAccount } from "@/lib/storage";

const OFFERED_KEY = "curio:localImportOffered";

/** Runs once whenever a session appears: pulls the account's server-side
 * favorites down into local storage (so they show up on this device even if
 * it has none locally yet), then — the first time only, per browser —
 * offers to push up any favorites this browser had before the account
 * existed. */
export default function AccountFavoritesSync() {
  const { status } = useSession();
  const [importCandidates, setImportCandidates] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(OFFERED_KEY)) return;

    fetch("/api/favorites")
      .then((res) => (res.ok ? res.json() : { slugs: [] as string[] }))
      .then((data: { slugs: string[] }) => {
        const accountSlugs = new Set(data.slugs);
        mergeFavoritesFromAccount(data.slugs);
        const localOnly = Array.from(getFavorites()).filter((slug) => !accountSlugs.has(slug));
        setImportCandidates(localOnly);
      })
      .catch(() => {});
  }, [status]);

  async function handleImport() {
    await fetch("/api/account/import-favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs: importCandidates }),
    }).catch(() => {});
    window.localStorage.setItem(OFFERED_KEY, "1");
    setDismissed(true);
  }

  function handleSkip() {
    window.localStorage.setItem(OFFERED_KEY, "1");
    setDismissed(true);
  }

  if (dismissed || importCandidates.length === 0) return null;

  const count = importCandidates.length;
  return (
    <div className="border-b border-line bg-paper-raised px-6 py-3">
      <div className="mx-auto flex max-w-[640px] flex-wrap items-center justify-between gap-3">
        <p className="font-sans text-sm text-ink-soft">
          You have {count} favorite{count === 1 ? "" : "s"} saved on this device — import{" "}
          {count === 1 ? "it" : "them"} into your account?
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleSkip}
            className="rounded-full px-3.5 py-1.5 font-sans text-sm text-ink-soft transition-colors hover:text-ink cursor-pointer"
          >
            Skip
          </button>
          <button
            onClick={handleImport}
            className="rounded-full bg-accent px-3.5 py-1.5 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90 cursor-pointer"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Mount it in `app/layout.tsx`**

Inside the `<SessionProvider>` block (added in Task 5), right after `<Header />`:

```tsx
        <SessionProvider session={session}>
          <Header />
          <AccountFavoritesSync />
          <main className="flex-1">{children}</main>
          <Footer />
        </SessionProvider>
```

Add the import at the top of the file:

```tsx
import AccountFavoritesSync from "@/components/AccountFavoritesSync";
```

- [ ] **Step 5: Verify**

In a signed-out browser session, favorite two or three words via `/story/<slug>` or `/history` (local-only, as before this plan). Sign in via `/login`. Confirm:
1. The import banner appears, correctly counting the words just favorited (none of them exist server-side yet, so all are "local-only").
2. Click "Import" — banner disappears. Confirm via the Upstash REST API (`smembers`, same pattern as Task 3's verification) that `curio:user:<id>:favorites` now contains those slugs, and that `curio:user:<id>:importedLocalFavorites` is set.
3. Reload the page — banner does not reappear (the local `curio:localImportOffered` flag prevents it).
4. Favorite one more word while signed in. Confirm (via the Upstash REST API) it shows up in `curio:user:<id>:favorites` immediately.
5. Open a second browser (or a private window signed into the same account) with **no** local favorites. Confirm the favorites from step 2 and step 4 appear there too, and the import banner does *not* appear (there's nothing local-only to offer, since the account already has more favorites than this fresh browser knows about, and it should find zero local-only candidates).

- [ ] **Step 6: Commit**

```bash
git add lib/storage.ts components/AccountFavoritesSync.tsx app/api/account app/layout.tsx
git commit -m "feat: sync favorites between local storage and account"
```

---

### Task 8: Deploy to production

**Files:** none (operational task — env vars + deploy)

**Interfaces:** none

- [ ] **Step 1: Run the full test and build suite locally**

```bash
npm run lint
npx vitest run
npm run build
```

Expected: all three succeed with no errors.

- [ ] **Step 2: Generate a production `AUTH_SECRET` (separate from your local one) and set it**

```bash
cd curio-web
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

```bash
printf '%s' "<value just generated>" | vercel env add AUTH_SECRET production --sensitive --yes
```

- [ ] **Step 3: Deploy**

```bash
vercel deploy --prod
```

- [ ] **Step 4: Smoke test the deployed site**

```bash
for p in / /history /login /account; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://etymology-app-orcin.vercel.app$p")
  echo "$p -> $code"
done
```

Expected: `/`, `/history`, `/login` → `200`. `/account` → `200` as well (it redirects server-side to `/login` when signed out, which itself is a `200`).

```bash
curl -s https://etymology-app-orcin.vercel.app/api/auth/providers
```

Expected: JSON containing the `resend` provider.

- [ ] **Step 5: End-to-end sign-in test against production**

In the browser, visit `https://etymology-app-orcin.vercel.app/login`, sign in with your real email, confirm the email arrives (Resend dashboard), click the link, confirm you land back on the deployed site signed in, and that `/account` shows the right email and subscription status.

- [ ] **Step 6: Note the follow-up this plan deliberately left out**

Record (e.g. in a short note to yourself, or a follow-up plan) that extending the daily *email* digest to send each account's personalized word — rather than only showing it on the website — is a natural next step, but wasn't part of this plan's scope. It would need: a per-account delivery-hour preference (accounts don't have one today; only anonymous subscribers do), and a decision about whether an account's daily email fully replaces the anonymous subscribe flow for that email address or runs alongside it.

- [ ] **Step 7: Commit anything left uncommitted**

```bash
git status --short
```

If clean, nothing to do. Otherwise stage and commit any stray changes (e.g. `.env.example` edits) with a descriptive message.
