# curio dig placement: release 1 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make curio dig findable from the site (nav, home, arrival, story, /play, dig end screen) and measure which link people came in through.

**Architecture:** A server-read gate (`isDigOpen()`) is passed down as a `digOpen` prop to client components. Internal links carry `?from=<place>`. On `/dig` the client sends a new `via` funnel event once per tab session, then strips the param. Done ticks on the home strip come from existing localStorage (`curio:play:<date>`, `curio:dig`) and render only after hydration.

**Tech stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4 tokens, Vitest (node environment, `renderToStaticMarkup`), lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-07-dig-placement-design.md` (release 1 section).

## Global constraints

- Archive, never backlog (from AGENTS.md):
  - no counts of unplayed things;
  - no "not yet", "you missed" or streak wording;
  - no badges or dots on the nav item;
  - ticks cover today only.
- Design system: only `components/ui/` primitives and the token classes in `app/globals.css`. No new arbitrary Tailwind values such as `text-[..]` or `tracking-[..]`. `max-w-[46ch]` already exists and may be reused. `DigFunnelTable.tsx` is admin-only and exempt.
- Don't touch `scripts/dig/` or `content/dig/`, because another session owns them.
- Run all commands from the worktree `C:/Users/Sam/Documents/Claude/Projects/Curio/curio-web-dig-placement`.
- `from` values are exactly `nav`, `home`, `arrival`, `play` and `story`.
- Dig copy must pass `bannedHits()` from `lib/dig/copyAudit` wherever existing tests apply it.

---

### Task 1: The `via` funnel event (server side and admin)

**Files:**
- Modify: `lib/dig/events.ts` (the `DigEvent` union, `parseDigEvent`, `funnelField`)
- Modify: `lib/dig/funnel.ts` (`DigFunnelRow`, `summarizeDigFunnel`)
- Modify: `components/dig/DigFunnelTable.tsx`
- Test: `lib/dig/events.test.ts`, `lib/dig/funnel.test.ts`

**Interfaces:**
- Produces: `export const VIA_SOURCES = ["nav", "home", "arrival", "play", "story"] as const;` and `export type ViaSource = (typeof VIA_SOURCES)[number];` in `lib/dig/events.ts`
- Produces: the event variant `{ kind: "via"; from: ViaSource }`, which counts the funnel field `via:<from>`
- Produces: `DigFunnelRow.via: Record<string, number>`, for example `{ nav: 3, home: 2 }`

- [ ] **Step 1: Write the failing tests.** Add to `lib/dig/events.test.ts`:

```ts
it("parses a via event from a known internal link and rejects others", () => {
  expect(parseDigEvent({ kind: "via", from: "nav" }, today)).toEqual({ kind: "via", from: "nav" });
  expect(parseDigEvent({ kind: "via", from: "evil" }, today)).toBeNull();
  expect(parseDigEvent({ kind: "via" }, today)).toBeNull();
});
it("counts a via event under via:<from>", () => {
  expect(funnelField({ kind: "via", from: "home" })).toBe("via:home");
});
```

Add to `lib/dig/funnel.test.ts`. The existing `toEqual` row expectation at line 27 also needs `via: {}` added.

```ts
it("collects via counts per row", () => {
  const s = summarizeDigFunnel({ "2026-12-02": { "via:nav": 3, "via:home": 2, start: 1 } }, null, { now: new Date("2026-12-03T00:00:00Z"), rowDates: ["2026-12-02"] });
  expect(s.rows[0].via).toEqual({ nav: 3, home: 2 });
});
```

- [ ] **Step 2: Run the tests and check they fail.** Run `npx vitest run lib/dig/events.test.ts lib/dig/funnel.test.ts`. The new tests should fail.

- [ ] **Step 3: Implement.** In `lib/dig/events.ts`:

```ts
/** Internal links into /dig carry ?from=<one of these> (lib/dig/client.ts sendViaOnce). */
export const VIA_SOURCES = ["nav", "home", "arrival", "play", "story"] as const;
export type ViaSource = (typeof VIA_SOURCES)[number];
```

Add `| { kind: "via"; from: ViaSource }` to `DigEvent`. In `parseDigEvent`'s switch:

```ts
case "via":
  return (VIA_SOURCES as readonly unknown[]).includes(b.from) ? { kind: "via", from: b.from as ViaSource } : null;
```

In `funnelField`, add `case "via": return \`via:${ev.from}\`;`.

In `lib/dig/funnel.ts`, add `via: Record<string, number>` to `DigFunnelRow`, and in the row map:

```ts
via: Object.fromEntries(Object.entries(h).filter(([f]) => f.startsWith("via:")).map(([f, n]) => [f.slice(4), n])),
```

In `DigFunnelTable.tsx`, add a last header cell `<span className="w-40 text-right">via</span>` and a row cell:

```tsx
<span className="w-40 text-right font-sans text-[11px] text-ink-soft">
  {Object.entries(row.via).map(([k, n]) => `${k} ${n}`).join(" · ")}
</span>
```

Then add one sentence to the explanatory paragraph: "via = which Curio link brought a visitor in (nav, home, arrival, play, story), once per tab session."

- [ ] **Step 4: Run the tests and check they pass.** Run `npx vitest run lib/dig components/dig/DigFunnelTable.test.tsx`. Everything should pass.

- [ ] **Step 5: Commit.** Run `git add lib/dig/events.ts lib/dig/events.test.ts lib/dig/funnel.ts lib/dig/funnel.test.ts components/dig/DigFunnelTable.tsx`, then `git commit -m "feat(dig): count which Curio link brought players in (via:<from>)"`.

### Task 2: Send `via` from /dig and strip the param

**Files:**
- Modify: `lib/dig/client.ts`
- Modify: `components/dig/DigGame.tsx`, in the `useEffect` that calls `sendLandOnce()`
- Test: `lib/dig/client.test.ts`

**Interfaces:**
- Consumes: `VIA_SOURCES` and `ViaSource` from Task 1
- Produces: `export function viaFrom(search: string): ViaSource | null` and `export function sendViaOnce(): void`

- [ ] **Step 1: Write the failing test.** Add to `lib/dig/client.test.ts`:

```ts
import { viaFrom } from "./client";
describe("viaFrom", () => {
  it("reads a known from param", () => {
    expect(viaFrom("?from=nav")).toBe("nav");
    expect(viaFrom("?x=1&from=story")).toBe("story");
  });
  it("ignores unknown or missing values", () => {
    expect(viaFrom("?from=evil")).toBeNull();
    expect(viaFrom("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and check it fails.** Run `npx vitest run lib/dig/client.test.ts`.

- [ ] **Step 3: Implement** in `lib/dig/client.ts`. Change the events import to `import { MAX_REJECTED_PER_FINISH, VIA_SOURCES, type ViaSource } from "./events";`, then add:

```ts
export function viaFrom(search: string): ViaSource | null {
  const v = new URLSearchParams(search).get("from");
  return v && (VIA_SOURCES as readonly string[]).includes(v) ? (v as ViaSource) : null;
}

/** Counts which Curio link opened /dig (once per tab session per link), then drops ?from= so
 * a copied or shared URL is clean. */
export function sendViaOnce(): void {
  try {
    const from = viaFrom(window.location.search);
    if (!from) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("from");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    const key = `curio:dig:via:${from}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
    sendDigEvent({ kind: "via", from });
  } catch {
    // private mode: better to under-count
  }
}
```

In `DigGame.tsx`, change `if (!date) sendLandOnce();` to `if (!date) { sendLandOnce(); sendViaOnce(); }` and add `sendViaOnce` to the import.

- [ ] **Step 4: Run the tests and check they pass.** Run `npx vitest run lib/dig`.

- [ ] **Step 5: Commit.** Run `git add lib/dig/client.ts lib/dig/client.test.ts components/dig/DigGame.tsx`, then `git commit -m "feat(dig): send via event from ?from= and strip it"`.

### Task 3: Dig in the header nav

**Files:**
- Modify: `app/layout.tsx` (`<Header />` becomes `<Header digOpen={isDigOpen()} />`, plus the import `import { isDigOpen } from "@/lib/dig/clock";`)
- Modify: `components/Header.tsx`

**Interfaces:**
- Produces: `Header({ digOpen = false }: { digOpen?: boolean })`

- [ ] **Step 1: Implement.** In `Header.tsx`, take the prop, add `const digActive = pathname.startsWith("/dig");`, and add this after the Puzzle link:

```tsx
{digOpen && (
  <Link href="/dig?from=nav" className={navLinkClass(digActive)}>
    Dig
  </Link>
)}
```

Update the comment above `isArrivalRoute` so its link list includes "Dig".

- [ ] **Step 2: Lint and type-check.** Run `npm run lint` and `npx tsc --noEmit`. Both should be clean.

- [ ] **Step 3: Commit.** Run `git add app/layout.tsx components/Header.tsx`, then `git commit -m "feat(nav): Dig link after Puzzle while dig is open"`.

### Task 4: "Also today" strip on the returning homepage

**Files:**
- Create: `components/TodayStrip.tsx`
- Create: `components/TodayStrip.test.tsx`
- Modify: `components/TodayHero.tsx` (remove the "Play today's puzzle" link and render `<TodayStrip digOpen={digOpen} />` after the button row)
- Modify: `components/HomeContent.tsx` (accept and pass `digOpen` to both heroes)
- Modify: `app/page.tsx` (`<HomeContent word={word} date={formatDay(dayKey(now))} digOpen={isDigOpen(now)} />`)

**Interfaces:**
- Produces: `export function isPuzzleDone(s: PlayState | null): boolean`, `export function isDigDone(store: DigStore, today: string): boolean`, and the default `TodayStrip({ digOpen }: { digOpen: boolean })`
- Produces: `HomeContent` and `TodayHero` take `digOpen: boolean`. `ArrivalHero` takes `digOpen?: boolean`, which Task 5 uses.

- [ ] **Step 1: Write the failing test** in `components/TodayStrip.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TodayStrip, { isDigDone, isPuzzleDone } from "./TodayStrip";

describe("isPuzzleDone", () => {
  it("is done once solved or out of clues, not while playing", () => {
    const base = { puzzleDate: "2026-11-07", cluesRevealed: 1 as const, cluesUsedToSolve: null };
    expect(isPuzzleDone(null)).toBe(false);
    expect(isPuzzleDone({ ...base, status: "playing" })).toBe(false);
    expect(isPuzzleDone({ ...base, status: "solved" })).toBe(true);
    expect(isPuzzleDone({ ...base, status: "failed" })).toBe(true);
  });
});

describe("isDigDone", () => {
  it("is done only when today's game is stored", () => {
    const store = { v: 1 as const, settings: { noTimer: false }, games: { "2026-11-06": {} as never } };
    expect(isDigDone(store, "2026-11-07")).toBe(false);
    expect(isDigDone(store, "2026-11-06")).toBe(true);
  });
});

describe("TodayStrip", () => {
  it("lists the puzzle and the dig with no ticks on the server and no counts", () => {
    const html = renderToStaticMarkup(<TodayStrip digOpen />);
    expect(html).toContain('href="/play"');
    expect(html).toContain('href="/dig?from=home"');
    expect(html).toContain("Also today");
    expect(html).not.toContain("done today");
    expect(html).not.toMatch(/\d of \d/);
  });
  it("omits the dig while dig is closed", () => {
    expect(renderToStaticMarkup(<TodayStrip digOpen={false} />)).not.toContain("/dig");
  });
});
```

- [ ] **Step 2: Run the test and check it fails.** Run `npx vitest run components/TodayStrip.test.tsx`.

- [ ] **Step 3: Implement** `components/TodayStrip.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { dayKey } from "@/lib/day";
import { getPlayState, useClientOnlyValue, type PlayState } from "@/lib/storage";
import { readStore, type DigStore } from "@/lib/dig/storage";

export function isPuzzleDone(s: PlayState | null): boolean {
  return !!s && s.status !== "playing";
}

export function isDigDone(store: DigStore, today: string): boolean {
  return !!store.games[today];
}

/** Today's other two things to do, under the story button. Ticks are today-only and show after
 * hydration (the server never knows). Never a count, never "not yet": archive, never backlog. */
export default function TodayStrip({ digOpen }: { digOpen: boolean }) {
  const puzzleDone = useClientOnlyValue(() => isPuzzleDone(getPlayState(dayKey())), false);
  const digDone = useClientOnlyValue(() => isDigDone(readStore(), dayKey()), false);
  const rows = [
    { href: "/play", title: "The puzzle", line: "Guess the word from three clues.", done: puzzleDone },
    ...(digOpen ? [{ href: "/dig?from=home", title: "curio dig", line: "Name words for seven prompts. Rarer ones dig deeper.", done: digDone }] : []),
  ];
  return (
    <div className="mt-8 w-full max-w-form">
      <p className="font-sans text-xs tracking-wide text-ink-faint">Also today</p>
      <ul className="mt-2 border-b border-line">
        {rows.map((r) => (
          <li key={r.href} className="border-t border-line">
            <Link href={r.href} className="group flex items-start justify-between gap-4 py-3">
              <span>
                <span className="block font-sans text-sm text-ink underline-offset-2 group-hover:underline">{r.title}</span>
                <span className="block font-sans text-sm text-ink-soft">{r.line}</span>
              </span>
              {r.done && (
                <span className="mt-0.5 text-ink-soft">
                  <Check size={16} strokeWidth={1.75} aria-hidden />
                  <span className="sr-only">done today</span>
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`useClientOnlyValue` returns a primitive boolean, so the snapshot is reference-stable. If `PlayState` isn't exported as a type, export it from `lib/storage.ts`. Check first: `export type PlayState` is at line 318, so it is.

In `TodayHero.tsx`: add `digOpen` to the props, delete the "Play today's puzzle" `<Link>` and its comment, and render `<TodayStrip digOpen={digOpen} />` straight after the button `div`. Then change the "Past words" paragraph's `mt-6` to `mt-8`.

In `HomeContent.tsx`: add `digOpen: boolean` to the props and pass `digOpen={digOpen}` to both heroes. In `app/page.tsx`: import `isDigOpen` and pass `digOpen={isDigOpen(now)}`.

- [ ] **Step 4: Run the tests and check they pass.** Run `npx vitest run components/TodayStrip.test.tsx` and `npx tsc --noEmit`.

- [ ] **Step 5: Commit.** Run `git add components/TodayStrip.tsx components/TodayStrip.test.tsx components/TodayHero.tsx components/HomeContent.tsx app/page.tsx`, then `git commit -m "feat(home): Also today strip with the puzzle and curio dig"`.

### Task 5: Arrival, story, /play and end-screen links

**Files:**
- Modify: `components/ArrivalHero.tsx`
- Modify: `components/StoryView.tsx`, `app/story/[slug]/page.tsx`
- Modify: `components/PuzzleGame.tsx:276` (`href="/dig"` becomes `href="/dig?from=play"`)
- Modify: `components/dig/EndScreen.tsx`
- Test: `components/dig/EndScreen.test.tsx`

**Interfaces:**
- Consumes: `ArrivalHero` already receives `digOpen?: boolean` from Task 4
- Produces: `StoryView` takes `digOpen?: boolean`

- [ ] **Step 1: Write the failing test.** Add to `components/dig/EndScreen.test.tsx`, using the file's existing `day` and `game` fixtures:

```tsx
it("links today's finished dig to today's word", () => {
  const html = renderToStaticMarkup(<EndScreen day={day} game={game} isToday />);
  expect(html).toContain("Today&#x27;s word on Curio");
  expect(html).toContain("Read where today&#x27;s word came from.");
  expect(bannedHits(html)).toEqual([]);
});
it("does not show the today's-word row on a past dig", () => {
  expect(renderToStaticMarkup(<EndScreen day={day} game={game} isToday={false} />)).not.toContain("Today&#x27;s word on Curio");
});
```

If the markup escapes `'` differently, follow how the file's other tests assert apostrophes.

- [ ] **Step 2: Run the tests and check they fail.** Run `npx vitest run components/dig/EndScreen.test.tsx`.

- [ ] **Step 3: Implement.**

`EndScreen.tsx`: insert this as the first `<li>` of the link list, before the TomorrowHint `li`:

```tsx
{isToday && (
  <li className="border-t border-line">
    <Link href="/" prefetch={false} className={rowLink}>
      <span className="underline underline-offset-2">Today&apos;s word on Curio</span>
      <span className="block text-sm text-ink-soft">Read where today&apos;s word came from.</span>
    </Link>
  </li>
)}
```

`ArrivalHero.tsx`: add `digOpen = false` to the props, and after the "Or play today's puzzle" link add:

```tsx
{digOpen && (
  <Link
    href="/dig?from=arrival"
    onClick={() => markOnboarded()}
    className="mt-3 inline-flex w-fit font-sans text-sm text-ink-soft transition-colors hover:text-ink"
  >
    Or try curio dig, today&apos;s word game &rarr;
  </Link>
)}
```

`app/story/[slug]/page.tsx`: import `isDigOpen` and pass `digOpen={isDigOpen()}` to `StoryView`. The page is static, so this is read at build time. That is acceptable, as the spec says.

`StoryView.tsx`: add `digOpen = false` to the props, and after the "Play today's puzzle" link add:

```tsx
{digOpen && (
  <Link
    href="/dig?from=story"
    className="block font-sans text-sm text-ink-soft transition-colors hover:text-ink"
  >
    Or play today&apos;s dig &rarr;
  </Link>
)}
```

`PuzzleGame.tsx`: change the dig link's href to `/dig?from=play`.

- [ ] **Step 4: Run all the tests.** Run `npx vitest run`, `npm run lint` and `npx tsc --noEmit`. Everything should pass. If a test asserts the old `/dig` href in PuzzleGame, update it to the new href.

- [ ] **Step 5: Commit.** Run `git add components/ArrivalHero.tsx components/StoryView.tsx "app/story/[slug]/page.tsx" components/PuzzleGame.tsx components/dig/EndScreen.tsx components/dig/EndScreen.test.tsx`, then `git commit -m "feat(dig): cross-links from arrival, story, /play and the dig end screen"`.

### Task 6: Verify locally, then ship

- [ ] **Build.** Run `npm run build`. It should succeed.
- [ ] **Browser checks** in local dev, at 375px, 320px and desktop:
  - The nav shows Dig and wraps cleanly at 320px.
  - The home strip shows two rows. Ticks appear after finishing the puzzle or the dig locally.
  - The arrival line shows when localStorage is cleared.
  - The story footer link works.
  - The dig end-screen row appears.
  - `/dig?from=nav` loses its `?from=` and sends a `via` POST, visible in the network panel.
- [ ] **Review.** Run `superpowers:requesting-code-review` on the branch diff.
- [ ] **Merge and deploy.** Merge to master (fast-forward) and push. Pushing deploys production.
- [ ] **Production checks.** Verify on curioword.com at 375px and desktop. Repeat the browser checks above, and confirm `/api/dig/event` returns 204 or 200 for `via`.
