# Search Discoverability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Curio's 1,147 word-story pages discoverable by search engines — a sitemap and robots file, a crawlable A–Z index, real internal links between story pages, per-page canonical URLs and human-written metadata, `DefinedTerm` structured data, and static rendering for the story route.

**Architecture:** Nine tasks in dependency order. Tasks 1–2 add the crawler files (pure logic in `lib/`, thin route files in `app/`, matching how `lib/collection.ts` already separates logic from components). Task 3 removes the root layout's `auth()` call — the single thing making *every* route in the app dynamic — and replaces the server-resolved session it fed `SessionProvider` with an optimistic localStorage hint. Task 4 then makes `/story/[slug]` itself static by moving the personalised date and `recordUserSeen` into a route handler called by a small client component. Tasks 5–8 add the `/words` index, better metadata, JSON-LD, and a deterministic internal-link block. Task 9 documents the result.

**Tech Stack:** Next.js 16.3.4 (App Router, Turbopack), React 19, TypeScript, Tailwind v4, Vitest, `next-auth@5.0.0-beta.32`. **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-09-20-search-discoverability-design.md` — read it first. It carries the measurements this plan argues from (build-output evidence, link-density counts, lineage bucket sizes); do not re-derive them.

## Global Constraints

- **No new npm dependencies.**
- **No new arbitrary Tailwind values** (`text-[Npx]`, `tracking-[...]`, etc.) and no hand-rolled `<button>`/`<input>` outside `components/ui/`. Read `docs/design-system.md` before writing any UI. Built-in Tailwind utilities (`h-4`, `columns-2`, `gap-x-4`) are fine; they are not arbitrary values.
- `components/AdminDashboard.tsx` is **exempt** — do not touch it.
- **Do not touch `lib/words.ts`'s `resolve*` locking layer**, and do not revert any call site to the unlocked `getWordForDate`/`getWordForUser` functions.
- **Do not generate or edit word content.** `WORDS` is read-only for this plan.
- **No changes to the email digest, the Bluesky post, the puzzle, or accounts.**
- The CC BY-SA Wiktionary attribution must stay reachable from every page (it lives in `components/Footer.tsx`, which is in the root layout — keep it there).
- `npm run lint`, `npx vitest run` and `npm run build` must be clean **after every task**, not just at the end.
- One commit per task. **Do not `git push`** until the user has reviewed the whole branch.
- Work on a branch in the main checkout. **Do not create a git worktree** — `handover.md` records two separate occasions where a leftover worktree inside the repo corrupted lint and test results (1 warning → 309 errors; 51 tests → 102).
- Short doc comments explaining *why*, matching the existing bar (see `app/globals.css`'s `:focus-visible` comment or `lib/words.ts`'s "Locking layer" block).
- Signed-in behaviour must be unchanged: the personal rotation and the shared calendar rotation stay fully separate, exactly as `handover.md` describes.

### Deliberate exceptions (rendered output WILL change here — expected, not bugs)

1. **The story page's date line always reserves its height** (Task 4). Today the `<p>` is omitted entirely when the word has no featured date, which is the case for ~884 of 1,147 words. After Task 4 the date arrives after hydration, so the slot is reserved (`h-4`) on every story page to avoid layout shift — adding ~16px of whitespace above the headword on those ~884 pages. Cumulative Layout Shift is itself a search-ranking signal, so reserving is the correct trade for this task.
2. **The story page's date is JavaScript-dependent** (Task 4). A crawler that doesn't run JS sees the prose, the headword, the lineage and every link, but no date line. The date is metadata, not content.
3. **The footer gains a third item** (Task 5), so it must be verified at 375px width.
4. `StoryView`'s existing "Browse all words →" link keeps pointing at `/history`, even though `/history` shows at most 263 of 1,147 words. Retargeting or rewording it is a copy/product call, not part of this task — Task 8 adds a separate, explicit A–Z link instead.

---

## File Structure

**New files:**
- `lib/siteUrl.ts` — `siteUrl()` / `absoluteUrl()`. One place for the public origin, used by all new SEO code.
- `lib/siteUrl.test.ts`
- `lib/seoRoutes.ts` — `PUBLIC_ROUTES`, `DISALLOWED_PATHS`, `buildSitemapEntries()`, `buildRobots()`. The single source of truth for which routes are crawlable.
- `lib/seoRoutes.test.ts`
- `app/sitemap.ts` — thin wrapper over `buildSitemapEntries()`.
- `app/robots.ts` — thin wrapper over `buildRobots()`.
- `lib/useSessionStatus.ts` — `useSession()`'s status with `"loading"` resolved optimistically from the localStorage hint.
- `app/api/story/[slug]/date/route.ts` — returns the session-appropriate featured date for a word, and fires `recordUserSeen`.
- `components/StoryDate.tsx` — client component that fetches the above.
- `app/words/page.tsx` — the static A–Z index.
- `lib/storyJsonLd.ts` — `buildStoryJsonLd()`, pure.
- `lib/storyJsonLd.test.ts`
- `lib/relatedWords.ts` — `getRelatedWords()`, pure and deterministic.
- `lib/relatedWords.test.ts`

**Modified files:**
- `lib/storage.ts` — adds the session hint (Task 3).
- `lib/useShowArrival.ts`, `components/Header.tsx`, `app/layout.tsx` — Task 3.
- `app/story/[slug]/page.tsx` — Tasks 4, 6, 7, 8.
- `components/StoryView.tsx` — Tasks 4, 8.
- `components/Footer.tsx`, `components/HistoryList.tsx`, `lib/seoRoutes.ts` — Task 5.
- `handover.md` — Task 9.

---

### Task 1: Sitemap

**Files:**
- Create: `lib/siteUrl.ts`, `lib/siteUrl.test.ts`, `lib/seoRoutes.ts`, `lib/seoRoutes.test.ts`, `app/sitemap.ts`

**Interfaces:**
- Produces: `siteUrl(): string` and `absoluteUrl(path: string): string` from `lib/siteUrl.ts` — used by Tasks 2, 6, 7. `PUBLIC_ROUTES`, `DISALLOWED_PATHS`, `SitemapEntry`, `buildSitemapEntries(): SitemapEntry[]` from `lib/seoRoutes.ts` — `DISALLOWED_PATHS` is consumed by Task 2, `PUBLIC_ROUTES` is appended to by Task 5.

**Why pure logic in `lib/`:** `vitest.config.ts` sets no path aliases, so a test cannot import a file that uses `@/…` imports. Every existing test imports its subject relatively (`from "./collection"`). Keeping the logic in `lib/` and the `app/` route files as one-line wrappers is what makes this testable, and matches the existing `lib/collection.ts` split.

- [ ] **Step 1: Write the failing test for the URL helpers**

Create `lib/siteUrl.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { siteUrl, absoluteUrl } from "./siteUrl";

const original = process.env.CURIO_SITE_URL;

afterEach(() => {
  if (original === undefined) delete process.env.CURIO_SITE_URL;
  else process.env.CURIO_SITE_URL = original;
});

describe("siteUrl", () => {
  it("uses CURIO_SITE_URL when set", () => {
    process.env.CURIO_SITE_URL = "https://curio.example";
    expect(siteUrl()).toBe("https://curio.example");
  });

  it("strips trailing slashes so joined paths never double up", () => {
    process.env.CURIO_SITE_URL = "https://curio.example//";
    expect(siteUrl()).toBe("https://curio.example");
  });

  it("falls back to localhost when unset or empty", () => {
    delete process.env.CURIO_SITE_URL;
    expect(siteUrl()).toBe("http://localhost:3000");
    process.env.CURIO_SITE_URL = "";
    expect(siteUrl()).toBe("http://localhost:3000");
  });
});

describe("absoluteUrl", () => {
  it("joins a rooted path", () => {
    process.env.CURIO_SITE_URL = "https://curio.example";
    expect(absoluteUrl("/story/quarantine")).toBe("https://curio.example/story/quarantine");
  });

  it("joins a path missing its leading slash", () => {
    process.env.CURIO_SITE_URL = "https://curio.example";
    expect(absoluteUrl("words")).toBe("https://curio.example/words");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/siteUrl.test.ts`
Expected: FAIL — cannot resolve `./siteUrl`.

- [ ] **Step 3: Implement `lib/siteUrl.ts`**

```ts
// The same CURIO_SITE_URL + localhost fallback that lib/email.ts,
// lib/bluesky.ts and app/layout.tsx each already spell out inline. Those
// three are deliberately left alone here: refactoring outbound email and a
// public Bluesky post mid-SEO-task risks a lot to save three lines. New
// code goes through here so the SEO surface at least has one source of
// truth for the origin.
const FALLBACK_ORIGIN = "http://localhost:3000";

/** The site's public origin, never with a trailing slash. */
export function siteUrl(): string {
  // `||` rather than `??` on purpose — an env var set to "" is a
  // misconfiguration, not a deliberate empty origin, and would otherwise
  // produce protocol-relative garbage like "//sitemap.xml".
  return (process.env.CURIO_SITE_URL || FALLBACK_ORIGIN).replace(/\/+$/, "");
}

export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run lib/siteUrl.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the failing test for the sitemap entries**

Create `lib/seoRoutes.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildSitemapEntries, PUBLIC_ROUTES, DISALLOWED_PATHS } from "./seoRoutes";
import { WORDS } from "./words";

const original = process.env.CURIO_SITE_URL;

beforeEach(() => {
  process.env.CURIO_SITE_URL = "https://curio.example";
});

afterEach(() => {
  if (original === undefined) delete process.env.CURIO_SITE_URL;
  else process.env.CURIO_SITE_URL = original;
});

describe("buildSitemapEntries", () => {
  it("lists every public route and every word, and nothing else", () => {
    const entries = buildSitemapEntries();
    expect(entries).toHaveLength(PUBLIC_ROUTES.length + WORDS.length);
  });

  it("includes every word's story URL exactly once", () => {
    const urls = buildSitemapEntries().map((e) => e.url);
    for (const word of WORDS) {
      const url = `https://curio.example/story/${word.slug}`;
      expect(urls.filter((u) => u === url)).toHaveLength(1);
    }
  });

  it("emits absolute URLs on the configured origin", () => {
    for (const entry of buildSitemapEntries()) {
      expect(entry.url.startsWith("https://curio.example/")).toBe(true);
    }
  });

  it("never leaks a private route", () => {
    const urls = buildSitemapEntries().map((e) => e.url);
    for (const path of DISALLOWED_PATHS) {
      expect(urls.some((u) => u.includes(path))).toBe(false);
    }
  });

  it("contains no duplicate URLs", () => {
    const urls = buildSitemapEntries().map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx vitest run lib/seoRoutes.test.ts`
Expected: FAIL — cannot resolve `./seoRoutes`.

- [ ] **Step 7: Implement `lib/seoRoutes.ts`**

```ts
import { WORDS } from "./words";
import { absoluteUrl } from "./siteUrl";

/** Routes a crawler should index. `/words` is added by the task that
 * creates it — listing a URL here before the route exists would put a 404
 * in the sitemap. */
export const PUBLIC_ROUTES = ["/", "/history", "/play", "/attribution"] as const;

/** Kept out of the sitemap AND disallowed in robots.txt. These are
 * account-scoped, auth-flow or API paths: a crawler can only ever see the
 * signed-out shell of them, so indexing them would put empty or
 * redirect-to-login pages in search results under Curio's name. */
export const DISALLOWED_PATHS = [
  "/admin",
  "/account",
  "/login",
  "/collection",
  "/unsubscribed",
  "/api/",
] as const;

export type SitemapEntry = {
  url: string;
  changeFrequency: "daily" | "weekly" | "monthly";
  priority: number;
};

/** No `lastModified` anywhere in here on purpose: Curio has no per-word
 * modification date, and a build timestamp would be a claim about the
 * content that isn't true. `changeFrequency`/`priority` are hints, not
 * claims of fact, so they stay. */
export function buildSitemapEntries(): SitemapEntry[] {
  const routes: SitemapEntry[] = PUBLIC_ROUTES.map((route) => ({
    url: absoluteUrl(route),
    // "/" and "/play" genuinely change every day (the rotation and the
    // puzzle); the index pages gain at most one row a day.
    changeFrequency: route === "/" || route === "/play" ? "daily" : "weekly",
    priority: route === "/" ? 1 : 0.8,
  }));

  const stories: SitemapEntry[] = WORDS.map((word) => ({
    url: absoluteUrl(`/story/${word.slug}`),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...routes, ...stories];
}
```

- [ ] **Step 8: Run it and watch it pass**

Run: `npx vitest run lib/seoRoutes.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 9: Add the route file**

Create `app/sitemap.ts`:

```ts
import type { MetadataRoute } from "next";
import { buildSitemapEntries } from "@/lib/seoRoutes";

// 1,151 URLs today (1,147 words + 4 public routes) — far inside the
// sitemaps.org 50,000-URL / 50MB ceiling, so no generateSitemaps() split is
// needed. Revisit only if WORDS grows past ~45,000.
export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemapEntries();
}
```

- [ ] **Step 10: Verify against a real dev server**

```bash
npm run dev
```

Fetch `http://localhost:3000/sitemap.xml` and confirm: it is valid XML with a `<urlset>` root, contains `<loc>http://localhost:3000/story/quarantine</loc>`, and the `<url>` element count is 1,151. A quick count:

```bash
curl -s http://localhost:3000/sitemap.xml | grep -c "<loc>"
```

Expected: `1151`. Stop the dev server when done.

- [ ] **Step 11: Verify the suite and commit**

```bash
npm run lint
npx vitest run
npm run build
```

All three clean. Then:

```bash
git add lib/siteUrl.ts lib/siteUrl.test.ts lib/seoRoutes.ts lib/seoRoutes.test.ts app/sitemap.ts
git commit -m "feat: add sitemap.xml covering every word and public route

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: robots.txt

**Files:**
- Modify: `lib/seoRoutes.ts` (append `buildRobots`), `lib/seoRoutes.test.ts` (append a describe block)
- Create: `app/robots.ts`

**Interfaces:**
- Consumes: `DISALLOWED_PATHS` and `absoluteUrl()` from Task 1.
- Produces: `RobotsConfig` and `buildRobots(): RobotsConfig` from `lib/seoRoutes.ts`.

- [ ] **Step 1: Write the failing test**

Append to `lib/seoRoutes.test.ts` (and add `buildRobots` to the existing import from `./seoRoutes`):

```ts
describe("buildRobots", () => {
  it("allows the site root", () => {
    expect(buildRobots().rules.allow).toBe("/");
    expect(buildRobots().rules.userAgent).toBe("*");
  });

  it("disallows every private path", () => {
    const { disallow } = buildRobots().rules;
    for (const path of DISALLOWED_PATHS) {
      expect(disallow).toContain(path);
    }
  });

  it("points at the absolute sitemap URL", () => {
    expect(buildRobots().sitemap).toBe("https://curio.example/sitemap.xml");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/seoRoutes.test.ts`
Expected: FAIL — `buildRobots` is not exported.

- [ ] **Step 3: Implement `buildRobots` in `lib/seoRoutes.ts`**

Append to the end of the file:

```ts
export type RobotsConfig = {
  rules: { userAgent: string; allow: string; disallow: string[] };
  sitemap: string;
};

/** One rule block for every crawler. The disallow list is the same
 * DISALLOWED_PATHS the sitemap excludes, so the two files can't drift into
 * advertising a URL that robots.txt blocks. */
export function buildRobots(): RobotsConfig {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...DISALLOWED_PATHS],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run lib/seoRoutes.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Add the route file**

Create `app/robots.ts`:

```ts
import type { MetadataRoute } from "next";
import { buildRobots } from "@/lib/seoRoutes";

export default function robots(): MetadataRoute.Robots {
  return buildRobots();
}
```

- [ ] **Step 6: Verify against a real dev server**

```bash
npm run dev
```

Fetch `http://localhost:3000/robots.txt`. Expected output, exactly:

```
User-Agent: *
Allow: /
Disallow: /admin
Disallow: /account
Disallow: /login
Disallow: /collection
Disallow: /unsubscribed
Disallow: /api/

Sitemap: http://localhost:3000/sitemap.xml
```

Confirm `/story/quarantine` is **not** blocked by any of those rules. Stop the dev server when done.

- [ ] **Step 7: Verify the suite and commit**

```bash
npm run lint
npx vitest run
npm run build
```

```bash
git add lib/seoRoutes.ts lib/seoRoutes.test.ts app/robots.ts
git commit -m "feat: add robots.txt allowing public routes, blocking private ones

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Stop the root layout forcing every route dynamic

**Files:**
- Modify: `lib/storage.ts` (append the session hint after the `useHasOnboarded`/`markOnboarded` block, around line 156)
- Create: `lib/useSessionStatus.ts`
- Modify: `lib/useShowArrival.ts` (whole file), `components/Header.tsx` (lines 6 and 12, plus the nav's third item), `app/layout.tsx` (lines 9, 41–56)

**Interfaces:**
- Produces: `readSessionHint(): boolean`, `writeSessionHint(signedIn: boolean): void`, `useSessionHint(): boolean` from `lib/storage.ts`; `ResolvedSessionStatus` and `useSessionStatus(): ResolvedSessionStatus` from `lib/useSessionStatus.ts`.

**Background (from the spec — read it):** `app/layout.tsx:48`'s `await auth()` reads cookies, which opts the root layout and therefore **every route in the app** into dynamic rendering. `/attribution` — a page with no auth call at all — is `ƒ` in the baseline build because of it. Removing it is a precondition for Task 4; on its own it does nothing for `/story/[slug]`, which has its own `auth()` call.

**What the server session was buying:** `useSession()` resolving to `"authenticated"` during server render, so `components/Header.tsx` renders the right nav in the initial HTML. Without it, `useSession()` starts at `"loading"` and the header visibly pops its third nav item in and swaps "History" for "Collection" a beat later. The hint below removes that regression.

**Deliberately NOT migrated:** `components/AccountFavoritesSync.tsx` and `components/PuzzleGame.tsx` both read `useSession()` directly, but only inside effects that gate real API calls on `status === "authenticated"`. The hint is an optimistic *display* value, never an authorization signal — leave both on raw `useSession()`.

- [ ] **Step 1: Add the session hint to `lib/storage.ts`**

Insert immediately after `markOnboarded()` (before the `PLAY_STATE_KEY_PREFIX` line):

```ts
const SESSION_HINT_KEY = "curio:signedIn"; // "1" = this browser was signed in last time a session resolved

/** Optimistic "was this browser signed in?" hint, written whenever
 * useSession() resolves and read on the very first client render.
 *
 * app/layout.tsx deliberately no longer calls auth(): doing so read
 * cookies, which opted the root layout — and so every route in the app —
 * into dynamic rendering, and that is what kept 1,147 story pages from
 * being prerendered (see docs/superpowers/specs/
 * 2026-09-20-search-discoverability-design.md for the build-output
 * evidence). Without a server-resolved session, useSession() starts at
 * "loading" on a cold load and the header would pop its third nav item in
 * a beat later. This hint lets the first render assume the previous
 * answer instead of assuming signed out.
 *
 * It is a DISPLAY hint only. It lives in localStorage, is trivially
 * forgeable, and must never gate an API call or an authorization
 * decision — components/AccountFavoritesSync.tsx and
 * components/PuzzleGame.tsx keep reading useSession() directly for
 * exactly that reason. A stale `true` (session expired, or signed out in
 * another tab) shows the signed-in nav for the few hundred milliseconds
 * before useSession() resolves and corrects it. */
export function readSessionHint(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SESSION_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSessionHint(signedIn: boolean) {
  if (typeof window === "undefined") return;
  // Only write on a real change: the caller runs this on every session
  // resolution, and an unconditional notify() would wake every subscriber
  // on every page load for no state change at all.
  if (readSessionHint() === signedIn) return;
  try {
    if (signedIn) window.localStorage.setItem(SESSION_HINT_KEY, "1");
    else window.localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    return;
  }
  notify();
}

export function useSessionHint(): boolean {
  return useSyncExternalStore(subscribe, readSessionHint, () => false);
}
```

- [ ] **Step 2: Create `lib/useSessionStatus.ts`**

```tsx
"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useSessionHint, writeSessionHint } from "./storage";

export type ResolvedSessionStatus = "authenticated" | "unauthenticated";

/** useSession()'s status with the transient "loading" state resolved from
 * the localStorage hint, so callers get a binary answer on the very first
 * render instead of each having to special-case a third state.
 *
 * This is the one place that writes the hint. It is for chrome that has to
 * render *something* immediately (the header's nav, the arrival hero's
 * visibility) — not for anything that acts on the session. See
 * readSessionHint's comment in lib/storage.ts. */
export function useSessionStatus(): ResolvedSessionStatus {
  const { status } = useSession();
  const hint = useSessionHint();

  useEffect(() => {
    if (status === "authenticated") writeSessionHint(true);
    else if (status === "unauthenticated") writeSessionHint(false);
  }, [status]);

  if (status === "loading") return hint ? "authenticated" : "unauthenticated";
  return status;
}
```

- [ ] **Step 3: Point `lib/useShowArrival.ts` at it**

Replace the whole file:

```tsx
"use client";

import { useSessionStatus } from "./useSessionStatus";
import { useHasOnboarded } from "./storage";

/** Whether to show the first-time arrival hero instead of the normal Today
 * page. Requires the RESOLVED negative session state — treating
 * useSession()'s transient "loading" as "anonymous" flashed the arrival
 * hero (and its reduced header) at any signed-in user whose browser hadn't
 * set the onboarded flag, e.g. someone signing in on a second device.
 * useSessionStatus() is what resolves that now (optimistically, from the
 * localStorage hint) so this hook never sees "loading" at all. One shared
 * hook so Header and HomeContent can't independently drift. */
export function useShowArrival(): boolean {
  const status = useSessionStatus();
  const onboarded = useHasOnboarded();
  return status === "unauthenticated" && !onboarded;
}
```

- [ ] **Step 4: Point `components/Header.tsx` at it**

Replace the import on line 6:

```tsx
import { useSessionStatus } from "@/lib/useSessionStatus";
```

Replace line 12:

```tsx
  const status = useSessionStatus();
```

And replace the three-branch third nav item (the `status === "authenticated" ? … : status === "unauthenticated" ? … : null` block) with a two-branch one, since the status is now binary:

```tsx
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
          ) : (
            <Link href="/login" className="text-sm text-ink-soft transition-colors hover:text-ink">
              Sign in
            </Link>
          )}
```

- [ ] **Step 5: Remove `auth()` from `app/layout.tsx`**

Delete the `import { auth } from "@/lib/auth";` line. Make `RootLayout` a non-async function, and replace the session comment and fetch with a session-less provider:

```tsx
export default function RootLayout({ children }: LayoutProps<"/">) {
  // No server-side auth() here on purpose. It reads cookies, which opts the
  // root layout — and therefore every route that shares it — into dynamic
  // rendering; that alone was enough to keep all 1,147 story pages from
  // being prerendered, even though this file never renders them. See
  // lib/storage.ts's readSessionHint comment for how the header avoids the
  // cold-load nav flicker that losing the server session would otherwise
  // reintroduce.
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <ThemeInit />
      </head>
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
    </html>
  );
}
```

- [ ] **Step 6: Confirm the rendering change in the build output**

```bash
npm run build
```

Expected in the route table: `/attribution`, `/login` and `/_not-found` are now `○` (Static) where they were `ƒ`. `/` stays `ƒ` (it has its own `auth()` and must — it renders the word of the day). `/story/[slug]` is **still `ƒ`** at this point; Task 4 fixes that. Record the before/after in the commit message.

- [ ] **Step 7: Verify signed-in and signed-out behaviour live**

```bash
npm run dev
```

This is the step that matters — `handover.md`'s standing rule is that claims get verified against live behaviour, not code review, and three prior sessions each caught a real bug exactly here.

1. **Signed out, cold load** of `/history`: header shows "Today", "History", "Sign in". No flicker, no missing third item.
2. **Sign in** with a magic link. Header shows "Today", "Collection", "Account".
3. **Hard-reload** (Ctrl+Shift+R) while signed in, twice. The header must show "Collection"/"Account" in the *first* paint — no pop-in, no "History"→"Collection" swap. This is what the hint exists for; if it flickers, the hint isn't being read on the first render.
4. **First-time-visitor path:** in a fresh private window, load `/`. The arrival hero must appear, exactly as before.
5. **Sign out**, then reload. Header returns to "History"/"Sign in" with no stale "Account" link persisting beyond the first moment.

Stop the dev server when done.

- [ ] **Step 8: Verify the suite and commit**

```bash
npm run lint
npx vitest run
npm run build
```

```bash
git add lib/storage.ts lib/useSessionStatus.ts lib/useShowArrival.ts components/Header.tsx app/layout.tsx
git commit -m "fix: stop the root layout's auth() forcing every route dynamic

app/layout.tsx's await auth() read cookies, which opted the root layout —
and so every route sharing it — into dynamic rendering. /attribution, a
page with no auth call at all, was dynamic because of it.

SessionProvider now resolves the session client-side, and an optimistic
localStorage hint keeps the header's nav correct on the first paint so the
cold-load flicker the server session was added to fix doesn't return.

/attribution, /login and /_not-found go from dynamic to static.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Make `/story/[slug]` statically rendered

**Files:**
- Create: `app/api/story/[slug]/date/route.ts`, `components/StoryDate.tsx`
- Modify: `app/story/[slug]/page.tsx` (whole file), `components/StoryView.tsx` (the `date` prop and the `{date && …}` block, lines 18 and 61–63)

**Interfaces:**
- Consumes: nothing from Tasks 1–3.
- Produces: `StoryDate` (default export, props `{ slug: string }`). `StoryView`'s `date?: string` prop is **removed** — Task 8 modifies the same component, so it must not expect that prop to exist.

**Why a route handler rather than deleting the date:** the page currently prefers the signed-in account's *own* featured date over the shared calendar's, because the two rotations are independent. That behaviour has to survive. Moving the whole computation (both branches) behind one request keeps it in one place, and means the static HTML never bakes in a date that would go stale as the rotation advances past build time.

**Bonus this removes:** the page calls `resolveHistory()`, which builds 263 dates and issues a 263-key Redis `mget` **on every anonymous story view**, just to print one line. After this task, crawlers and signed-out visitors never trigger it.

- [ ] **Step 1: Create the route handler**

`app/api/story/[slug]/date/route.ts`:

```ts
import { NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { getUserJoinedAt, recordUserSeen } from "@/lib/userData";
import { getWordBySlug, resolveHistory, resolveHistoryForUser } from "@/lib/words";

/** The "featured on <date>" line for a story page, and the recordUserSeen
 * side effect that used to fire from the page body.
 *
 * This lives behind a request rather than in app/story/[slug]/page.tsx
 * because that page calls auth(), which reads cookies and forces the whole
 * route to render dynamically — with 1,147 story pages that is the
 * difference between a prerendered CDN asset and a server render plus a
 * 263-key Redis mget per view. See docs/superpowers/specs/
 * 2026-09-20-search-discoverability-design.md.
 *
 * The signed-in branch is unchanged: an account's own personalized date for
 * this word wins over the shared calendar's, because the two rotations are
 * independent and the shared date can be a stale day for someone whose
 * personal rotation is showing this word right now. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getWordBySlug(slug)) {
    return NextResponse.json({ date: null }, { status: 404 });
  }

  const session = await auth();
  if (session?.user?.id) after(() => recordUserSeen(session.user.id));
  const joinedAtStr = session?.user?.id ? await getUserJoinedAt(session.user.id) : null;
  const personalEntry =
    session?.user?.id && joinedAtStr
      ? (await resolveHistoryForUser(session.user.id, new Date(joinedAtStr + "T00:00:00Z"))).find(
          (d) => d.word.slug === slug
        )
      : undefined;
  const historyEntry = personalEntry ?? (await resolveHistory()).find((d) => d.word.slug === slug);
  const date = historyEntry
    ? new Date(historyEntry.date + "T00:00:00Z").toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : null;

  // Personalized per account — must never be cached by a CDN or shared
  // between visitors.
  return NextResponse.json({ date }, { headers: { "Cache-Control": "private, no-store" } });
}
```

- [ ] **Step 2: Create the client component**

`components/StoryDate.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

/** The story page's "featured on" line. Fetched rather than server-rendered
 * so the page itself stays static — see
 * app/api/story/[slug]/date/route.ts for why.
 *
 * The slot keeps its height whether or not a date arrives: ~884 of 1,147
 * words have never been featured and will never fill it, and a line that
 * appears after hydration would otherwise shove the headword down the page
 * on the ~263 that do. Layout shift is a ranking signal, so reserving is
 * the right trade for this page. */
export default function StoryDate({ slug }: { slug: string }) {
  const [date, setDate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/story/${slug}/date`)
      .then((res) => (res.ok ? res.json() : { date: null }))
      .then((data: { date: string | null }) => {
        if (!cancelled) setDate(data.date);
      })
      .catch(() => {
        // A missing date line is not worth surfacing an error for.
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <p className="mb-6 h-4 font-sans text-xs tracking-wide text-ink-faint">{date}</p>
  );
}
```

- [ ] **Step 3: Make the page pure**

Replace `app/story/[slug]/page.tsx` in full:

```tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import StoryView from "@/components/StoryView";
import { WORDS, getWordBySlug } from "@/lib/words";

export function generateStaticParams() {
  return WORDS.map((w) => ({ slug: w.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const word = getWordBySlug(slug);
  if (!word) return {};
  return {
    title: `${word.word} — Curio`,
    description: word.origin,
  };
}

// Nothing in this component may read cookies, headers, or Redis: every such
// call opts all 1,147 prerendered paths back into per-request rendering.
// The session-dependent parts (the personalized date, recordUserSeen) live
// in app/api/story/[slug]/date/route.ts, fetched by components/StoryDate.tsx.
export default async function StoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const word = getWordBySlug(slug);
  if (!word) notFound();

  return <StoryView word={word} />;
}
```

- [ ] **Step 4: Update `StoryView` to render `StoryDate`**

In `components/StoryView.tsx`: add the import

```tsx
import StoryDate from "./StoryDate";
```

change the signature from `{ word, date }: { word: WordEntry; date?: string }` to:

```tsx
export default function StoryView({ word }: { word: WordEntry }) {
```

and replace the

```tsx
      {date && (
        <p className="mb-6 font-sans text-xs tracking-wide text-ink-faint">{date}</p>
      )}
```

block with:

```tsx
      <StoryDate slug={word.slug} />
```

- [ ] **Step 5: Confirm the rendering change in the build output**

```bash
npm run build
```

Expected in the route table — this is the whole point of the task:

```
├   /story/[slug]
│ ├ ● /story/quarantine
│ ├ ● /story/salary
│ ├ ● /story/disaster
│ └ ● [+1144 more paths]
```

`●` (SSG), not `ƒ`. If it is still `ƒ`, something in the page's import graph is still reading a request-time API — do not proceed until it is `●`. `/story/[slug]/opengraph-image` staying `ƒ` is expected and fine.

- [ ] **Step 6: Verify both session states live**

```bash
npm run dev
```

1. **Signed out**, open `/story/quarantine`. The date line shows the shared calendar's date for that word, same as before this change.
2. **Signed out**, open a story for a word that has never been featured (pick any slug from deep in `WORDS`). No date, no error in the console, and the headword sits in the same place as on `/story/quarantine`.
3. **Signed in**, open a story for a word your account has actually been shown (check `/collection`). It must show **your** personalized date, not the shared calendar's — this is the requirement the brief calls out explicitly. Confirm the two differ where they should by comparing against `/history`'s "All words" date for the same word.
4. Check the network tab: exactly one `/api/story/<slug>/date` request per page view, returning 200.
5. Confirm the OG image route still renders: open `http://localhost:3000/story/quarantine/opengraph-image` directly and confirm a PNG with the word on it.

Stop the dev server when done.

- [ ] **Step 7: Verify the suite and commit**

```bash
npm run lint
npx vitest run
npm run build
```

```bash
git add "app/story/[slug]/page.tsx" "app/api/story/[slug]/date/route.ts" components/StoryDate.tsx components/StoryView.tsx
git commit -m "perf: render story pages statically

The page called auth() for the personalized date, which forced all 1,147
prerendered paths to render per request — and made every anonymous view
issue a 263-key Redis mget through resolveHistory() just to print one line.

Both now live behind GET /api/story/[slug]/date, fetched client-side.
Signed-in behaviour is unchanged: an account's own featured date still wins
over the shared calendar's.

/story/[slug]: dynamic -> SSG, 1,147 paths prerendered.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The `/words` A–Z index

**Files:**
- Create: `app/words/page.tsx`
- Modify: `lib/seoRoutes.ts` (add `/words` to `PUBLIC_ROUTES`), `lib/seoRoutes.test.ts` (assert it), `components/Footer.tsx` (whole file), `components/HistoryList.tsx` (add one link under the tabs, around line 133)

**Interfaces:**
- Consumes: `PUBLIC_ROUTES` from Task 1.
- Produces: the `/words` route, linked from Task 8's related block.

**Why this exists:** `/history` is built from `resolveUniqueWordsMostRecent()`, bounded by days since 2026-01-01 — 263 words today, of which `HistoryList` renders 60 before a client-side "Show more". So ~884 words have never been linked from anywhere. This page lists all 1,147 as plain `<a>` elements in the server-rendered HTML.

- [ ] **Step 1: Write the page**

`app/words/page.tsx`:

```tsx
import Link from "next/link";
import { WORDS } from "@/lib/words";

export const metadata = {
  title: "All words A–Z — Curio",
  description: "Every word Curio has a story for, listed A to Z.",
  alternates: { canonical: "/words" },
};

// The complete index. /history can only ever show the words the shared
// calendar has actually reached (263 today, bounded by days since the
// rotation's start date), and caps that at 60 behind a client-side "Show
// more" — so most of the word bank has never been linked from anywhere at
// all. Everything here is plain server-rendered markup: no client
// component, no pagination, no search. It is an index, not a feature.
function groupByLetter() {
  const sorted = [...WORDS].sort((a, b) => a.word.localeCompare(b.word, "en"));
  const groups = new Map<string, typeof sorted>();
  for (const word of sorted) {
    const letter = word.word[0].toUpperCase();
    const group = groups.get(letter);
    if (group) group.push(word);
    else groups.set(letter, [word]);
  }
  return [...groups.entries()];
}

export default function WordsPage() {
  const groups = groupByLetter();

  return (
    <div className="mx-auto max-w-page px-6 py-16">
      <h1 className="font-serif text-3xl">All words</h1>
      <p className="mt-3 font-sans text-sm text-ink-soft">
        Every word Curio has a story for — {WORDS.length} of them, A to Z.
      </p>

      <nav aria-label="Jump to letter" className="mt-6 flex flex-wrap gap-x-3 gap-y-1">
        {groups.map(([letter]) => (
          <a
            key={letter}
            href={`#${letter.toLowerCase()}`}
            className="font-sans text-sm text-ink-soft transition-colors hover:text-accent"
          >
            {letter}
          </a>
        ))}
      </nav>

      {groups.map(([letter, words]) => (
        <section key={letter} className="mt-10">
          <h2
            id={letter.toLowerCase()}
            className="mb-3 font-sans text-xs tracking-wide text-ink-faint"
          >
            {letter}
          </h2>
          <ul className="columns-2 gap-x-8 sm:columns-3">
            {words.map((word) => (
              <li key={word.slug} className="py-1">
                {/* prefetch={false} deliberately: 1,147 links on one page
                    would otherwise queue 1,147 prefetches as the user
                    scrolls. These pages are prerendered and cheap to load
                    outright. */}
                <Link
                  href={`/story/${word.slug}`}
                  prefetch={false}
                  className="font-serif text-base text-ink transition-colors hover:text-accent"
                >
                  {word.word}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add `/words` to the sitemap**

In `lib/seoRoutes.ts`, change `PUBLIC_ROUTES` to:

```ts
export const PUBLIC_ROUTES = ["/", "/history", "/words", "/play", "/attribution"] as const;
```

and delete the "`/words` is added by the task that creates it" sentence from its doc comment, replacing it with:

```ts
/** Routes a crawler should index. Every other route is private,
 * account-scoped, an auth flow or an API endpoint — see DISALLOWED_PATHS. */
```

In `lib/seoRoutes.test.ts`, append to the `buildSitemapEntries` describe block:

```ts
  it("includes the A–Z index, which is the only page linking every word", () => {
    const urls = buildSitemapEntries().map((e) => e.url);
    expect(urls).toContain("https://curio.example/words");
  });
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run lib/seoRoutes.test.ts`
Expected: PASS (9 tests). The existing length assertion still holds because it is computed from `PUBLIC_ROUTES.length`.

- [ ] **Step 4: Link it from the footer**

Replace `components/Footer.tsx` in full. The attribution link must stay — it is the CC BY-SA requirement and has to be reachable from every page.

```tsx
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-line">
      {/* flex-wrap, not justify-between: a third item makes this row
          overflow at 375px otherwise, and the attribution link is the one
          that must never be pushed off-screen. */}
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-5 gap-y-2 px-6 py-6 font-sans text-xs text-ink-faint">
        <span>Curio</span>
        <Link href="/words" className="hover:text-ink-soft">
          All words
        </Link>
        <Link href="/attribution" className="ml-auto hover:text-ink-soft">
          Word origins from Wiktionary (CC BY-SA)
        </Link>
      </div>
    </footer>
  );
}
```

- [ ] **Step 5: Link it from `/history`**

In `components/HistoryList.tsx`, immediately after the `<SegmentedTabs … />` element and before the `{filter === "mine" && (…)}` block, insert:

```tsx
      {/* /history can only show words the shared calendar has actually
          reached, and caps that at PAGE_SIZE — this is the way to the rest
          of the word bank, for readers and crawlers alike. */}
      <p className="mb-6 font-sans text-sm text-ink-soft">
        <Link href="/words" className="transition-colors hover:text-ink">
          Browse all words A–Z &rarr;
        </Link>
      </p>
```

`Link` is already imported in that file.

- [ ] **Step 6: Confirm it is static and complete**

```bash
npm run build
```

Expected: `○ /words` in the route table (Static).

```bash
npm run dev
```

Then, with JavaScript disabled in the browser (DevTools → Settings → Debugger → Disable JavaScript), load `http://localhost:3000/words` and confirm the words are all visible and clickable. Count the links in the served HTML:

```bash
curl -s http://localhost:3000/words | grep -o 'href="/story/[^"]*"' | sort -u | wc -l
```

Expected: `1147`.

- [ ] **Step 7: Verify the layout at mobile width**

Still on the dev server, set the viewport to 375px wide and check:
1. `/words` — the letter jump-nav wraps cleanly, the columns don't overflow horizontally, and tapping a letter jumps to that section.
2. Any page — the footer's three items wrap onto two lines rather than overflowing, and the attribution link is fully readable. Check light **and** dark.

Stop the dev server when done.

- [ ] **Step 8: Verify the suite and commit**

```bash
npm run lint
npx vitest run
npm run build
```

```bash
git add app/words/page.tsx lib/seoRoutes.ts lib/seoRoutes.test.ts components/Footer.tsx components/HistoryList.tsx
git commit -m "feat: add a crawlable A-Z index at /words

/history is bounded by days since the rotation's start date (263 words
today) and caps each tab at 60 behind a client-side button, so ~884 words
had never been linked from anywhere. /words lists all 1,147 as plain
server-rendered links, and is reachable from the footer on every page.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Per-page metadata worth clicking

**Files:**
- Modify: `app/story/[slug]/page.tsx` (`generateMetadata`, lines 13–24 after Task 4)

**Interfaces:**
- Consumes: nothing new. `metadataBase` is already set in `app/layout.tsx` from `CURIO_SITE_URL`, so a *relative* canonical resolves to an absolute URL automatically — that is why this doesn't need `absoluteUrl()`.

**What's wrong today:** `title` is `"<word> — Curio"` (accurate but says nothing about what the page is), and `description` is the raw `origin` field, which opens mid-thought — `"From Italian quaranta giorni, "forty days" — the wait Venice imposed…"`. There is no canonical URL at all.

**What to use instead:** `teaser` is already a one-sentence hook written for humans and deliberately distinct from `origin`. Measured across all 1,147 entries: min 40, median 81, **max 151 characters** — every one already fits a meta description without truncation, so no truncation helper is needed.

- [ ] **Step 1: Rewrite `generateMetadata`**

```tsx
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const word = getWordBySlug(slug);
  if (!word) return {};

  // `teaser` is the field written to be read cold by a human — one
  // sentence, no mid-thought opening, and deliberately distinct from
  // `origin` (which is the full explanation and starts with "From Latin…"
  // more often than not). Every teaser in the bank is ≤151 characters, so
  // nothing needs truncating for a meta description.
  const description = word.teaser;
  const title = `${word.word}: the origin of the word — Curio`;

  return {
    title,
    description,
    // Relative on purpose: app/layout.tsx's metadataBase resolves it
    // against CURIO_SITE_URL, so this can't drift from the sitemap's origin.
    alternates: { canonical: `/story/${slug}` },
    openGraph: {
      title,
      description,
      url: `/story/${slug}`,
    },
  };
}
```

Note the deliberate omission: no `openGraph.type: "article"`. These pages have no author and no publication date, and `article` invites consumers to look for both.

- [ ] **Step 2: Verify the rendered `<head>` against a real server**

```bash
npm run build
npm run start
```

Use the production server, not `next dev` — this is metadata on a prerendered page, and the built output is what ships.

```bash
curl -s http://localhost:3000/story/quarantine | grep -o '<title>[^<]*</title>'
curl -s http://localhost:3000/story/quarantine | grep -o '<link rel="canonical"[^>]*>'
curl -s http://localhost:3000/story/quarantine | grep -o '<meta name="description"[^>]*>'
```

Expected:
- title: `<title>quarantine: the origin of the word — Curio</title>`
- canonical: an **absolute** URL — `<link rel="canonical" href="http://localhost:3000/story/quarantine"/>`. If it comes out relative, `metadataBase` isn't being applied and the task isn't done.
- description: the quarantine teaser, `"Venice once made incoming ships wait offshore for exactly forty days — no more, no less."`

Also confirm the OG image survived Task 4's rendering change: `curl -sI http://localhost:3000/story/quarantine/opengraph-image` returns `200` and `content-type: image/png`, and the `<head>` still carries an `og:image` meta tag pointing at it.

Stop the server when done.

- [ ] **Step 3: Verify the suite and commit**

```bash
npm run lint
npx vitest run
npm run build
```

```bash
git add "app/story/[slug]/page.tsx"
git commit -m "feat: give story pages canonical URLs and human metadata

Descriptions came from the raw origin field, which opens mid-thought
('From Italian quaranta giorni…'). They now use teaser, which is written
to be read cold and is ≤151 chars across the whole bank. Every page gets a
canonical URL, resolved through the existing metadataBase.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: `DefinedTerm` structured data

**Files:**
- Create: `lib/storyJsonLd.ts`, `lib/storyJsonLd.test.ts`
- Modify: `app/story/[slug]/page.tsx` (render the script tag)

**Interfaces:**
- Consumes: `absoluteUrl()` from Task 1; `WordEntry` from `lib/words.ts`.
- Produces: `buildStoryJsonLd(word: WordEntry): Record<string, unknown>` and `serializeJsonLd(value: unknown): string`.

**Why `DefinedTerm` and not `Article`:** Curio has no author, no publication date and no article body for these pages. `Article` requires inventing at least one of those, and the brief is explicit that only true claims go in. `DefinedTerm` with `inDefinedTermSet` describes exactly what the page is.

- [ ] **Step 1: Write the failing test**

`lib/storyJsonLd.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildStoryJsonLd, serializeJsonLd } from "./storyJsonLd";
import { WORDS } from "./words";

const original = process.env.CURIO_SITE_URL;
const quarantine = WORDS.find((w) => w.slug === "quarantine")!;

beforeEach(() => {
  process.env.CURIO_SITE_URL = "https://curio.example";
});

afterEach(() => {
  if (original === undefined) delete process.env.CURIO_SITE_URL;
  else process.env.CURIO_SITE_URL = original;
});

describe("buildStoryJsonLd", () => {
  it("describes the word as a DefinedTerm in Curio's term set", () => {
    expect(buildStoryJsonLd(quarantine)).toEqual({
      "@context": "https://schema.org",
      "@type": "DefinedTerm",
      name: "quarantine",
      description: quarantine.teaser,
      url: "https://curio.example/story/quarantine",
      inDefinedTermSet: {
        "@type": "DefinedTermSet",
        name: "Curio",
        url: "https://curio.example/words",
      },
    });
  });

  it("claims nothing Curio cannot support", () => {
    // No author, no dates, no ratings — see the spec's "only true claims".
    for (const word of WORDS.slice(0, 50)) {
      const keys = Object.keys(buildStoryJsonLd(word));
      for (const forbidden of ["author", "datePublished", "dateModified", "aggregateRating", "publisher"]) {
        expect(keys).not.toContain(forbidden);
      }
    }
  });

  it("produces valid JSON for every word in the bank", () => {
    for (const word of WORDS) {
      expect(() => JSON.parse(serializeJsonLd(buildStoryJsonLd(word)))).not.toThrow();
    }
  });
});

describe("serializeJsonLd", () => {
  it("escapes < so content can never close the script tag", () => {
    const output = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(output).not.toContain("</script>");
    expect(output).toContain("\\u003c");
    expect(JSON.parse(output)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/storyJsonLd.test.ts`
Expected: FAIL — cannot resolve `./storyJsonLd`.

- [ ] **Step 3: Implement `lib/storyJsonLd.ts`**

```ts
import type { WordEntry } from "./words";
import { absoluteUrl } from "./siteUrl";

/** schema.org DefinedTerm for a word's story page.
 *
 * DefinedTerm, not Article, on purpose: Curio's story pages have no author,
 * no publication date and no article body, and Article would require
 * inventing at least one of them. Every property below is something the
 * page can actually support — the word, the sentence Curio wrote about it,
 * its URL, and the set it belongs to. Nothing else goes in here. */
export function buildStoryJsonLd(word: WordEntry): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: word.word,
    description: word.teaser,
    url: absoluteUrl(`/story/${word.slug}`),
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      name: "Curio",
      url: absoluteUrl("/words"),
    },
  };
}

/** JSON for embedding inside a <script> tag. The `<` escape is what stops
 * any future content containing "</script>" from closing the tag early —
 * the content is Curio's own today, but this is the cheap habit, not the
 * paranoid one. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run lib/storyJsonLd.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Render it on the page**

In `app/story/[slug]/page.tsx`, add the import:

```tsx
import { buildStoryJsonLd, serializeJsonLd } from "@/lib/storyJsonLd";
```

and change the component's return to wrap the view in a fragment carrying the script tag:

```tsx
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildStoryJsonLd(word)) }}
      />
      <StoryView word={word} />
    </>
  );
```

- [ ] **Step 6: Validate the real output**

```bash
npm run build
npm run start
```

Extract the block from three different pages and parse it:

```bash
curl -s http://localhost:3000/story/quarantine | grep -o '<script type="application/ld+json">[^<]*</script>'
```

Confirm for each: it parses as JSON, `@type` is `DefinedTerm`, `url` is absolute and matches the page, `name` matches the headword, and there is no `author`, `datePublished` or `aggregateRating`.

Note on validation scope: Google's Rich Results Test needs a publicly reachable URL, so it cannot run against localhost. The structural checks above plus `lib/storyJsonLd.test.ts` are what can be verified pre-deploy — say so plainly in the task report rather than claiming a Google validation that didn't happen. Run the URL through the Rich Results Test after the branch is deployed.

Stop the server when done.

- [ ] **Step 7: Verify the suite and commit**

```bash
npm run lint
npx vitest run
npm run build
```

```bash
git add lib/storyJsonLd.ts lib/storyJsonLd.test.ts "app/story/[slug]/page.tsx"
git commit -m "feat: add DefinedTerm JSON-LD to story pages

DefinedTerm rather than Article: these pages have no author and no
publication date, and Article would mean inventing one. Only the word, its
teaser, its URL and its term set are claimed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Internal linking between story pages

**Files:**
- Create: `lib/relatedWords.ts`, `lib/relatedWords.test.ts`
- Modify: `app/story/[slug]/page.tsx` (pass the links down), `components/StoryView.tsx` (render the block)

**Interfaces:**
- Consumes: `WORDS`, `WordEntry`, `getWordBySlug` from `lib/words.ts`.
- Produces: `RelatedLink = { slug: string; word: string }`, `RelatedWords = { language: string | null; words: RelatedLink[] }`, and `getRelatedWords(slug: string): RelatedWords`. `StoryView` gains a required `related: RelatedWords` prop.

**Why not prose matching:** `WordEntry.related` is a prose sentence, not structured data. Measured over all 1,147 entries, matching other headwords inside it links only 221 pages (19.3%), leaves 926 dead ends, and produces false positives on incidental English words (`salary → phrase`, `clue → sail`). `lineage` *is* structured, and alphabetical neighbours form a single cycle through all 1,147 words — together they guarantee every page has outbound links and that the whole set is reachable from any entry point. Measured coverage: 1,082/1,147 words have a same-source-language peer; the other 65 rely on the neighbours.

- [ ] **Step 1: Write the failing test**

`lib/relatedWords.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getRelatedWords } from "./relatedWords";
import { WORDS, getWordBySlug } from "./words";

describe("getRelatedWords", () => {
  it("gives every word in the bank at least two outbound links", () => {
    // This is the guarantee the whole approach rests on — 926 of 1,147
    // pages would be dead ends under prose matching. If this ever fails,
    // the internal-link mesh has holes and story pages are orphaned again.
    for (const word of WORDS) {
      expect(getRelatedWords(word.slug).words.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("never links a word to itself, and never repeats a link", () => {
    for (const word of WORDS) {
      const slugs = getRelatedWords(word.slug).words.map((w) => w.slug);
      expect(slugs).not.toContain(word.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it("only ever links to slugs that exist", () => {
    for (const word of WORDS) {
      for (const link of getRelatedWords(word.slug).words) {
        expect(getWordBySlug(link.slug)).toBeDefined();
      }
    }
  });

  it("names a language only when both words genuinely share it", () => {
    for (const word of WORDS) {
      const { language, words } = getRelatedWords(word.slug);
      if (language === null) continue;
      expect(word.lineage).toContain(language);
      // At least one listed word must actually share it — the neighbours
      // filling out the list need not.
      expect(words.some((w) => getWordBySlug(w.slug)!.lineage.includes(language))).toBe(true);
    }
  });

  it("is deterministic", () => {
    expect(getRelatedWords("quarantine")).toEqual(getRelatedWords("quarantine"));
  });

  it("returns nothing for an unknown slug", () => {
    expect(getRelatedWords("not-a-real-word")).toEqual({ language: null, words: [] });
  });

  it("caps the list at six", () => {
    for (const word of WORDS) {
      expect(getRelatedWords(word.slug).words.length).toBeLessThanOrEqual(6);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/relatedWords.test.ts`
Expected: FAIL — cannot resolve `./relatedWords`.

- [ ] **Step 3: Implement `lib/relatedWords.ts`**

```ts
import { WORDS, getWordBySlug, type WordEntry } from "./words";

export type RelatedLink = { slug: string; word: string };
export type RelatedWords = {
  /** The source language the peers genuinely share, or null when this word
   * has no same-language peer at all (65 of 1,147 do not). */
  language: string | null;
  words: RelatedLink[];
};

const MAX_PEERS = 4;
const MAX_TOTAL = 6;

type Index = {
  sorted: WordEntry[];
  positionOf: Map<string, number>;
  byLanguage: Map<string, string[]>;
};

let index: Index | null = null;

/** Built once per process, not per page — 1,147 story pages are
 * prerendered in one build, and rebuilding the buckets for each would be
 * 1,147 full passes over the word bank for no reason. */
function getIndex(): Index {
  if (index) return index;

  const sorted = [...WORDS].sort((a, b) => a.word.localeCompare(b.word, "en") || a.slug.localeCompare(b.slug));
  const positionOf = new Map(sorted.map((w, i) => [w.slug, i]));
  const byLanguage = new Map<string, string[]>();
  for (const word of sorted) {
    // lineage always ends in "English" — grouping on it would put all
    // 1,147 words in one bucket and say nothing.
    for (const language of word.lineage) {
      if (language === "English") continue;
      const bucket = byLanguage.get(language);
      if (bucket) bucket.push(word.slug);
      else byLanguage.set(language, [word.slug]);
    }
  }

  index = { sorted, positionOf, byLanguage };
  return index;
}

function toLink(word: WordEntry): RelatedLink {
  return { slug: word.slug, word: word.word };
}

/** Deterministic outbound links for a story page: up to four words sharing
 * this one's most specific source language, plus its two alphabetical
 * neighbours.
 *
 * The neighbours are what make this a guarantee rather than a best effort.
 * They form a single cycle through all 1,147 words, so every page has at
 * least two outbound links and the whole set is reachable from any entry
 * point — including the 65 words with no same-language peer. That matters
 * because ~884 of these pages are linked from nowhere else at all.
 *
 * Deliberately NOT derived from the `related` prose: measured over the full
 * bank, matching headwords in that sentence covers only 19.3% of pages and
 * produces false positives on incidental English words (salary -> phrase,
 * clue -> sail). See docs/superpowers/specs/
 * 2026-09-20-search-discoverability-design.md. */
export function getRelatedWords(slug: string): RelatedWords {
  const entry = getWordBySlug(slug);
  if (!entry) return { language: null, words: [] };

  const { sorted, positionOf, byLanguage } = getIndex();

  // Smallest qualifying bucket wins: "also from Old Norse" is a more
  // interesting claim than "also from Latin", and both are equally true.
  // Ties break on the language name so the choice never depends on
  // lineage ordering.
  const language =
    entry.lineage
      .filter((l) => l !== "English" && (byLanguage.get(l)?.length ?? 0) > 1)
      .sort((a, b) => byLanguage.get(a)!.length - byLanguage.get(b)!.length || a.localeCompare(b))[0] ?? null;

  const links: RelatedLink[] = [];
  const taken = new Set<string>([slug]);

  if (language) {
    const bucket = byLanguage.get(language)!;
    // Walk forward from this word's own place in the bucket, wrapping —
    // so each word in a bucket points at a different set of peers and
    // every member gets linked from somewhere.
    const start = bucket.indexOf(slug);
    for (let i = 1; i < bucket.length && links.length < MAX_PEERS; i++) {
      const peer = bucket[(start + i) % bucket.length];
      if (taken.has(peer)) continue;
      taken.add(peer);
      links.push(toLink(getWordBySlug(peer)!));
    }
  }

  const position = positionOf.get(slug)!;
  for (const offset of [-1, 1]) {
    const neighbour = sorted[(position + offset + sorted.length) % sorted.length];
    if (taken.has(neighbour.slug)) continue;
    taken.add(neighbour.slug);
    links.push(toLink(neighbour));
  }

  return { language, words: links.slice(0, MAX_TOTAL) };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run lib/relatedWords.test.ts`
Expected: PASS (7 tests). The first test walks all 1,147 words — if it fails, stop and fix the mesh rather than relaxing the assertion.

- [ ] **Step 5: Pass the links from the page**

In `app/story/[slug]/page.tsx`, add the import:

```tsx
import { getRelatedWords } from "@/lib/relatedWords";
```

and pass the result to `StoryView`:

```tsx
      <StoryView word={word} related={getRelatedWords(slug)} />
```

- [ ] **Step 6: Render the block in `StoryView`**

In `components/StoryView.tsx`, add the import:

```tsx
import type { RelatedWords } from "@/lib/relatedWords";
```

change the signature to:

```tsx
export default function StoryView({ word, related }: { word: WordEntry; related: RelatedWords }) {
```

and insert this section between the `<div className="mt-12 space-y-10">` sections block and the `<div className="mt-12 border-t border-line pt-8">` "Browse all words" block:

```tsx
      {related.words.length > 0 && (
        <section className="mt-12">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="font-sans text-xs tracking-wide text-ink-faint">
              {related.language ? `More words from ${related.language}` : "More words"}
            </h2>
            <div className="h-px flex-1 bg-line" />
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {related.words.map((link) => (
              <li key={link.slug}>
                <Link
                  href={`/story/${link.slug}`}
                  className="font-serif text-lg text-ink transition-colors hover:text-accent"
                >
                  {link.word}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/words"
            className="mt-4 inline-block font-sans text-xs text-ink-faint transition-colors hover:text-ink-soft"
          >
            All words A&ndash;Z &rarr;
          </Link>
        </section>
      )}
```

The heading markup deliberately reuses the exact pattern the Origin/Journey/Related sections already use in this file — same classes, same divider — so the block reads as part of the page rather than an SEO bolt-on.

- [ ] **Step 7: Verify live**

```bash
npm run build
npm run start
```

1. Open `/story/quarantine`. The block appears below "Related words", with a heading naming a language that is genuinely in quarantine's lineage (`["Latin", "Italian", "English"]` — so "Latin" or "Italian"), and the links go to real story pages.
2. Follow three links in a row from one story to another without going through an index. That is the mesh working.
3. Confirm the links are in the server HTML, not injected by JavaScript:

```bash
curl -s http://localhost:3000/story/quarantine | grep -o 'href="/story/[^"]*"' | sort -u
```

Expected: several distinct story URLs.
4. Check the block at 375px, light and dark — the word list wraps rather than overflowing.

Stop the server when done.

- [ ] **Step 8: Verify the suite and commit**

```bash
npm run lint
npx vitest run
npm run build
```

```bash
git add lib/relatedWords.ts lib/relatedWords.test.ts "app/story/[slug]/page.tsx" components/StoryView.tsx
git commit -m "feat: link story pages to each other

Every story page now links to up to four words sharing its most specific
source language plus its two alphabetical neighbours. The neighbours form a
single cycle through all 1,147 words, so every page has outbound links and
the whole set is reachable from any entry point.

Not derived from the `related` prose: measured over the full bank that
covers 19.3% of pages and mismatches incidental English words
(salary -> phrase, clue -> sail).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Whole-branch review, handover, cleanup

**Files:**
- Modify: `handover.md`

**Interfaces:** none — this task consumes the finished branch.

- [ ] **Step 1: Run the whole-branch review**

Use `superpowers:requesting-code-review` for a review of the complete diff (`git diff master...HEAD`), not task-scoped reviews. `handover.md` records that the 2026-09-12 session's final review caught two bugs that no task-scoped review could have — a cross-task integration bug and a silent-failure gap — because they only appeared once every piece was visible together. Specifically ask the reviewer to check:
- that nothing reintroduces a request-time API into `/story/[slug]`'s import graph,
- that the session hint is nowhere used as an authorization signal,
- that the sitemap, robots disallow list and actual route structure agree with each other.

- [ ] **Step 2: Run the full verification pass from a clean state**

```bash
git worktree list
```

Expected: only the main checkout. If anything else is listed, remove it before going further — `handover.md` records lint going from 1 warning to 309 errors and tests from 51 to 102 purely from a leftover worktree inside the repo.

```bash
npm run lint
npx vitest run
npm run build
```

All three clean, from the main checkout. In the build's route table confirm, in one place: `● /story/…` with 1,147 paths, `○ /words`, `○ /attribution`.

Then, against a real server (`npm run start`), confirm `/sitemap.xml` has 1,151 `<loc>` entries and `/robots.txt` renders with the sitemap line and all six disallow rules.

- [ ] **Step 3: Update `handover.md`**

Add a `## This session (2026-09-20): search discoverability` section after the 2026-09-19 one, covering:
- What landed, in task order, with the measured before/after: every route dynamic → story pages SSG (1,147 paths) plus `/words`, `/attribution`, `/login` static.
- **The root-layout finding, prominently** — `app/layout.tsx`'s `auth()` made every route in the app dynamic, including pages with no auth call. Anyone adding a server-side `auth()`, `cookies()` or `headers()` call to the root layout again will silently undo all of this, and the build's route table is the only place it shows up. Say that explicitly.
- The session hint (`curio:signedIn` in `lib/storage.ts`): what it is, that it is display-only, and that `AccountFavoritesSync`/`PuzzleGame` deliberately still read `useSession()` directly.
- That `/history` is bounded by days since the rotation's start date (263 today), which is why `/words` exists and why "Browse all words →" in `StoryView` still points at `/history` — a copy decision deliberately left alone.
- The measured link-density numbers, so nobody re-litigates prose matching.
- Deferred, with reasons: (a) no `cacheComponents`/PPR migration — it is the proper Next 16 answer for a static shell with a streamed session, but it is an app-wide change touching every uncached read; (b) `lib/email.ts`, `lib/bluesky.ts` and `app/layout.tsx` still spell out the `CURIO_SITE_URL` fallback inline rather than using `lib/siteUrl.ts`, deliberately not refactored mid-task; (c) the story date is now JavaScript-dependent; (d) Google Rich Results validation needs a public URL and can only be run post-deploy.

Also update the "Architecture map" section with one line each for `lib/siteUrl.ts`, `lib/seoRoutes.ts`, `lib/relatedWords.ts`, `lib/storyJsonLd.ts` and `app/api/story/[slug]/date/route.ts`.

- [ ] **Step 4: Commit the handover**

```bash
git add handover.md
git commit -m "docs: record the search-discoverability session in handover.md

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Clean up**

Stop every dev/production server started during the branch, then:

```bash
rm -rf .next
git status
```

`git status` must show a clean tree with no untracked build artifacts and no worktree directory. Do **not** `git push` — the user reviews the branch first.
