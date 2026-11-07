# curio dig placement: release 2 (a welcoming first run) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New players get a plain-words intro and no clock, are coached once on their first answer, and finish on an end screen that leads with what they found.

**Architecture:** The local dig store (`curio:dig`) gets an optional `noTimer` (absent means not chosen yet, which means no timer) and a `coached` flag. Everything else is copy and props in the existing dig components. There are no server changes.

**Tech stack:** React 19 client components, Vitest (node environment, `renderToStaticMarkup`), the existing `lib/dig/copyAudit` banned-words check.

**Spec:** `docs/superpowers/specs/2026-11-07-dig-placement-design.md` (the release 2 section).

## Global constraints

- Archive, never backlog:
  - no streaks, counts of unplayed items, "you missed" or completion percentages;
  - all new player-facing copy must pass `bannedHits()` (`lib/dig/copyAudit.ts`), which bans `\b\d+ of \d+\b`, `%`, `played`, `missed` and more.
- Design system: `components/ui/` primitives (`Button` variants `primary | secondary | ghost | link`) and token classes only. No new arbitrary Tailwind values. Red (`bg-accent-button`) is reserved for Start on the intro.
- Don't touch `scripts/dig/` or `content/dig/`.
- Existing players keep their stored timer choice. Every store saved before this release contains `settings.noTimer` (true or false), and it must be honoured.

## Rulings carried from the spec

- **The first rejected guess needs no new coaching.** `PromptScreen` already shows "Not on today's list. Try another." in `text-ink-soft`, which meets spec B3's miss case.
- **The fossil already appears as a reveal.** Both "The fossil was …" and "Words worth knowing" read that way, so there is no change for that part of B4.
- **The intro's timer toggle keeps its "No timer" wording.** It now starts pressed for new players. The spec's "Add a 25-second timer" wording moves to the end-screen offer, where the choice is new.

---

### Task 1: Timer off until chosen

**Files:**
- Modify: `lib/dig/storage.ts` (`DigStore` type, `empty`, `parseStore`, `setNoTimer`)
- Create: `effectiveNoTimer` and `markCoached` in `lib/dig/storage.ts`
- Modify: `components/dig/Intro.tsx`, `components/dig/DigGame.tsx`, `components/dig/EndScreen.tsx`
- Test: `lib/dig/game.test.ts` (store parse tests live here), `components/dig/Intro.test.tsx`, `components/dig/EndScreen.test.tsx`

**Interfaces:**
- Produces: `export type DigSettings = { noTimer?: boolean; coached?: true };`, with `DigStore = { v: 1; settings: DigSettings; games: Record<string, StoredGame> }`
- Produces: `export function effectiveNoTimer(s: DigSettings): boolean` (returns `s.noTimer ?? true`) and `export function markCoached(): void`
- Produces: `EndScreen` takes `offerTimer?: boolean` and `onAddTimer?: () => void`

- [ ] **Step 1: Write the failing tests.**

In `lib/dig/game.test.ts`, change the `parseStore("{nope")` expectation to `{ v: 1, settings: {}, games: {} }` and add:

```ts
it("keeps a stored timer choice, leaves an unchosen one absent, keeps coached", () => {
  expect(parseStore(JSON.stringify({ v: 1, settings: { noTimer: false }, games: {} })).settings).toEqual({ noTimer: false });
  expect(parseStore(JSON.stringify({ v: 1, settings: {}, games: {} })).settings).toEqual({});
  expect(parseStore(JSON.stringify({ v: 1, settings: { noTimer: "x", coached: true }, games: {} })).settings).toEqual({ coached: true });
});
it("treats an unchosen timer as no timer", () => {
  expect(effectiveNoTimer({})).toBe(true);
  expect(effectiveNoTimer({ noTimer: false })).toBe(false);
  expect(effectiveNoTimer({ noTimer: true })).toBe(true);
});
```

Import `effectiveNoTimer` from `./storage`. Check any other assertion in the file that expects `settings: { noTimer: … }` from an input that held one. Those stay as they are.

In `components/dig/Intro.test.tsx`, replace the three existing tests with:

```tsx
it("says the rules in plain words, with the example and Start", () => {
  const html = renderToStaticMarkup(<Intro noTimer onToggleTimer={noop} onStart={noop} />);
  expect(html).toContain("Name a word that fits each prompt.");
  expect(html).toContain("Everyday words count. Rarer ones dig deeper.");
  expect(html).toContain("For example: Name a fruit");
  expect(html).toContain("apple lands in the topsoil. quince digs down to the clay.");
  expect(html).not.toMatch(/fossil|bedrock|cross-section/);
  expect(html).toContain("Seven prompts. No clock: take your time.");
  expect(html).toContain('aria-pressed="true"');
  expect(bannedHits(html)).toEqual([]);
});
it("names the clock when the timer is on", () => {
  const html = renderToStaticMarkup(<Intro noTimer={false} onToggleTimer={noop} onStart={noop} />);
  expect(html).toContain("Seven prompts, 25 seconds each.");
  expect(html).toContain('aria-pressed="false"');
});
it("keeps red for Start alone", () => {
  const html = renderToStaticMarkup(<Intro noTimer={false} onToggleTimer={noop} onStart={noop} />);
  expect(html.match(/bg-accent-button/g)).toHaveLength(1);
});
```

In `components/dig/EndScreen.test.tsx`:

```tsx
it("offers a timer once, as an opt-in, when the player never chose one", () => {
  const html = renderToStaticMarkup(<EndScreen day={day} game={game} isToday offerTimer onAddTimer={() => {}} />);
  expect(html).toContain("Want more of a challenge? Add a 25-second timer next time.");
  expect(bannedHits(html)).toEqual([]);
  expect(renderToStaticMarkup(<EndScreen day={day} game={game} isToday />)).not.toContain("Add a 25-second timer");
});
```

- [ ] **Step 2: Run the tests and check they fail.** Run `npx vitest run lib/dig/game.test.ts components/dig/Intro.test.tsx components/dig/EndScreen.test.tsx`.

- [ ] **Step 3: Implement.**

`lib/dig/storage.ts`:

```ts
/** noTimer absent = never chosen = no timer (a new player's first digs have no clock).
 * Stores saved before 2026-11-07 always hold true or false, so returning players keep theirs. */
export type DigSettings = { noTimer?: boolean; coached?: true };
export type DigStore = { v: 1; settings: DigSettings; games: Record<string, StoredGame> };

const empty = (): DigStore => ({ v: 1, settings: {}, games: {} });

export function effectiveNoTimer(s: DigSettings): boolean {
  return s.noTimer ?? true;
}
```

In `parseStore`, replace `settings: { noTimer: !!s.settings?.noTimer }` with:

```ts
settings: {
  ...(typeof s.settings?.noTimer === "boolean" ? { noTimer: s.settings.noTimer } : {}),
  ...(s.settings?.coached === true ? { coached: true as const } : {}),
},
```

Then replace `setNoTimer` and add `markCoached`, both keeping the other settings:

```ts
export function setNoTimer(on: boolean) { const s = readStore(); writeStore({ ...s, settings: { ...s.settings, noTimer: on } }); }
export function markCoached() { const s = readStore(); if (!s.settings.coached) writeStore({ ...s, settings: { ...s.settings, coached: true } }); }
```

`components/dig/Intro.tsx` body text (keep the example box, the buttons and the toggle as they are). Replace the three opening `<p>`s and the closing note with:

```tsx
<p className="font-sans text-lg text-ink">Name a word that fits each prompt.</p>
<p className="mt-2 font-sans text-lg text-ink-soft">Everyday words count. Rarer ones dig deeper.</p>
```

After the toggle row:

```tsx
<p className="mt-3 font-sans text-sm text-ink-faint">{noTimer ? "Seven prompts. No clock: take your time." : "Seven prompts, 25 seconds each."}</p>
```

Update the component's doc comment to "The landing card: two plain lines, an example, Start, and No timer."

`components/dig/DigGame.tsx`:
- Import `effectiveNoTimer`.
- In the intro branch, use `const noTimer = effectiveNoTimer(store.settings);` for `noTimer`, for `onToggleTimer={() => setNoTimer(!noTimer)}` and for the start dispatch (`{ type: "start", noTimer }`).
- Where `EndScreen` is rendered, pass `offerTimer={isToday && store.settings.noTimer === undefined}` and `onAddTimer={() => setNoTimer(false)}`.

`components/dig/EndScreen.tsx`: add the props `offerTimer = false` and `onAddTimer`. Keep a local `const [timerAdded, setTimerAdded] = useState(false);`. After the "A new dig opens at midnight UTC." line, render:

```tsx
{offerTimer && onAddTimer && (
  <p className="mt-2 font-sans text-base text-ink-soft">
    {timerAdded ? "Timer on for your next dig." : (
      <Button variant="link" onClick={() => { onAddTimer(); setTimerAdded(true); }}>Want more of a challenge? Add a 25-second timer next time.</Button>
    )}
  </p>
)}
```

Once `setNoTimer(false)` is stored, `store.settings.noTimer` is no longer undefined, so `offerTimer` becomes false. To keep the "Timer on" confirmation visible, render the block when `offerTimer || timerAdded`. The condition is therefore `(offerTimer || timerAdded) && onAddTimer`.

- [ ] **Step 4: Run all the tests.** Run `npx vitest run` (the whole suite: `copyAudit.test.tsx` renders Intro too), then `npm run lint` and `npx tsc --noEmit`. Fix any test that relied on the old intro copy or on `settings: { noTimer: false }` from `empty()`, so that it asserts the new behaviour.

- [ ] **Step 5: Commit.** Run `git commit -m "feat(dig): no clock until a player asks for one; plain-words intro"`.

### Task 2: Coach the first answer, lead the end screen with what was found

**Files:**
- Modify: `components/dig/Reveal.tsx` (a `coach?: boolean` prop)
- Modify: `components/dig/DigGame.tsx` (decide and mark coaching)
- Modify: `components/dig/EndScreen.tsx` (the found line)
- Create: `coachIndex` in `lib/dig/game.ts`, and `foundLine` in `components/dig/EndScreen.tsx` (exported)
- Test: `lib/dig/game.test.ts`, `components/dig/Reveal.test.tsx`, `components/dig/EndScreen.test.tsx`

**Interfaces:**
- Consumes: `markCoached()` and `DigSettings.coached` from Task 1
- Produces: `export function coachIndex(results: PromptResult[]): number` (the index of the first result with an answer, or -1) and `export function foundLine(tiers: (Tier | null)[]): string`

- [ ] **Step 1: Write the failing tests.**

`lib/dig/game.test.ts`:

```ts
it("coaches on the first answered prompt only", () => {
  const r = (answer: string | null) => ({ answer, tier: answer ? ("common" as const) : null, rejected: [], lastGuess: null });
  expect(coachIndex([r(null), r("apple"), r("pear")])).toBe(1);
  expect(coachIndex([r(null)])).toBe(-1);
});
```

`components/dig/Reveal.test.tsx`: reuse the file's existing fixtures for an answered result. Look at how the existing tests build `result` and `secret` and copy that.

```tsx
it("shows the one-time tip only when coached", () => {
  const tip = "Every word that fits counts. Rarer ones dig deeper.";
  expect(renderToStaticMarkup(<Reveal {...answeredProps} coach />)).toContain(tip);
  expect(renderToStaticMarkup(<Reveal {...answeredProps} />)).not.toContain(tip);
});
```

`components/dig/EndScreen.test.tsx`:

```tsx
describe("foundLine", () => {
  it("leads with what was found and the deepest layer reached", () => {
    expect(foundLine(["common", null, null, null, null, null, "fossil"])).toBe("You found 2 words and reached the bedrock.");
    expect(foundLine(["familiar", null, null, null, null, null, null])).toBe("You found 1 word and reached the loam.");
    expect(foundLine([null, null, null, null, null, null, null])).toBe("Hard ground today. Here's what was buried.");
  });
});
it("shows the found line on the postcard and passes the copy audit", () => {
  const html = renderToStaticMarkup(<EndScreen day={day} game={game} isToday />);
  expect(html).toContain("You found 2 words and reached the bedrock.");
  expect(bannedHits(html)).toEqual([]);
});
```

The file's existing `game` fixture has tiers `["common", null, null, null, null, null, "fossil"]`.

- [ ] **Step 2: Run the tests and check they fail.** Run `npx vitest run lib/dig/game.test.ts components/dig/Reveal.test.tsx components/dig/EndScreen.test.tsx`.

- [ ] **Step 3: Implement.**

`lib/dig/game.ts`:

```ts
/** The prompt whose reveal carries the one-time "every word counts" tip: the first one answered. */
export function coachIndex(results: PromptResult[]): number {
  return results.findIndex((r) => r.answer !== null);
}
```

`components/dig/Reveal.tsx`: add `coach = false` to the props, with the doc comment "first answer this device has ever made: show the one-time tip". Straight after the `extra` paragraph, add:

```tsx
{coach && answered && <p className="mt-2 font-sans text-base text-ink">Every word that fits counts. Rarer ones dig deeper.</p>}
```

`components/dig/DigGame.tsx` (DigRun):

```tsx
// Coaching is decided once, at mount, so marking it seen doesn't hide the tip mid-reveal.
const [coachable] = useState(() => !readStore().settings.coached);
const coachAt = coachable ? coachIndex(state.results) : -1;
const coachNow = state.phase === "reveal" && coachAt === state.current;
useEffect(() => { if (coachNow) markCoached(); }, [coachNow]);
```

Pass `coach={coachNow}` to `<Reveal>`. Import `coachIndex` from `@/lib/dig/game` and `markCoached` from `@/lib/dig/storage`. `state.results` only holds locked prompts, so `coachIndex` can't point at a later prompt while an earlier one is on screen.

`components/dig/EndScreen.tsx`:

```tsx
import { formatDepth, STRATUM, TIER_LABEL } from "@/lib/dig/score";
import { TIERS, type Tier } from "@/lib/dig/types";

/** The postcard's first line: what the player found, never what they didn't. */
export function foundLine(tiers: (Tier | null)[]): string {
  const found = tiers.filter((t): t is Tier => t !== null);
  if (found.length === 0) return "Hard ground today. Here's what was buried.";
  const deepest = found.reduce((a, t) => (TIERS.indexOf(t) > TIERS.indexOf(a) ? t : a));
  return `You found ${found.length} ${found.length === 1 ? "word" : "words"} and reached the ${STRATUM[deepest]}.`;
}
```

On the postcard, between the wordmark row and the depth `<h2>`, add `<p className="mt-3 font-sans text-base text-ink">{foundLine(game.tiers)}</p>`. Change the `<h2>`'s `mt-3` to `mt-1`. Update `announceDone` only if a test requires it, and otherwise leave it.

- [ ] **Step 4: Run all the tests.** Run `npx vitest run`, `npm run lint` and `npx tsc --noEmit`.

- [ ] **Step 5: Commit.** Run `git commit -m "feat(dig): coach the first answer once; end screen leads with what was found"`.

### Task 3: Verify and ship

- [ ] **Build.** Run `npm run build`.
- [ ] **Browser checks** in local dev at 375px. Clear `curio:dig` first, then check:
  - The intro shows the two plain lines and "No timer" is pressed.
  - Start runs a dig with no clock.
  - The first answered reveal shows the tip, and the second does not.
  - The end screen leads with the found line, then shows the timer offer.
  - Tapping the offer shows "Timer on for your next dig."
  - Reloading the intro now shows the timer on.
  - A store holding `settings.noTimer: false` keeps the timer.
- [ ] **Review.** Run a final whole-branch review, then a mobile `ux-reviewer` pass on the copy and flow.
- [ ] **Merge and deploy.** Fast-forward master and push. Then verify on curioword.com at 375px and desktop.
