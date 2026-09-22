# Claude Code prompt — curio-web design system consolidation

> Paste this into Claude Code from the root of `curio-web` (on `master`, clean tree).

---

We're consolidating the design system in this repo. A full audit has already been done — the findings below are the input, not something to re-derive from scratch. Verify each one against the actual code before acting on it, but don't re-do the survey.

**Before writing any code:** use `superpowers:brainstorming` to pressure-test the plan shape with me, then `superpowers:writing-plans` to produce `docs/superpowers/plans/YYYY-MM-DD-design-system-consolidation.md` in the same house style as the existing plans in that directory (Goal / Architecture / Tech Stack / Spec / Global Constraints / File Structure / checkbox tasks). Execute with `superpowers:subagent-driven-development`. Do not start Phase 1 until I've approved the plan.

Also read `AGENTS.md` first — this is Next.js 16 and the API surface may differ from your training data.

## What's already good — do not break it

- `app/globals.css` has a genuine semantic colour token layer: 9 tokens (`paper`, `paper-raised`, `ink`, `ink-soft`, `ink-faint`, `accent`, `accent-deep`, `line`, `danger`), each defined for light, `[data-theme="dark"]`, and `prefers-color-scheme: dark`, then re-exported to Tailwind v4 via `@theme inline`. Components use those tokens; there is **zero** hardcoded hex in `components/`.
- The global `:focus-visible` ring is correct and deliberately written in longhand — the comment explains why (Lightning CSS shorthand expansion dropped the var). Leave it alone.
- Serif/sans pairing (Newsreader / Work Sans) via `@fontsource`, applied through `--font-serif` / `--font-sans`.

Everything below is additive to that foundation. **No new colour tokens, no new fonts, no new npm dependencies.**

## The problem, in numbers

| Layer | Tokens defined | Ad-hoc values in components |
|---|---|---|
| Colour | 9 × 2 themes | 0 (clean) |
| Typography — size | 0 | 47 uses of `text-[Npx]`, **18 distinct** (9, 9.5, 10, 10.5, 11, 12, 13, 13.5, 14, 15, 16, 18, 19, 22, 26, 32, 36, 44px) alongside 79 uses of the Tailwind scale |
| Typography — tracking | 0 | 24 uses, **9 distinct** (−0.015 to 0.18em) |
| Typography — leading | 0 | 9 uses, **6 distinct** (1.05–1.55) |
| Spacing | Tailwind default only | 27 arbitrary `[Npx]` uses, **22 distinct**, 18 of them off any 4px grid (5, 7, 9, 22, 26, 30, 34px…) |
| Radius | 0 | `rounded-md` ×9 vs `rounded-full` ×11 vs `rounded-[2px]` ×1, no rule for which |
| Motion | 0 | `transition-colors` ×25, `transition-opacity` ×9, plus a hardcoded `0.25s ease` on `body` |
| Container width | 0 | `max-w-[440px]`, `[480px]`, `[560px]`, `[640px]`, `[720px]`, `[46ch]` — 6 widths, no rule |

And there are **no component primitives at all**. 23 `<button>` elements across 9 files carry 16 near-duplicate class strings; 4 `<input>` elements carry 4 different ones (two different radii, two different fills). `font-sans` is repeated 87 times even though `body` already sets it.

## Phase 1 — Tokens (no visual change intended)

Extend the `@theme inline` block in `app/globals.css` with the missing primitive scales, then replace every arbitrary value with a token. Snap the 18 type sizes down to a scale of ~7 steps, the 9 tracking values to ~4, the 6 leading values to ~3, and the container widths to ~3 named ones. Name them semantically where the usage is semantic (`--text-eyebrow`, `--text-body`, `--text-display`) rather than t-shirt sizes where that reads better in this codebase — your call, argue it in the plan.

Rules:
- Where two ad-hoc values are within ~1px or ~0.02em of each other, collapse them. Where collapsing would visibly change a hero or the reading column, keep the distinct step and say so in the plan.
- The 9.5px and 10.5px sizes are below any sane floor. Propose a minimum (11px) and flag every place it changes.
- Add radius tokens with an explicit rule: which components are pills, which are `md`. Right now the primary button is a pill in `EmailSignupInline` and `md` in `login` — pick one and justify it.
- Add duration/easing tokens and replace the hardcoded `0.25s`.
- OG image routes (`app/**/opengraph-image.tsx`) legitimately can't use CSS vars — they're rendered server-side. Extract their 14 hex literals to a single exported constant object (e.g. `lib/ogTheme.ts`) derived from the same light-mode values, so the palette lives in one place. Add a comment explaining why they can't use the tokens.

**Acceptance:** zero `text-[`, `tracking-[`, `leading-[`, and arbitrary `m*-[Npx]` / `p*-[Npx]` / `gap-[Npx]` in `components/` and `app/`. Screenshots of `/`, `/story/[slug]`, `/history`, `/collection`, `/play`, `/login`, `/account` before and after, light and dark, look the same modulo the deliberate exceptions listed in the plan.

## Phase 2 — Primitives

Create `components/ui/` with the primitives the codebase is already hand-rolling. From the actual usage:

- **Button** — variants `primary` (accent fill), `secondary` (line border), `ghost` (text only), `link` (underlined); sizes `sm` / `md`; props `disabled`, `loading`, `fullWidth`. Must cover all 23 existing call sites. Use `clsx` (already a dependency).
- **IconButton** — the lucide-icon buttons in `Header`, `ThemeToggle`, `StoryView`, `HistoryList`. Needs a required `label` prop that becomes `aria-label`, and a minimum 44×44 hit area even when the icon is smaller.
- **TextField** — the 4 inputs. One radius, one fill, optional leading icon (`HistoryList`'s search), optional label (`login` has one, the others use `aria-label`), error state wired to `aria-describedby`.
- **Pill / SegmentedControl** — the tab and language-filter buttons in `CollectionScreen` and `HistoryList`, which already use `aria-pressed`.
- **Eyebrow** — the 15 uppercase + tracked + tiny label spans.
- **Surface** — the `bg-paper-raised` + `border-line` card treatment.

Refactor every call site to use them. The end state should be that a new screen can be built without writing a single button class string.

**Acceptance:** `<button` appears only inside `components/ui/`; `npm run lint`, `npx vitest run`, `npm run build` all clean; visual parity as in Phase 1.

## Phase 3 — Accessibility fixes

These are measured, not guessed. Verify each with a contrast calculator before and after.

| Issue | Measured | Required |
|---|---|---|
| `ink-faint` on `paper`, light | **2.77:1** | 4.5:1 (WCAG 1.4.3) — used 10× at 9.5px |
| `ink-faint` on `paper`, dark | **4.07:1** | 4.5:1 |
| `text-paper` on `bg-accent` (primary button), light | **3.91:1** | 4.5:1 at 14px |
| `border-line` on `paper` | **1.31:1** | 3:1 (WCAG 1.4.11) — it's the only boundary an input has |

Fixes need to preserve the warm paper-and-ink character — this is an editorial product, not a dashboard. Options to weigh in the plan: darken `ink-faint` toward `ink-soft` in light mode (`#5b665f` measures 5.07:1); use `accent-deep` (`#7a4f1e`, 6.01:1) as the primary button fill in light mode only; add a dedicated `--line-strong` token for interactive boundaries while keeping `--line` for decorative rules. Show me the candidate hexes with their measured ratios before applying.

Also in scope:
- **Zero `aria-live` regions in the codebase.** The email signup success/error, the login error, and the puzzle guess result all change text silently. Add `role="status"` / `aria-live="polite"` (and `role="alert"` for errors).
- Pill buttons at `py-1.5` render ~30px tall, under the 44px target. Fold a minimum into the Pill primitive.
- Inputs use `focus:border-accent` — that's `:focus`, so it fires on mouse click, it duplicates the global ring, and it's exactly the border-colour-change pattern the comment in `globals.css` argues against. Remove it and let the global `:focus-visible` ring do the work, or make it `focus-visible:` and justify keeping both.

## Phase 4 — Documentation

Write `docs/design-system.md`: the token tables (name, value light, value dark, when to use), one section per primitive (variants, props, states, accessibility notes, a code example), and the three or four rules that aren't obvious from the code — when pill vs `md` radius, when serif vs sans, when `ink-soft` vs `ink-faint`. Then add a short "Design system" section to `AGENTS.md` pointing at it, so future agent sessions pick up the constraints automatically. Update `handover.md` the way the previous batches did.

## Global constraints

- No new npm dependencies. No new colour tokens beyond what Phase 3 justifies. No new fonts.
- `npm run lint`, `npx vitest run`, `npm run build` clean after **every** task, not just at the end.
- Match existing code style: short doc comments explaining *why*, not *what*.
- One commit per task. Do not `git push` until I've reviewed the whole batch.
- Phases 1 and 2 are refactors — if a diff changes rendered output, it needs to be in the plan's deliberate-exceptions list or it's a bug.
- If a phase turns out bigger than the plan estimated, stop and tell me rather than compressing the work.
