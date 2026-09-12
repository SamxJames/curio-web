# Daily Send Fix, Arrival Page, Bluesky Auto-Post & Content Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Fix the daily email digest, which currently silently drops anyone who didn't pick ~9am UTC as their delivery hour, by sending every subscriber the same word at the one cron run the Hobby plan actually allows; (2) replace the homepage's word-plus-a-separate-onboarding-banner pairing with one merged "arrival" hero for first-time anonymous visitors; (3) auto-post the daily word to Bluesky from the same cron run; (4) scaffold (not run) a content pipeline that turns a Wiktextract dump entry into a reviewable draft in Curio's voice, gated on human approval before it ever reaches `lib/words.ts`.

**Architecture:** Phases 1-3 all key off the one existing cron run (`vercel.json`'s `0 9 * * *`, already correct — the bug is in the *code*, which assumes it also runs on the other 23 hours). Phase 1 drops the per-subscriber hour concept from the anonymous flow's read path (`getAllSubscribers` replaces `getSubscribersForHour`); Phase 2 is a client-side branch on the homepage (existing `hasOnboarded` flag decides "first-time visitor," matching the mechanism `OnboardingBanner` already used) with no new tracking system; Phase 3 adds one more `Promise.allSettled` branch to the same cron handler, posting via `@atproto/api`, following this codebase's existing "log instead of send when unconfigured" fallback pattern (`lib/db.ts`, `lib/email.ts`); Phase 4 is three standalone Node scripts (extract → rewrite via the Claude API → human-gated append), writing to a reviewable `content/drafts/` directory that nothing else in the app reads.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4, Vitest 5, `@upstash/redis`, Resend, `next-auth@5.0.0-beta.32`. New for this plan: `@atproto/api` (Bluesky), `tsx` (dev-only, to run the Phase 4 scripts directly), the Anthropic Messages API via plain `fetch` (no SDK — these are one-off scripts, not app runtime code, so a raw `fetch` avoids adding a dependency that never ships in the deployed app).

**Spec:** No separate written spec — requirements come from the user's own message dated 2026-09-12 (four numbered items: fix daily send, arrival page, Bluesky, content pipeline scaffolding), reproduced as this plan's Global Constraints and per-task detail. Two decisions in that message were explicitly left for the plan author to propose and get confirmed before execution — both are called out below and must be confirmed (or amended) before Task 3 / Task 5 run:

- **Flagged decision A (Task 3):** dropping the hour concept also touches `app/account/page.tsx` (it shows/edits the *same* `Subscriber.hour` field the anonymous flow used). This plan's concrete proposal: replace the account page's hour picker with a plain Subscribed/Not-subscribed toggle (no hour choice), delete `HourWheel.tsx`/`AccountHourPicker.tsx`, and stop maintaining the now-unread hour secondary index in `lib/db.ts`. If you'd rather leave the account page's hour picker as decorative-but-harmless, skip Task 3 and keep `getSubscribersForHour` alive unused.
- **Flagged decision B (Task 5):** "first-time visitor" detection reuses the existing `hasOnboarded`/`markOnboarded` flag from `lib/storage.ts` (already the mechanism `OnboardingBanner` used) rather than introducing a new one. The arrival hero is marked "seen" (so later visits show the normal Today page) only on a real interaction — submitting the email capture, or clicking through to the story — not on a bare page view, so someone who reloads mid-read still sees the same arrival page. If you want different first-time semantics, this is the line to change.

## Global Constraints

- Every daily-send subscriber gets the same word at the one cron run — no per-subscriber hour bucketing anywhere in the send path (Decision, item 1).
- The anonymous email-subscribe flow (`SignupForm`, `/api/subscribe`) no longer asks for a delivery hour (Decision, item 1).
- The arrival hero (Phase 2) is shown only to anonymous, not-yet-onboarded visitors on `/`. Signed-in users and anonymous visitors who have already onboarded see today's existing Today content, unchanged (item 2).
- No new Tailwind color tokens. Phase 2's palette (given as hex in the spec) maps onto the existing tokens in `app/globals.css` — `ink`→`ink`, `muted`→`ink-soft`, `accent`→`accent`, `hairline`→`line`, `input fill`→`paper-raised`, `page bg`→`paper` — never hardcoded hex in a component.
- Newsreader for the word/teaser, Work Sans for everything else (item 2) — matches the fonts already loaded in `app/layout.tsx`; the one addition is the 700 weight (`@fontsource/newsreader/700.css`), needed for the arrival hero's bold word display, nothing else changes weight.
- Bluesky posting must follow the existing fallback pattern: unset `BLUESKY_IDENTIFIER`/`BLUESKY_APP_PASSWORD` logs what would have been posted instead of throwing (item 3, matching `lib/db.ts`/`lib/email.ts`).
- Never ask the user for `BLUESKY_APP_PASSWORD` or `ANTHROPIC_API_KEY` values, and never write real credentials into any committed file — `.env.example` gets the variable name and a comment only (item 3).
- Bluesky post text stays within 300 characters (item 3): word + teaser + tracked link, truncating the teaser (never the word or link) if needed.
- The content pipeline (item 4) is scaffolding: it must never write directly to `lib/words.ts` from an unreviewed draft. Every new word entry lands in `content/drafts/<slug>.json` first; a separate, explicitly-invoked script is the only thing that appends an *already-approved* draft to `WORDS`, and it re-runs `lib/words.test.ts`'s invariants (non-empty `teaser` distinct from `origin`, `lineage` ending in `"English"`) before appending.
- The content pipeline must never invent or pad etymology facts. If a Wiktextract entry's extracted facts are thin, the rewrite pass still produces a draft from exactly what's there — it does not skip the entry and does not add unsourced detail (item 4).
- Package manager is npm (`package-lock.json` committed). Don't introduce yarn/pnpm lockfiles.
- Match the existing code style: short doc comments explaining *why* above non-obvious code, existing Tailwind tokens only, existing patterns for Redis fallback and Resend fallback.
- Deploy process matches what's already established: `git push origin master` (Vercel's Git integration auto-deploys `master` to production — confirmed working as of this session), or `vercel deploy --prod` from `curio-web/` as a manual fallback.

---

## File Structure

New files:
- `lib/db.test.ts` — Vitest unit tests for `getAllSubscribers` (local-fallback path).
- `components/ArrivalHero.tsx` — the merged first-visit hero (Phase 2).
- `components/TodayHero.tsx` — today's existing hero content, extracted so `HomeContent` can switch between it and `ArrivalHero`.
- `components/HomeContent.tsx` — client component: decides arrival vs. today, based on session + `hasOnboarded`.
- `lib/bluesky.ts` — `buildBlueskyPost` (pure, tested) + `postDailyWordToBluesky` (fallback-pattern side effect).
- `lib/bluesky.test.ts` — Vitest unit tests for `buildBlueskyPost`'s truncation logic.
- `scripts/extractEtymology.ts` — parses a Wiktextract JSONL dump for one word's raw etymology facts.
- `scripts/extractEtymology.test.ts` — tests against a fixture dump.
- `scripts/__fixtures__/sample-wiktextract.jsonl` — hand-built fixture (a thin entry and a richer one) standing in for a real dump.
- `scripts/rewriteEtymology.ts` — calls the Claude API to turn extracted facts into a Curio-voice draft, writes `content/drafts/<slug>.json`.
- `scripts/rewriteEtymology.test.ts` — tests prompt construction and response validation with the API call mocked (no real API calls in the test suite).
- `scripts/approveDraft.ts` — validates an approved draft against the `WordEntry` invariants and appends it to `lib/words.ts`.
- `scripts/approveDraft.test.ts` — tests the validation logic and the append (against a temp copy of a small word-list fixture, not the real `lib/words.ts`).
- `content/drafts/.gitkeep` — keeps the (initially empty) directory in git.

Modified files:
- `lib/db.ts` — add `getAllSubscribers`; make `upsertSubscriber`'s `hour` parameter optional (default `9`); (Task 3 only) drop `getSubscribersForHour` and the hour secondary index.
- `app/api/cron/send-daily/route.ts` — call `getAllSubscribers()` instead of `getSubscribersForHour(hour)`; add the Bluesky post as a third settled branch alongside the digest sends.
- `components/SignupForm.tsx` — remove `HourWheel`, email-only form.
- `app/api/subscribe/route.ts` — drop hour from request validation.
- `app/page.tsx` — render `HomeContent` instead of the hero JSX directly.
- `components/Header.tsx` — render a reduced (wordmark + theme toggle only) header when `HomeContent` is about to show the arrival hero.
- `.env.example` — document `BLUESKY_IDENTIFIER`, `BLUESKY_APP_PASSWORD`, `ANTHROPIC_API_KEY`.
- `package.json` — add `@atproto/api` (runtime) and `tsx` (dev) dependencies, plus three `content:*` scripts for the Phase 4 tools.

Deleted files:
- `components/OnboardingBanner.tsx`, `components/SignupForm.tsx`'s only caller — superseded by `ArrivalHero` (Phase 2 folds `SignupForm` into `ArrivalHero`'s own compact form, so `SignupForm.tsx` is deleted too; see Task 5).
- (Task 3 only) `components/HourWheel.tsx`, `components/AccountHourPicker.tsx`.

---

### Task 1: Fix the cron bug — send every subscriber, not an hour bucket

**Files:**
- Modify: `lib/db.ts` (add `getAllSubscribers`, after the existing `getSubscribersForHour`)
- Create: `lib/db.test.ts`
- Modify: `app/api/cron/send-daily/route.ts` (whole file)

**Interfaces:**
- Produces: `getAllSubscribers(): Promise<string[]>` — consumed by this task's own route change, and nothing else in this plan.

- [ ] **Step 1: Write the failing test**

Create `lib/db.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { getAllSubscribers, removeSubscriber, upsertSubscriber } from "./db";

// These exercise the local-JSON-fallback path (no Upstash env vars set in
// the test environment), the same path a zero-config `npm run dev` uses —
// see lib/db.ts's own module comment. Every test cleans up the emails it
// wrote so runs don't leak into `.data/subscribers.json` between tests.
describe("getAllSubscribers", () => {
  const testEmails = ["cron-fix-a@example.com", "cron-fix-b@example.com"];

  afterEach(async () => {
    for (const email of testEmails) {
      await removeSubscriber(email);
    }
  });

  it("returns every subscriber regardless of delivery hour", async () => {
    await upsertSubscriber(testEmails[0], 3);
    await upsertSubscriber(testEmails[1], 21);

    const all = await getAllSubscribers();

    expect(all).toEqual(expect.arrayContaining(testEmails));
  });

  it("omits a subscriber after they unsubscribe", async () => {
    await upsertSubscriber(testEmails[0], 9);
    await removeSubscriber(testEmails[0]);

    const all = await getAllSubscribers();

    expect(all).not.toContain(testEmails[0]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx vitest run lib/db.test.ts
```

Expected: fails — `getAllSubscribers` is not exported from `lib/db.ts` yet.

- [ ] **Step 3: Implement `getAllSubscribers`**

Add to `lib/db.ts`, directly after the existing `getSubscribersForHour` function:

```ts
/** Every subscribed email, regardless of the delivery hour they picked (or
 * were defaulted to) — used by the daily cron, which only ever fires once
 * a day on the Hobby plan (see the send-daily route's own comment). The
 * hour-bucketed index (`HOUR_INDEX_PREFIX`) predates that realization and
 * is unused by the send path now; this reads subscriber records directly. */
export async function getAllSubscribers(): Promise<string[]> {
  if (redis) {
    const keys = await redis.keys(`${SUBSCRIBER_PREFIX}*`);
    return keys.map((key) => key.slice(SUBSCRIBER_PREFIX.length));
  }
  const db = await readLocalDb();
  return Object.values(db).map((s) => s.email);
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npx vitest run lib/db.test.ts
```

Expected: both tests pass.

- [ ] **Step 5: Fix the route**

Replace the whole of `app/api/cron/send-daily/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAllSubscribers } from "@/lib/db";
import { sendDailyDigest } from "@/lib/email";
import { getTodayWord } from "@/lib/words";

/** Configured in vercel.json to run once a day at 0 9 * * * (9am UTC) — the
 * Vercel Hobby plan caps cron at once/day, so there is no per-hour bucket
 * to honor here even though Subscriber still carries an `hour` field
 * (vestigial — see lib/db.ts). Every subscriber gets today's word at this
 * one run, regardless of what hour they were ever assigned. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const word = getTodayWord();
  const subscribers = await getAllSubscribers();

  const results = await Promise.allSettled(
    subscribers.map((email) => sendDailyDigest(email, word, now))
  );
  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - sent;

  return NextResponse.json({ word: word.slug, attempted: results.length, sent, failed });
}
```

- [ ] **Step 6: Verify against the dev fallback**

With the dev server running (`npm run dev`), seed a couple of subscribers at different hours and confirm the route now sends to both regardless:

```bash
curl -s -X POST http://localhost:3000/api/subscribe -H "Content-Type: application/json" -d '{"email":"verify-a@example.com","hour":3}'
curl -s -X POST http://localhost:3000/api/subscribe -H "Content-Type: application/json" -d '{"email":"verify-b@example.com","hour":21}'
curl -s http://localhost:3000/api/cron/send-daily
```

Expected: the JSON response's `attempted` is at least 2, and the dev server's console log (no `RESEND_API_KEY` set locally means the dev fallback logs instead of sending — see `lib/email.ts`) shows a `[curio:email:dev-fallback]` line for both `verify-a@example.com` and `verify-b@example.com`, not just whichever was closest to the current hour.

Clean up the two test subscribers:

```bash
curl -s "http://localhost:3000/api/unsubscribe?token=$(node -e "console.log(Buffer.from('verify-a@example.com').toString('base64url'))")" -o /dev/null
curl -s "http://localhost:3000/api/unsubscribe?token=$(node -e "console.log(Buffer.from('verify-b@example.com').toString('base64url'))")" -o /dev/null
```

- [ ] **Step 7: Commit**

```bash
git add lib/db.ts lib/db.test.ts app/api/cron/send-daily/route.ts
git commit -m "fix: daily cron sends every subscriber, not an hour bucket"
```

---

### Task 2: Drop the hour picker from the anonymous subscribe flow

**Files:**
- Modify: `lib/db.ts` (`upsertSubscriber`'s signature only)
- Modify: `components/SignupForm.tsx` (whole file)
- Modify: `app/api/subscribe/route.ts` (whole file)

**Interfaces:**
- Consumes: `upsertSubscriber` (existing, `lib/db.ts`).
- Produces: `upsertSubscriber(email: string, hour?: number)` — the `hour` parameter becomes optional (default `9`, matching the cron's approximate fire time and `AccountHourPicker`'s existing `initialHour` default), so `app/account/page.tsx`'s still-explicit `upsertSubscriber(email, hour)` call keeps working unchanged whether or not Task 3 runs.

- [ ] **Step 1: Make `hour` optional on `upsertSubscriber`**

In `lib/db.ts`, change:

```ts
export async function upsertSubscriber(
  email: string,
  hour: number
): Promise<void> {
```

to:

```ts
export async function upsertSubscriber(
  email: string,
  hour: number = 9
): Promise<void> {
```

- [ ] **Step 2: Simplify `SignupForm`**

Replace the whole of `components/SignupForm.tsx`:

```tsx
"use client";

import { useState } from "react";

type Status = "idle" | "submitting" | "success" | "error";

export default function SignupForm({ onSubscribed }: { onSubscribed?: () => void }) {
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="signup-email" className="mb-2 block font-sans text-xs tracking-wide text-ink-faint">
          Email
        </label>
        <input
          id="signup-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-md border border-line bg-transparent px-3 py-2.5 font-sans text-sm text-ink placeholder:text-ink-faint focus:border-accent"
        />
      </div>

      {status === "error" && <p className="font-sans text-sm text-danger">{errorMessage}</p>}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-md bg-accent px-4 py-2.5 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
      >
        {status === "submitting" ? "Subscribing…" : "Get the daily word"}
      </button>
    </form>
  );
}
```

(This component is superseded by `ArrivalHero` in Task 5 and deleted there — this step keeps it correct and working in the meantime, since Task 5 hasn't run yet and `OnboardingBanner` still renders it.)

- [ ] **Step 3: Drop hour from the subscribe API**

Replace the whole of `app/api/subscribe/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { upsertSubscriber } from "@/lib/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { email } = (body ?? {}) as { email?: string };

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  await upsertSubscriber(email);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Verify**

```bash
npm run build
curl -s -w "\n%{http_code}\n" -X POST http://localhost:3000/api/subscribe \
  -H "Content-Type: application/json" -d '{"email":"no-hour-check@example.com"}'
```

Expected: builds successfully; `{"ok":true}` and `200`. Confirm `app/account/page.tsx` still builds and its `AccountHourPicker` still renders (unaffected — it always passed an explicit `hour`, which the new default doesn't change).

```bash
curl -s "http://localhost:3000/api/unsubscribe?token=$(node -e "console.log(Buffer.from('no-hour-check@example.com').toString('base64url'))")" -o /dev/null
```

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts components/SignupForm.tsx app/api/subscribe/route.ts
git commit -m "feat: drop delivery-hour choice from anonymous subscribe flow"
```

---

### Task 3 (flagged decision A — confirm before running): Simplify the account page's subscription UI to match

**Files:**
- Modify: `app/account/page.tsx` (whole file)
- Modify: `lib/db.ts` (remove `getSubscribersForHour`, `HOUR_INDEX_PREFIX` bookkeeping in `upsertSubscriber`/`removeSubscriber`)
- Delete: `components/HourWheel.tsx`, `components/AccountHourPicker.tsx`

**Interfaces:**
- Consumes: `upsertSubscriber` (Task 2's new default-hour signature), `removeSubscriber`, `getSubscriberByEmail` (all existing, `lib/db.ts`).

- [ ] **Step 1: Remove the hour secondary index from `lib/db.ts`**

Remove the `getSubscribersForHour` function entirely (nothing calls it after Task 1). In `upsertSubscriber`, remove the `HOUR_INDEX_PREFIX` maintenance — change:

```ts
export async function upsertSubscriber(
  email: string,
  hour: number = 9
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const record: Subscriber = {
    email: normalizedEmail,
    hour,
    createdAt: new Date().toISOString(),
  };

  if (redis) {
    const existing = await redis.hgetall<Subscriber>(
      SUBSCRIBER_PREFIX + normalizedEmail
    );
    if (existing?.hour !== undefined && existing.hour !== hour) {
      await redis.srem(HOUR_INDEX_PREFIX + existing.hour, normalizedEmail);
    }
    await redis.hset(SUBSCRIBER_PREFIX + normalizedEmail, { ...record });
    await redis.sadd(HOUR_INDEX_PREFIX + hour, normalizedEmail);
    return;
  }

  const db = await readLocalDb();
  db[normalizedEmail] = record;
  await writeLocalDb(db);
}
```

to:

```ts
export async function upsertSubscriber(
  email: string,
  hour: number = 9
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const record: Subscriber = {
    email: normalizedEmail,
    hour,
    createdAt: new Date().toISOString(),
  };

  if (redis) {
    await redis.hset(SUBSCRIBER_PREFIX + normalizedEmail, { ...record });
    return;
  }

  const db = await readLocalDb();
  db[normalizedEmail] = record;
  await writeLocalDb(db);
}
```

`hour` stays on the `Subscriber` type and record (harmless, and already-written Redis hashes have it) — only the now-unread secondary index (`HOUR_INDEX_PREFIX` sets) stops being maintained. Similarly simplify `removeSubscriber`:

```ts
export async function removeSubscriber(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();

  if (redis) {
    await redis.del(SUBSCRIBER_PREFIX + normalizedEmail);
    return;
  }

  const db = await readLocalDb();
  delete db[normalizedEmail];
  await writeLocalDb(db);
}
```

Delete the now-unused `HOUR_INDEX_PREFIX` constant.

- [ ] **Step 2: Update `lib/db.test.ts`**

`getAllSubscribers`'s tests (Task 1) called `upsertSubscriber(email, hour)` with an explicit hour to prove the fix ignores it — that still works unchanged (the parameter still exists, just optional). No edit needed here; re-run to confirm:

```bash
npx vitest run lib/db.test.ts
```

Expected: still passes (the hour argument is accepted, just no longer indexed).

- [ ] **Step 3: Simplify the account page**

Replace the whole of `app/account/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/lib/auth";
import { getSubscriberByEmail, removeSubscriber, upsertSubscriber } from "@/lib/db";

export const metadata = { title: "Account — Curio" };

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const email = session.user.email;
  const subscriber = email ? await getSubscriberByEmail(email) : null;

  async function subscribe() {
    "use server";
    if (!email) return;
    await upsertSubscriber(email);
    revalidatePath("/account");
  }

  async function unsubscribe() {
    "use server";
    if (!email) return;
    await removeSubscriber(email);
    revalidatePath("/account");
  }

  return (
    <section className="mx-auto max-w-[440px] px-6 py-20">
      <h1 className="font-serif text-3xl">Account</h1>
      <p className="mt-3 font-sans text-sm text-ink-soft">{session.user.email}</p>

      <div className="mt-8 border-t border-line pt-6">
        <h2 className="font-sans text-xs tracking-wide text-ink-faint">Daily email</h2>

        {subscriber ? (
          <>
            <p className="mt-2 font-sans text-sm text-ink-soft">Subscribed — one word a day.</p>
            <form action={unsubscribe} className="mt-3">
              <button
                type="submit"
                className="font-sans text-sm text-ink-faint underline underline-offset-2 transition-colors hover:text-danger cursor-pointer"
              >
                Unsubscribe
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="mt-2 font-sans text-sm text-ink-soft">Not subscribed yet.</p>
            <form action={subscribe} className="mt-3">
              <button
                type="submit"
                className="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90 cursor-pointer"
              >
                Subscribe
              </button>
            </form>
          </>
        )}
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

- [ ] **Step 4: Delete the now-unused components**

```bash
git rm components/HourWheel.tsx components/AccountHourPicker.tsx
```

- [ ] **Step 5: Verify**

```bash
npm run lint
npm run build
```

Expected: both succeed — no remaining imports of `HourWheel`/`AccountHourPicker`/`getSubscribersForHour` anywhere (the build would fail on a dangling import if one were missed).

With the dev server running and signed in (an existing session from an earlier task), visit `/account`: confirm it shows "Not subscribed yet." + a "Subscribe" button (or "Subscribed — one word a day." + "Unsubscribe", if that email already has a subscriber record from earlier manual testing), and that clicking through toggles correctly and persists across a reload.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: simplify account page's daily-email UI to match the dropped hour picker"
```

---

### Task 4: Arrival hero component

**Files:**
- Modify: `app/layout.tsx` (add the 700-weight Newsreader import)
- Create: `components/ArrivalHero.tsx`

**Interfaces:**
- Consumes: `WordEntry` shape (`word`, `respelling`, `partOfSpeech`, `teaser`, `slug` — existing, `lib/words.ts`).
- Produces: `<ArrivalHero word={WordEntry} date={string} />` — consumed by Task 5's `HomeContent`.

- [ ] **Step 1: Add the bold Newsreader weight**

In `app/layout.tsx`, add one line after the existing `@fontsource/newsreader/600.css` import:

```tsx
import "@fontsource/newsreader/600.css";
import "@fontsource/newsreader/700.css";
import "@fontsource/newsreader/400-italic.css";
```

- [ ] **Step 2: Create `components/ArrivalHero.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import type { WordEntry } from "@/lib/words";
import { markOnboarded } from "@/lib/storage";
import ThemeToggle from "./ThemeToggle";

type Status = "idle" | "submitting" | "success" | "error";

/** The merged first-look hero for anonymous, first-time visitors — replaces
 * the old pairing of the plain Today hero plus a separate OnboardingBanner
 * pitch. Marks onboarded (see lib/storage.ts) only on a real interaction —
 * submitting the email, or clicking through to the story — not on a bare
 * page view, so reloading mid-read doesn't prematurely swap to the normal
 * Today page. See components/HomeContent.tsx for how this is chosen. */
export default function ArrivalHero({ word, date }: { word: WordEntry; date: string }) {
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
      markOnboarded();
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-1px)] max-w-[640px] flex-col px-6">
      <div className="flex items-center justify-between py-5">
        <Link href="/" className="font-serif text-lg tracking-tight">
          Curio
        </Link>
        <ThemeToggle />
      </div>

      <div className="flex flex-1 flex-col pt-10 pb-10">
        <p className="font-sans text-[11px] tracking-[0.14em] text-accent uppercase">
          Today&apos;s word &middot; {date}
        </p>

        <h1 className="mt-4 font-serif text-[44px] leading-[1.05] font-bold">{word.word}</h1>
        <p className="mt-3 font-sans text-sm text-ink-soft">
          {word.respelling} &middot; {word.partOfSpeech}
        </p>

        <p className="mt-6 max-w-[46ch] font-serif text-[19px] leading-[1.38] text-ink">
          {word.teaser}
        </p>

        <Link
          href={`/story/${word.slug}`}
          onClick={() => markOnboarded()}
          className="mt-6 inline-flex w-fit font-sans text-sm font-medium text-accent transition-opacity hover:opacity-80"
        >
          Find out more &rarr;
        </Link>

        <div className="flex-1" />

        <div className="border-t border-line pt-8">
          <p className="font-sans text-sm leading-relaxed text-ink-soft">
            One word, one story, every day.
            <br />
            No feed. No backlog to catch up on.
          </p>

          {status === "success" ? (
            <p className="mt-5 font-sans text-sm text-ink-soft">
              You&apos;re in. Your first word arrives tomorrow.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-5 flex gap-2">
              <input
                type="email"
                name="email"
                inputMode="email"
                autoComplete="email"
                required
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
          )}
          {status === "error" && <p className="mt-2 font-sans text-sm text-danger">{errorMessage}</p>}

          <Link
            href="/history"
            onClick={() => markOnboarded()}
            className="mt-6 inline-block font-sans text-xs text-ink-faint transition-colors hover:text-ink-soft"
          >
            Prefer to browse first? See the archive &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify it renders**

There's no route wired up to it yet (Task 5 does that) — confirm it at least type-checks and lints cleanly:

```bash
npm run lint
npx tsc --noEmit
```

Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx components/ArrivalHero.tsx
git commit -m "feat: add ArrivalHero component for first-time visitors"
```

---

### Task 5 (confirm decision B before running): Wire up first-time detection, retire the onboarding banner

**Files:**
- Create: `components/TodayHero.tsx`
- Create: `components/HomeContent.tsx`
- Modify: `app/page.tsx` (whole file)
- Modify: `components/Header.tsx` (whole file)
- Delete: `components/OnboardingBanner.tsx`, `components/SignupForm.tsx`

**Interfaces:**
- Consumes: `ArrivalHero` (Task 4), `useHasOnboarded` (existing, `lib/storage.ts`), `useSession` (existing, `next-auth/react`).
- Produces: `<HomeContent word={WordEntry} date={string} isPersonalized={boolean} />` — consumed only by `app/page.tsx`.

- [ ] **Step 1: Extract the existing hero into `TodayHero`**

Create `components/TodayHero.tsx` with exactly today's current homepage content (moved, not changed):

```tsx
import Link from "next/link";
import EtymologyLineage from "@/components/EtymologyLineage";
import type { WordEntry } from "@/lib/words";

export default function TodayHero({
  word,
  date,
  isPersonalized,
}: {
  word: WordEntry;
  date: string;
  isPersonalized: boolean;
}) {
  return (
    <section className="mx-auto flex max-w-[640px] flex-col items-start px-6 py-20">
      <p className="font-sans text-xs tracking-wide text-ink-faint">
        {isPersonalized ? <>Your word &middot; {date}</> : date}
      </p>

      <h1 className="mt-6 font-serif text-6xl leading-none sm:text-7xl">{word.word}</h1>
      <p className="mt-4 font-sans text-sm text-ink-soft">
        {word.respelling} &middot; {word.partOfSpeech}
      </p>

      <EtymologyLineage lineage={word.lineage} className="mt-3 text-xs" />

      <p className="mt-8 max-w-[46ch] font-serif text-lg leading-relaxed text-ink-soft">
        {word.teaser}
      </p>

      <Link
        href={`/story/${word.slug}`}
        className="mt-10 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90"
      >
        Read the full story
      </Link>
    </section>
  );
}
```

- [ ] **Step 2: Create `HomeContent`**

```tsx
"use client";

import { useSession } from "next-auth/react";
import { useHasOnboarded } from "@/lib/storage";
import type { WordEntry } from "@/lib/words";
import ArrivalHero from "./ArrivalHero";
import TodayHero from "./TodayHero";

/** Decides between the first-time arrival hero and the normal Today hero.
 * `hasOnboarded()`'s pre-hydration snapshot is `true` (see lib/storage.ts),
 * so server-rendered HTML and the first client render both show TodayHero —
 * a genuine first-timer flips to ArrivalHero immediately after hydration,
 * the same one-render-later pattern OnboardingBanner used before it. */
export default function HomeContent({
  word,
  date,
  isPersonalized,
}: {
  word: WordEntry;
  date: string;
  isPersonalized: boolean;
}) {
  const { status } = useSession();
  const onboarded = useHasOnboarded();
  const showArrival = status !== "authenticated" && !onboarded;

  return showArrival ? (
    <ArrivalHero word={word} date={date} />
  ) : (
    <TodayHero word={word} date={date} isPersonalized={isPersonalized} />
  );
}
```

- [ ] **Step 3: Update `app/page.tsx`**

Replace the whole file:

```tsx
import HomeContent from "@/components/HomeContent";
import { auth } from "@/lib/auth";
import { getUserJoinedAt } from "@/lib/userData";
import { getTodayWord, getWordForUser } from "@/lib/words";

export default async function TodayPage() {
  const session = await auth();
  const joinedAtStr = session?.user?.id ? await getUserJoinedAt(session.user.id) : null;
  const isPersonalized = !!joinedAtStr;
  const word = isPersonalized
    ? getWordForUser(session!.user.id, new Date(joinedAtStr! + "T00:00:00Z"))
    : getTodayWord();

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return <HomeContent word={word} date={today} isPersonalized={isPersonalized} />;
}
```

- [ ] **Step 4: Reduce the header for the arrival state**

Replace the whole of `components/Header.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useSession } from "next-auth/react";
import { useHasOnboarded } from "@/lib/storage";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  const pathname = usePathname();
  const { status } = useSession();
  const onboarded = useHasOnboarded();

  // The arrival hero (app/page.tsx, first-time anonymous visitors only)
  // draws its own wordmark + theme toggle row as part of its layout — the
  // global header would otherwise duplicate that row and add nav links
  // ("Today", "History", "Sign in") that don't make sense before someone
  // has read a single word yet. See components/HomeContent.tsx for the
  // exact same condition this mirrors.
  const isArrivalRoute = pathname === "/" && status !== "authenticated" && !onboarded;
  if (isArrivalRoute) return null;

  const secondNavItem =
    status === "authenticated"
      ? { href: "/collection", label: "Collection" }
      : { href: "/history", label: "History" };
  const NAV = [{ href: "/", label: "Today" }, secondNavItem];

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

- [ ] **Step 5: Delete the superseded components**

```bash
git rm components/OnboardingBanner.tsx components/SignupForm.tsx
```

Confirm nothing else imports either:

```bash
grep -rn "OnboardingBanner\|SignupForm" app components --include="*.tsx"
```

Expected: no matches.

- [ ] **Step 6: Verify**

```bash
npm run lint
npm run build
```

Expected: both clean (a stray import of either deleted component would fail the build).

With the dev server running, clear `localStorage` (or open a private window) and visit `/`: expected the arrival hero — wordmark + theme toggle only in the header row, today's word, teaser, "Find out more →", the tagline, the email pill, and the archive link. Submit the email pill: expected the "You're in" message, and that reloading `/` now shows the *normal* Today page (full header with Today/History/Sign in) — confirms `markOnboarded()` fired.

Clear `localStorage` again, revisit `/`, and this time click "Find out more →" instead of subscribing: confirms landing on the story page, and that going back to `/` also now shows the normal Today page (the click-through path also marks onboarded).

Clear `localStorage` one more time, revisit `/`, and reload the page without interacting: expected the arrival hero *again* (a bare view alone doesn't mark onboarded).

Finally, sign in (existing session from earlier tasks) and visit `/`: expected the normal Today page regardless of the local onboarded flag (an authenticated visitor never sees the arrival hero).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: merge onboarding into a single arrival hero for first-time visitors"
```

---

### Task 6: Auto-post the daily word to Bluesky

**Files:**
- Modify: `package.json` (add `@atproto/api`)
- Create: `lib/bluesky.ts`
- Create: `lib/bluesky.test.ts`
- Modify: `.env.example`
- Modify: `app/api/cron/send-daily/route.ts` (whole file)

**Interfaces:**
- Produces: `buildBlueskyPost(word: WordEntry, url: string): string` (pure, tested), `postDailyWordToBluesky(word: WordEntry, date: Date): Promise<{ posted: boolean }>` — consumed by this task's own route change.

- [ ] **Step 1: Install the dependency**

```bash
npm install @atproto/api
```

- [ ] **Step 2: Write the failing test for the pure text-builder**

Create `lib/bluesky.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildBlueskyPost } from "./bluesky";
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
  };
}

const URL = "https://example.com/story/quarantine?utm_source=bluesky&utm_medium=social&utm_campaign=daily-word";

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
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
npx vitest run lib/bluesky.test.ts
```

Expected: fails — `lib/bluesky.ts` doesn't exist yet.

- [ ] **Step 4: Implement `lib/bluesky.ts`**

```ts
import { AtpAgent, RichText } from "@atproto/api";
import type { WordEntry } from "./words";

const MAX_LENGTH = 300;
const ELLIPSIS = "…";

/** Builds the post text: word, a blank line, the teaser (truncated if
 * needed — the word and link are never cut), a blank line, the link.
 * Pure and synchronous so it's cheaply unit-testable without a network
 * call or a real Bluesky session. */
export function buildBlueskyPost(word: WordEntry, url: string): string {
  const fixed = `${word.word}\n\n\n\n${url}`; // word + two blank-line gaps + url, teaser slotted between
  const budgetForTeaser = MAX_LENGTH - fixed.length;

  let teaser = word.teaser;
  if (teaser.length > budgetForTeaser) {
    teaser = teaser.slice(0, Math.max(0, budgetForTeaser - ELLIPSIS.length)) + ELLIPSIS;
  }

  return `${word.word}\n\n${teaser}\n\n${url}`;
}

function buildStoryUrl(slug: string, siteUrl: string): string {
  const url = new URL(`/story/${slug}`, siteUrl);
  url.searchParams.set("utm_source", "bluesky");
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", "daily-word");
  return url.toString();
}

/** Posts today's word to Bluesky, following this codebase's existing
 * fallback pattern (lib/db.ts, lib/email.ts): without both
 * BLUESKY_IDENTIFIER and BLUESKY_APP_PASSWORD configured, this logs what
 * would have been posted instead of throwing, so the rest of the daily
 * cron (email sends) is unaffected by Bluesky being unconfigured. */
export async function postDailyWordToBluesky(
  word: WordEntry,
  date: Date
): Promise<{ posted: boolean }> {
  const identifier = process.env.BLUESKY_IDENTIFIER;
  const appPassword = process.env.BLUESKY_APP_PASSWORD;
  const siteUrl = process.env.CURIO_SITE_URL ?? "http://localhost:3000";
  const url = buildStoryUrl(word.slug, siteUrl);
  const text = buildBlueskyPost(word, url);

  if (!identifier || !appPassword) {
    console.log(`[curio:bluesky:dev-fallback] would post: ${text}`);
    return { posted: false };
  }

  const agent = new AtpAgent({ service: "https://bsky.social" });
  await agent.login({ identifier, password: appPassword });

  // RichText auto-detects the URL and turns it into a real clickable
  // facet — without this, the link would just be plain unclickable text
  // in the post, defeating the UTM tracking's whole purpose.
  const richText = new RichText({ text });
  await richText.detectFacets(agent);

  await agent.post({
    text: richText.text,
    facets: richText.facets,
    createdAt: date.toISOString(),
  });

  return { posted: true };
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
npx vitest run lib/bluesky.test.ts
```

Expected: all four pass.

- [ ] **Step 6: Document the new env vars**

Add to `.env.example`, after the existing `AUTH_SECRET` block:

```
# Bluesky auto-post (daily cron). Leave both unset to log the post instead
# of sending — see lib/bluesky.ts. Generate the app password in Bluesky's
# own settings: Settings -> App Passwords (never your account login
# password) — do not commit the real value anywhere.
BLUESKY_IDENTIFIER=curiodaily.bsky.social
BLUESKY_APP_PASSWORD=
```

- [ ] **Step 7: Wire the post into the cron route**

Replace the whole of `app/api/cron/send-daily/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAllSubscribers } from "@/lib/db";
import { sendDailyDigest } from "@/lib/email";
import { postDailyWordToBluesky } from "@/lib/bluesky";
import { getTodayWord } from "@/lib/words";

/** Configured in vercel.json to run once a day at 0 9 * * * (9am UTC) — the
 * Vercel Hobby plan caps cron at once/day, so there is no per-hour bucket
 * to honor here even though Subscriber still carries an `hour` field
 * (vestigial — see lib/db.ts). Every subscriber gets today's word at this
 * one run, regardless of what hour they were ever assigned. The same run
 * also posts the word to Bluesky — same trigger, same frequency, zero
 * extra infra. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const word = getTodayWord();
  const subscribers = await getAllSubscribers();

  const [emailResults, blueskyResult] = await Promise.allSettled([
    Promise.allSettled(subscribers.map((email) => sendDailyDigest(email, word, now))),
    postDailyWordToBluesky(word, now),
  ]);

  const emailOutcomes = emailResults.status === "fulfilled" ? emailResults.value : [];
  const sent = emailOutcomes.filter((r) => r.status === "fulfilled").length;
  const failed = emailOutcomes.length - sent;
  const bluesky =
    blueskyResult.status === "fulfilled" ? blueskyResult.value.posted : false;

  return NextResponse.json({
    word: word.slug,
    attempted: emailOutcomes.length,
    sent,
    failed,
    bluesky,
  });
}
```

- [ ] **Step 8: Verify**

```bash
npm run build
curl -s http://localhost:3000/api/cron/send-daily
```

Expected: JSON response includes `"bluesky":false` (no `BLUESKY_*` env vars set locally), and the dev server console shows a `[curio:bluesky:dev-fallback] would post: ...` line containing the word, its teaser, and a `/story/<slug>?utm_source=bluesky...` link. Confirm the email-sending behavior from Task 1 is unaffected (subscribers from that task's verification, if any remain, still get logged/sent).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json lib/bluesky.ts lib/bluesky.test.ts .env.example app/api/cron/send-daily/route.ts
git commit -m "feat: auto-post the daily word to Bluesky from the send-daily cron"
```

---

### Task 7: Wiktextract etymology extractor (content pipeline, part 1 of 3)

**Files:**
- Modify: `package.json` (add `tsx` devDependency, add `content:extract` script)
- Create: `scripts/__fixtures__/sample-wiktextract.jsonl`
- Create: `scripts/extractEtymology.ts`
- Create: `scripts/extractEtymology.test.ts`

**Interfaces:**
- Produces: `extractEtymologyFacts(dumpPath: string, targetWord: string): Promise<string[]>` (the distinct, non-empty `etymology_text` values found for that word's English entries) — consumed by Task 8.

- [ ] **Step 1: Install `tsx`**

```bash
npm install -D tsx
```

Add to `package.json`'s `"scripts"`:

```json
"content:extract": "tsx scripts/extractEtymology.ts"
```

- [ ] **Step 2: Create the fixture dump**

Create `scripts/__fixtures__/sample-wiktextract.jsonl` (one JSON object per line, matching real Wiktextract's shape — a word with two distinct etymology sections, a word with a thin one-sentence etymology, a non-English entry that must be filtered out, and a duplicate-etymology line that must be deduplicated):

```jsonl
{"word": "bank", "lang": "English", "lang_code": "en", "pos": "noun", "etymology_number": 1, "etymology_text": "From Middle English banke, from Old Norse banki, of the same origin as bank (raised shelf of ground)."}
{"word": "bank", "lang": "English", "lang_code": "en", "pos": "verb", "etymology_number": 1, "etymology_text": "From Middle English banke, from Old Norse banki, of the same origin as bank (raised shelf of ground)."}
{"word": "bank", "lang": "English", "lang_code": "en", "pos": "noun", "etymology_number": 2, "etymology_text": "From Middle English banke, from Old Italian banca (\"table, counter\"), from Old High German banc (\"bench\")."}
{"word": "bank", "lang": "French", "lang_code": "fr", "pos": "noun", "etymology_text": "Emprunt a l'anglais bank."}
{"word": "thistle", "lang": "English", "lang_code": "en", "pos": "noun", "etymology_text": "From Old English þistel."}
```

- [ ] **Step 3: Write the failing test**

Create `scripts/extractEtymology.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import path from "path";
import { extractEtymologyFacts } from "./extractEtymology";

const FIXTURE = path.join(__dirname, "__fixtures__", "sample-wiktextract.jsonl");

describe("extractEtymologyFacts", () => {
  it("returns every distinct English etymology_text for the word", async () => {
    const facts = await extractEtymologyFacts(FIXTURE, "bank");
    expect(facts).toHaveLength(2);
    expect(facts).toContain(
      "From Middle English banke, from Old Norse banki, of the same origin as bank (raised shelf of ground)."
    );
    expect(facts).toContain(
      'From Middle English banke, from Old Italian banca ("table, counter"), from Old High German banc ("bench").'
    );
  });

  it("excludes non-English-language entries", async () => {
    const facts = await extractEtymologyFacts(FIXTURE, "bank");
    expect(facts.join(" ")).not.toContain("Emprunt");
  });

  it("returns a single fact for a word with only one, thin, etymology", async () => {
    const facts = await extractEtymologyFacts(FIXTURE, "thistle");
    expect(facts).toEqual(["From Old English þistel."]);
  });

  it("returns an empty array for a word not in the dump", async () => {
    const facts = await extractEtymologyFacts(FIXTURE, "nonexistent-word");
    expect(facts).toEqual([]);
  });
});
```

- [ ] **Step 4: Run it and confirm it fails**

```bash
npx vitest run scripts/extractEtymology.test.ts
```

Expected: fails — `scripts/extractEtymology.ts` doesn't exist yet.

- [ ] **Step 5: Implement the extractor**

Create `scripts/extractEtymology.ts`:

```ts
import { createReadStream } from "fs";
import { createInterface } from "readline";

type WiktextractLine = {
  word?: string;
  lang_code?: string;
  etymology_text?: string;
};

/** Reads a Wiktextract JSONL dump line by line (dumps run into the
 * gigabytes — this never loads the whole file into memory) and collects
 * every distinct, non-empty `etymology_text` for the given word's English
 * entries. A word can appear multiple times (once per part of speech, or
 * per `etymology_number` for true homographs like "bank"); duplicates
 * across those repeats are collapsed, but genuinely different etymology
 * sections are both kept — the rewrite pass (scripts/rewriteEtymology.ts)
 * decides what to do with more than one. */
export async function extractEtymologyFacts(
  dumpPath: string,
  targetWord: string
): Promise<string[]> {
  const seen = new Set<string>();
  const facts: string[] = [];

  const rl = createInterface({
    input: createReadStream(dumpPath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let entry: WiktextractLine;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // a real dump can have stray malformed lines; skip rather than abort
    }
    if (entry.word !== targetWord || entry.lang_code !== "en") continue;
    const text = entry.etymology_text?.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    facts.push(text);
  }

  return facts;
}

/** CLI entry point: `npm run content:extract -- <dump-path> <word>` — prints
 * the extracted facts as JSON to stdout, so `content:rewrite` (Task 8) can
 * pipe them in without either script needing to know the other's internals. */
async function main() {
  const [dumpPath, word] = process.argv.slice(2);
  if (!dumpPath || !word) {
    console.error("Usage: npm run content:extract -- <dump-path> <word>");
    process.exit(1);
  }
  const facts = await extractEtymologyFacts(dumpPath, word);
  console.log(JSON.stringify({ word, facts }, null, 2));
}

// Only run the CLI when this file is executed directly (`tsx
// scripts/extractEtymology.ts ...`), not when its functions are imported
// by the test file or by another script.
if (require.main === module) {
  main();
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

```bash
npx vitest run scripts/extractEtymology.test.ts
```

Expected: all four pass.

- [ ] **Step 7: Verify the CLI**

```bash
npm run content:extract -- scripts/__fixtures__/sample-wiktextract.jsonl bank
```

Expected: JSON printed with `"word": "bank"` and a `"facts"` array of the two distinct etymology strings from the fixture.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json scripts/__fixtures__ scripts/extractEtymology.ts scripts/extractEtymology.test.ts
git commit -m "feat: add Wiktextract etymology extractor script"
```

---

### Task 8: Claude rewrite pass → reviewable draft (content pipeline, part 2 of 3)

**Files:**
- Modify: `package.json` (add `content:rewrite` script)
- Modify: `.env.example`
- Create: `content/drafts/.gitkeep`
- Create: `scripts/rewriteEtymology.ts`
- Create: `scripts/rewriteEtymology.test.ts`

**Interfaces:**
- Consumes: the JSON shape `extractEtymology.ts`'s CLI prints (`{ word: string; facts: string[] }`).
- Produces: `buildRewritePrompt(word: string, facts: string[]): string` (pure, tested), `parseRewriteResponse(raw: string): DraftEntry` (pure, tested, throws on a malformed/invalid response) — both consumed only within this task's own CLI. `DraftEntry` type (`slug`, `word`, `respelling`, `partOfSpeech`, `teaser`, `origin`, `journey`, `related`, `lineage`) — consumed by Task 9.

- [ ] **Step 1: Document the env var**

Add to `.env.example`, after the Bluesky block:

```
# Anthropic API key for the content pipeline's rewrite pass
# (scripts/rewriteEtymology.ts) — only used by that standalone script, never
# by the deployed app itself. Leave unset; the script refuses to run
# without it rather than silently skipping (unlike the daily-send
# fallbacks above, there's no sensible "log what would have been
# generated" stand-in for an LLM rewrite).
ANTHROPIC_API_KEY=
```

- [ ] **Step 2: Create the drafts directory**

```bash
mkdir -p content/drafts
touch content/drafts/.gitkeep
```

- [ ] **Step 3: Add the script entry**

Add to `package.json`'s `"scripts"`:

```json
"content:rewrite": "tsx scripts/rewriteEtymology.ts"
```

- [ ] **Step 4: Write the failing tests**

Create `scripts/rewriteEtymology.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildRewritePrompt, parseRewriteResponse } from "./rewriteEtymology";

describe("buildRewritePrompt", () => {
  it("includes the word and every fact, and forbids inventing details", () => {
    const prompt = buildRewritePrompt("bank", [
      "From Middle English banke, from Old Norse banki.",
      "From Old Italian banca, from Old High German banc.",
    ]);
    expect(prompt).toContain("bank");
    expect(prompt).toContain("From Middle English banke, from Old Norse banki.");
    expect(prompt).toContain("From Old Italian banca, from Old High German banc.");
    expect(prompt.toLowerCase()).toContain("do not invent");
  });
});

describe("parseRewriteResponse", () => {
  const validJson = JSON.stringify({
    respelling: "BANGK",
    partOfSpeech: "noun",
    teaser: "A word for money-holding and riverbanks alike, from the very same root.",
    origin: "From Middle English banke, ultimately from Old Norse banki.",
    journey: "The word split into two senses that still share one spelling today.",
    related: "A distant cousin of bench, from the same Germanic root for a raised shelf.",
    lineage: ["Old Norse", "Middle English", "English"],
  });

  it("parses a valid response into a DraftEntry with the given slug/word", () => {
    const draft = parseRewriteResponse(validJson, "bank");
    expect(draft.slug).toBe("bank");
    expect(draft.word).toBe("bank");
    expect(draft.respelling).toBe("BANGK");
    expect(draft.lineage).toEqual(["Old Norse", "Middle English", "English"]);
  });

  it("throws if the response isn't valid JSON", () => {
    expect(() => parseRewriteResponse("not json", "bank")).toThrow();
  });

  it("throws if a required field is missing", () => {
    const missingTeaser = JSON.stringify({
      respelling: "BANGK",
      partOfSpeech: "noun",
      origin: "...",
      journey: "...",
      related: "...",
      lineage: ["English"],
    });
    expect(() => parseRewriteResponse(missingTeaser, "bank")).toThrow(/teaser/i);
  });

  it("throws if lineage doesn't end in English", () => {
    const badLineage = JSON.stringify({
      respelling: "BANGK",
      partOfSpeech: "noun",
      teaser: "A teaser sentence here.",
      origin: "Origin text.",
      journey: "Journey text.",
      related: "Related text.",
      lineage: ["Old Norse"],
    });
    expect(() => parseRewriteResponse(badLineage, "bank")).toThrow(/lineage/i);
  });

  it("throws if teaser equals origin", () => {
    const sameText = JSON.stringify({
      respelling: "BANGK",
      partOfSpeech: "noun",
      teaser: "Identical text.",
      origin: "Identical text.",
      journey: "Journey text.",
      related: "Related text.",
      lineage: ["English"],
    });
    expect(() => parseRewriteResponse(sameText, "bank")).toThrow(/teaser/i);
  });
});
```

- [ ] **Step 5: Run the tests and confirm they fail**

```bash
npx vitest run scripts/rewriteEtymology.test.ts
```

Expected: fails — `scripts/rewriteEtymology.ts` doesn't exist yet.

- [ ] **Step 6: Implement the rewrite script**

Create `scripts/rewriteEtymology.ts`:

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

/** The prompt sent to Claude — the source facts are the *only* thing it's
 * allowed to draw on. Explicit "do not invent" language plus "even if the
 * facts are thin" covers both failure modes item 4 of the spec called
 * out: padding an etymology with unsourced detail, and silently skipping
 * an entry because there wasn't much to say. */
export function buildRewritePrompt(word: string, facts: string[]): string {
  const factsBlock = facts.map((f, i) => `${i + 1}. ${f}`).join("\n");
  return `You are writing one entry for Curio, a daily-word-etymology app. Its voice is warm, curious, and precise — never academic, never cute.

The word is: "${word}"

Here are the ONLY facts you may use, extracted from Wiktionary/Wiktextract:
${factsBlock}

Do NOT invent, guess, or pad any etymological detail beyond what's given above — if the facts are thin, write a short, honest entry rather than adding unsourced material. Do not skip the word even if the facts are sparse.

Write a JSON object (and nothing else — no markdown fences, no commentary) with exactly these fields:
{
  "respelling": "a phonetic respelling in Curio's house style, e.g. \\"KWOR-uhn-teen\\"",
  "partOfSpeech": "noun | verb | adjective | etc.",
  "teaser": "one sentence, the hook shown on the homepage — must NOT be identical to origin",
  "origin": "1-3 sentences, the full origin explanation, drawn only from the facts above",
  "journey": "1-3 sentences on how the meaning or use of the word changed over time, drawn only from the facts above (if the facts don't support a journey, write the honest shorter version rather than inventing a shift)",
  "related": "1-2 sentences connecting this word to a cognate or related English word, drawn only from the facts above (if none is supported by the facts, say so plainly rather than inventing one)",
  "lineage": ["array of language names, oldest first, always ending with \\"English\\" — only languages actually named in the facts above, in the order they appear in the word's history"]
}`;
}

/** Validates and shapes Claude's raw text response into a DraftEntry,
 * enforcing the same invariants lib/words.test.ts checks for the real
 * WORDS array — a draft that fails these should never reach a review
 * file at all. */
export function parseRewriteResponse(raw: string, word: string): DraftEntry {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Claude's response was not valid JSON for "${word}": ${raw.slice(0, 200)}`);
  }

  const requiredStringFields = ["respelling", "partOfSpeech", "teaser", "origin", "journey", "related"] as const;
  for (const field of requiredStringFields) {
    if (typeof parsed[field] !== "string" || !(parsed[field] as string).trim()) {
      throw new Error(`Draft for "${word}" is missing a non-empty "${field}" field.`);
    }
  }

  if (!Array.isArray(parsed.lineage) || parsed.lineage.length === 0 || !parsed.lineage.every((l) => typeof l === "string")) {
    throw new Error(`Draft for "${word}" has an invalid "lineage" field (must be a non-empty string array).`);
  }
  const lineage = parsed.lineage as string[];
  if (lineage[lineage.length - 1] !== "English") {
    throw new Error(`Draft for "${word}" has a "lineage" that doesn't end in "English": ${JSON.stringify(lineage)}`);
  }

  const teaser = parsed.teaser as string;
  const origin = parsed.origin as string;
  if (teaser === origin) {
    throw new Error(`Draft for "${word}" has a "teaser" identical to its "origin" — they must differ.`);
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
  };
}

async function callClaude(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. This script has no fallback mode — set it in .env.local before running content:rewrite."
    );
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API request failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { content: { type: string; text?: string }[] };
  const textBlock = data.content.find((b) => b.type === "text");
  if (!textBlock?.text) {
    throw new Error("Anthropic API response had no text content block.");
  }
  return textBlock.text;
}

/** CLI entry point: `npm run content:rewrite -- <word> <facts-json-path>`,
 * where <facts-json-path> is the file `content:extract` was redirected
 * into (`npm run content:extract -- <dump> <word> > /tmp/facts.json`).
 * Writes content/drafts/<word>.json for human review — nothing reads that
 * file automatically; scripts/approveDraft.ts (Task 9) is the only thing
 * that ever moves a draft into lib/words.ts, and only when explicitly
 * told to. */
async function main() {
  const [word, factsPath] = process.argv.slice(2);
  if (!word || !factsPath) {
    console.error("Usage: npm run content:rewrite -- <word> <facts-json-path>");
    process.exit(1);
  }

  const { readFileSync, writeFileSync } = await import("fs");
  const path = await import("path");

  const extracted = JSON.parse(readFileSync(factsPath, "utf-8")) as { word: string; facts: string[] };
  if (extracted.facts.length === 0) {
    console.error(`No etymology facts found for "${word}" in ${factsPath} — nothing to rewrite.`);
    process.exit(1);
  }

  const prompt = buildRewritePrompt(word, extracted.facts);
  const raw = await callClaude(prompt);
  const draft = parseRewriteResponse(raw, word);

  const outPath = path.join("content", "drafts", `${word}.json`);
  writeFileSync(outPath, JSON.stringify(draft, null, 2) + "\n");
  console.log(`Wrote ${outPath} — review it, then run: npm run content:approve -- ${outPath}`);
}

if (require.main === module) {
  main();
}
```

- [ ] **Step 7: Run the tests and confirm they pass**

```bash
npx vitest run scripts/rewriteEtymology.test.ts
```

Expected: all six pass. Note these tests only exercise `buildRewritePrompt`/`parseRewriteResponse` directly — `callClaude` and `main` are never invoked in the test suite, so no real API calls or costs happen when running `npm test`.

- [ ] **Step 8: Commit**

```bash
git add package.json .env.example content/drafts/.gitkeep scripts/rewriteEtymology.ts scripts/rewriteEtymology.test.ts
git commit -m "feat: add Claude rewrite-pass script producing reviewable drafts"
```

(Do not run this script against a real word as part of verifying this task — that requires a real `ANTHROPIC_API_KEY`, costs real money, and the user explicitly asked to run the pipeline against real words themselves afterward. `npm run lint` and `npx tsc --noEmit` passing, plus the unit tests above, are sufficient verification for this task.)

---

### Task 9: Approve-and-append script (content pipeline, part 3 of 3)

**Files:**
- Modify: `package.json` (add `content:approve` script)
- Create: `scripts/approveDraft.ts`
- Create: `scripts/approveDraft.test.ts`

**Interfaces:**
- Consumes: `DraftEntry` (Task 8).
- Produces: `validateDraft(draft: unknown): DraftEntry` (pure, tested, throws on any invariant violation), `appendDraftToWordsFile(draft: DraftEntry, wordsFilePath: string): void` (tested against a temp fixture file, never the real `lib/words.ts`, in the test suite).

- [ ] **Step 1: Add the script entry**

Add to `package.json`'s `"scripts"`:

```json
"content:approve": "tsx scripts/approveDraft.ts"
```

- [ ] **Step 2: Write the failing tests**

Create `scripts/approveDraft.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { appendDraftToWordsFile, validateDraft } from "./approveDraft";

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
};

describe("validateDraft", () => {
  it("accepts a well-formed draft", () => {
    expect(validateDraft(validDraft)).toEqual(validDraft);
  });

  it("rejects a draft missing a field", () => {
    const { teaser: _teaser, ...missingTeaser } = validDraft;
    expect(() => validateDraft(missingTeaser)).toThrow(/teaser/i);
  });

  it("rejects a draft whose lineage doesn't end in English", () => {
    expect(() => validateDraft({ ...validDraft, lineage: ["Old Norse"] })).toThrow(/lineage/i);
  });

  it("rejects a draft whose teaser equals its origin", () => {
    expect(() => validateDraft({ ...validDraft, teaser: validDraft.origin })).toThrow(/teaser/i);
  });
});

describe("appendDraftToWordsFile", () => {
  let tmpFile: string;

  afterEach(() => {
    rmSync(tmpFile, { force: true });
  });

  it("appends the draft as a new WORDS entry before the closing bracket", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "curio-approve-test-"));
    tmpFile = path.join(dir, "words-fixture.ts");
    writeFileSync(
      tmpFile,
      `export const WORDS: WordEntry[] = [\n  {\n    slug: "existing",\n    word: "existing",\n  },\n];\n`
    );

    appendDraftToWordsFile(validDraft, tmpFile);

    const contents = readFileSync(tmpFile, "utf-8");
    expect(contents).toContain('slug: "existing"');
    expect(contents).toContain('slug: "bank"');
    expect(contents.indexOf('slug: "existing"')).toBeLessThan(contents.indexOf('slug: "bank"'));
    // The array must still close exactly once, after the appended entry.
    expect(contents.trim().endsWith("];")).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

```bash
npx vitest run scripts/approveDraft.test.ts
```

Expected: fails — `scripts/approveDraft.ts` doesn't exist yet.

- [ ] **Step 4: Implement the approve script**

Create `scripts/approveDraft.ts`:

```ts
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import type { DraftEntry } from "./rewriteEtymology";

/** Re-checks a draft against exactly the invariants lib/words.test.ts
 * enforces on the real WORDS array, so a draft can only ever be appended
 * if it would also pass the existing test suite. */
export function validateDraft(draft: unknown): DraftEntry {
  const d = draft as Partial<DraftEntry>;
  const requiredStringFields: (keyof DraftEntry)[] = [
    "slug",
    "word",
    "respelling",
    "partOfSpeech",
    "teaser",
    "origin",
    "journey",
    "related",
  ];
  for (const field of requiredStringFields) {
    if (typeof d[field] !== "string" || !(d[field] as string).trim()) {
      throw new Error(`Draft is missing a non-empty "${field}" field.`);
    }
  }
  if (!Array.isArray(d.lineage) || d.lineage.length === 0 || !d.lineage.every((l) => typeof l === "string")) {
    throw new Error('Draft has an invalid "lineage" field (must be a non-empty string array).');
  }
  if (d.lineage[d.lineage.length - 1] !== "English") {
    throw new Error(`Draft's "lineage" doesn't end in "English": ${JSON.stringify(d.lineage)}`);
  }
  if (d.teaser === d.origin) {
    throw new Error('Draft\'s "teaser" is identical to its "origin" — they must differ.');
  }
  return d as DraftEntry;
}

/** Inserts the draft as one more object literal into the WORDS array,
 * immediately before the array's closing `];` — a plain text insertion
 * rather than an AST transform, which is enough here because
 * lib/words.ts's WORDS array has exactly one closing `];` in the whole
 * file (the file's other exports are functions, not array literals). */
export function appendDraftToWordsFile(draft: DraftEntry, wordsFilePath: string): void {
  const source = readFileSync(wordsFilePath, "utf-8");
  const closingIndex = source.lastIndexOf("];");
  if (closingIndex === -1) {
    throw new Error(`Could not find the WORDS array's closing "];" in ${wordsFilePath}.`);
  }

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
  },
`;

  const updated = source.slice(0, closingIndex) + entryLiteral + source.slice(closingIndex);
  writeFileSync(wordsFilePath, updated);
}

/** CLI entry point: `npm run content:approve -- content/drafts/<slug>.json`.
 * Validates the draft, appends it to the real lib/words.ts, then re-runs
 * the full test suite (which re-checks the exact same invariants across
 * every entry, old and new) so a bad append is caught immediately rather
 * than silently shipping. */
function main() {
  const [draftPath] = process.argv.slice(2);
  if (!draftPath) {
    console.error("Usage: npm run content:approve -- content/drafts/<slug>.json");
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(draftPath, "utf-8"));
  const draft = validateDraft(raw);

  const wordsFilePath = "lib/words.ts";
  appendDraftToWordsFile(draft, wordsFilePath);
  console.log(`Appended "${draft.slug}" to ${wordsFilePath}. Running tests…`);

  execSync("npx vitest run lib/words.test.ts", { stdio: "inherit" });
  console.log(`Done. Review the diff (git diff ${wordsFilePath}) before committing.`);
}

if (require.main === module) {
  main();
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
npx vitest run scripts/approveDraft.test.ts
```

Expected: all five pass.

- [ ] **Step 6: End-to-end dry run against a throwaway draft**

Confirm the whole append step works against the *real* `lib/words.ts` using a harmless, clearly-fake throwaway word, then revert it — this is the one place in Task 9 that's worth checking against the real file, since `appendDraftToWordsFile`'s test (Step 2) only exercises a fixture copy:

```bash
cat > /tmp/curio-dry-run-draft.json <<'EOF'
{
  "slug": "zzz-dry-run-test",
  "word": "zzz-dry-run-test",
  "respelling": "ZEE-test",
  "partOfSpeech": "noun",
  "teaser": "A throwaway teaser sentence for testing.",
  "origin": "A throwaway origin sentence for testing.",
  "journey": "A throwaway journey sentence for testing.",
  "related": "A throwaway related sentence for testing.",
  "lineage": ["English"]
}
EOF
npm run content:approve -- /tmp/curio-dry-run-draft.json
```

Expected: prints "Appended..." then the full `lib/words.test.ts` suite passes (the throwaway entry satisfies every invariant). Then revert it — this word must never actually ship:

```bash
git checkout lib/words.ts
rm /tmp/curio-dry-run-draft.json
```

Confirm the revert worked:

```bash
git diff --stat lib/words.ts
```

Expected: no output (clean).

- [ ] **Step 7: Commit**

```bash
git add package.json scripts/approveDraft.ts scripts/approveDraft.test.ts
git commit -m "feat: add human-gated approve-and-append script for content drafts"
```

---

### Task 10: Deploy to production

**Files:** none (operational task — env vars + deploy)

**Interfaces:** none

- [ ] **Step 1: Run the full verification suite locally**

```bash
npm run lint
npx vitest run
npm run build
```

Expected: all three succeed with no errors. Confirm the route list in the build output no longer shows any route depending on a deleted component, and that `/api/cron/send-daily` is still present.

- [ ] **Step 2: Set the new production env vars (Bluesky only — the content pipeline's `ANTHROPIC_API_KEY` is a local/dev-only tool, never needed in Vercel)**

Ask the user for the real `BLUESKY_APP_PASSWORD` value (generated in Bluesky's own Settings → App Passwords) rather than generating or guessing it. Once provided:

```bash
printf '%s' "curiodaily.bsky.social" | vercel env add BLUESKY_IDENTIFIER production --yes
printf '%s' "<the app password the user provided>" | vercel env add BLUESKY_APP_PASSWORD production --sensitive --yes
```

- [ ] **Step 3: Deploy**

```bash
git push origin master
```

(Vercel's Git integration auto-deploys `master` to production — confirmed working as of this session. Use `vercel deploy --prod` instead only if that integration is ever found to be disconnected again.)

- [ ] **Step 4: Smoke test the deployed site**

```bash
for p in / /history /login /account /collection; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://etymology-app-orcin.vercel.app$p")
  echo "$p -> $code"
done
```

Expected: every path returns `200` (`/account` and `/collection` redirect server-side to `/login` when signed out, which is itself a `200`).

- [ ] **Step 5: Confirm the arrival hero in production**

In a private/incognito browser window, visit `https://etymology-app-orcin.vercel.app/`. Expected: the arrival hero (not the old onboarding-banner pairing) — wordmark + theme toggle header, today's word, teaser, "Find out more →", tagline, email pill, archive link.

- [ ] **Step 6: Confirm the cron fix and Bluesky post on the next scheduled run**

The cron only fires once a day (`0 9 * * *`) — this can't be fully verified synchronously. Manually trigger it once (with the real `CRON_SECRET`) to confirm it runs cleanly end to end in production:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://etymology-app-orcin.vercel.app/api/cron/send-daily
```

Expected: JSON response with `attempted`/`sent`/`failed` counts matching the real subscriber count, and `"bluesky": true` if `BLUESKY_APP_PASSWORD` was set in Step 2. Confirm the post actually appears on `https://bsky.app/profile/curiodaily.bsky.social`.

**Caution:** this sends a real digest email to every real subscriber and posts to the real Bluesky account — confirm with the user before running it, since it's not a dry run.

- [ ] **Step 7: Update `handover.md`**

This doc's "Deferred / parked items" list currently includes "Story pages show the wrong date when reached from a personalized History click" — already fixed in an earlier session (see git log). Also update the "No GitHub remote" line (also no longer true — this repo now pushes to `github.com/SamxJames/curio-web` with Vercel's Git integration deploying `master` automatically), and add a short note under a new "This session" heading covering: the cron fix, the arrival hero replacing the onboarding banner, the Bluesky auto-post, and the content pipeline scripts (`content:extract`/`content:rewrite`/`content:approve`) — so the next fresh session doesn't have to re-derive any of this from `git log`.

- [ ] **Step 8: Commit anything left uncommitted**

```bash
git status --short
```

If clean, nothing to do. Otherwise stage and commit remaining changes (e.g. the `handover.md` update) with a descriptive message.
