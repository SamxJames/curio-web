# Story-Page Front Door Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tell someone who lands on `/story/[slug]` from search what Curio is, and how to get tomorrow's word, without adding a feed, a backlog or new navigation.

**Architecture:** A new client component, `StoryFrontDoor`, puts one line of copy and the existing `EmailSignupInline` right after the story. It hides for visitors this browser knows already get the email. A localStorage flag records that, set when someone joins or arrives from a digest link, and digest links now carry `utm_source=email`. The "Today's word is ___ →" link reads today's word from `/api/story/[slug]/date`, the uncached route the page already fetches for its "featured on" line, so every story page stays static. The "Browse all words →" link to `/history` is removed.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4 tokens, Vitest (node environment).

**Spec:** Phase 2 of the owner's 2026-09-26 pre-launch brief, carried in the "Brief" section below with the owner's answers from this session.

## Brief (owner's, with this session's decisions)

- One short line near the end of the story. **Chosen wording:** "This is Curio: one word's origin story, every morning. No feed, no backlog."
- Reuse `EmailSignupInline` below the story. No new signup flow.
- If the story isn't today's word, show a small link: "Today's word is ___ →".
- "Browse all words →" currently points at `/history`, which is a personal view. **Decision:** remove it. `getRelatedWords` always returns alphabetical neighbours (see `lib/relatedWords.ts`), so "All words A–Z →" (to `/words`) already renders on every story page, and a second link to `/words` would repeat it.
- Keep the related-word and A–Z links as they are. No header nav items.
- **Decision (subscribers):** the digest links subscribers to story pages every morning, so the line and signup are hidden (a) on visits from a digest link (`utm_source=email`), and (b) on any browser that has joined via `EmailSignupInline` or arrived from a digest link before. The "Today's word" link is not hidden.
- Out of scope: streaks, unread counts, "X of N", "you missed", random/explore, per-user send times, a fifth nav item, push/PWA, leaderboards, new word content.

## Global Constraints

- Archive, never backlog (`AGENTS.md`): no counts of unseen words, no "you missed", no streaks or percentages.
- `app/story/[slug]/page.tsx` must not read cookies, headers or Redis. All 1,147 story pages stay static. Anything per-request goes through `/api/story/[slug]/date`.
- Design tokens only (`docs/design-system.md`): no new arbitrary Tailwind values (`text-[Npx]`, etc.), and no hand-rolled `<button>`/`<input>` outside `components/ui/`.
- Short "why" comments, matching the surrounding code.
- npm only. Free tiers only; no new dependencies.
- Exact copy: `This is Curio: one word's origin story, every morning. No feed, no backlog.` and `Today's word is {word} →`.
- Test commands: `npx vitest run`, `npm run lint` (baseline: 3 pre-existing warnings), `npm run build`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

- `lib/email.ts`: add `digestStoryUrl(slug)` (the tagged link), and use it in the HTML and plain-text digest.
- `lib/emailArrival.ts` (new): `isEmailArrival(search)`, a pure check that lives outside the `"use client"` storage module so it can be unit-tested.
- `lib/storage.ts`: add the `curio:subscribed` flag (`hasSubscribedHere`, `useHasSubscribedHere`, `markSubscribedHere`).
- `components/EmailSignupInline.tsx`: set the flag on success, from all three places it's used.
- `components/StoryFrontDoor.tsx` (new): the line and the signup, hidden for known subscribers.
- `app/api/story/[slug]/date/route.ts`: also return `today: { slug, word }`.
- `lib/useStoryDay.ts` (new): one fetch of that route, shared by the date line and the today link.
- `components/StoryDate.tsx`: becomes presentational; takes `date` as a prop.
- `components/StoryView.tsx`: wires it all together; removes "Browse all words".
- `handover.md`: session notes (last task).

Page order after this change: header block → Favorite/Share → Origin / Journey / Related words → **front door** (border-top, line, signup) → More words (unchanged, including "All words A–Z →") → bottom block (border-top: **"Today's word is ___ →"** where "Browse all words" was, then "Try today's puzzle →").

The today link sits in the bottom slot, not beside the signup, for two reasons. It appears only after a fetch, so at the bottom it can only move the puzzle link and footer. And it stays visible to subscribers, for whom the front door is hidden.

---

### Task 1: Tag digest links and recognise email arrivals

**Files:**
- Modify: `lib/email.ts` (the two `storyUrl` lines, currently at 59 and 103)
- Create: `lib/emailArrival.ts`
- Test: `lib/email.test.ts`, `lib/emailArrival.test.ts` (new)

**Interfaces:**
- Produces: `digestStoryUrl(slug: string): string` exported from `lib/email.ts`; `isEmailArrival(search: string): boolean` exported from `lib/emailArrival.ts`. Task 3 uses `isEmailArrival`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/email.test.ts` (change the import line to `import { buildDigestSubject, digestStoryUrl } from "./email";`):

```ts
describe("digestStoryUrl", () => {
  it("links to the story page, tagged so the page knows the reader came from the digest", () => {
    const url = new URL(digestStoryUrl("sideburns"));
    expect(url.pathname).toBe("/story/sideburns");
    expect(url.searchParams.get("utm_source")).toBe("email");
    expect(url.searchParams.get("utm_medium")).toBe("email");
    expect(url.searchParams.get("utm_campaign")).toBe("daily-word");
  });
});
```

Create `lib/emailArrival.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isEmailArrival } from "./emailArrival";

describe("isEmailArrival", () => {
  it("is true for a digest link's query string", () => {
    expect(isEmailArrival("?utm_source=email&utm_medium=email&utm_campaign=daily-word")).toBe(true);
  });

  it("is false for Bluesky links, other sources and no query at all", () => {
    expect(isEmailArrival("?utm_source=bluesky&utm_medium=social")).toBe(false);
    expect(isEmailArrival("?utm_source=emailx")).toBe(false);
    expect(isEmailArrival("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/email.test.ts lib/emailArrival.test.ts`
Expected: FAIL. `digestStoryUrl` is not exported, and `./emailArrival` cannot be resolved.

- [ ] **Step 3: Implement**

In `lib/email.ts`, add below `buildDigestSubject`:

```ts
/** The digest's story link. Tagged like lib/bluesky.ts's links, and for a
 * second reason: the story page reads utm_source=email to hide its signup
 * pitch from people who already get this email (see
 * components/StoryFrontDoor.tsx). */
export function digestStoryUrl(slug: string): string {
  const url = new URL(`/story/${slug}`, SITE_URL);
  url.searchParams.set("utm_source", "email");
  url.searchParams.set("utm_medium", "email");
  url.searchParams.set("utm_campaign", "daily-word");
  return url.toString();
}
```

Replace both `const storyUrl = \`${SITE_URL}/story/${word.slug}\`;` lines (in `buildDigestHtml` and in `sendDailyDigest`) with `const storyUrl = digestStoryUrl(word.slug);`. In `buildDigestHtml` the URL lands in an `href="..."` attribute; `URL.toString()` already joins params with a plain `&`, which email clients accept in `href`, so no escaping change is needed.

Create `lib/emailArrival.ts`:

```ts
/** Whether a page's query string came from a digest email link (see
 * lib/email.ts's digestStoryUrl). Kept out of lib/storage.ts, a
 * "use client" module, so it stays a plain function the tests can import. */
export function isEmailArrival(search: string): boolean {
  return new URLSearchParams(search).get("utm_source") === "email";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/email.test.ts lib/emailArrival.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email.ts lib/email.test.ts lib/emailArrival.ts lib/emailArrival.test.ts
git commit -m "feat: tag digest story links with utm_source=email"
```

---

### Task 2: Today's word from the story-date route, fetched once

**Files:**
- Modify: `app/api/story/[slug]/date/route.ts`
- Create: `lib/useStoryDay.ts`
- Modify: `components/StoryDate.tsx`, `components/StoryView.tsx` (the `<StoryDate slug=… />` call and the bottom block)
- Test: `app/sharedDay.test.ts`

**Interfaces:**
- Produces: the route's JSON is `{ date: string | null; today: { slug: string; word: string } | null }` (on 404, `{ date: null, today: null }`). `useStoryDay(slug: string): StoryDay | null` and `type StoryDay = { date: string | null; today: { slug: string; word: string } | null }` from `lib/useStoryDay.ts`. `StoryDate` now takes `{ date: string | null }`.

- [ ] **Step 1: Write the failing test**

In `app/sharedDay.test.ts`, in `everySurfaceAt`, change the destructure and return so `today` comes back too:

```ts
  const { date, today } = (await res.json()) as {
    date: string | null;
    today: { slug: string; word: string } | null;
  };
  return { signedOut, signedIn, digests, blueskyText, date, today };
```

In the `it.each` body, after the `s.date` expectation, add:

```ts
      expect(s.today).toEqual({ slug: expected.slug, word: expected.word });
```

Then add one more test inside the `describe` block:

```ts
  it("a story page for another word still names today's word", async () => {
    vi.setSystemTime(new Date("2026-09-26T09:00:00.000Z"));
    const today = await resolveWordForDate(new Date("2026-09-26T09:00:00.000Z"));
    const other = today.slug === "sideburns" ? "fiasco" : "sideburns";

    const res = await storyDate(new Request("http://localhost"), {
      params: Promise.resolve({ slug: other }),
    });
    const body = (await res.json()) as { today: { slug: string; word: string } | null };

    expect(body.today).toEqual({ slug: today.slug, word: today.word });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/sharedDay.test.ts`
Expected: FAIL. `today` is `undefined`.

- [ ] **Step 3: Implement the route change**

In `app/api/story/[slug]/date/route.ts`, change the 404 body to `{ date: null, today: null }`. Replace the lines from `const historyEntry = …` through the return with:

```ts
  // resolveHistory is most recent first, so its head is today — the same
  // locked word home, the digest and Bluesky show. Returned here (rather
  // than read in the page) for the page's "Today's word is ___" link, so
  // the page itself stays static.
  const history = await resolveHistory();
  const historyEntry = history.find((d) => d.word.slug === slug);
  const date = historyEntry ? formatDay(historyEntry.date) : null;
  const today = { slug: history[0].word.slug, word: history[0].word.word };

  // Every request must reach the function so recordUserSeen fires for
  // signed-in visitors — never let a CDN answer this.
  return NextResponse.json({ date, today }, { headers: { "Cache-Control": "private, no-store" } });
```

Update the file's top doc comment: its first line becomes "The "featured on <date>" line and today's word for a story page, plus the recordUserSeen side effect that used to fire from the page body."

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/sharedDay.test.ts`
Expected: PASS.

- [ ] **Step 5: Move the fetch into a shared hook**

Create `lib/useStoryDay.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

export type StoryDay = {
  date: string | null;
  today: { slug: string; word: string } | null;
};

/** One request for a story page's per-visit facts (the "featured on" date
 * and today's word), shared by the date line and the today link. Two
 * separate fetches would also fire recordUserSeen twice. Fetched rather
 * than rendered so the page stays static; see
 * app/api/story/[slug]/date/route.ts. */
export function useStoryDay(slug: string): StoryDay | null {
  const [day, setDay] = useState<StoryDay | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/story/${slug}/date`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: StoryDay | null) => {
        if (!cancelled) setDay(data);
      })
      .catch(() => {
        // A missing date line or today link is not worth surfacing an error for.
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return day;
}
```

Replace `components/StoryDate.tsx` with the presentational version. Keep the height-reservation comment, which still holds:

```tsx
/** The story page's "featured on" line. The date comes from lib/useStoryDay.ts.
 *
 * The slot keeps its height whether or not a date arrives: ~884 of 1,147
 * words have never been featured and will never fill it, and a line that
 * appears after hydration would otherwise shove the headword down the page
 * on the ~263 that do. Layout shift is a ranking signal, so reserving is
 * the right trade for this page. */
export default function StoryDate({ date }: { date: string | null }) {
  return (
    <p className="mb-6 h-4 font-sans text-xs tracking-wide text-ink-faint">{date}</p>
  );
}
```

(The `"use client"` directive and the React imports go away. It is still only rendered from the client `StoryView`.)

- [ ] **Step 6: Wire it into StoryView and replace "Browse all words"**

In `components/StoryView.tsx`:
- Add `import { useStoryDay } from "@/lib/useStoryDay";`.
- At the top of the component body, add `const day = useStoryDay(word.slug);`.
- Replace `<StoryDate slug={word.slug} />` with `<StoryDate date={day?.date ?? null} />`.
- Replace the whole bottom section (the `border-t` div holding "Browse all words" and the `mt-4` div holding "Try today's puzzle") with:

```tsx
      <div className="mt-12 space-y-4 border-t border-line pt-8">
        {/* Only for a word that isn't today's: the one pointer from an old
         * story to the live day. "Browse all words" (to /history, a
         * personal view) was removed; "All words A–Z" above covers it. */}
        {day?.today && day.today.slug !== word.slug && (
          <Link
            href={`/story/${day.today.slug}`}
            className="block font-sans text-sm text-ink-soft transition-colors hover:text-ink"
          >
            Today&apos;s word is {day.today.word} &rarr;
          </Link>
        )}
        <Link
          href="/play"
          className="block font-sans text-xs text-ink-faint transition-colors hover:text-ink-soft"
        >
          Try today&apos;s puzzle &rarr;
        </Link>
      </div>
```

- [ ] **Step 7: Run the whole suite, lint and a build**

Run: `npx vitest run`, then `npm run lint`, then `npm run build`
Expected: all tests pass. Lint shows the same 3 pre-existing warnings. The build output still lists `/story/[slug]` as SSG (●) with 1,147 paths. If it shows as dynamic (ƒ), something in the page now reads request data. Stop and report.

- [ ] **Step 8: Check it live (signed out)**

Start the dev server with the preview tool (`curio-dev`). Open `/story/<any word that isn't today's>`. Confirm "Today's word is <today's word> →" shows and links to today's story. Confirm the featured-on date still appears for a word that has been featured, and that "Browse all words" is gone. Open today's story (follow the link) and confirm the today link is absent there. In the network panel, confirm one request to `/api/story/<slug>/date` per story view.

- [ ] **Step 9: Commit**

```bash
git add app/api/story/[slug]/date/route.ts app/sharedDay.test.ts lib/useStoryDay.ts components/StoryDate.tsx components/StoryView.tsx
git commit -m "feat: name today's word on older story pages; drop the /history link"
```

---

### Task 3: The front door, with the signup, hidden for subscribers

**Files:**
- Modify: `lib/storage.ts` (add after `markOnboarded`)
- Modify: `components/EmailSignupInline.tsx`
- Create: `components/StoryFrontDoor.tsx`
- Modify: `components/StoryView.tsx` (insert after the `SECTIONS` block)

**Interfaces:**
- Consumes: `isEmailArrival(search: string): boolean` from `lib/emailArrival.ts` (Task 1).
- Produces: `hasSubscribedHere(): boolean`, `useHasSubscribedHere(): boolean` and `markSubscribedHere(): void` from `lib/storage.ts`; a default-export `StoryFrontDoor` component with no props.

There is no unit test for this task. The repo's Vitest runs in `node` with no DOM or localStorage, and the only pure logic here (`isEmailArrival`) is tested in Task 1. Step 5 does the verification in the browser.

- [ ] **Step 1: Add the flag to lib/storage.ts**

Add `const SUBSCRIBED_KEY = "curio:subscribed";` next to the other keys at the top. After `markOnboarded`, add:

```ts
/** "This browser joined the email, or has arrived from one." A display hint
 * only, like the session hint below: it hides a story page's signup pitch
 * (components/StoryFrontDoor.tsx) and nothing else. Not cleared on
 * unsubscribe — worst case, a lapsed subscriber doesn't see the pitch. */
export function hasSubscribedHere(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SUBSCRIBED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Server snapshot is `false`, so the static HTML includes the pitch —
 * strangers from search are who it's for. */
export function useHasSubscribedHere(): boolean {
  return useSyncExternalStore(subscribe, hasSubscribedHere, () => false);
}

export function markSubscribedHere() {
  if (typeof window === "undefined" || hasSubscribedHere()) return;
  try {
    window.localStorage.setItem(SUBSCRIBED_KEY, "1");
  } catch {
    return;
  }
  notify();
}
```

- [ ] **Step 2: Set it from EmailSignupInline**

In `components/EmailSignupInline.tsx`, import `markSubscribedHere` from `@/lib/storage`. In `handleSubmit`'s success path, call it **after** `onSubscribed?.()`:

```ts
      setStatus("success");
      track("signup_submitted");
      // Callback first: StoryFrontDoor uses it to pin itself open so this
      // "You're in" message survives the flag flipping just below.
      onSubscribed?.();
      markSubscribedHere();
```

Update the component's doc comment: it is used on the arrival hero, `/play`'s post-game funnel and story pages (`StoryFrontDoor`), and records `markSubscribedHere()` on success.

- [ ] **Step 3: Create components/StoryFrontDoor.tsx**

```tsx
"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import EmailSignupInline from "./EmailSignupInline";
import { markSubscribedHere, useHasSubscribedHere } from "@/lib/storage";
import { isEmailArrival } from "@/lib/emailArrival";

/** A story page's front door for someone who arrived from search: what
 * Curio is, and how to get tomorrow's word. Hidden for anyone this browser
 * knows already gets the email — a digest link (utm_source=email, see
 * lib/email.ts) or a signup here — since subscribers land on story pages
 * every morning and shouldn't be pitched the thing they already have. */
export default function StoryFrontDoor() {
  const subscribedHere = useHasSubscribedHere();
  // Pinned open after a signup on this page, so the "You're in" message
  // isn't unmounted the instant markSubscribedHere() flips the flag.
  const [justJoined, setJustJoined] = useState(false);

  useEffect(() => {
    if (isEmailArrival(window.location.search)) markSubscribedHere();
  }, []);

  if (subscribedHere && !justJoined) return null;

  return (
    <section aria-label="About Curio" className="mt-12 border-t border-line pt-8">
      <p className="font-sans text-sm leading-relaxed text-ink-soft">
        This is Curio: one word&apos;s origin story, every morning. No feed, no backlog.
      </p>
      <div className="mt-5">
        {/* flushSync so justJoined commits before EmailSignupInline's
         * markSubscribedHere() triggers the store re-render. */}
        <EmailSignupInline onSubscribed={() => flushSync(() => setJustJoined(true))} />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Place it in StoryView**

In `components/StoryView.tsx`, import `StoryFrontDoor from "./StoryFrontDoor"` and render `<StoryFrontDoor />` straight after the closing `</div>` of the `mt-12 space-y-10` SECTIONS block, before the `{related.peers.length + …}` "More words" section.

- [ ] **Step 5: Check it live (signed out, no real signup)**

Do **not** submit the signup form. It writes to the shared production Upstash (see `handover.md`, "Important: local dev and production point at the same Upstash database").
1. In a fresh browser profile (or after `localStorage.removeItem("curio:subscribed")`), open `/story/<word>`. The line and the Join field show after the story, above "More words".
2. Open `/story/<word>?utm_source=email`. The block disappears after hydration, and `localStorage.getItem("curio:subscribed")` is `"1"`.
3. Navigate to another story without the query. The block stays hidden.
4. Remove the key and reload. The block is back.
5. Check the success path without a network write. In the browser console, temporarily override `window.fetch` to return `new Response(JSON.stringify({ ok: true }), { status: 200 })` for `/api/subscribe`, type an email and press Join. "You're in. Tomorrow's word arrives in the morning." must stay visible, and the flag must now be `"1"`. Reload to drop the override. The block is now hidden.
6. Tab order: after the story text, Tab reaches the email field, then Join.

- [ ] **Step 6: Run the whole suite, lint and a build**

Run: `npx vitest run`, `npm run lint`, `npm run build`
Expected: all tests pass; the same 3 lint warnings; `/story/[slug]` still SSG (●), 1,147 paths.

- [ ] **Step 7: Commit**

```bash
git add lib/storage.ts components/EmailSignupInline.tsx components/StoryFrontDoor.tsx components/StoryView.tsx
git commit -m "feat: a front door on story pages — one line and the email signup"
```

---

### Task 4 (controller, not a subagent): Screenshots, deploy, handover

- [ ] **Step 1: After screenshots.** With the dev server running, run the same capture used for the "before" set (DevTools-protocol script at `<scratchpad>/shoot.mjs`: 390px and 1280px, `prefers-color-scheme` light and dark, full page) for `/story/sideburns` (not today's word, so the today link shows). Send the before and after sets side by side to the owner.
- [ ] **Step 2: Signed-in check (owner signs in, per memory).** The owner signs in themselves in the browser pane. Confirm the story page still shows the date line and the today link, and that the front door shows or hides by the localStorage flag, not by sign-in state. No test accounts.
- [ ] **Step 3: Final whole-branch review**, then merge the worktree branch into `master` locally, following `handover.md`'s process.
- [ ] **Step 4: Deploy.** Push `master`; Vercel's Git integration deploys production. Verify on `https://curioword.com/story/<not-today>`: the today link, the front door, and `?utm_source=email` hiding it. Confirm the digest link format in the next real digest, or preview the HTML with `buildDigestHtml` locally (no send).
- [ ] **Step 5: Update `handover.md`.** Add a "This session (2026-09-26, cont.): story-page front door" section (what changed, the `curio:subscribed` flag and `utm_source=email`, why "Browse all words" was removed, the test count). Update the "Last updated" line and the "Where the conversation was headed next" pointer (Phase 3 next). Update the memory note `prelaunch-brief-status`. Commit and push.
- [ ] **Step 6: Clean up** the dev server, `.next` and the worktree, per handover's workflow notes.
