# Curio Design System Consolidation — Design

**Source:** `curio-web-design-system-prompt.md` (repo root) — a full audit was already done there; this spec formalizes it plus the decisions made during brainstorming, backed by a fresh data pull against the actual codebase (see "Verified data" below).

## Goal

Consolidate Curio's design system in four phases: (1) replace 18 distinct arbitrary type sizes / 9 tracking values / 6 leading values / assorted spacing and container widths with a small token scale, (2) extract the 23 near-duplicate `<button>` and 4 `<input>` call sites into shared primitives, (3) fix four measured WCAG contrast failures and add missing `aria-live` regions, (4) document all of it. Phases 1–2 must not change rendered output except for a short, explicit list of deliberate exceptions; Phase 3 does change rendered output (color, radius floors) and requires an in-plan checkpoint before any contrast fix is applied.

## What's already good — do not break it

- `app/globals.css`'s 9-token semantic color layer (`paper`, `paper-raised`, `ink`, `ink-soft`, `ink-faint`, `accent`, `accent-deep`, `line`, `danger`), each defined for light/`[data-theme="dark"]`/`prefers-color-scheme: dark`, re-exported via `@theme inline`. Zero hardcoded hex in `components/`. Verified: confirmed by direct read of `app/globals.css`.
- The longhand `:focus-visible` ring (`outline-width`/`outline-style`/`outline-color`, not the `outline` shorthand) — the shorthand silently drops the `var(--accent)` reference under this project's Lightning CSS build. Leave it alone.
- Newsreader/Work Sans serif/sans pairing via `@fontsource`.

No new npm dependencies, no new fonts, no new color tokens beyond what Phase 3's contrast fixes justify.

## Scope decisions made during brainstorming

- **`components/AdminDashboard.tsx` is exempt from this pass.** It carries several of the arbitrary type sizes (9.5px, 13.5px, 22px, 32px, etc.) and 4 of the 23 buttons, but it's internal tooling, not part of this consolidation. The acceptance criteria below are scoped to exclude it explicitly.
- **One plan document covering all 4 phases**, matching the source prompt's "do not start Phase 1 until I've approved the plan" (singular). Phase 3 gets an explicit in-plan checkpoint task (present candidate hex values + measured ratios, wait for approval) rather than being split into a separate plan — Phases 1/2/4 aren't gated behind Phase 3 landing first, but Phase 3's actual color changes don't get applied without a specific go-ahead mid-execution.

## Verified data (Phase 1 scope: `components/` and `app/`, excluding `AdminDashboard.tsx`)

Full detail gathered via direct grep of the real files — summarized here; the plan should re-derive exact file:line targets at write time since line numbers shift as earlier tasks land.

### Type size (`text-[Npx]`) — 14 distinct values found

| Raw value(s) | Where | Resolution |
|---|---|---|
| 9, 9.5, 10, 10.5px | badges, chip/tab labels, date labels, respelling/POS lines, month headers (CollectionScreen.tsx, ~13 occurrences) | Snap to **11px** (new token `--text-micro`) — a visible 0.5–2px increase, flagged per the prompt's own accessibility-floor request |
| 11px | tab labels, ArrivalHero eyebrow | Already the floor; use `--text-micro` directly |
| 13.5, 14px | band note, session intro line | Snap to **`text-sm`** (14px, already Tailwind's default — no new token) |
| 15px | empty-state message, closing fact line, WordRow teaser | Snap to **`text-base`** (16px, ~1px nudge) |
| 16px | active-filter line | Already exact `text-base` — just drop the arbitrary syntax |
| 18px | Collection h2, History row title | Already exact `text-lg` |
| 19px | ArrivalHero teaser paragraph | **Resolved**: checked `TodayHero.tsx` directly — its teaser paragraph is `text-lg` (18px), and its headline (`text-6xl`/`sm:text-7xl`, 60–72px) is already dramatically larger than ArrivalHero's 44px, so the two heroes are already deliberately different in scale (TodayHero is spacious/headline-only; ArrivalHero is compact, with a pitch and email capture below). That headline gap justifies `--text-display` staying its own token — but the teaser paragraphs' 19px-vs-18px gap is only 1px, within the general collapse threshold, and body-copy consistency across sibling screens matters more than preserving a 1px quirk. ArrivalHero's teaser snaps to `text-lg`, matching TodayHero. |
| 26px | Collection WordRow title | Snap to **`text-2xl`** (24px, a 2px trim) |
| 36px | Collection h1 | Already exact `text-4xl` |
| 44px | ArrivalHero word headline | Genuinely between `text-4xl`(36) and `text-5xl`(48) — keep distinct as new token `--text-display`, this is the hero-headline case the source prompt explicitly says to preserve |

Net effect: most arbitrary sizes resolve to **existing Tailwind defaults**, not new custom vars. Only `--text-micro` (11px) and `--text-display` (44px) are genuinely new tokens.

### Tracking / leading

9 distinct tracking values (−0.015em to 0.18em) and 6 distinct leading values (1.05–1.55), all confined to `CollectionScreen.tsx` and `ArrivalHero.tsx`. Snap tracking to ~4 steps and leading to ~3 steps using the same "within ~1px/~0.02em, collapse" rule as type size; the plan should show the exact before/after mapping per the prompt's acceptance criteria.

### Spacing

No new spacing tokens — Tailwind's default 4px-based scale already covers this. All arbitrary `m*-[Npx]`/`p*-[Npx]`/`gap-[Npx]` values found (24 distinct, confined to `CollectionScreen.tsx`, almost none currently on-grid) snap to the nearest default utility (e.g. `pt-[30px]` → `pt-8`, `gap-[6px]` → `gap-1.5`).

### Radius

**Decision (brainstormed, not the prompt's default): pill (`rounded-full`) for all default interactive elements** — buttons, inputs, tabs, icon buttons, toggles. **Exception: full-width block-level CTAs stay `rounded-md`** (currently just `HistoryList`'s "Show more" button) — a pill stretched edge-to-edge reads oddly; block buttons get the squarer corner.

This resolves the prompt's flagged `EmailSignupInline` (pill) vs. `login` (md) inconsistency by making pill the universal default, and matches the brand's warmer editorial register better than boxier corners. It's a visible change to ~4-5 currently-`md` elements: `PuzzleGame`'s guess input+submit, `login`'s two buttons + email input, `HistoryList`'s search input, `account`'s Subscribe/Sign out buttons all move from `md` to pill. The lone `rounded-[2px]` chip in `CollectionScreen` (a near-square "tag" style used nowhere else) also folds into the pill rule, matching the rest of that filter row — one radius rule, no carved-out exception, consistent with Phase 1's overall goal of consolidating rather than multiplying variants. All of this goes in the plan's deliberate-exceptions list.

### Container width

Three named tokens: `--container-page` (640px — the de facto standard, used 10×), `--container-form` (440px — login/account; the 480px `unsubscribed` and 560px `CollectionScreen` outliers snap to this as likely-unintentional drift, not deliberate narrower layouts — flag both explicitly in the plan rather than assuming). The existing `46ch` prose measure (3 uses, already consistent) is left as-is.

### Motion

One `--duration-base` (150ms — matches the de facto default across ~20 `transition-colors`/`transition-opacity` call sites, and the 3 explicit `duration-150` uses in `CollectionScreen`). The hardcoded `0.25s ease` theme-fade transition in `app/globals.css` becomes its own named `--duration-theme` — it's deliberately slower than interactive-element transitions (a full theme swap, not a hover state), so it stays distinct rather than being forced onto the same token.

### Button/input primitive variants (from the real class-string audit)

Four button "families" found in practice:
1. **Primary filled** (`bg-accent ... text-paper`) — currently split `rounded-md px-4 py-2.5` / `rounded-md px-4 py-2` (one outlier, `account.tsx`'s Subscribe, using `py-2` not `py-2.5`) / `rounded-full px-5 py-2.5` / `rounded-full px-3.5 py-1.5`. Becomes one `Button variant="primary"` with `sm`/`md` sizes covering the padding split; the `py-2` outlier is a bug to fix, not a variant to preserve.
2. **Secondary/bordered** (`border border-line ... hover:border-accent`) — currently split across radius/padding the same way. Becomes `Button variant="secondary"`.
3. **Bare text button** (no border/bg/radius, sometimes underlined) — 7 instances, inconsistent underline usage. Becomes `Button variant="ghost"` or `variant="link"` per the prompt's spec (ghost = ordinary text-colored button, link = underlined).
4. **Icon-only** (fixed hit area, `aria-label` required) — `ThemeToggle`, `HistoryList`'s favorite heart. Becomes `IconButton`.

Inputs: 3 of 4 already share `border border-line bg-transparent ... focus:border-accent`, differing only in padding; `EmailSignupInline`'s `bg-paper-raised` fill is the one outlier — Phase 3 also removes `focus:border-accent` everywhere (redundant with the global `:focus-visible` ring, and it's a `:focus` not `:focus-visible` trigger, which is exactly the anti-pattern the `globals.css` comment already argues against).

## Phase 1 acceptance criteria

Zero `text-[`, `tracking-[`, `leading-[`, and arbitrary `m*-[Npx]`/`p*-[Npx]`/`gap-[Npx]` in `components/` and `app/`, **excluding `AdminDashboard.tsx`**. OG image routes (`app/**/opengraph-image.tsx`) get their 14 hex literals extracted to `lib/ogTheme.ts` (server-rendered, can't use CSS vars) with a comment explaining why. Screenshots of `/`, `/story/[slug]`, `/history`, `/collection`, `/play`, `/login`, `/account` before/after, light/dark, match modulo the deliberate-exceptions list (the type-size floor bump, the ArrivalHero/TodayHero teaser decision, the radius-rule changes, the two container-width outlier snaps).

## Phase 2 — Primitives (unchanged from source prompt)

`components/ui/`: `Button` (primary/secondary/ghost/link × sm/md, `disabled`/`loading`/`fullWidth`), `IconButton` (required `label`→`aria-label`, 44×44 minimum hit area), `TextField` (one radius, one fill, optional leading icon, optional label, `aria-describedby` error state), `Pill`/`SegmentedControl` (the `aria-pressed` tab/filter pattern), `Eyebrow` (uppercase+tracked+tiny label), `Surface` (`bg-paper-raised` + `border-line` card). Refactor all call sites (23 buttons, 4 inputs) except `AdminDashboard.tsx`. Acceptance: `<button` appears only inside `components/ui/` (outside the excluded file); lint/vitest/build clean; visual parity per Phase 1's rules.

## Phase 3 — Accessibility (unchanged from source prompt, with an explicit checkpoint)

Four measured contrast failures to fix (`ink-faint` on `paper` light 2.77:1 / dark 4.07:1, both need 4.5:1; `text-paper` on `accent` light 3.91:1, needs 4.5:1 at 14px; `border-line` on `paper` 1.31:1, needs 3:1). **The plan must include a dedicated task that presents candidate hex values with their measured ratios and pauses for explicit approval before any color value is actually applied** — this is not optional, it's how the source prompt asked for this phase to run. Also: `aria-live`/`role="status"`/`role="alert"` on the email-signup, login-error, and puzzle-guess-result flows; a 44px minimum floor folded into the `Pill` primitive; removal of the redundant `focus:border-accent` (or an explicit justification for keeping both, if the plan argues that).

## Phase 4 — Documentation (unchanged from source prompt)

`docs/design-system.md` (token tables, one section per primitive with variants/props/states/accessibility/example, the non-obvious rules — pill vs. `md`, serif vs. sans, `ink-soft` vs. `ink-faint`), a short "Design system" pointer added to `AGENTS.md`, and a `handover.md` update matching this session's existing entries' style.

## Global constraints

No new npm dependencies. No new color tokens beyond Phase 3's justified additions. No new fonts. `npm run lint`, `npx vitest run`, `npm run build` clean after **every task**, not just at the end. Short doc comments explaining *why*, matching existing style. One commit per task. **Do not `git push` until the user has reviewed the whole batch.** If a phase runs bigger than estimated, stop and say so rather than compress the work.
