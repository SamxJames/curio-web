# Week 1 Launch Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make curio dig ready for strangers from launch posts: the rules show on load, results can challenge a friend, the homepage and header point to the dig, /play explains itself, story pages drop pipeline disclaimers, and launch traffic and day-7 return become measurable.

**Architecture:** Small, independent changes on the existing Next.js 16 app. The new pure modules (`lib/dig/pitch.ts`, `lib/dig/challenge.ts`, `lib/storyText.ts`, `lib/dig/cohort.ts`) carry the logic and tests. Components only wire them in. The cohorts reuse the existing dig event endpoint and the `curio:dig:` Redis prefix.

**Tech Stack:** Next.js 16 App Router (read `AGENTS.md`: this is not the Next.js you know), React 19, TypeScript, Tailwind v4, Vitest, Upstash Redis.

**Spec:** `docs/superpowers/specs/2026-11-07-week1-launch-readiness-design.md`

## Global Constraints
- Work in the worktree `.claude/worktrees/week1` (branch `feat/week1-launch-readiness`). Run `npm ci` there once before the first test (never junction `node_modules`).
- Commands: `npx vitest run <path>`, `npm run lint`, `npm run build`.
- UI must use the `components/ui/` primitives and the tokens in `app/globals.css` (read `docs/design-system.md`). Add no new arbitrary Tailwind values. `components/dig/DigFunnelTable.tsx` (admin) is exempt.
- Pitch line, verbatim: `A daily word game where obscure answers win. No crowd needed, and every answer comes with its origin story.`
- Archive, never backlog: no streaks, unread counts, "you missed" copy, or rankings.
- Client components may only `import type` from `lib/words.ts`.
- Redis keys must start with `curio:dig:` (for dig data). Writes happen only when `writesRedis()` is true (production).
- Do not change story titles, meta descriptions, `lib/words.ts` data, or the sitemap (SEO freeze).
- Commit after each task. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Dig rules show on load + pitch line

**Files:**
- Create: `lib/dig/pitch.ts`
- Modify: `components/dig/Intro.tsx`, `components/dig/DigGame.tsx:56-64`, `app/dig/page.tsx:6-10`
- Test: `components/dig/Intro.test.tsx` (create)

**Interfaces:**
- Produces: `export const DIG_PITCH: string` from `lib/dig/pitch.ts`. Intro props become `{ noTimer: boolean; onToggleTimer: () => void; onStart: () => void; loading?: boolean; challenge?: string | null }`, where `challenge` is a ready-made line shown above the rules (Task 2 passes it).

- [ ] **Step 1: Write the failing test** (`components/dig/Intro.test.tsx`)

```tsx
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Intro from "./Intro";
import { DIG_PITCH } from "@/lib/dig/pitch";

const noop = () => {};
describe("Intro", () => {
  it("leads with the pitch and the rules", () => {
    const html = renderToStaticMarkup(<Intro noTimer={false} onToggleTimer={noop} onStart={noop} />);
    expect(html).toContain(DIG_PITCH);
    expect(html).toContain("7 prompts. 25 seconds each.");
  });
  it("shows the rules but a disabled Start while loading", () => {
    const html = renderToStaticMarkup(<Intro noTimer={false} onToggleTimer={noop} onStart={noop} loading />);
    expect(html).toContain("7 prompts. 25 seconds each.");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*Loading…/);
  });
  it("shows a friend's challenge line when given", () => {
    const html = renderToStaticMarkup(<Intro noTimer={false} onToggleTimer={noop} onStart={noop} challenge="A friend dug 2.3 m today. Can you go deeper?" />);
    expect(html).toContain("A friend dug 2.3 m today.");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run components/dig/Intro.test.tsx`. Expected: FAIL (no `lib/dig/pitch`).

- [ ] **Step 3: Implement**

`lib/dig/pitch.ts`:
```ts
/** The one-line pitch for curio dig: the intro, the /dig description and the homepage card. */
export const DIG_PITCH =
  "A daily word game where obscure answers win. No crowd needed, and every answer comes with its origin story.";
```

`components/dig/Intro.tsx`: add the `loading` and `challenge` props.
- When `challenge` is set, render `<p className="font-sans text-base text-ink">{challenge}</p>` first.
- Make the first line `DIG_PITCH`, in the same `text-lg text-ink` paragraph that replaces "Each prompt hides one word nobody expects." Then keep "Each prompt hides one word nobody expects." as part of the second paragraph: `Each prompt hides one word nobody expects. 7 prompts. 25 seconds each. Rarer answers dig deeper.`
- Start: `<Button onClick={onStart} disabled={loading}>{loading ? "Loading…" : "Start"}</Button>`.
- Wrap the `ToggleGroup` in `{!loading && (...)}` so nobody toggles before the store is read.
- If `Button` doesn't forward `disabled`, read `components/ui/Button.tsx` and use its existing disabled support. Don't hand-roll a button.

`components/dig/DigGame.tsx`: replace the `!day` branch with:
```tsx
if (!day) {
  return (
    <>
      <Heading heading={heading} phase="intro" note={note} />
      <Intro noTimer={false} onToggleTimer={() => {}} onStart={() => {}} loading />
      <p className="sr-only" aria-live="polite">Loading the dig…</p>
    </>
  );
}
```
Remove the `StrataSkeleton` import if it's now unused (check with grep).

`app/dig/page.tsx`: `description: DIG_PITCH` (import from `@/lib/dig/pitch`).

- [ ] **Step 4: Run** `npx vitest run components/dig` (all dig component tests). Expected: PASS. If an existing test asserted "Loading the dig…" visibly or the old intro text, update it to the new copy.

- [ ] **Step 5: Commit** `feat(dig): rules and pitch render before the day loads`

---

### Task 2: Challenge link

**Files:**
- Create: `lib/dig/challenge.ts`, `lib/dig/challenge.test.ts`
- Modify: `lib/dig/share.ts:5-7` (+ its test if one asserts the URL line), `components/dig/DigGame.tsx`, `components/dig/EndScreen.tsx`, `lib/traffic.ts` (add `challenge` only if Task 6 hasn't landed yet; Task 6 owns the traffic list, so coordinate: **Task 2 adds `"challenge"` to `TRAFFIC_SOURCES` and `TAGGED`**)
- Test: `lib/dig/challenge.test.ts`, `lib/dig/share.test.ts`

**Interfaces:**
- Consumes: `TIERS`, `Tier` (`lib/dig/types.ts`); `scoreOf`, `formatDepth` (`lib/dig/score.ts`); Intro's `challenge` prop (Task 1).
- Produces: `encodeVs(n: number, tiers: (Tier | null)[]): string`, `parseVs(raw: string | null, n: number): (Tier | null)[] | null`, `challengeLine(tiers: (Tier | null)[]): string`, `shareText(n, score, tiers)` whose last line is `curioword.com/dig?vs=<code>&utm_source=challenge`.

- [ ] **Step 1: Failing tests** (`lib/dig/challenge.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { challengeLine, encodeVs, parseVs } from "./challenge";
import type { Tier } from "./types";

const tiers: (Tier | null)[] = ["common", "rare", null, "fossil", "popular", "familiar", "uncommon"];
describe("challenge codes", () => {
  it("round-trips", () => {
    expect(encodeVs(12, tiers)).toBe("12.04-5123");
    expect(parseVs("12.04-5123", 12)).toEqual(tiers);
  });
  it("rejects another day, bad length, bad characters and junk", () => {
    expect(parseVs("11.04-5123", 12)).toBeNull();
    expect(parseVs("12.04-512", 12)).toBeNull();
    expect(parseVs("12.04-5129", 12)).toBeNull();
    expect(parseVs("12.04x5123", 12)).toBeNull();
    expect(parseVs(null, 12)).toBeNull();
    expect(parseVs("", 12)).toBeNull();
  });
  it("words the friend's depth", () => {
    expect(challengeLine(tiers)).toMatch(/^A friend dug \d+\.\d m today\. Can you go deeper\?$/);
  });
});
```

In `lib/dig/share.test.ts` (create it if it doesn't exist), assert the last line of `shareText(12, scoreOf(tiers), tiers)` equals `curioword.com/dig?vs=12.04-5123&utm_source=challenge`.

- [ ] **Step 2: Run** `npx vitest run lib/dig/challenge.test.ts lib/dig/share.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `lib/dig/challenge.ts`

```ts
import { formatDepth, PROMPTS_PER_DAY, scoreOf } from "./score";
import { TIERS, type Tier } from "./types";

/** A spoiler-free challenge code: "<day number>.<one char per prompt>", tier index 0–5 or "-". Nothing stored. */
export function encodeVs(n: number, tiers: (Tier | null)[]): string {
  return `${n}.${tiers.map((t) => (t ? String(TIERS.indexOf(t)) : "-")).join("")}`;
}

/** The friend's tiers, or null when the code is malformed or for a different day. */
export function parseVs(raw: string | null, n: number): (Tier | null)[] | null {
  const m = raw?.match(/^(\d{1,5})\.([0-5-]+)$/);
  if (!m || Number(m[1]) !== n || m[2].length !== PROMPTS_PER_DAY) return null;
  return [...m[2]].map((c) => (c === "-" ? null : TIERS[Number(c)]));
}

export function challengeLine(tiers: (Tier | null)[]): string {
  return `A friend dug ${formatDepth(scoreOf(tiers))} today. Can you go deeper?`;
}
```

`lib/dig/share.ts`: the last array element becomes `` `curioword.com/dig?vs=${encodeVs(n, tiers)}&utm_source=challenge` ``.

`lib/traffic.ts`: add `"challenge"` to `TRAFFIC_SOURCES` (before `"other"`) and to `TAGGED`.

`components/dig/DigGame.tsx`, today only (`!date`):
- In `DigGame`, add `const [vsRaw, setVsRaw] = useState<string | null>(null);` and, inside the existing effect when `!date`, `setVsRaw(new URLSearchParams(window.location.search).get("vs"));`.
- Pass `vsRaw` to `DigRun`. In `DigRun`, compute `const friend = isToday ? parseVs(vsRaw, day.number) : null;`.
- Pass `challenge={friend ? challengeLine(friend) : null}` to `<Intro>`, and `friend={friend}` to `<EndScreen>`.

`components/dig/EndScreen.tsx`: add an optional `friend?: (Tier | null)[] | null` prop. When it's set, render this after the player's own strata/depth block:
```tsx
{friend && (
  <section className="mt-8 border-t border-line pt-6">
    <h2 className="font-sans text-xs tracking-wide text-ink-faint">You and your friend</h2>
    <div className="mt-3 grid grid-cols-2 gap-4">
      <div><p className="font-sans text-sm text-ink-soft">You · {formatDepth(game.score)}</p><Strata compact label="Your dig" tiers={game.tiers} /></div>
      <div><p className="font-sans text-sm text-ink-soft">Friend · {formatDepth(scoreOf(friend))}</p><Strata compact label="Your friend's dig" tiers={friend} /></div>
    </div>
  </section>
)}
```
First check `Strata`'s props in `components/dig/Strata.tsx:28`. If `words` is required, pass `words={[]}` or whatever its type requires for "no words". Keep it spoiler-free: never show the friend's answers.

- [ ] **Step 4: Run** `npx vitest run lib/dig components/dig lib/traffic.test.ts`. Expected: PASS. Fix any existing test that pinned the old share text or the source list.

- [ ] **Step 5: Commit** `feat(dig): challenge a friend with a spoiler-free link`

---

### Task 3: Homepage dig card + header link

**Files:**
- Create: `components/DigCard.tsx`, `components/DigCard.test.tsx`
- Modify: `app/page.tsx`, `components/HomeContent.tsx`, `components/TodayHero.tsx`, `components/ArrivalHero.tsx`, `app/layout.tsx:72`, `components/Header.tsx` (+ `components/Header.test.tsx`)

**Interfaces:**
- Consumes: `DIG_PITCH` (Task 1); `isDigOpen()` from `lib/dig/clock.ts` (server-only).
- Produces: `DigCard` (no props). `HomeContent`, `TodayHero` and `ArrivalHero` take `digOpen: boolean`. `Header` takes `digOpen?: boolean` (default false).

- [ ] **Step 1: Failing tests**
- `components/DigCard.test.tsx`: `renderToStaticMarkup(<DigCard />)` contains `href="/dig"`, `Today&#x27;s dig` (or `Today's dig`, depending on escaping; assert with a regex `/Today(&#x27;|')s dig/`) and `DIG_PITCH`.
- `components/Header.test.tsx`: add a case where `<Header digOpen />` contains `href="/dig"`, and plain `<Header />` does not. Mirror how the existing test renders it, including any session mocking.

- [ ] **Step 2: Run** `npx vitest run components/DigCard.test.tsx components/Header.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement**

`components/DigCard.tsx` (server-safe, no hooks):
```tsx
import Link from "next/link";
import { DIG_PITCH } from "@/lib/dig/pitch";

/** Today's dig, at the top of the homepage: the launch front door. */
export default function DigCard() {
  return (
    <Link href="/dig" className="mb-12 block w-full border border-line p-5 transition-colors hover:border-line-strong">
      <p className="font-sans text-xs tracking-wide text-ink-faint">Today&apos;s dig</p>
      <p className="mt-2 max-w-[46ch] font-serif text-lg leading-relaxed text-ink">{DIG_PITCH}</p>
      <span className="mt-4 inline-flex items-center rounded-full bg-accent px-5 py-2.5 font-sans text-sm font-medium text-paper">Start today&apos;s dig</span>
    </Link>
  );
}
```
(`max-w-[46ch]` already exists in `TodayHero`, so it's an established value. If `docs/design-system.md` names a token for it, use that instead.)

Wiring:
- `app/page.tsx`: `<HomeContent word={word} date={...} digOpen={isDigOpen()} />`.
- `HomeContent`: pass `digOpen` to both heroes.
- Each hero renders `{digOpen && <DigCard />}` as the first child of its `<section>`, before the date eyebrow.
- `app/layout.tsx`: `<Header digOpen={isDigOpen()} />`.
- `Header`: after the Puzzle link, add `{digOpen && <Link href="/dig" className={navLinkClass(pathname.startsWith("/dig"))}>Dig</Link>}`.

- [ ] **Step 4: Run** `npx vitest run components app` and `npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(home): today's dig card on the homepage and a Dig header link`

---

### Task 4: /play rules line

**Files:**
- Modify: `components/PuzzleGame.tsx:165`
- Test: the existing `components/PuzzleGame.test.tsx` if present, otherwise a render assertion in a new `components/PuzzleGame.rules.test.tsx`

- [ ] **Step 1: Failing test:** render `PuzzleGame` as its existing tests do (copy their setup) and assert the markup contains `Guess today&#x27;s word in up to three clues. Each clue gives more away.` (regex for the apostrophe). If `PuzzleGame` can't be rendered statically in a test, extract the line into a tiny exported `PuzzleRules` component in the same file and test that.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement:** directly under the `<h1>Guess the word</h1>`: `<p className="mt-2 font-sans text-base text-ink-soft">Guess today&apos;s word in up to three clues. Each clue gives more away.</p>`.
- [ ] **Step 4: Run** `npx vitest run components/PuzzleGame*`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(play): one-line rules under the heading`

---

### Task 5: Strip pipeline disclaimers from stories

**Files:**
- Create: `lib/storyText.ts`, `lib/storyText.test.ts`
- Modify: `components/StoryView.tsx:125-135`

**Interfaces:**
- Produces: `cleanStoryText(s: string): string` (pure, client-safe, no imports from `lib/words.ts`).

- [ ] **Step 1: Failing tests** (`lib/storyText.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { cleanStoryText } from "./storyText";
import { WORDS } from "./words";

describe("cleanStoryText", () => {
  it("cuts a trailing disclaimer clause and keeps the lead", () => {
    expect(cleanStoryText("It shares a root with other words built on that stem, though the facts here don't name them specifically."))
      .toBe("It shares a root with other words built on that stem.");
  });
  it("keeps what follows 'but' in a sentence that opens with the facts", () => {
    expect(cleanStoryText("The facts here don't name a specific English cognate, but the root verb means 'to remember'. Next sentence."))
      .toBe("The root verb means 'to remember'. Next sentence.");
  });
  it("drops a sentence that is only a disclaimer", () => {
    expect(cleanStoryText("Real fact. The facts given don't support tracing this word to any other English cognate."))
      .toBe("Real fact.");
    expect(cleanStoryText("The facts given don't support tracing this word to any other English cognate.")).toBe("");
  });
  it("leaves clean text alone", () => {
    expect(cleanStoryText("From Hindustani jangal, 'desert'.")).toBe("From Hindustani jangal, 'desert'.");
  });
  it("leaves no disclaimer anywhere in the word bank", () => {
    const leftovers: string[] = [];
    for (const w of WORDS) for (const k of ["origin", "journey", "related"] as const) {
      const out = cleanStoryText(w[k]);
      if (/\bthe facts\b|\bfacts (given|here|don't)\b/i.test(out)) leftovers.push(`${w.slug}.${k}: ${out}`);
    }
    expect(leftovers).toEqual([]);
  });
});
```
First check the `SECTIONS` keys in `StoryView.tsx:17-20` and use the real field names in place of `origin`/`journey`/`related`.

- [ ] **Step 2: Run** `npx vitest run lib/storyText.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `lib/storyText.ts`

```ts
/** Disclaimers the generation pipeline left in reader-facing story text ("the facts here don't …").
 * Removed at render time; the data in lib/words.ts is left as is. */
const FACTS = String.raw`the facts(?: here| given)?(?: only)? (?:don't|do not|only|point|show|trace)`;
const TRAILING = new RegExp(String.raw`[,;]?\s*(?:—\s*)?(?:though|but|and|while|although)\s+${FACTS}[^.!?]*`, "gi");
const OPENING_BUT = new RegExp(String.raw`^${FACTS}[^.!?]*?,\s*but\s+`, "i");
const MENTION = new RegExp(String.raw`\b${FACTS}`, "i");

function splitSentences(s: string): string[] {
  return s.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [];
}

export function cleanStoryText(s: string): string {
  const out: string[] = [];
  for (const raw of splitSentences(s)) {
    let t = raw.trim();
    if (!MENTION.test(t)) { out.push(t); continue; }
    if (OPENING_BUT.test(t)) {
      t = t.replace(OPENING_BUT, "");
      out.push(t.charAt(0).toUpperCase() + t.slice(1));
      continue;
    }
    const cut = t.replace(TRAILING, "").trim();
    if (cut !== t && !MENTION.test(cut) && /[A-Za-z]/.test(cut)) {
      out.push(/[.!?]["')\]]*$/.test(cut) ? cut : cut + ".");
    }
    // otherwise: the sentence is only a disclaimer; drop it
  }
  return out.join(" ").trim();
}
```
Run the sweep test. For any leftover it prints, widen `FACTS` (for example "the facts don't", "facts given don't") until the sweep passes. Also read 10 changed outputs (log them temporarily) and check that they read naturally. Don't special-case individual words.

`components/StoryView.tsx`: compute `const sections = SECTIONS.map(({ key, label }) => ({ key, label, text: cleanStoryText(word[key]) })).filter((s) => s.text);` and render `s.text`.

- [ ] **Step 4: Run** `npx vitest run lib/storyText.test.ts components/StoryView*`. Expected: PASS.

- [ ] **Step 5: Commit** `fix(story): hide pipeline disclaimers from readers`

---

### Task 6: Launch tags + dig cohorts

**Files:**
- Create: `lib/dig/cohort.ts`, `lib/dig/cohort.test.ts`
- Modify: `lib/traffic.ts`, `lib/dig/client.ts`, `lib/dig/events.ts`, `lib/dig/keys.ts`, `lib/dig/server.ts`, `app/api/dig/event/route.ts`, `components/dig/DigGame.tsx`, `app/admin/page.tsx`, `components/AdminDashboard.tsx`, `components/dig/DigFunnelTable.tsx`
- Test: `lib/dig/cohort.test.ts`, `lib/dig/events.test.ts` (extend), `lib/traffic.test.ts` (extend)

**Interfaces:**
- Consumes: `challenge` already in `TRAFFIC_SOURCES`/`TAGGED` (Task 2).
- Produces:
  - `firstPlayDate(games: Record<string, { finishedAt: string }>, today: string): string | null`: the earliest finish UTC day before today.
  - `isNewPlayer(games, today): boolean`: no finish on any earlier UTC day.
  - `cohortDay(first: string, today: string): number | null`: whole days, 1–60, else null.
  - `digKeys.cohort(first: string)` = `` `curio:dig:cohort:${first}` ``.
  - The start event gains an optional `first: string`, and the finish event an optional `isNew: true`.
  - `summarizeCohorts(cohorts: Record<string, Record<string, number>>, funnel: Record<string, Record<string, number>>, dates: string[]): { date: string; newFinishers: number; d1: number; d7: number; d8to13: number }[]`.

- [ ] **Step 1: Failing tests**

`lib/dig/cohort.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { cohortDay, firstPlayDate, isNewPlayer, summarizeCohorts } from "./cohort";

const games = { "2026-11-08": { finishedAt: "2026-11-08T10:00:00Z" }, "2026-11-10": { finishedAt: "2026-11-10T09:00:00Z" } };
describe("cohorts", () => {
  it("first play is the earliest finish before today", () => {
    expect(firstPlayDate(games, "2026-11-15")).toBe("2026-11-08");
    expect(firstPlayDate(games, "2026-11-08")).toBeNull();
    expect(firstPlayDate({}, "2026-11-15")).toBeNull();
  });
  it("new means no earlier finish", () => {
    expect(isNewPlayer({}, "2026-11-08")).toBe(true);
    expect(isNewPlayer(games, "2026-11-08")).toBe(true);
    expect(isNewPlayer(games, "2026-11-09")).toBe(false);
  });
  it("cohort day is 1–60 whole days", () => {
    expect(cohortDay("2026-11-08", "2026-11-15")).toBe(7);
    expect(cohortDay("2026-11-08", "2026-11-08")).toBeNull();
    expect(cohortDay("2026-09-01", "2026-11-15")).toBeNull();
    expect(cohortDay("nonsense", "2026-11-15")).toBeNull();
  });
  it("summarizes new finishers and returns", () => {
    const rows = summarizeCohorts(
      { "2026-11-08": { d1: 4, d7: 2, d8: 1, d12: 1 } },
      { "2026-11-08": { "finish:new": 20 } },
      ["2026-11-08", "2026-11-09"],
    );
    expect(rows).toEqual([
      { date: "2026-11-08", newFinishers: 20, d1: 4, d7: 2, d8to13: 2 },
      { date: "2026-11-09", newFinishers: 0, d1: 0, d7: 0, d8to13: 0 },
    ]);
  });
});
```

`lib/dig/events.test.ts`, new cases:
- `parseDigEvent({ kind: "start", date: today, ret: "d7", first: "<today minus 7>" }, today)` keeps `first`.
- `first` equal to today, more than 60 days old, or junk is dropped (the event still parses).
- `funnelFields` for a start with `first` is unchanged (cohorts are written separately).
- `parseDigEvent` for a valid finish with `isNew: true` keeps `isNew`, and `planFinish` for it includes `[digKeys.funnel(date), "finish:new", 1]`.

`lib/traffic.test.ts`: `classifySource` with `?utm_source=reddit`, `hn`, `newsletter` and `challenge` returns that source.

- [ ] **Step 2: Run** `npx vitest run lib/dig/cohort.test.ts lib/dig/events.test.ts lib/traffic.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/dig/cohort.ts` (pure, client-safe):
```ts
const DAY = 86_400_000;
const day = (iso: string) => { const t = Date.parse(iso.slice(0, 10) + "T00:00:00Z"); return Number.isNaN(t) ? null : t; };
const MAX_COHORT_DAY = 60;

export function firstPlayDate(games: Record<string, { finishedAt: string }>, today: string): string | null {
  const now = day(today);
  let first: number | null = null;
  for (const g of Object.values(games)) {
    const d = typeof g.finishedAt === "string" ? day(g.finishedAt) : null;
    if (d !== null && now !== null && d < now && (first === null || d < first)) first = d;
  }
  return first === null ? null : new Date(first).toISOString().slice(0, 10);
}

export const isNewPlayer = (games: Record<string, { finishedAt: string }>, today: string) => firstPlayDate(games, today) === null;

export function cohortDay(first: string, today: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(first)) return null;
  const a = day(first), b = day(today);
  if (a === null || b === null) return null;
  const n = Math.round((b - a) / DAY);
  return n >= 1 && n <= MAX_COHORT_DAY ? n : null;
}

export function summarizeCohorts(
  cohorts: Record<string, Record<string, number>>,
  funnel: Record<string, Record<string, number>>,
  dates: string[],
) {
  return dates.map((date) => {
    const c = cohorts[date] ?? {};
    let d8to13 = 0;
    for (let i = 8; i <= 13; i++) d8to13 += c[`d${i}`] ?? 0;
    return { date, newFinishers: funnel[date]?.["finish:new"] ?? 0, d1: c.d1 ?? 0, d7: c.d7 ?? 0, d8to13 };
  });
}
```

`lib/dig/events.ts`:
- `start` type: `{ kind: "start"; date: string; ret?: ...; first?: string }`. In the parser, `const first = typeof b.first === "string" && cohortDay(b.first, today) !== null ? b.first : undefined;` and include it when set.
- `finish` type: add `isNew?: true`, parsed as `b.isNew === true ? { ..., isNew: true } : ...`.
- In `planFinish`: `if (ev.isNew) out.push([digKeys.funnel(ev.date), "finish:new", 1]);`.

`lib/dig/keys.ts`: add `cohort: (first: string) => \`curio:dig:cohort:${first}\`,` with the comment `/** returning starts by first-play date: field d<days since first> */`.

`lib/dig/server.ts`, in `recordFunnel` (after the funnel write): when `ev.kind === "start" && ev.first`, compute `const n = cohortDay(ev.first, date)` and, if it's not null, run `await r.hincrby(digKeys.cohort(ev.first), \`d${n}\`, 1)`. Fold it into the existing pipeline when there is one. Add `readCohorts(dates: string[]): Promise<Record<string, Record<string, number>>>`, modelled on the funnel reader at `server.ts:~190` (pipeline `hgetall` per date, coerce values to numbers, `{}` when Redis is absent).

`lib/dig/client.ts`:
- `buildStartEvent`: add `first` when `firstPlayDate(games, date)` is not null.
- `buildFinishEvent`: gains a final parameter `isNew: boolean` and adds `isNew: true` when it's true.

`components/dig/DigGame.tsx`: when building the finish event, pass `isNewPlayer(readStore().games, day.date)`. **Compute it before `saveGame`**, since saving adds today's game (which isn't earlier than today anyway, so either order is correct; still compute it first, for clarity).

`lib/traffic.ts`: add `"newsletter"` to `TRAFFIC_SOURCES` (before `"other"`), and `"reddit"`, `"hn"` and `"newsletter"` to `TAGGED`. `challenge` is already there from Task 2. Then grep for `TRAFFIC_SOURCES` users (`scripts/traffic*`, `lib/trafficStats.ts`, admin) and check that a new source shows up without further change. Fix any test that pins the list.

Admin:
- `app/admin/page.tsx`: alongside the dig funnel, fetch `readCohorts(last21)`, where `last21` is the 21 most recent dates from `last28`. Pass `summarizeCohorts(cohorts, digDays, last21)` through `AdminDashboard` to `DigFunnelTable` as `cohorts`.
- In `DigFunnelTable`, render a second small table titled "Dig cohorts (first-play date)" with the columns Date · New finishers · Back day 1 · Back day 7 · Back days 8–13. Match the existing table's markup and classes.

- [ ] **Step 4: Run** `npx vitest run` (full suite), `npm run lint`, `npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(dig): launch utm tags and day-7 cohort counts`

---

## Final verification (controller, after all tasks)
- `npm run build` in the worktree passes, checked without grep-filtering (a failed type check can hide).
- Browser at desktop and 375px:
  - `curl -s localhost:<port>/dig` HTML contains the pitch and "7 prompts. 25 seconds each.";
  - play a dig, copy the share, and open its `vs` URL in a fresh tab (after clearing `curio:dig` in localStorage). The challenge line shows, and after finishing, "You and your friend" shows;
  - the homepage card and the header Dig link;
  - `/play` shows the rules line;
  - `/story/carpet` (has a disclaimer) reads cleanly.
- Note: local dev writes to production Upstash only when `VERCEL_ENV=production`, so local play is safe.
