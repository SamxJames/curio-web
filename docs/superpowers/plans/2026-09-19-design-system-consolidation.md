# Design System Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Curio's 18 distinct arbitrary Tailwind values (type size, tracking, leading, spacing, radius, container width) with a small token scale, extract the 23 near-duplicate `<button>`/4 `<input>` call sites into shared `components/ui/` primitives, fix four measured WCAG contrast failures plus three missing `aria-live` regions, and document all of it.

**Architecture:** Four phases, each building on the last. Phase 1 extends `app/globals.css`'s existing `@theme inline` block (already the pattern for the 9-token color layer) with type/tracking/leading/container tokens, then migrates every arbitrary-value call site to use them — additive and mechanical, no new components. Phase 2 builds `components/ui/` primitives from the *migrated* call sites' actual patterns (Button, IconButton, TextField, SegmentedControl, Eyebrow — `Surface` is dropped, see Task 11's note) and refactors every call site to use them; the primitives bake in Phase 3's accessibility rules from the start (44px targets, no redundant focus ring, `aria-pressed`) rather than being built once and immediately reworked. Phase 3 is then mostly just the color-contrast fixes (behind an explicit approval checkpoint) plus the three `aria-live` additions Phase 2 couldn't have anticipated. Phase 4 documents the result.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4 (`@theme`), `clsx` (already a dependency, no new ones).

**Spec:** `docs/superpowers/specs/2026-09-19-design-system-consolidation-design.md` (source audit: `curio-web-design-system-prompt.md`, repo root).

## Global Constraints

- No new npm dependencies. No new color tokens beyond Phase 3's four justified additions. No new fonts.
- `npm run lint`, `npx vitest run`, `npm run build` clean after **every task**, not just at the end.
- `components/AdminDashboard.tsx` is **exempt** from every phase of this plan — do not touch it.
- Phases 1–2 must not change rendered output except for the deliberate exceptions listed below. Verify each task visually (`npm run dev`, screenshot or direct inspection of the affected screen, light and dark) before committing — there is no automated visual-regression coverage in this codebase, so this manual check is the actual test for CSS/markup-only tasks.
- One commit per task. **Do not `git push` until the user has reviewed the whole batch.**
- Short doc comments explaining *why*, matching existing style (see `app/globals.css`'s `:focus-visible` comment for the bar).
- If a phase runs bigger than this plan estimated, stop and say so rather than compress the work.

### Deliberate exceptions (rendered output WILL change here — expected, not bugs)

1. Type-size floor: `text-[9px]`/`[9.5px]`/`[10px]`/`[10.5px]` → `text-micro` (11px) — a visible 0.5–2px increase on ~13 label/badge/tab elements in `CollectionScreen.tsx` and one in `ArrivalHero.tsx`.
2. `CollectionScreen.tsx`'s `text-[26px]` word title → `text-2xl` (24px, a 2px trim).
3. `CollectionScreen.tsx`'s `text-[15px]` elements → `text-base` (16px, ~1px nudge).
4. `ArrivalHero.tsx`'s teaser paragraph: `text-[19px] leading-[1.38]` → `text-lg leading-relaxed`, matching `TodayHero.tsx`'s equivalent paragraph exactly (both size and leading).
5. Radius rule change: `PuzzleGame.tsx`'s guess input+button, both `login/page.tsx` buttons + its email input, `HistoryList.tsx`'s search input, and `account/page.tsx`'s Subscribe/Sign out buttons move from `rounded-md` to `rounded-full` (pill). `HistoryList.tsx`'s full-width "Show more" button stays `rounded-md` (the one exception — see spec).
6. `CollectionScreen.tsx`'s one `rounded-[2px]` filter chip becomes `rounded-full`, matching the rest of that filter row.
7. `account/page.tsx`'s Subscribe button padding: `py-2` → `py-2.5`, fixing an existing one-off inconsistency with every other primary button (this was a bug, not a variant).
8. Container-width outliers: `unsubscribed/page.tsx`'s `max-w-[480px]` and `CollectionScreen.tsx`'s `max-w-[560px]` both snap to `max-w-form` (440px) — likely-unintentional drift, not deliberate narrower layouts.
9. Phase 3's contrast fixes (colors) — candidate values proposed and computed at the Task 12 checkpoint, but not final until the user approves them there; this plan does not pre-decide them.

---

## File Structure

New files:
- `lib/ogTheme.ts` — the 4 distinct hex values used across the 3 OG image routes (server-rendered, can't use CSS vars), extracted to one place.
- `components/ui/Button.tsx` — `primary`/`secondary`/`ghost`/`link` variants × `sm`/`md` sizes, `disabled`/`loading`/`fullWidth` props.
- `components/ui/IconButton.tsx` — required `label` prop → `aria-label`, 44×44 minimum hit area, optional visible children (for `ThemeToggle`'s responsive text label).
- `components/ui/TextField.tsx` — one radius (pill), one fill, optional leading icon, optional visible label, `aria-describedby` error state.
- `components/ui/SegmentedControl.tsx` — the `aria-pressed` toggle-group pattern already used twice in `CollectionScreen.tsx`, extended to `HistoryList.tsx`'s tabs (which currently have no `aria-pressed` at all).
- `components/ui/Eyebrow.tsx` — the uppercase+tracked+tiny-label pattern (10 in-scope instances; see Task 11's note on the 15→10 count).
- `docs/design-system.md` — Phase 4.

Modified files (Phase 1): `app/globals.css`, `components/CollectionScreen.tsx`, `components/ArrivalHero.tsx`, `components/TodayHero.tsx`, `components/StoryView.tsx`, `components/PuzzleGame.tsx`, `components/HistoryList.tsx`, `components/Header.tsx`, `components/Footer.tsx`, `components/AccountFavoritesSync.tsx`, `app/play/page.tsx`, `app/attribution/page.tsx`, `app/login/page.tsx`, `app/account/page.tsx`, `app/unsubscribed/page.tsx`.

Modified files (Phase 2, on top of the above): `components/ThemeToggle.tsx`, `components/EmailSignupInline.tsx`.

Modified files (Phase 3): `app/globals.css` (color values), `components/EmailSignupInline.tsx`, `app/login/page.tsx`, `components/PuzzleGame.tsx`.

Modified files (Phase 4): `AGENTS.md`, `handover.md`.

---

### Task 1: Define Phase 1 design tokens in `app/globals.css`

**Files:**
- Modify: `app/globals.css` (whole file)

**Interfaces:**
- Produces: Tailwind utilities `text-micro`, `text-display`, `tracking-headline`, `tracking-label`, `tracking-wide`, `tracking-wider`, `tracking-widest`, `leading-display`, `leading-body`, `max-w-page`, `max-w-form` (all auto-generated by Tailwind v4 from the `@theme` namespaces `--text-*`/`--tracking-*`/`--leading-*`/`--container-*`), plus the plain CSS variable `--duration-theme` consumed directly in this same file's `body` rule. Every later task in Phase 1 and 2 consumes these.

- [ ] **Step 1: Add the new theme tokens**

Replace the full contents of `app/globals.css` with:

```css
@import "tailwindcss";

:root {
  --paper: #f1ece0;
  --paper-raised: #e9e2d0;
  --ink: #24302b;
  --ink-soft: #5b665f;
  --ink-faint: #8a9089;
  --accent: #9c6b30;
  --accent-deep: #7a4f1e;
  --line: #d8cfbc;
  --danger: #a13f3f;
}

[data-theme="dark"] {
  --paper: #17140f;
  --paper-raised: #211c15;
  --ink: #ece6d6;
  --ink-soft: #b0a891;
  --ink-faint: #7d7666;
  --accent: #d3a35f;
  --accent-deep: #e8bd82;
  --line: #3a3226;
  --danger: #d97b7b;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper: #17140f;
    --paper-raised: #211c15;
    --ink: #ece6d6;
    --ink-soft: #b0a891;
    --ink-faint: #7d7666;
    --accent: #d3a35f;
    --accent-deep: #e8bd82;
    --line: #3a3226;
    --danger: #d97b7b;
  }
}

:root {
  --font-newsreader: "Newsreader", ui-serif, Georgia, serif;
  --font-work-sans: "Work Sans", ui-sans-serif, system-ui, sans-serif;

  /* Site-wide theme-switch fade (see the `body` rule below) — deliberately
   * its own token, not reusing Tailwind's interactive-element transition
   * default (150ms): a full light/dark swap reads better slower than a
   * hover state does. Consumed directly via var(), not through @theme,
   * since it isn't backing a generated Tailwind utility class. */
  --duration-theme: 250ms;
}

@theme inline {
  --color-paper: var(--paper);
  --color-paper-raised: var(--paper-raised);
  --color-ink: var(--ink);
  --color-ink-soft: var(--ink-soft);
  --color-ink-faint: var(--ink-faint);
  --color-accent: var(--accent);
  --color-accent-deep: var(--accent-deep);
  --color-line: var(--line);
  --color-danger: var(--danger);
  --font-serif: var(--font-newsreader);
  --font-sans: var(--font-work-sans);

  /* Type size: every arbitrary text-[Npx] in the app collapses onto either
   * an existing Tailwind default (text-sm/base/lg/2xl/4xl — no token needed
   * for those, they're already consistent) or one of these two genuine
   * outliers. --text-micro is the accessibility floor for the smallest
   * labels (was 9/9.5/10/10.5/11px scattered across CollectionScreen.tsx —
   * see docs/superpowers/specs/2026-09-19-design-system-consolidation-design.md
   * for the full before/after mapping). --text-display is ArrivalHero's
   * word headline, deliberately between Tailwind's text-4xl (36px) and
   * text-5xl (48px) with no close match to either. */
  --text-micro: 11px;
  --text-display: 44px;

  /* Letter spacing: 9 arbitrary values collapse to 5 (one more than the
   * spec's ~4 estimate — see docs/design-system.md once Phase 4 lands for
   * why: the negative headline value is categorically different from the
   * other four "spread out" values, not just another point on the same
   * scale). */
  --tracking-headline: -0.015em;
  --tracking-label: 0.06em;
  --tracking-wide: 0.1em;
  --tracking-wider: 0.12em;
  --tracking-widest: 0.18em;

  /* Line height: 6 arbitrary values collapse to 2 new tokens here, plus
   * Tailwind's own existing leading-relaxed (1.625, already used by
   * TodayHero's teaser and — after Task 3 — ArrivalHero's) for the "long
   * reading paragraph" case, giving 3 effective steps total, matching the
   * spec's ~3 estimate once you count what was already there. */
  --leading-display: 1.05;
  --leading-body: 1.5;

  /* Container widths: 640px is already the de facto page-shell standard
   * (10 uses); 440px is the form-shell standard once its two outliers
   * (480px, 560px) snap onto it — see this plan's deliberate-exceptions
   * list. The existing 46ch prose measure (3 uses, already consistent)
   * isn't tokenized — it's a text-measure unit, not a layout width, and
   * nothing about it needed fixing. */
  --container-page: 40rem; /* 640px */
  --container-form: 27.5rem; /* 440px */
}

* {
  border-color: var(--line);
}

html {
  color-scheme: light;
}

[data-theme="dark"] {
  color-scheme: dark;
}

body {
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-work-sans), ui-sans-serif, system-ui, sans-serif;
  transition: background-color var(--duration-theme) ease, color var(--duration-theme) ease;
}

::selection {
  background: var(--accent);
  color: var(--paper);
}

/* Every focusable element gets a visible ring in the accent color —
 * :focus-visible (not :focus) so it only shows for keyboard/assistive-tech
 * navigation, not every mouse click. A ring (outline, drawn outside the box)
 * rather than a border-color change: border changes are easy to miss for
 * low-vision users and don't meet WCAG 2.4.11's non-text contrast
 * requirement the way a distinct outline does. */
:focus-visible {
  /* Longhand, not the `outline` shorthand — Lightning CSS's shorthand
   * expansion was silently dropping the var(--accent) reference from the
   * outline-color it generated, rendering a default/inherited color instead
   * (confirmed visually: the ring rendered in ink-soft, not accent, despite
   * the shorthand's cssText showing var(--accent) correctly). Longhand
   * properties avoid that expansion step entirely. */
  outline-width: 2px;
  outline-style: solid;
  outline-color: var(--accent);
  outline-offset: 2px;
}

/* Hides the hour wheel's native scrollbar while keeping it scrollable */
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
```

This is additive only — every existing arbitrary-value call site is untouched until later tasks, and `--duration-theme` (250ms) is the exact same value the old hardcoded `0.25s` already was, so this step alone changes zero rendered output.

- [ ] **Step 2: Verify no visual change**

```bash
npm run dev
```

Load `/` in a browser, toggle the theme switcher, confirm the fade still takes the same ~250ms it did before. Stop the dev server after checking.

- [ ] **Step 3: Lint, typecheck, build**

```bash
npm run lint
npx tsc --noEmit -p .
npx vitest run
npm run build
```

Expected: all clean. (`npm run build` also regenerates `.next/types`, needed for a clean `tsc` run afterward — if `tsc` reports a stray `Cannot find name 'LayoutProps'` error before you've run `build` once, that's this project's known pre-existing quirk, not a regression; re-run `tsc` after `build` to confirm.)

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat: add Phase 1 design tokens (type, tracking, leading, container, motion)"
```

---

### Task 2: Migrate `CollectionScreen.tsx` to the new tokens

**Files:**
- Modify: `components/CollectionScreen.tsx`

**Interfaces:**
- Consumes: `text-micro`, `text-display` (unused here), `tracking-label`/`wide`/`wider`/`widest`, `leading-display`/`body` from Task 1.
- Produces: nothing new consumed by later tasks — Task 10 (SegmentedControl) and Task 11 (Eyebrow) will touch this same file again later for structural (not just class-name) changes; this task is class-name-only.

This is the file carrying the large majority of Phase 1's arbitrary values. Apply these exact replacements (read the file first — line numbers below are from the current committed version and may drift by the time earlier tasks in this plan land, since none of them touch this file; re-locate by the quoted `old_string` if a line number is off by a line or two):

- [ ] **Step 1: Type size, tracking, leading — apply the mapping**

| Line (approx) | Old | New |
|---|---|---|
Values below are verified against the actual current file (a couple of raw px values in the original audit data were transcribed wrong — e.g. lines 68 and 304 are really 10.5px, not 9.5px as first reported — this table has the corrected values). The "Old" column shows only the token-relevant classes; other classes on the same element (e.g. line 64's `font-normal`, line 68's `mt-2.5`) are untouched, not shown here, and not part of this mapping.

| Line (approx) | Old | New |
|---|---|---|
| 64 | `text-[36px] tracking-[-0.015em] leading-[1.05]` | `text-4xl tracking-headline leading-display` |
| 68 | `text-[10.5px] tracking-[0.12em]` (subline) | `text-micro tracking-wider` |
| 79 | `text-[11px] tracking-[0.12em]` (Collection tab — a `<Link>`, not a `<button>`; see Task 10 Step 4) | `text-micro tracking-wider` |
| 89 | `text-[11px] tracking-[0.12em]` (History tab — also a `<Link>`) | `text-micro tracking-wider` |
| 99 | `text-[15px]` (empty-state message) | `text-base` |
| 163 | `text-[18px]` (h2) | `text-lg` |
| 164 | `text-[9.5px] tracking-[0.1em]` (tap to filter) | `text-micro tracking-wide` |
| 208 | `text-[10.5px] tracking-[0.05em]` (chip label) | `text-micro tracking-label` |
| 213 | `text-[9px]` (chip count badge) | `text-micro` |
| 219 | `text-[13.5px] leading-[1.5]` (band note) | `text-sm leading-body` |
| 226 | `text-[16px]` (active filter line) | `text-base` |
| 230 | `text-[10px] tracking-[0.1em]` (clear button) | `text-micro tracking-wide` |
| 241 | `text-[9.5px] tracking-[0.18em]` (month header, collection) | `text-micro tracking-widest` |
| 259 | `text-[15px] leading-[1.55]` (closing fact line) | `text-base leading-body` |
| 301 | `text-[26px] leading-[1.1]` (WordRow title) | `text-2xl leading-display` |
| 304 | `text-[10.5px] tracking-[0.06em]` (respelling/POS) | `text-micro tracking-label` |
| 309 | `text-[15px] leading-[1.45]` (WordRow teaser) | `text-base leading-body` |
| 312 | `text-[9.5px] tracking-[0.13em]` (lineage container — non-interactive wrapper; the per-language `<button>`s inside it at line 324 have no typography classes of their own, they inherit this) | `text-micro tracking-wider` |
| 339 | `text-[9.5px] tracking-[0.08em]` (WordRow date, no `uppercase` — a token-scale fix only, not an Eyebrow-primitive candidate, see Task 11's note) | `text-micro tracking-label` |
| 351 | `text-[14px]` (History intro line) | `text-sm` |
| 354 | `text-[9.5px] tracking-[0.18em]` (month header, history) | `text-micro tracking-widest` |
| 363 | `text-[10px] tracking-[0.06em]` (History date, no `uppercase` — same note as line 339) | `text-micro tracking-label` |
| 366 | `text-[18px]` (History row title) | `text-lg` |
| 367 | `text-[9.5px] tracking-[0.1em]` (History POS tag) | `text-micro tracking-wide` |

- [ ] **Step 2: Spacing — snap to the nearest Tailwind default**

| Line (approx) | Old | New |
|---|---|---|
| 62 | `pb-[34px]` | `pb-8` (32px) |
| 63 | `pt-[30px]` | `pt-8` (32px) |
| 74 | `mt-[22px]` | `mt-6` (24px) |
| 79 | `mr-[24px]` | `mr-6` |
| 99 | `mt-[28px]` | `mt-7` (28px) |
| 161 | `pt-[28px]` | `pt-7` |
| 169 | `mt-[14px]`, `h-[28px]`, `gap-[2px]` | `mt-3.5` (14px), `h-7` (28px), `gap-0.5` (2px) |
| 194 | `gap-[6px]` | `gap-1.5` |
| 208 | `gap-[5px]`, `px-[9px]`, `py-[5px]` | `gap-1.5` (6px, nearest — a 1px change from 5, within the same tolerance as the type-size floor bump), `px-2` (8px), `py-1` (4px) |
| 219 | `mt-[14px]` | `mt-3.5` |
| 225 | `mt-[26px]` | `mt-6.5` if available, else `mt-6` (24px) — Tailwind v4's default scale includes half-steps; verify `mt-6.5` (26px) generates a real utility before using it, otherwise use `mt-6` and note the 2px change |
| 241 | `pt-[26px]` | same 26px handling as above |
| 259 | `mt-[30px]`, `pt-[22px]` | `mt-8` (32px), `pt-5.5` if available else `pt-5` (20px) |
| 300 | `gap-[7px]` | `gap-1.5` (6px) or `gap-2` (8px), whichever is visually closer once you see it rendered — this one genuinely straddles the grid, use your judgment and note the choice in the commit message |
| 304 | `mt-[5px]` | `mt-1` (4px) |
| 312 | `gap-x-[7px]` | same as line 300's `gap-[7px]` |
| 350 | `pt-[22px]` | `pt-5.5`/`pt-5` per line 259's note |
| 354 | `pt-[26px]` | same as line 241 |
| 363 | `w-[42px]` | `w-11` (44px, and conveniently lands exactly on the 44px accessibility target width for this date column) — check this doesn't clip the widest date string ("Sep 18") before committing |

For every value in this table that doesn't land exactly on Tailwind's default scale, pick the visually-nearest default and note in the commit message which ones were a genuine judgment call (26px, 22px, 7px) versus an exact/near-exact match (34→32, 30→32, 22→24, etc.).

- [ ] **Step 3: Radius — fold the one arbitrary chip radius into the pill rule**

Line 208's `rounded-[2px]` becomes `rounded-full`, matching every other pill-shaped control in the app (this is the one deliberate exception from this plan's exceptions list, not a bug).

- [ ] **Step 4: Verify no unintended visual change**

```bash
npm run dev
```

Load `/collection` (sign in first if needed — this screen requires an account) in both light and dark mode. Compare against the deliberate-exceptions list in this plan's header — every difference you see should be explained by one of the 9 listed exceptions (this file touches #1, #2, #3, #6, #8). Anything else is a bug — fix it before committing.

- [ ] **Step 5: Lint, typecheck, test, build**

```bash
npm run lint
npx tsc --noEmit -p .
npx vitest run
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add components/CollectionScreen.tsx
git commit -m "refactor: migrate CollectionScreen.tsx to Phase 1 design tokens"
```

---

### Task 3: Migrate `ArrivalHero.tsx` to the new tokens

**Files:**
- Modify: `components/ArrivalHero.tsx:32-53` (the eyebrow, headline, and teaser paragraph)

**Interfaces:**
- Consumes: `text-micro`, `text-display`, `tracking-wider` from Task 1.

- [ ] **Step 1: Apply the mapping**

In `components/ArrivalHero.tsx`, make these exact changes:

Line 32 (eyebrow) — from:
```tsx
<p className="font-sans text-[11px] tracking-[0.14em] text-accent uppercase">
```
to:
```tsx
<p className="font-sans text-micro tracking-wider text-accent uppercase">
```
(11px stays 11px — no visible change. 0.14em collapses into `--tracking-wider`'s 0.12em, a 0.02em nudge, within tolerance.)

Line 36 (headline) — from:
```tsx
<h1 className="mt-4 font-serif text-[44px] leading-[1.05] font-bold">{word.word}</h1>
```
to:
```tsx
<h1 className="mt-4 font-serif text-display leading-display font-bold">{word.word}</h1>
```
(exact match, zero visual change.)

Line 41 (teaser paragraph) — from:
```tsx
<p className="mt-6 max-w-[46ch] font-serif text-[19px] leading-[1.38] text-ink">
```
to:
```tsx
<p className="mt-6 max-w-[46ch] font-serif text-lg leading-relaxed text-ink">
```
This is deliberate exception #4 — fully matches `TodayHero.tsx`'s equivalent teaser paragraph (`text-lg leading-relaxed`) rather than partially matching (size only). A real, visible size/leading change on this one paragraph.

- [ ] **Step 2: Verify**

```bash
npm run dev
```

Clear local storage (or open an incognito window) so the arrival hero actually renders instead of the returning-visitor Today view, load `/`, compare light and dark against the deliberate-exceptions list (exception #4 applies here).

- [ ] **Step 3: Lint, typecheck, test, build**

```bash
npm run lint
npx tsc --noEmit -p .
npx vitest run
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add components/ArrivalHero.tsx
git commit -m "refactor: migrate ArrivalHero.tsx to Phase 1 tokens, match TodayHero's teaser treatment"
```

---

### Task 4: Roll out `max-w-page`/`max-w-form` container tokens

**Files:**
- Modify: `components/TodayHero.tsx`, `components/ArrivalHero.tsx`, `components/StoryView.tsx`, `components/PuzzleGame.tsx`, `components/HistoryList.tsx`, `components/Header.tsx`, `components/Footer.tsx`, `components/AccountFavoritesSync.tsx`, `components/CollectionScreen.tsx`, `app/play/page.tsx`, `app/attribution/page.tsx`, `app/login/page.tsx`, `app/account/page.tsx`, `app/unsubscribed/page.tsx`

**Interfaces:**
- Consumes: `max-w-page`, `max-w-form` from Task 1.

This is one mechanical find-and-replace per file — `max-w-[640px]` → `max-w-page` everywhere it appears, `max-w-[440px]` → `max-w-form` everywhere it appears, and the two outliers snap to `max-w-form` too (deliberate exception #8).

- [ ] **Step 1: Replace `max-w-[640px]` → `max-w-page`**

In each of these files, replace the literal string `max-w-[640px]` with `max-w-page` (one occurrence per file, in the outermost section/div):

- `components/TodayHero.tsx:15`
- `components/ArrivalHero.tsx:23`
- `components/StoryView.tsx:53`
- `components/PuzzleGame.tsx:119`
- `components/HistoryList.tsx:122`
- `components/Header.tsx:33`
- `components/Footer.tsx:6`
- `components/AccountFavoritesSync.tsx:59`
- `app/play/page.tsx:19`
- `app/attribution/page.tsx:5`

- [ ] **Step 2: Replace `max-w-[440px]` → `max-w-form`, and the two outliers**

- `app/login/page.tsx:82` and `:115` — `max-w-[440px]` → `max-w-form`
- `app/account/page.tsx:30` — `max-w-[440px]` → `max-w-form`
- `app/unsubscribed/page.tsx:12` — `max-w-[480px]` → `max-w-form` (deliberate exception #8, a 40px narrowing)
- `components/CollectionScreen.tsx:62` — `max-w-[560px]` → `max-w-form` (deliberate exception #8, an 80px narrowing — this is the more visually significant of the two outlier snaps, check it carefully against the deliberate-exceptions expectation)

Leave every `max-w-[46ch]` occurrence (`ArrivalHero.tsx:53` after Task 3's edit, `TodayHero.tsx:27`, `app/play/page.tsx:22`) completely untouched — not part of this token.

- [ ] **Step 3: Verify**

```bash
npm run dev
```

Load `/`, `/story/[any-slug]`, `/history`, `/collection`, `/play`, `/login`, `/account`, `/unsubscribed`, `/attribution` in both light and dark. Every page except `/unsubscribed` and `/collection` should look pixel-identical to before this task; those two should be visibly narrower (exception #8) — confirm it doesn't look broken, just narrower.

- [ ] **Step 4: Lint, typecheck, test, build**

```bash
npm run lint
npx tsc --noEmit -p .
npx vitest run
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add components/TodayHero.tsx components/ArrivalHero.tsx components/StoryView.tsx components/PuzzleGame.tsx components/HistoryList.tsx components/Header.tsx components/Footer.tsx components/AccountFavoritesSync.tsx components/CollectionScreen.tsx app/play/page.tsx app/attribution/page.tsx app/login/page.tsx app/account/page.tsx app/unsubscribed/page.tsx
git commit -m "refactor: roll out max-w-page/max-w-form container tokens"
```

---

### Task 5: Extract OG image colors to `lib/ogTheme.ts`

**Files:**
- Create: `lib/ogTheme.ts`
- Modify: `app/opengraph-image.tsx`, `app/story/[slug]/opengraph-image.tsx`, `app/play/opengraph-image.tsx`

**Interfaces:**
- Produces: `ogTheme: { paper: string; ink: string; inkSoft: string; inkFaint: string }`, consumed by all three OG image routes.

- [ ] **Step 1: Create the theme constant**

```ts
/** Colors for the OG image routes (app/**/opengraph-image.tsx) — these
 * render server-side via next/og's ImageResponse (a Satori-based renderer),
 * which doesn't support CSS custom properties, so they can't reference
 * app/globals.css's tokens directly. Mirrors that file's light-mode values
 * only (an OG image preview always renders on a light background,
 * regardless of the sharer's or viewer's theme preference) — keep these
 * two files in sync by hand if the light-mode palette in app/globals.css
 * ever changes. */
export const ogTheme = {
  paper: "#f1ece0",
  ink: "#24302b",
  inkSoft: "#5b665f",
  inkFaint: "#8a9089",
} as const;
```

- [ ] **Step 2: Wire it into all three routes**

In `app/opengraph-image.tsx`, add `import { ogTheme } from "@/lib/ogTheme";` and replace `background: "#f1ece0"` → `background: ogTheme.paper`, `color: "#24302b"` → `color: ogTheme.ink`, and (in the second `<div>`) `color: "#5b665f"` → `color: ogTheme.inkSoft`.

In `app/story/[slug]/opengraph-image.tsx`, add the same import and replace all 7 hex occurrences: both `background: "#f1ece0"` (lines 33, 56) → `ogTheme.paper`, all three `color: "#24302b"` (lines 34, 57, 76) → `ogTheme.ink`, `color: "#5b665f"` (line 60) → `ogTheme.inkSoft`, `color: "#8a9089"` (line 66) → `ogTheme.inkFaint`.

In `app/play/opengraph-image.tsx`, add the same import and replace `background: "#f1ece0"` → `ogTheme.paper`, `color: "#24302b"` → `ogTheme.ink`, both `color: "#5b665f"` occurrences (lines 35, 41) → `ogTheme.inkSoft`.

- [ ] **Step 3: Verify the images still render identically**

```bash
npm run dev
```

Visit `http://localhost:3000/opengraph-image`, `http://localhost:3000/story/quarantine/opengraph-image` (or any real slug), and `http://localhost:3000/play/opengraph-image` directly in a browser tab — these routes serve the actual PNG. Confirm all three look pixel-identical to before (same colors, since `ogTheme`'s values are copied verbatim from the originals).

- [ ] **Step 4: Lint, typecheck, test, build**

```bash
npm run lint
npx tsc --noEmit -p .
npx vitest run
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add lib/ogTheme.ts app/opengraph-image.tsx "app/story/[slug]/opengraph-image.tsx" app/play/opengraph-image.tsx
git commit -m "refactor: extract OG image hex literals to lib/ogTheme.ts"
```

---

### Task 6: Roll out the pill-by-default radius rule

**Files:**
- Modify: `components/PuzzleGame.tsx`, `app/login/page.tsx`, `components/HistoryList.tsx`, `app/account/page.tsx`

**Interfaces:** None new — this is a class-name-only change (deliberate exception #5, plus #7 for the `account.tsx` padding bug).

- [ ] **Step 1: `PuzzleGame.tsx`**

Line 139 (guess input) — `rounded-md` → `rounded-full`.
Line 143 (Guess submit button) — `rounded-md` → `rounded-full`.

- [ ] **Step 2: `app/login/page.tsx`**

Line 91 (Open mail provider button) — `rounded-md` → `rounded-full`.
Line 135 (email input) — `rounded-md` → `rounded-full`.
Line 144 (Send sign-in link button) — `rounded-md` → `rounded-full`.

- [ ] **Step 3: `HistoryList.tsx`**

Line 135 (search input) — `rounded-md` → `rounded-full`.
Line 216 (Show more button) — **leave as `rounded-md`** — this is the full-width block-level exception, not an oversight.

- [ ] **Step 4: `app/account/page.tsx`**

Line 55 (Subscribe button) — `rounded-md` → `rounded-full`, **and** `py-2` → `py-2.5` (deliberate exception #7 — this was a pre-existing inconsistency with every other primary button, not a variant worth preserving).
Line 73 (Sign out button) — `rounded-md` → `rounded-full`.

- [ ] **Step 5: Verify**

```bash
npm run dev
```

Load `/play`, `/login`, `/history`, `/account` in light and dark. Every input and button you just touched should now be pill-shaped; `HistoryList`'s "Show more" should still be the squarer `rounded-md`. Compare against deliberate exceptions #5 and #7.

- [ ] **Step 6: Lint, typecheck, test, build**

```bash
npm run lint
npx tsc --noEmit -p .
npx vitest run
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add components/PuzzleGame.tsx app/login/page.tsx components/HistoryList.tsx app/account/page.tsx
git commit -m "refactor: apply the pill-by-default radius rule across auth/puzzle/history/account"
```

---

### Task 7: Build the `Button` primitive and migrate all 18 non-icon, non-segmented-control button call sites

**Files:**
- Create: `components/ui/Button.tsx`
- Modify: `components/AccountFavoritesSync.tsx`, `components/CollectionScreen.tsx`, `components/HistoryList.tsx`, `components/PuzzleGame.tsx`, `components/StoryView.tsx`, `app/account/page.tsx`, `app/login/page.tsx`, `components/EmailSignupInline.tsx`

**Interfaces:**
- Produces:
```ts
type ButtonVariant = "primary" | "secondary" | "ghost" | "link";
type ButtonSize = "sm" | "md";

type ButtonProps = {
  variant?: ButtonVariant; // default "primary"
  size?: ButtonSize; // default "md"
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  className?: string; // merged in last, for the rare per-instance override (e.g. account.tsx's danger-hover unsubscribe link)
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;
```
Exported as `export default function Button(props: ButtonProps)`. Forwards every native `<button>` prop (`onClick`, `type`, `aria-pressed`, `aria-label`, etc.) via `...rest` so call sites like `StoryView.tsx`'s favorite toggle (which needs `aria-pressed`) don't need anything special. Consumed by every task after this one that touches a button.

- [ ] **Step 1: Build the primitive**

```tsx
"use client";

import clsx from "clsx";

type ButtonVariant = "primary" | "secondary" | "ghost" | "link";
type ButtonSize = "sm" | "md";

type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "disabled">;

// One radius rule (pill, per the design-system consolidation) and one
// padding/size scale for every button in the app — the four variants below
// are exactly the four near-duplicate class-string families found across
// the pre-consolidation codebase (see docs/superpowers/specs/
// 2026-09-19-design-system-consolidation-design.md), not a speculative
// design-system taxonomy.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3.5 py-1.5 text-sm",
  md: "px-5 py-2.5 text-sm",
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "rounded-full bg-accent font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50",
  secondary:
    "rounded-full border border-line text-ink-soft transition-colors hover:border-accent hover:text-ink",
  ghost: "text-ink-soft transition-colors hover:text-ink",
  link: "text-ink-faint underline underline-offset-2 transition-colors hover:text-ink-soft",
};

export default function Button({
  variant = "primary",
  size = "md",
  disabled,
  loading,
  fullWidth,
  className,
  children,
  ...rest
}: ButtonProps) {
  // ghost/link variants keep their own natural (unpadded) size — they're
  // inline text buttons in the source markup, not filled/bordered CTAs, so
  // forcing the sm/md padding scale onto them would visibly change every
  // one of the 7 bare-text call sites this variant replaces.
  const sizeClass = variant === "ghost" || variant === "link" ? "" : SIZE_CLASSES[size];

  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        "cursor-pointer font-sans disabled:cursor-not-allowed",
        sizeClass,
        VARIANT_CLASSES[variant],
        fullWidth && "w-full",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Migrate `AccountFavoritesSync.tsx`**

Line 65 (Skip) — replace:
```tsx
<button
  onClick={handleSkip}
  className="rounded-full px-3.5 py-1.5 font-sans text-sm text-ink-soft transition-colors hover:text-ink cursor-pointer"
>
  Skip
</button>
```
with:
```tsx
<Button variant="ghost" size="sm" onClick={handleSkip}>
  Skip
</Button>
```
Line 71 (Import) — replace the `bg-accent ... rounded-full px-3.5 py-1.5` button with `<Button size="sm" onClick={handleImport}>Import</Button>` (default variant is already `primary`).

Add `import Button from "@/components/ui/Button";` at the top.

- [ ] **Step 3: Migrate `CollectionScreen.tsx`'s two non-segmented-control buttons**

Line 230 (real line number, verified — "clear" filter button) — this one has custom typography (`text-[10px] tracking-[0.1em] uppercase`, now `text-micro tracking-wide uppercase` after Task 2) that doesn't match `Button`'s `link`/`ghost` variants — it's actually an `Eyebrow`-shaped interactive element. **Leave this one as a raw `<button>` for now** — Task 11 (Eyebrow primitive) will migrate it as an interactive eyebrow, not here. Note this explicitly in your commit message so the "no raw `<button>` outside `components/ui/`" acceptance bar isn't checked as fully met until Task 11 lands.

Line 324 (lineage tag button) — replace the bare `cursor-pointer` + conditional `text-accent` button with `<Button variant="link" size="sm" className="no-underline" onClick={...}>` — wait, this element doesn't currently underline, so use `variant="ghost"` instead (ghost has no underline, matching current behavior) — `<Button variant="ghost" size="sm" onClick={...}>{languageName}</Button>`, keeping the conditional `text-accent` as an extra `className` prop passed through when active.

Add the `Button` import.

- [ ] **Step 4: Migrate `HistoryList.tsx`'s inline link and Show more button**

Line 157 (inline "all words" link inside a paragraph) — replace:
```tsx
<button onClick={() => setFilter("all")} className="underline underline-offset-2 hover:text-ink cursor-pointer">all words</button>
```
with:
```tsx
<Button variant="link" className="inline" onClick={() => setFilter("all")}>all words</Button>
```
(the `inline` className keeps it flowing inside the surrounding `<p>` the way a bare `<button>` with no `display` override already did.)

Line 216 (Show more) — replace the `rounded-md border border-line py-2.5 ... text-ink-soft` button with:
```tsx
<Button variant="secondary" fullWidth className="mt-6 !rounded-md" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
  Show more
</Button>
```
The `!rounded-md` override is deliberate — this is the one full-width-block exception to the pill default (see Task 6's note), and `Button`'s `secondary` variant hardcodes `rounded-full`, so this call site needs to override it explicitly rather than the primitive growing a `radius` prop for one caller.

Add the `Button` import.

- [ ] **Step 5: Migrate `PuzzleGame.tsx`'s three buttons**

Verified against the actual current file (not the pre-session audit — this file hasn't changed since, but double-check anyway since line numbers drift):

Lines 141-146 (Guess submit) — replace:
```tsx
<button
  type="submit"
  className="shrink-0 rounded-md bg-accent px-4 py-2.5 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90 cursor-pointer"
>
  Guess
</button>
```
with:
```tsx
<Button type="submit" size="sm">
  Guess
</Button>
```
Note: this button has no `disabled` condition in the current code at all (it's always clickable — `handleGuess` itself no-ops on an empty/non-playing guess) — don't invent one.

Lines 152-158 ("I need another clue") — replace:
```tsx
<button
  type="button"
  onClick={handleNeedAnotherClue}
  className="font-sans text-xs text-ink-faint underline underline-offset-2 transition-colors hover:text-ink-soft cursor-pointer"
>
  I need another clue
</button>
```
with:
```tsx
<Button variant="link" onClick={handleNeedAnotherClue}>
  I need another clue
</Button>
```

Lines 180-187 ("Share your result") — replace:
```tsx
<button
  type="button"
  onClick={handleShare}
  className="mt-6 flex items-center gap-2 font-sans text-sm text-ink-soft transition-colors hover:text-ink cursor-pointer"
>
  <Share size={15} strokeWidth={1.75} />
  {shareCopied ? "Copied" : "Share your result"}
</button>
```
with:
```tsx
<Button variant="ghost" className="mt-6" onClick={handleShare}>
  <Share size={15} strokeWidth={1.75} />
  {shareCopied ? "Copied" : "Share your result"}
</Button>
```
The `Share` import (from `lucide-react`, already at the top of this file) and the `shareCopied` conditional text both carry over unchanged — this is not `Share2`, don't substitute a different icon.

Add the `Button` import (`import Button from "@/components/ui/Button";`).

- [ ] **Step 6: Migrate `StoryView.tsx`'s two buttons**

Verified against the actual current file. Lines 74-86 (Favorite) — replace:
```tsx
<button
  onClick={handleFavorite}
  aria-pressed={isFavorited}
  aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
  className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-ink-soft transition-colors hover:border-accent hover:text-ink cursor-pointer"
>
  <Heart
    size={15}
    strokeWidth={1.75}
    className={isFavorited ? "fill-accent text-accent" : ""}
  />
  {isFavorited ? "Favorited" : "Favorite"}
</button>
```
with:
```tsx
<Button variant="secondary" aria-pressed={isFavorited} aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"} onClick={handleFavorite}>
  <Heart size={15} strokeWidth={1.75} className={isFavorited ? "fill-accent text-accent" : ""} />
  {isFavorited ? "Favorited" : "Favorite"}
</Button>
```

Lines 87-107 (Share/Copy — a three-way conditional, not a simple toggle) — replace:
```tsx
<button
  onClick={handleShare}
  className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-ink-soft transition-colors hover:border-accent hover:text-ink cursor-pointer"
>
  {copied ? (
    <>
      <LinkIcon size={15} strokeWidth={1.75} />
      Link copied
    </>
  ) : canShare ? (
    <>
      <Share size={15} strokeWidth={1.75} />
      Share
    </>
  ) : (
    <>
      <LinkIcon size={15} strokeWidth={1.75} />
      Copy link
    </>
  )}
</button>
```
with:
```tsx
<Button variant="secondary" onClick={handleShare}>
  {copied ? (
    <>
      <LinkIcon size={15} strokeWidth={1.75} />
      Link copied
    </>
  ) : canShare ? (
    <>
      <Share size={15} strokeWidth={1.75} />
      Share
    </>
  ) : (
    <>
      <LinkIcon size={15} strokeWidth={1.75} />
      Copy link
    </>
  )}
</Button>
```
Note there's no `aria-pressed` on this second button (it's not a toggle, unlike Favorite) — don't add one.

Add the `Button` import.

- [ ] **Step 7: Migrate `app/account/page.tsx`'s three buttons**

Verified against the actual current file — **all three are `type="submit"` buttons inside `<form action={serverAction}>` (React Server Component form actions), not `onClick` handlers.** `Button` already forwards arbitrary native props via `...rest`, so `type="submit"` passes through fine; do not add an `onClick`, there isn't one to preserve.

Lines 41-46 (Unsubscribe, inside `<form action={unsubscribe}>`) — replace:
```tsx
<button
  type="submit"
  className="font-sans text-sm text-ink-faint underline underline-offset-2 transition-colors hover:text-danger cursor-pointer"
>
  Unsubscribe
</button>
```
with:
```tsx
<Button variant="link" type="submit" className="hover:!text-danger">
  Unsubscribe
</Button>
```
(the `!` override is needed since `Button`'s `link` variant hardcodes `hover:text-ink-soft`; this one call site needs the danger hover instead — not worth a whole new variant for one instance).

Lines 53-58 (Subscribe, inside `<form action={subscribe}>`) — replace:
```tsx
<button
  type="submit"
  className="rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90 cursor-pointer"
>
  Subscribe
</button>
```
with:
```tsx
<Button type="submit">
  Subscribe
</Button>
```
(default `primary`/`md` — this also fixes exception #7's `py-2`→`py-2.5` bug automatically, since it now goes through `Button`'s shared padding scale instead of its own one-off value.)

Lines 71-76 (Sign out, inside the inline sign-out `<form action={async () => {...}}>`) — replace:
```tsx
<button
  type="submit"
  className="rounded-md border border-line px-4 py-2.5 font-sans text-sm text-ink-soft transition-colors hover:border-accent hover:text-ink cursor-pointer"
>
  Sign out
</button>
```
with:
```tsx
<Button variant="secondary" type="submit">
  Sign out
</Button>
```

Add the `Button` import.

- [ ] **Step 8: Migrate `app/login/page.tsx`'s three buttons**

Line 91 (Open mail provider) — replace with `<Button fullWidth className="mt-6" onClick={...}>Open {matched.label}</Button>` (check the exact current text/props before replacing).

Line 104 (other mail-provider links) — replace with `<Button variant="link" onClick={...}>{p.label}</Button>` for each item in that map.

Line 144 (Send sign-in link) — replace with `<Button type="submit" fullWidth loading={status === "submitting"} disabled={status === "submitting"}>{status === "submitting" ? "Sending…" : "Send sign-in link"}</Button>` — check this file's exact existing loading-state text/logic before replacing, and preserve it.

Add the `Button` import.

- [ ] **Step 9: Migrate `EmailSignupInline.tsx`'s one button**

Lines 59-65 — replace:
```tsx
<button
  type="submit"
  disabled={status === "submitting"}
  className="shrink-0 rounded-full bg-accent px-5 py-2.5 font-sans text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
>
  {status === "submitting" ? "Joining…" : "Join"}
</button>
```
with:
```tsx
<Button type="submit" disabled={status === "submitting"} className="shrink-0">
  {status === "submitting" ? "Joining…" : "Join"}
</Button>
```
The loading-text swap (`"Joining…"` while submitting) carries over unchanged — don't flatten it to a static `"Join"`.

Add the `Button` import.

- [ ] **Step 10: Verify every migrated screen**

```bash
npm run dev
```

Load `/`, `/story/[slug]`, `/play`, `/history`, `/login`, `/account`, and (signed in) `/collection` in light and dark. Every button you touched should look and behave identically to before (click handlers still fire, disabled/loading states still show, hover/focus states unchanged) — this task's changes are Phase 2 markup restructuring, not a Phase 1 visual change, so there should be **zero** visible difference anywhere in this task, no exceptions.

- [ ] **Step 11: Lint, typecheck, test, build**

```bash
npm run lint
npx tsc --noEmit -p .
npx vitest run
npm run build
```

- [ ] **Step 12: Commit**

```bash
git add components/ui/Button.tsx components/AccountFavoritesSync.tsx components/CollectionScreen.tsx components/HistoryList.tsx components/PuzzleGame.tsx components/StoryView.tsx app/account/page.tsx app/login/page.tsx components/EmailSignupInline.tsx
git commit -m "feat: add Button primitive, migrate 17 of 18 non-icon button call sites"
```

(17, not 18 — `CollectionScreen.tsx`'s "clear" filter button is deliberately deferred to Task 11, per Step 3's note.)

---

### Task 8: Build the `IconButton` primitive and migrate `ThemeToggle`/`HistoryList`'s favorite heart

**Files:**
- Create: `components/ui/IconButton.tsx`
- Modify: `components/ThemeToggle.tsx`, `components/HistoryList.tsx`

**Interfaces:**
- Produces:
```ts
type IconButtonProps = {
  label: string; // becomes aria-label — required, not optional
  children: React.ReactNode; // the icon (and, for ThemeToggle, an optional visible text label alongside it)
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;
```
Exported as `export default function IconButton(props: IconButtonProps)`.

- [ ] **Step 1: Build the primitive**

```tsx
"use client";

import clsx from "clsx";

type IconButtonProps = {
  /** Becomes aria-label — required, not optional. An icon-only control with
   * no accessible name is invisible to screen readers regardless of how it
   * looks. */
  label: string;
  children: React.ReactNode;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "aria-label">;

export default function IconButton({ label, children, className, ...rest }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={clsx(
        // min-h/min-w (not h/w) so a caller that also renders a visible text
        // label alongside the icon (ThemeToggle) can grow past 44px wide
        // without the icon+label combination being force-squared.
        "inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-line px-2.5 text-ink-soft transition-colors hover:text-ink hover:border-accent",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Migrate `ThemeToggle.tsx`**

Replace the existing `<button onClick={cycle} aria-label={...} title={...} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-line px-2.5 text-ink-soft transition-colors hover:text-ink hover:border-accent cursor-pointer sm:px-3">` with:

```tsx
<IconButton label={`Theme: ${current.label}. Click to change.`} title={`Theme: ${current.label}`} onClick={cycle} className="sm:px-3">
  <Icon size={16} strokeWidth={1.75} />
  <span className="hidden font-sans text-xs sm:inline">{current.shortLabel}</span>
</IconButton>
```

Note the height change: the old button was a fixed `h-9` (36px); `IconButton`'s `min-h-11` (44px) is taller. This is a real, visible size increase in the header's theme toggle — it's not in this plan's deliberate-exceptions list from Phase 1 because it's a Phase 3 accessibility requirement (44px minimum touch target) being applied proactively during the Phase 2 primitive build, exactly as this plan's Architecture section describes. Add it to your commit message as a Phase-3-anticipating change.

Preserve every other prop (`onClick={cycle}`, `title`) and the exact icon/label logic already in this file — only the wrapping element and its className change.

Add the `IconButton` import, remove the now-unused inline className logic if nothing else in the file needs it.

- [ ] **Step 3: Migrate `HistoryList.tsx`'s favorite heart**

Line 194 — replace:
```tsx
<button
  onClick={() => handleToggle(word.slug)}
  aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
  className="shrink-0 rounded-full p-2 text-ink-faint transition-colors hover:text-accent cursor-pointer"
>
  <Heart size={16} strokeWidth={1.75} className={favorited ? "fill-accent text-accent" : ""} />
</button>
```
with:
```tsx
<IconButton
  label={favorited ? "Remove from favorites" : "Add to favorites"}
  onClick={() => handleToggle(word.slug)}
  className="shrink-0 !border-0 !text-ink-faint hover:!text-accent"
>
  <Heart size={16} strokeWidth={1.75} className={favorited ? "fill-accent text-accent" : ""} />
</IconButton>
```
This one has no border in its current design (a borderless icon button, unlike `ThemeToggle`'s bordered one) — the `!border-0` override preserves that, since `IconButton`'s default has a border. If this feels like it's fighting the primitive rather than using it, that's a legitimate signal `IconButton` needs a `bordered?: boolean` prop instead of relying on override classes — use your judgment: if you add the prop, default it to `true` (matching `ThemeToggle`, the more common case) and set it `false` here, and update Step 1's component accordingly before this step.

- [ ] **Step 4: Verify**

```bash
npm run dev
```

Load `/` (any page with the header) and `/history` (signed in) in light and dark. Confirm the theme toggle still cycles correctly and is now visibly ~8px taller; confirm the favorite heart toggles and still has no border.

- [ ] **Step 5: Lint, typecheck, test, build**

```bash
npm run lint
npx tsc --noEmit -p .
npx vitest run
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add components/ui/IconButton.tsx components/ThemeToggle.tsx components/HistoryList.tsx
git commit -m "feat: add IconButton primitive, migrate ThemeToggle and HistoryList's favorite toggle"
```

---

### Task 9: Build the `TextField` primitive and migrate all 4 inputs

**Files:**
- Create: `components/ui/TextField.tsx`
- Modify: `components/PuzzleGame.tsx`, `components/HistoryList.tsx`, `components/EmailSignupInline.tsx`, `app/login/page.tsx`

**Interfaces:**
- Produces:
```ts
type TextFieldProps = {
  label?: string; // visible <label>, when provided
  error?: string; // wired to aria-describedby + aria-invalid when provided
  icon?: React.ReactNode; // leading icon (HistoryList's search)
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>;
```
Exported as `export default function TextField(props: TextFieldProps)`. This task also resolves Phase 3's `focus:border-accent` removal (see the spec's Phase 3 section) — the primitive is built without it from the start, rather than adding it now and removing it in Task 14.

- [ ] **Step 1: Build the primitive**

```tsx
"use client";

import { useId } from "react";
import clsx from "clsx";

type TextFieldProps = {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "className">;

export default function TextField({ label, error, icon, className, id, ...rest }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div>
      {label && (
        <label htmlFor={inputId} className="mb-2 block font-sans text-xs tracking-wide text-ink-faint">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">{icon}</div>
        )}
        <input
          id={inputId}
          aria-describedby={errorId}
          aria-invalid={!!error}
          className={clsx(
            // No focus:border-accent — the global :focus-visible ring
            // (app/globals.css) already provides a visible focus indicator;
            // duplicating it with a :focus border-color change fires on
            // every mouse click (not just keyboard focus) and is exactly
            // the anti-pattern that ring's own comment argues against.
            "w-full rounded-full border border-line bg-transparent py-2.5 font-sans text-sm text-ink placeholder:text-ink-faint",
            icon ? "pl-9 pr-3" : "px-4",
            className
          )}
          {...rest}
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 font-sans text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Migrate `PuzzleGame.tsx`'s guess input**

Replace the existing `<input>` (with its `rounded-full border border-line bg-transparent px-3 py-2.5 ...` className, already pill after Task 6) with `<TextField value={...} onChange={...} placeholder={...} ... />`, preserving every existing prop (value, onChange, placeholder, autoFocus if present, etc.) exactly. Remove the now-redundant `min-w-0 flex-1` wrapper classes if `TextField`'s own layout already handles them — check the surrounding flex container and adjust only if visually necessary.

- [ ] **Step 3: Migrate `HistoryList.tsx`'s search input**

Replace with `<TextField icon={<Search size={15} strokeWidth={1.75} />} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search words…" aria-label="Search words" />`, preserving the exact existing search-icon import and behavior.

- [ ] **Step 4: Migrate `EmailSignupInline.tsx`'s email input**

Replace the `rounded-full border border-line bg-paper-raised px-4 py-2.5 ...` input with `<TextField type="email" value={email} onChange={...} placeholder="your@email.com" ... />`. Note: this drops the `bg-paper-raised` fill in favor of `TextField`'s `bg-transparent` default — a real, visible fill-color change on this one input (the arrival hero's email capture, sitting on the page background rather than looking like a filled pill). This is a new deliberate exception this plan didn't anticipate in Phase 1 (it only showed up once you actually build the shared primitive) — add it to your commit message explicitly, and flag it to the user in your task report rather than treating it as already covered by the existing exceptions list.

- [ ] **Step 5: Migrate `app/login/page.tsx`'s email input**

Replace with `<TextField type="email" label="Email" value={email} onChange={...} placeholder="you@example.com" required />`, preserving this file's existing `<label>` text ("Email") via the new `label` prop instead of a separate hand-written `<label>` element — remove the old hand-written label markup once `TextField` renders its own.

- [ ] **Step 6: Verify**

```bash
npm run dev
```

Load `/play`, `/history`, `/`, and `/login` in light and dark. Type into each input, confirm placeholder/focus/value behavior is unchanged, confirm the global focus ring (not a border-color change) is what shows on Tab-focus. Confirm `EmailSignupInline`'s input now sits flush with the page background instead of looking filled (the flagged exception from Step 4).

- [ ] **Step 7: Lint, typecheck, test, build**

```bash
npm run lint
npx tsc --noEmit -p .
npx vitest run
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add components/ui/TextField.tsx components/PuzzleGame.tsx components/HistoryList.tsx components/EmailSignupInline.tsx app/login/page.tsx
git commit -m "feat: add TextField primitive, migrate all 4 inputs, drop redundant focus:border-accent"
```

---

### Task 10: Build the `SegmentedControl` primitive and migrate CollectionScreen's filter + HistoryList's tabs

**Files:**
- Create: `components/ui/SegmentedControl.tsx`
- Modify: `components/CollectionScreen.tsx`, `components/HistoryList.tsx`

**Interfaces:**
- Produces: two named exports from the same file — `SegmentedTabs` (single-select, `role="tablist"`/`aria-selected`, for `HistoryList`'s My days/All/Favorites) and `ToggleGroup` (multi-pressable, `aria-pressed`, for `CollectionScreen`'s language filter's two renderings). They share styling but not ARIA semantics — a single-select tab row and a toggleable filter are different interaction patterns and shouldn't be forced into one API just because they look similar.

This task also closes the accessibility gap the spec's brainstorming surfaced: `HistoryList.tsx`'s tabs currently have **no** `aria-pressed`/`aria-selected` at all, unlike `CollectionScreen`'s filter (which already has `aria-pressed` on both its renderings). Building `SegmentedTabs` with the correct ARIA baked in and migrating `HistoryList` to use it closes this gap as a side effect of Phase 2 — Task 14 (Phase 3's aria-live task) does not need to touch this again.

- [ ] **Step 1: Build the primitive**

```tsx
"use client";

import clsx from "clsx";

type Segment<T extends string> = { key: T; label: string };

/** Single-select tab row — role="tablist"/aria-selected, for a set of
 * mutually exclusive views (HistoryList's My days/All words/Favorites).
 * Distinct from ToggleGroup below: a tab selects one view, a toggle filters
 * a set — different ARIA semantics even though they render identically. */
export function SegmentedTabs<T extends string>({
  segments,
  active,
  onChange,
  className,
}: {
  segments: Segment<T>[];
  active: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={clsx("flex items-center gap-1 font-sans text-sm", className)}>
      {segments.map(({ key, label }) => (
        <button
          key={key}
          role="tab"
          aria-selected={active === key}
          onClick={() => onChange(key)}
          className={clsx(
            "min-h-11 rounded-full px-3.5 py-1.5 transition-colors cursor-pointer",
            active === key ? "bg-paper-raised text-ink" : "text-ink-soft hover:text-ink"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Multi-pressable toggle group — aria-pressed per segment, for a filter
 * where each option is independently on/off (CollectionScreen's language
 * filter, whether rendered as the proportional bar or the chip list). */
export function ToggleGroup<T extends string>({
  segments,
  isActive,
  onToggle,
  renderSegment,
  className,
}: {
  segments: T[];
  isActive: (key: T) => boolean;
  onToggle: (key: T) => void;
  renderSegment: (key: T, active: boolean) => React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {segments.map((key) => (
        <button key={key} type="button" aria-pressed={isActive(key)} onClick={() => onToggle(key)} className="cursor-pointer">
          {renderSegment(key, isActive(key))}
        </button>
      ))}
    </div>
  );
}
```

`ToggleGroup` is deliberately thin (it just wraps the `aria-pressed`/`onClick` plumbing and hands rendering back to the caller via `renderSegment`) because `CollectionScreen`'s two renderings of the same filter (the proportional bar and the chip list, see the spec's Section 3 data) have almost nothing in common visually — forcing them into one visual template would be a worse fit than this thin wrapper.

- [ ] **Step 2: Migrate `HistoryList.tsx`'s tabs**

Replace the existing `<div className="mb-6 flex items-center gap-1 font-sans text-sm">{tabs.map(...)}</div>` block (lines ~139-152) with:

```tsx
<SegmentedTabs segments={tabs} active={filter} onChange={setFilter} className="mb-6" />
```

`tabs` here is the existing `{ key: Filter; label: string }[]` array already defined earlier in the file — no change needed to how it's built, only to how it's rendered. Remove the now-unused inline `clsx` import if nothing else in the file needs it.

Add `import { SegmentedTabs } from "@/components/ui/SegmentedControl";`.

- [ ] **Step 3: Migrate `CollectionScreen.tsx`'s language filter (both renderings)**

For the proportional bar (around line 173-193): replace the existing `{languages.map((stat) => { const isActive = ...; return <button ...>; })}` block with a `ToggleGroup` call — `segments={languages.map((l) => l.name)}`, `isActive={(name) => activeLanguage === name}`, `onToggle={toggleLanguage}`, and `renderSegment` returning the existing bar-segment JSX (the `style={{ flexGrow: ..., backgroundColor: ..., opacity: ... }}` div content), reading `stat` back out of the `languages` array by name inside `renderSegment` since `ToggleGroup` only threads the key through, not the original `stat` object — you'll need to either look it up (`languages.find((l) => l.name === key)`) or restructure `ToggleGroup`'s `segments` prop to accept the full objects with a `key` accessor instead of bare strings if the lookup feels awkward. Use your judgment; if you change `ToggleGroup`'s signature here, keep it consistent with how the chip-list rendering (next) also needs to consume it.

For the chip list (around line 198-216): same `ToggleGroup` wrapping, with `renderSegment` returning the existing chip JSX (the `relative flex ... rounded-full border ...` span/text/count structure, already migrated to `rounded-full` and the new type tokens by Task 2 and Task 6 — verify the `rounded-[2px]`→`rounded-full` change from Task 2 Step 3 is still present here after this refactor, since this task rewrites the same block).

Add `import { ToggleGroup } from "@/components/ui/SegmentedControl";`.

- [ ] **Step 4: Do NOT migrate `CollectionScreen.tsx`'s "Collection"/"History" section tabs — verified they're real navigation, not a toggle**

Lines 74-95 (the "Collection"/"History" section tabs at the top of the screen) look like the same tab pattern as `HistoryList`'s filter row, but checking the actual file shows they're **Next.js `<Link href="/collection">`/`<Link href="/collection?tab=history">` elements with `scroll={false}`, not `<button onClick={...}>` elements** — this screen's `tab` state is driven by the URL query string (read server-side, presumably in `app/collection/page.tsx`), not local React state. Forcing these into `SegmentedTabs` (built for `<button>`s with an `onChange` callback) would silently break URL-based navigation, the browser back button, and direct linking to `?tab=history`.

**Leave these two `<Link>` elements exactly as they are structurally.** They already carry the correct token classes from Task 2 (`text-micro tracking-wider uppercase`, via the `clsx()` call at lines 78-81/88-91) — no further change needed here. Do not wrap them in `SegmentedTabs`, `Eyebrow`, or any other primitive built for interactive buttons; a `<Link>` styled identically to a tab is a different pattern from a same-page toggle, even though it looks the same, and this plan's primitives are scoped to what they were actually built from (see this plan's Architecture section — primitives come from real call-site patterns, not a speculative taxonomy).

- [ ] **Step 5: Verify**

```bash
npm run dev
```

Load `/collection` (signed in) in light and dark. Click through both tab rows (Collection/History, and the language filter in both its bar and chip forms) and confirm selection/filtering still works exactly as before. Load `/history` and confirm My days/All words/Favorites still switch correctly. Inspect the DOM (browser devtools) to confirm `role="tab"`/`aria-selected` are present on the tab rows and `aria-pressed` is still present on the language filter.

- [ ] **Step 6: Lint, typecheck, test, build**

```bash
npm run lint
npx tsc --noEmit -p .
npx vitest run
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add components/ui/SegmentedControl.tsx components/CollectionScreen.tsx components/HistoryList.tsx
git commit -m "feat: add SegmentedControl primitive, migrate CollectionScreen and HistoryList tabs/filters, add missing aria-selected to HistoryList tabs"
```

---

### Task 11: Build the `Eyebrow` primitive and migrate the 10 in-scope instances

**Files:**
- Create: `components/ui/Eyebrow.tsx`
- Modify: `components/ArrivalHero.tsx`, `components/CollectionScreen.tsx`

**Interfaces:**
- Produces: `export default function Eyebrow({ as, className, children, ...rest }: { as?: "span" | "p"; className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLElement>)`.

**Note on scope:** the source prompt's audit claimed 15 instances of this pattern; a fresh count found exactly 15 across the whole tree, but **5 of those live in the excluded `AdminDashboard.tsx`**. Of the remaining 10: **2 are the `CollectionScreen.tsx` "Collection"/"History" `<Link>` elements (lines 79/89), which Task 10 Step 4 already established must stay plain `<Link>`s, not become a primitive** — they're excluded from this task too, for the same reason. **1 more is the "clear" filter button**, which becomes an `Eyebrow`-styled `Button` (interactive). The remaining **7 are non-interactive labels** that become plain `Eyebrow` spans/paragraphs.

- [ ] **Step 1: Build the primitive**

```tsx
import clsx from "clsx";

export default function Eyebrow({
  as: Tag = "span",
  className,
  children,
  ...rest
}: {
  as?: "span" | "p";
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={clsx("font-sans text-micro uppercase text-ink-soft", className)} {...rest}>
      {children}
    </Tag>
  );
}
```

Default color is `text-ink-soft` since that's the most common case in the 10 in-scope instances; call sites that need `text-accent` (the "clear" button, the arrival-hero eyebrow) or a different tracking value pass an overriding `className`.

- [ ] **Step 2: Migrate `ArrivalHero.tsx`'s eyebrow**

Line 32 — replace `<p className="font-sans text-micro tracking-wider text-accent uppercase">` (from Task 3) with `<Eyebrow as="p" className="tracking-wider text-accent">`.

Add the `Eyebrow` import.

- [ ] **Step 3: Migrate `CollectionScreen.tsx`'s 6 non-interactive `Eyebrow` instances**

**Verified against the actual file: only 6, not 8** — lines 339 and 363 (WordRow's date label and History tab's date label) do NOT have an `uppercase` class in the real code (they're `text-[9.5px] tracking-[0.08em] whitespace-nowrap text-ink-soft` and `text-[10px] tracking-[0.06em] text-ink-soft` respectively) — they already got their token-scale fix in Task 2 (plain `text-micro tracking-label` classes) and should stay exactly as Task 2 left them, **not** wrapped in `<Eyebrow>`, which is specifically for the uppercase micro-label pattern. Don't touch lines 339/363 in this task.

Each of the 6 real instances becomes `<Eyebrow className="...">` with whatever extra tracking/margin classes the original element had, minus the now-redundant `font-sans text-micro uppercase` (`Eyebrow` provides those):

- Line 68 (subline) — `<Eyebrow className="mt-2.5 tracking-wider">`
- Line 164 ("tap to filter") — `<Eyebrow className="tracking-wide">`
- Line 241 (month header, collection) — `<Eyebrow as="p" className="pt-7 pb-1 tracking-widest">`
- Line 312 (lineage tags container — a non-interactive wrapper; the per-language `<button>`s inside it at line 324 have no typography of their own, they inherit `Eyebrow`'s via CSS inheritance, which is why this can become `<Eyebrow>` even though it wraps interactive children) — `<Eyebrow className="mt-2.5 flex flex-wrap gap-x-1.5 gap-y-0 tracking-wider">`; preserve the existing flex-wrap layout and the children (the `.map()` over `word.lineage`) exactly, only the wrapping element changes.
- Line 354 (month header, history) — same pattern as line 241
- Line 367 (History POS tag) — `<Eyebrow className="tracking-wide">`

- [ ] **Step 4: Migrate `CollectionScreen.tsx`'s 1 interactive instance**

(Lines 79/89, the Collection/History section tabs, are `<Link>` elements per Task 10 Step 4 — already correctly left untouched by Task 2 and never in scope for any `components/ui/` primitive. The only interactive Eyebrow-pattern element in this file is the "clear" button below.)

Line 230 (real line number, verified — "clear" filter button) — this is the one deferred from Task 7, and the only interactive instance in scope for this task (the two `<Link>`-based section tabs at lines 79/89 are correctly excluded — see Task 10 Step 4; do not touch them here). Replace:
```tsx
<button
  type="button"
  onClick={() => onToggleLanguage(activeLanguage!)}
  className="cursor-pointer font-sans text-[10px] tracking-[0.1em] text-accent uppercase"
>
  clear
</button>
```
with:
```tsx
<Button variant="link" className="!text-accent !no-underline text-micro tracking-wide uppercase" onClick={() => onToggleLanguage(activeLanguage!)}>
  clear
</Button>
```
using `Button`'s `link` variant as the interaction base (cursor, focus behavior) but overriding its default underline/color, since neither `Button` nor `Eyebrow` alone cover "interactive uppercase micro-label," and building a third primitive for one call site would be over-engineering. Add the `Button` import if not already present in this file from Task 7.

- [ ] **Step 5: Verify**

```bash
npm run dev
```

Load `/` (arrival hero — clear local storage / incognito first) and `/collection` (signed in) in light and dark. Every eyebrow-style label should look identical to before this task (this is a pure markup/primitive-extraction task, not a Phase-1-style value change — zero visual difference expected anywhere).

- [ ] **Step 6: Lint, typecheck, test, build**

```bash
npm run lint
npx tsc --noEmit -p .
npx vitest run
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add components/ui/Eyebrow.tsx components/ArrivalHero.tsx components/CollectionScreen.tsx
git commit -m "feat: add Eyebrow primitive, migrate 10 in-scope instances (5 of 15 excluded via AdminDashboard)"
```

**Note on the dropped `Surface` primitive:** the source prompt's Phase 2 list includes a `Surface` component for the "`bg-paper-raised` + `border-line` card treatment." A fresh audit found only 3 total uses of `bg-paper-raised` in scope, and only 2 combine it with a border — and those 2 aren't even the same shape (`AccountFavoritesSync.tsx`'s banner has only a bottom border; `EmailSignupInline.tsx`'s input, already handled by Task 9's `TextField`, is a full-border pill). Building a generic `Surface` primitive for one real remaining case (the banner) isn't justified — this plan drops it. If a genuine card pattern emerges later (e.g. from future content), revisit then rather than speculatively building it now.

---

### Task 12: Phase 3 checkpoint — present contrast-fix candidates, wait for approval

**Files:** None modified — this task makes no code changes. Its sole deliverable is the approval itself.

**Interfaces:** None.

This task exists because the spec requires it explicitly: Phase 3's color changes must not be applied without the user seeing the actual candidate hex values and their measured ratios first. **Do not proceed to Task 13 until this approval is explicit and in writing from the user.**

- [ ] **Step 1: Present the four contrast failures and candidate fixes**

All ratios below were computed programmatically against the real WCAG relative-luminance formula (not estimated, not copied without checking) during this plan's writing — every one of the four original audit numbers reproduced exactly, confirming the source audit is trustworthy, and one additional failure was found that the source audit's table didn't list (`border-line` on `paper` in **dark** mode — it only called out light mode). Present exactly this table to the user:

| Failure | Measured | Required | Candidate fix | Candidate's ratio |
|---|---|---|---|---|
| `ink-faint` on `paper`, light | 2.77:1 | 4.5:1 (WCAG 1.4.3) | Darken `ink-faint` toward `ink-soft` in light mode | `#5b665f` (the current `ink-soft` light value) measures **5.07:1** |
| `ink-faint` on `paper`, dark | 4.07:1 | 4.5:1 | Same treatment, dark mode | `#b0a891` (the current `ink-soft` dark value) measures **7.75:1** |
| `text-paper` on `bg-accent` (primary button), light | 3.91:1 | 4.5:1 at 14px | Use `accent-deep` as the primary button fill in **light mode only** | `#7a4f1e` (the current `accent-deep` light value) measures **6.01:1** |
| `border-line` on `paper`, light | 1.31:1 | 3:1 (WCAG 1.4.11) | New `--line-strong` token for interactive boundaries, keep `--line` for decorative rules | `#8c806a` (a candidate darkened/desaturated tan, between `--line` and `--ink-soft`) measures **3.29:1** |
| **`border-line` on `paper`, dark — not in the source audit, found while computing the above** | **1.46:1** (also fails 3:1) | 3:1 | Same `--line-strong` treatment, dark mode | `#6b6250` (a candidate lightened tan) measures **3.05:1** |

Note the pattern: three of the four original fixes (both `ink-faint` cases, and the button text) can reuse an existing token (`ink-soft`, `accent-deep`) — zero new CSS variables. The `border-line`/`--line-strong` fix (now two rows, light and dark, since the dark failure was missed by the source audit) is the one place this phase adds genuinely new colors, which the Global Constraints explicitly allow ("no new color tokens beyond Phase 3's four justified additions" — note this table now proposes 2 new hex values across light/dark for the one `--line-strong` token, not 4 separate additions) but the user should still sign off on the actual hex before it's applied — these are new colors, not a snap-to-existing-token move like the other three.

- [ ] **Step 2: Wait for explicit approval**

Do not write any code, do not touch `app/globals.css`, and do not begin Task 13 until the user has explicitly approved the specific hex values (or proposed different ones) in response to Step 1's table. If executing this plan via subagent-driven-development, the implementer subagent for this task should report status `NEEDS_CONTEXT` back to the controller with the table from Step 1 as its content, and the controller relays it to the user directly — this is exactly the kind of external checkpoint that process's four stop-and-ask conditions cover, not something to route around.

---

### Task 13: Apply the approved contrast fixes

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: the specific hex values approved in Task 12.

**This task cannot be planned with exact code in advance** — its content depends entirely on what Task 12 gets approved. Do not skip Task 12 to get here faster.

- [ ] **Step 1: Apply the approved values**

Using exactly the hex values approved in Task 12 (not the candidates listed there if the user changed any of them), update the relevant `:root`/`[data-theme="dark"]`/`prefers-color-scheme` blocks in `app/globals.css`. If the approved fix is "use `accent-deep` as the primary button fill in light mode," this likely means changing `components/ui/Button.tsx`'s `primary` variant to reference `bg-accent-deep` conditionally in light mode only — Tailwind can't conditionally apply a class based on the theme attribute directly, so this may need either a new CSS custom property that itself varies by theme (cleanest, matching the existing `--accent`/`--accent-deep` pattern) or a `dark:bg-accent` override class. Prefer the CSS-custom-property approach for consistency with how every other color in this file already works.

- [ ] **Step 2: Verify contrast for real, not just visually**

Use a contrast calculator (WebAIM's or equivalent) against the actual final rendered values, in both light and dark, for all four fixed pairs. All four must now meet their required ratio. Do not eyeball this.

- [ ] **Step 3: Verify no other regression**

```bash
npm run dev
```

Load every screen in both themes. Confirm the warm, editorial character is preserved (this was the spec's explicit constraint) — these are small, targeted shifts, not a palette overhaul.

- [ ] **Step 4: Lint, typecheck, test, build**

```bash
npm run lint
npx tsc --noEmit -p .
npx vitest run
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add app/globals.css components/ui/Button.tsx
git commit -m "fix: resolve four measured WCAG contrast failures (approved values, see Task 12)"
```

---

### Task 14: Add missing `aria-live` regions

**Files:**
- Modify: `components/EmailSignupInline.tsx`, `app/login/page.tsx`, `components/PuzzleGame.tsx`

**Interfaces:** None new.

- [ ] **Step 1: `EmailSignupInline.tsx`**

Success message (currently `components/EmailSignupInline.tsx:38-42`):
```tsx
if (status === "success") {
  return (
    <p className="font-sans text-sm text-ink-soft">You&apos;re in. Your first word arrives tomorrow.</p>
  );
}
```
becomes:
```tsx
if (status === "success") {
  return (
    <p role="status" className="font-sans text-sm text-ink-soft">You&apos;re in. Your first word arrives tomorrow.</p>
  );
}
```

Error message (currently line 67):
```tsx
{status === "error" && <p className="mt-2 font-sans text-sm text-danger">{errorMessage}</p>}
```
becomes:
```tsx
{status === "error" && <p role="alert" className="mt-2 font-sans text-sm text-danger">{errorMessage}</p>}
```

- [ ] **Step 2: `app/login/page.tsx`**

Line 138-140:
```tsx
{status === "error" && (
  <p className="font-sans text-sm text-danger">Something went wrong. Try again.</p>
)}
```
becomes:
```tsx
{status === "error" && (
  <p role="alert" className="font-sans text-sm text-danger">Something went wrong. Try again.</p>
)}
```

- [ ] **Step 3: `PuzzleGame.tsx`**

Wrong-guess flash (lines 148-150):
```tsx
{wrongFlash && (
  <p className="font-sans text-sm text-danger">Not quite — here&apos;s another clue.</p>
)}
```
becomes:
```tsx
{wrongFlash && (
  <p role="alert" className="font-sans text-sm text-danger">Not quite — here&apos;s another clue.</p>
)}
```
This one matters most of the three — it self-clears after 600ms (`setTimeout`, line ~82-83), so without `role="alert"` a screen-reader user has a sub-second window to notice it.

Solved/failed result banner (lines 163-171) — add `role="status"` to the wrapping `<div className="mt-8">` (line 163) so the whole result block (status line + word + respelling) is announced as one unit when it appears:
```tsx
{isDone && (
  <div role="status" className="mt-8">
```

- [ ] **Step 4: Verify**

```bash
npm run dev
```

Turn on a screen reader (or use browser devtools' accessibility tree inspector if a screen reader isn't available) and confirm each of the four elements above now shows up with the correct role in the accessibility tree. Functionally exercise all three flows (submit the email signup with a bad address, fail a login, guess wrong on the puzzle) to confirm the messages still appear/disappear exactly as before — this task only adds ARIA attributes, no visual or behavioral change.

- [ ] **Step 5: Lint, typecheck, test, build**

```bash
npm run lint
npx tsc --noEmit -p .
npx vitest run
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add components/EmailSignupInline.tsx app/login/page.tsx components/PuzzleGame.tsx
git commit -m "fix: add aria-live announcements to signup, login, and puzzle feedback messages"
```

---

### Task 15: Write `docs/design-system.md`

**Files:**
- Create: `docs/design-system.md`

**Interfaces:** None — pure documentation.

- [ ] **Step 1: Write the document**

Cover, in this order: (1) the color token table (9 tokens × light/dark values, when to use `ink` vs `ink-soft` vs `ink-faint`, and the four Phase 3 additions/changes with their measured ratios); (2) the type/tracking/leading/container/motion token tables from `app/globals.css`, each with its purpose and example usage; (3) one section per `components/ui/` primitive (`Button`, `IconButton`, `TextField`, `SegmentedControl`'s two exports, `Eyebrow`) covering variants/props/states/accessibility notes/a real code example pulled from an actual call site in this codebase, not an invented one; (4) the rules that aren't obvious from the code alone: pill-by-default radius (with the one full-width exception), serif (Newsreader) for word display and long-form reading vs. sans (Work Sans) for everything else, and the `ink-soft`/`ink-faint` usage split. Note explicitly that `components/AdminDashboard.tsx` is out of scope for all of this and still uses the pre-consolidation ad-hoc values.

- [ ] **Step 2: Self-review against the actual codebase**

Re-open each primitive file and each token definition in `app/globals.css` you just wrote about — confirm every prop name, variant name, and token name in the doc matches the real code exactly (not what you remember writing 14 tasks ago).

- [ ] **Step 3: Commit**

```bash
git add docs/design-system.md
git commit -m "docs: write docs/design-system.md"
```

---

### Task 16: Update `AGENTS.md` and `handover.md`

**Files:**
- Modify: `AGENTS.md`, `handover.md`

**Interfaces:** None — depends on Tasks 1-15 all being complete so it accurately describes what landed.

- [ ] **Step 1: Add a "Design system" pointer to `AGENTS.md`**

Append a short new section after the existing Next.js-version block:

```markdown

## Design system

Curio has a small, consolidated design token layer (`app/globals.css`'s `@theme inline` block — colors, type sizes, tracking, leading, container widths, motion) and a shared component primitive library (`components/ui/` — Button, IconButton, TextField, SegmentedControl, Eyebrow). Read `docs/design-system.md` before adding any new UI — new arbitrary Tailwind values (`text-[Npx]`, `tracking-[...]`, etc.) or a new hand-rolled `<button>`/`<input>` outside `components/ui/` should be treated as a regression, not a shortcut. `components/AdminDashboard.tsx` is the one deliberate exception (internal tooling, not part of this system).
```

- [ ] **Step 2: Update `handover.md`**

Follow this project's own established pattern for a new dated session entry (see the most recent entries in that file for the exact style — numbered list, brief prose, file/function references in backticks). Cover: the token consolidation (Phase 1), the new `components/ui/` primitives and which call sites moved (Phase 2), the four contrast fixes with their approved values and the three new `aria-live` regions (Phase 3), and the new `docs/design-system.md` (Phase 4). Also update the "Last updated" line at the top of the file to today's date with a one-line summary, matching how the two most recent entries already did this.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md handover.md
git commit -m "docs: point AGENTS.md at the design system, update handover.md"
```

---

## Self-Review Notes

- **Spec coverage:** Phase 1 (Tasks 1-6), Phase 2 (Tasks 7-11, `Surface` explicitly dropped with justification in Task 11), Phase 3 (Tasks 12-14, checkpoint is a hard gate per the spec's explicit requirement), Phase 4 (Tasks 15-16) — every phase and acceptance criterion in the spec has a corresponding task.
- **Placeholder scan:** Task 13 (apply approved contrast fixes) is the one task in this plan that cannot carry exact final code, because its content is gated on Task 12's live approval — this is not a plan-writing gap, it's the correct shape for a task whose input doesn't exist yet. Every other task has real, complete code. A few individual steps (CollectionScreen's `mt-[26px]`/`gap-[7px]`-style off-grid spacing values, `CollectionScreen`'s lineage-tag `ToggleGroup` data-lookup shape) explicitly hand the implementer a judgment call with clear bounds rather than a fabricated precise answer, because the real answer depends on how the value looks rendered, not on a formula — this is flagged inline at each such step, not hidden.
- **Type/interface consistency:** `Button`'s `ButtonProps`, `IconButton`'s `IconButtonProps`, `TextField`'s `TextFieldProps`, `SegmentedTabs`/`ToggleGroup`'s generic signatures, and `Eyebrow`'s props are each defined once (Tasks 7-11) and referenced with the same names in every later task that imports them. `ogTheme`'s four keys (Task 5) are used identically across all three OG image files.
- **Cross-task dependency called out explicitly:** Task 11 Step 4 modifies `components/ui/SegmentedControl.tsx` (built in Task 10) to add the eyebrow-style classes to `SegmentedTabs` — the only place one primitive's own file is touched again by a later task, done deliberately rather than by accident, and flagged as such in that step.
