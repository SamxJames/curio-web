# curio dig retention release 1: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the five Release 1 retention items for curio dig: return counter, live strata and varied reveals, postcard end screen, dig line in digest and social posts, play-screen cleanup.

**Architecture:** All player UI stays in `components/dig/` and `app/dig/`; game logic stays pure in `lib/dig/` (reducer, copy tables, bucket helpers). Analytics are extra `HINCRBY` fields on the existing `curio:dig:funnel:<date>` hash, written inside the existing event path, with no new reads and no new endpoints. Nothing new is saved in `lib/dig/storage.ts`.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before touching `app/`), React 19, TS, Tailwind v4 tokens, Vitest (`renderToStaticMarkup` style), Upstash Redis.

**Spec:** `docs/superpowers/specs/2026-11-07-dig-retention-design.md` (read fully, including its Review log). CEO brief rules apply.

## Global Constraints

- One worktree per branch (`superpowers:using-git-worktrees`), see "Branches and stages". Commit per task. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Product principle "archive, never backlog". The banned list lives in ONE place, `lib/dig/copyAudit.ts` (task Z1); every test that checks copy imports `bannedHits` from it and none keeps its own regex. It covers UI, email, share text, share image, OG image, aria text and analytics labels a player sees. Task F1 enforces it end to end.
- `lib/dig/storage.ts` is NOT edited. `DigStore.v` stays 1 (a bump wipes every saved game). Any future new field is optional.
- Client components may only `import type` from `lib/words.ts`. Redis keys use the `curio:dig` prefix (reuse `digKeys`). Local dev uses production Upstash: writes stay behind `writesRedis()` in `lib/dig/server.ts`. Never send real test emails or write secrets; name env vars only.
- Redis: only extra `HINCRBY` fields inside the existing event pipeline. No new reads, no per-user endpoints.
- Design system (`docs/design-system.md`): tokens and `components/ui/` primitives only. No new arbitrary Tailwind values (`text-[Npx]` etc.), no hand-rolled `<button>`/`<input>`. Red (`bg-accent-button`) on Start and Share only (Join is secondary). No `Eyebrow`. Stay inside the dig scope; do not touch the site-wide brand migration.
- Tier copy (`TIER_LABEL`, `TIER_POINTS`, `STRATUM`, `shareText`, share image, OG image) is NOT edited. Reveal variants live only in the new `lib/dig/revealCopy.ts`.
- Fossil and answer data never leave the obfuscated payload; digest and social use `prompts[0].text` only.
- Every commit must build: when a task adds a prop to a shared component, the prop is OPTIONAL with a safe default until integration task I1 wires it.
- Each task verifies with `npx vitest run <paths>`; every stage ends with `npm run lint` and `npm run build`.
- Production push is HELD until Sam answers the email-promise decision (Group C changes the 09:00 UTC digest). Group A deploys alone, away from 00:00 UTC and 09:00 UTC.

## Branches and stages

Group A has to reach production alone and first, so it never shares a branch with anything else.

```
Z   on master, before any branch      Z1 copyAudit module and test (a pure test helper with no runtime importer: safe to land first)

Stage 1 (two worktrees cut from master after Z, fully parallel, no shared files)
  feat/dig-return-counter   Group A: A1 -> A2 -> (A3 || A4) -> A5. Merge to master and deploy FIRST, alone.
  feat/dig-digest-line      Group C: C1 -> (C2 || C3) -> C4. NEVER merged to master until Sam answers the
                            email-promise decision (pushing master deploys, and the cron then emails everyone).

Stage 2 (cut feat/dig-retention-ui from master AFTER A has merged, so it rebases cleanly)
  P0   sequential prep: P0a (split screens.test.tsx) then P0b (all new event kinds in one commit)
  then three lanes in parallel, each owning disjoint files:
    Lane P (play screen)   B1 -> B2 ;  B3 independent
    Lane D (strata)        D1 || D2 -> D3 (needs D1) -> D4 (needs D2) -> D5 (needs D3)
    Lane E (postcard)      E1 ;  E2 (needs D3 for the Strata `height` prop)

Stage 3 (sequential, after lanes P and D; E may still be running)
  I1   integration: the only task that edits DigGame.tsx and the dig page files

Stage 4 (sequential)
  F1 copy audit (after C is rebased onto the branch, D, E and I1), then F2 docs and verification.
  Group C is merged only on Sam's decision; F1 runs once with C included, on a throwaway merge if C is still held.
```

## File ownership (no file is edited by two tasks in the same stage)

| Task | Owns (source and tests) |
|---|---|
| Z1 | `lib/dig/copyAudit.ts`, `lib/dig/copyAudit.unit.test.ts` |
| A1 | `lib/dig/client.ts`, `lib/dig/client.test.ts` |
| A2 | `lib/dig/events.ts`, `lib/dig/events.test.ts`, `lib/dig/server.ts`, `lib/dig/server.test.ts` |
| A3 | `lib/dig/funnel.ts`, `lib/dig/funnel.test.ts`, `components/dig/DigFunnelTable.tsx` |
| A4 | `components/dig/DigGame.tsx` (Stage 1 only; later owned by I1) |
| C1 | `lib/dig/digLineText.ts`, `lib/dig/digLine.ts` and their tests, `lib/traffic.ts` only if a source is missing |
| C2 | `lib/email.ts`, `lib/email.test.ts`, `app/sample-email/route.ts`, its test |
| C3 | `lib/blueskyPost.ts`, `lib/socialPost.ts`, `lib/bluesky.ts`, `lib/threads.ts`, `lib/instagram.ts` and their tests |
| C4 | `app/api/cron/**` and its tests |
| P0a | `components/dig/screens.test.tsx` (deleted), new `Intro.test.tsx`, `PromptScreen.test.tsx`, `Reveal.test.tsx`, `testFixtures.ts` |
| P0b | `lib/dig/events.ts`, `lib/dig/events.test.ts` |
| B1 | `lib/dig/game.ts`, `lib/dig/game.test.ts`, `lib/dig/resume.test.ts` |
| B2 | `components/dig/PromptScreen.tsx`, `components/dig/PromptScreen.test.tsx` |
| B3 | `components/dig/Intro.tsx`, `components/dig/Intro.test.tsx`, `lib/dig/introSample.test.ts`, `app/dig/page.tsx` (noscript only) |
| D1 | `app/globals.css`, `docs/design-system.md`, `lib/dig/motion.test.ts` |
| D2 | `lib/dig/revealCopy.ts`, `lib/dig/revealCopy.test.ts` |
| D3 | `components/dig/Strata.tsx`, `components/dig/Strata.test.tsx`, `lib/dig/strata.test.ts` |
| D4 | `components/dig/Reveal.tsx`, `components/dig/BoneMark.tsx`, `components/dig/Reveal.test.tsx` |
| D5 | `lib/dig/strip.ts`, `lib/dig/strip.test.ts` |
| E1 | `lib/dig/tomorrow.ts`, `components/dig/TomorrowHint.tsx` and its test |
| E2 | `components/dig/EndScreen.tsx`, `components/dig/EndScreen.test.tsx`, `components/SignupOffer.tsx` (+ test if any), `lib/dig/share.ts`, `lib/dig/share.test.ts` |
| I1 | `components/dig/DigGame.tsx`, `app/dig/page.tsx`, `app/dig/[date]/play/page.tsx`, `components/dig/strip.test.tsx` |
| F1 | `lib/dig/copyAudit.test.ts` |
| F2 | `docs/handover/dig.md`, `handover.md` |

---

## Group Z: Shared copy-audit module (on master, first)

### Task Z1: One banned-word list for every test

**Files:**
- Create: `lib/dig/copyAudit.ts`
- Test: `lib/dig/copyAudit.unit.test.ts`

**Interfaces:**
- Produces: `BANNED: RegExp`; `auditText(rendered: string): string` (strips HTML tags, decodes `&#x27;`, `&#39;`, `&amp;`, `&quot;` and curly apostrophes to `'`, lowercases, then removes the two allowed phrases `prompt N of 7` and `deeper than N% of today's diggers`); `bannedHits(rendered: string): string[]` (every `BANNED` match in `auditText(rendered)`, `[]` when clean).

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { auditText, bannedHits } from "./copyAudit";

describe("copyAudit", () => {
  it.each([
    "Your streak is 3", "You missed yesterday", "3 in a row", "You played 4 digs", "You haven't played today",
    "You didn't finish", "Come back tomorrow", "A countdown", "Opens in 6 hours", "9 hours left",
    "Don&#x27;t break it", "Catch up on the unplayed ones", "3 of 12", "80% complete", "Most people said tea",
    "Everyone digs here", "Nobody else found it", "Not done",
  ])("flags %s", (t) => expect(bannedHits(t).length).toBeGreaterThan(0));
  it("allows progress through today's seven and the depth percentile", () => {
    expect(bannedHits("<p>Prompt 3 of 7</p>")).toEqual([]);
    expect(bannedHits("Deeper than 72% of today&#x27;s diggers")).toEqual([]);
  });
  it("decodes entities and strips tags before matching", () => {
    expect(auditText("<b>Don&#39;t</b> Break")).toBe("don't break");
    expect(bannedHits("<span>Don&#39;t break it</span>")).toEqual(["don't break"]);
  });
  it("leaves the planned copy alone", () => {
    for (const t of ["A new dig opens at midnight UTC.", "Topsoil. Right on the surface.", "Today's dig starts with “Name a beverage”. Seven prompts, about three minutes.", "Take your time.", "Pass? Tap again"]) expect(bannedHits(t)).toEqual([]);
  });
});
```
- [ ] **Step 2:** `npx vitest run lib/dig/copyAudit.unit.test.ts` FAIL.
- [ ] **Step 3: Implement.**

```ts
export const BANNED = /streak|missed|you didn't|haven't|come back|in a row|\bplayed\b|countdown|opens in|hours left|don't break|catch up|unplayed|not done|\b\d+ of \d+\b|%|most people|everyone|nobody else/g;

export function auditText(rendered: string): string {
  return rendered
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;|&#39;|&#x2019;|&rsquo;|’/g, "'")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim().toLowerCase()
    .replace(/prompt \d of 7/g, "")
    .replace(/deeper than \d+% of today's diggers/g, "");
}
export function bannedHits(rendered: string): string[] {
  return auditText(rendered).match(BANNED) ?? [];
}
```
(If a case above fails, fix the module, not the test.)
- [ ] **Step 4:** PASS. **Step 5:** Commit `test(dig): one shared banned-word list for the archive-never-backlog audit`

---

## Group A: Return counter (Stage 1, branch `feat/dig-return-counter`; ships first, alone)

### Task A1: `returningBucket` and start-event builder

**Files:**
- Modify: `lib/dig/client.ts` (add two exports)
- Test: `lib/dig/client.test.ts` (extend)

**Interfaces:**
- Produces: `type ReturnBucket = "d1" | "d2_6" | "d7"`; `returningBucket(games: Record<string, { finishedAt: string }>, today: string): ReturnBucket | null`; `buildStartEvent(date: string, games: Record<string, { finishedAt: string }>): { kind: "start"; date: string; ret?: ReturnBucket }`.
- Rule: use the most recent `finishedAt` whose UTC date (`slice(0,10)`) is earlier than `today`; gap = whole UTC days; 1 -> d1, 2..6 -> d2_6, >=7 -> d7; no such game -> null. Invalid `finishedAt` is ignored.

- [ ] **Step 1: Write the failing tests** (append to `lib/dig/client.test.ts`; keep existing imports)

```ts
import { buildStartEvent, returningBucket } from "./client";

const g = (finishedAt: string) => ({ finishedAt });
describe("returningBucket", () => {
  const today = "2026-11-10";
  it("is null for an empty store", () => expect(returningBucket({}, today)).toBeNull());
  it("is null when the only finish is today (even on an archive date)", () => {
    expect(returningBucket({ "2026-11-01": g("2026-11-10T08:00:00.000Z") }, today)).toBeNull();
  });
  it.each([
    ["2026-11-09T23:59:00.000Z", "d1"],
    ["2026-11-08T00:00:00.000Z", "d2_6"],
    ["2026-11-04T10:00:00.000Z", "d2_6"],
    ["2026-11-03T10:00:00.000Z", "d7"],
    ["2026-10-01T10:00:00.000Z", "d7"],
  ])("finish at %s is %s", (at, want) => {
    expect(returningBucket({ "2026-11-07": g(at) }, today)).toBe(want);
  });
  it("uses the most recent earlier finish and ignores junk dates", () => {
    const games = { a: g("2026-11-01T00:00:00.000Z"), b: g("2026-11-09T05:00:00.000Z"), c: g("nope") };
    expect(returningBucket(games, today)).toBe("d1");
  });
});
describe("buildStartEvent", () => {
  it("adds ret only when the device is returning", () => {
    expect(buildStartEvent("2026-11-10", {})).toEqual({ kind: "start", date: "2026-11-10" });
    expect(buildStartEvent("2026-11-10", { x: g("2026-11-09T01:00:00.000Z") })).toEqual({ kind: "start", date: "2026-11-10", ret: "d1" });
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`returningBucket` is not exported): `npx vitest run lib/dig/client.test.ts`

- [ ] **Step 3: Implement** (add to `lib/dig/client.ts`)

```ts
export type ReturnBucket = "d1" | "d2_6" | "d7";
const DAY = 86_400_000;
const utcDay = (iso: string) => { const t = Date.parse(iso.slice(0, 10)); return Number.isNaN(t) ? null : t; };

/** Coarse "this device finished a dig on an earlier UTC day" flag, bucketed by the gap. Read
 * from the store already in memory; nothing is stored or sent about a person. */
export function returningBucket(games: Record<string, { finishedAt: string }>, today: string): ReturnBucket | null {
  const now = Date.parse(today);
  let latest: number | null = null;
  for (const g of Object.values(games)) {
    const d = typeof g.finishedAt === "string" ? utcDay(g.finishedAt) : null;
    if (d !== null && d < now && (latest === null || d > latest)) latest = d;
  }
  if (latest === null) return null;
  const gap = Math.round((now - latest) / DAY);
  return gap <= 1 ? "d1" : gap <= 6 ? "d2_6" : "d7";
}

export function buildStartEvent(date: string, games: Record<string, { finishedAt: string }>) {
  const ret = returningBucket(games, date);
  return ret ? { kind: "start" as const, date, ret } : { kind: "start" as const, date };
}
```

- [ ] **Step 4: Run, expect PASS.** `npx vitest run lib/dig/client.test.ts`
- [ ] **Step 5: Commit** `feat(dig): bucket a returning device for the start event`

### Task A2: Server accepts `ret` and writes one extra increment

**Files:**
- Modify: `lib/dig/events.ts` (`DigEvent` start gains `ret?`, `parseDigEvent`, new `startIncrs`), `lib/dig/server.ts` (`recordFunnel`)
- Test: `lib/dig/events.test.ts`, `lib/dig/server.test.ts` (uses `h.FakeRedis`; copy the `recordFunnel` pattern at its lines ~127 and ~160)

**Interfaces:**
- Consumes: `ReturnBucket` shape (strings only; do not import from `client.ts`, which is a client module: define `RETURN_BUCKETS` in `events.ts` and have `client.ts` keep its own type).
- Produces: `RETURN_BUCKETS = ["d1","d2_6","d7"] as const`; start event `{ kind:"start"; date: string; ret?: "d1"|"d2_6"|"d7" }`; `funnelFields(ev): string[]` (start with ret -> `["start","start:ret:d2_6"]`, others `[funnelField(ev)]` or `[]`). `funnelField` is unchanged.

- [ ] **Step 1: Failing tests** in `events.test.ts`

```ts
it("accepts a start with a valid return bucket and drops a junk one", () => {
  expect(parseDigEvent({ kind: "start", date: today, ret: "d2_6" }, today)).toEqual({ kind: "start", date: today, ret: "d2_6" });
  expect(parseDigEvent({ kind: "start", date: today, ret: "d9" }, today)).toEqual({ kind: "start", date: today });
  expect(parseDigEvent({ kind: "start", date: today, ret: { $: 1 } }, today)).toEqual({ kind: "start", date: today });
});
it("a returning start increments start and start:ret:<bucket>; a plain one only start", () => {
  expect(funnelFields({ kind: "start", date: today, ret: "d1" })).toEqual(["start", "start:ret:d1"]);
  expect(funnelFields({ kind: "start", date: today })).toEqual(["start"]);
  expect(funnelFields({ kind: "claim", date: today, prompt: 0, guess: "jib" })).toEqual([]);
});
```
(add `funnelFields` to the import). In `server.test.ts` add: after `recordFunnel(d, { kind:"start", date:d, ret:"d7" })` in production env, the fake funnel hash has `start: 1` and `"start:ret:d7": 1`; in a non-production env nothing is written (mirror the neighbouring isolation test).

- [ ] **Step 2: Run, expect FAIL.** `npx vitest run lib/dig/events.test.ts lib/dig/server.test.ts`
- [ ] **Step 3: Implement.** In `events.ts`: add `export const RETURN_BUCKETS = ["d1", "d2_6", "d7"] as const;`, change the start member to `{ kind: "start"; date: string; ret?: (typeof RETURN_BUCKETS)[number] }`, and parse:

```ts
case "start": {
  if (b.date !== today) return null;
  const ret = (RETURN_BUCKETS as readonly unknown[]).includes(b.ret) ? (b.ret as (typeof RETURN_BUCKETS)[number]) : undefined;
  return ret ? { kind: "start", date: today, ret } : { kind: "start", date: today };
}
```

and

```ts
export function funnelFields(ev: DigEvent): string[] {
  const f = funnelField(ev);
  if (!f) return [];
  return ev.kind === "start" && ev.ret ? [f, `start:ret:${ev.ret}`] : [f];
}
```

In `server.ts` `recordFunnel`: replace the single `hincrby` with `const fields = funnelFields(ev); if (!fields.length || !writesRedis()) return;` then, when `fields.length === 1` keep `await r.hincrby(key, fields[0], 1)`, else `const p = r.pipeline(); for (const f of fields) p.hincrby(key, f, 1); await p.exec();`. Import `funnelFields`.
- [ ] **Step 4: Run, expect PASS.** Same command.
- [ ] **Step 5:** Privacy check (read-only): open the event route (`app/api/dig/event`) and confirm it does not log request bodies next to IP addresses; if the privacy page lists what Curio collects, add one line, "anonymous, rough return interval". Note the result in the commit body.
- [ ] **Step 6:** Commit `feat(dig): count returning starts in the funnel`

### Task A3: Admin shows returning starts and share (parallel with A4)

**Files:**
- Modify: `lib/dig/funnel.ts` (row gains `returning`, `returnShare`), `components/dig/DigFunnelTable.tsx` (two columns; admin-exempt styling)
- Test: `lib/dig/funnel.test.ts`

**Interfaces:**
- Consumes: hash fields `start`, `start:ret:d1|d2_6|d7`.
- Produces: `DigFunnelRow.returning: number` (sum of `start:ret:`), `DigFunnelRow.returnShare: number | null` (`returning / start * 100`, one decimal, null when start is 0). `summarizeDigFunnel` signature unchanged. Existing `COLS` keeps its numeric columns; render `returning` as a number and `returnShare` as `12.5%` or blank. (The `%` is admin-only and is not part of the player copy audit.)

- [ ] **Step 1: Failing test**

```ts
it("sums returning starts and gives the share of all starts", () => {
  const days = { "2026-11-08": { start: 40, "start:ret:d1": 6, "start:ret:d2_6": 3, "start:ret:d7": 1 }, "2026-11-09": { land: 3 } };
  const { rows } = summarizeDigFunnel(days, null, { now: new Date("2026-11-10T12:00:00Z"), rowDates: ["2026-11-08", "2026-11-09"] });
  const r8 = rows.find((r) => r.date === "2026-11-08")!, r9 = rows.find((r) => r.date === "2026-11-09")!;
  expect(r8.returning).toBe(10);
  expect(r8.returnShare).toBe(25);
  expect(r9.returning).toBe(0);
  expect(r9.returnShare).toBeNull();
});
```
- [ ] **Step 2: Run, FAIL.** `npx vitest run lib/dig/funnel.test.ts`
- [ ] **Step 3: Implement** in `funnel.ts`: add the two fields to `DigFunnelRow`; in the row map `const start = h.start ?? 0; const returning = sum(h, "start:ret:");` and `returnShare: start ? Math.round((returning / start) * 1000) / 10 : null`. In the table add `"returning"` to the numeric columns and a final `Return %` column rendering `row.returnShare === null ? "" : \`${row.returnShare}%\``. Update the intro sentence to: "Returning = starts from a device that finished a dig on an earlier day. It undercounts (Safari clears storage after 7 days, private windows). Read from day 2; target 30% by days 8 to 14."
- [ ] **Step 4: Run, PASS.** Also `npx vitest run lib/dig` to catch fixtures that build `DigFunnelRow` literals.
- [ ] **Step 5: Commit** `feat(dig): admin shows returning starts and share`

### Task A4: Send the flag on Start (parallel with A3; `DigGame.tsx` is owned by A4 in Stage 1 only, by I1 afterwards)

**Files:**
- Modify: `components/dig/DigGame.tsx` (the `onStart` in `DigRun`)
- Test: covered by A1; no new test: `DigGame` exports no helper here.

**Interfaces:**
- Consumes: `buildStartEvent(date, games)` from A1; `readStore()` (already imported).

- [ ] **Step 1:** Replace the `sendDigEvent(isToday ? { kind: "start", date: day.date } : { kind: "past" })` line with:

```ts
sendDigEvent(isToday ? buildStartEvent(day.date, readStore().games) : { kind: "past" });
```
and import `buildStartEvent` from `@/lib/dig/client`. A past-dig start never carries the flag (unchanged `{ kind: "past" }`). A resume sends no start (unchanged).
- [ ] **Step 2:** `npx vitest run components/dig lib/dig` (PASS), `npm run lint`, `npm run build`.
- [ ] **Step 3: Commit** `feat(dig): flag a returning device when a dig starts`

### Task A5: Release gate for Group A (manual plus release-manager)

- [ ] Ask `release-manager` to deploy branch `feat/dig-return-counter` alone (merge it to master first; Group C and the UI branch are not on master yet): not within 10 minutes of 00:00 UTC or of 09:00 UTC (Hobby crons fire anywhere in the hour).
- [ ] Verify on production: complete a start on `curioword.com/dig` from a browser holding an earlier-day finished game (a dev-tools-edited `finishedAt` in your own browser's `curio:dig`; Sam signs in himself, no accounts are created). `/admin` shows the Returning column increment. Only then say "live".
- [ ] That check writes ONE fake returning start into the live stats. Write down the day and the bucket it touched (in the F2 handover note) and leave that start out of the day 2 to day 7 baseline. It proves the wiring, not Safari eviction: do not read the `d7` bucket as retention.
- [ ] Record the baseline readout plan in `docs/handover/dig.md` (F2).

---

## Group C: Dig line in digest and social (Stage 1, branch `feat/dig-digest-line`, parallel with A; NOT merged until Sam answers the email-promise decision)

### Task C1: The line itself

**Files:**
- Create: `lib/dig/digLineText.ts` (pure: text, URL and the `DigLine` type; safe to import from `lib/email.ts` and the social builders), `lib/dig/digLine.ts` (server-side: `getDigLine`, imports `./server`; only the cron routes and `app/sample-email/route.ts` import it, so `fs`, `crypto` and Redis never reach email or social code)
- Test: `lib/dig/digLineText.test.ts`, `lib/dig/digLine.test.ts`; `lib/traffic.ts` only if a source below is missing

**Interfaces:**
- Produces (`digLineText.ts`): `type DigLine = { prompt: string }`; `digLineText(prompt: string, opts?: { short?: boolean }): string`; `digLineUrl(source: "email" | "bluesky" | "threads" | "instagram" | "sample"): string`.
- Produces (`digLine.ts`): `getDigLine(now?: Date): Promise<DigLine | null>`.
- `digLineText("Name a beverage")` = `Today's dig starts with “Name a beverage”. Seven prompts, about three minutes.`; `short: true` drops the second sentence.
- `digLineUrl(s)` = `absoluteUrl("/dig")` plus `utm_source=<s>&utm_medium=<email|social>&utm_campaign=daily-dig` (email and sample use medium `email`; the three social sources use `social`). Read `lib/traffic.ts`: `utm_source` values must be in `TRAFFIC_SOURCES`, otherwise the `land:<source>` field is never credited and the per-channel readout is empty. The test below asserts it for the four real channels; if one is missing, add it to `TRAFFIC_SOURCES` in this task. `sample` is intentionally untagged (see the comment in `app/sample-email/route.ts`).
- `getDigLine`: returns null (never throws) when `digLaunchDate()` is null, `!isDigOpen(now)`, `readDay(dayKey(now))` is null or throws, or the first prompt has no text. Reads `prompts[0].text` only, never `payload`.

- [ ] **Step 1: Failing tests**

```ts
// digLineText.test.ts
import { describe, expect, it } from "vitest";
import { bannedHits } from "./copyAudit";
import { isTrafficSource } from "@/lib/traffic";
import { digLineText, digLineUrl } from "./digLineText";

describe("digLineText", () => {
  it("quotes the first prompt and states the length", () => {
    expect(digLineText("Name a beverage")).toBe("Today's dig starts with “Name a beverage”. Seven prompts, about three minutes.");
  });
  it("has a short form", () => expect(digLineText("Name a beverage", { short: true })).toBe("Today's dig starts with “Name a beverage”."));
  it("passes the shared copy audit: no gap, no count of people, no deadline", () => {
    expect(bannedHits(digLineText("Name a beverage"))).toEqual([]);
    expect(digLineText("x")).not.toMatch(/left|deadline|\d+ (people|players)/i);
  });
});
describe("digLineUrl", () => {
  it("points at /dig with the channel's utm_source", () => {
    const u = new URL(digLineUrl("threads"));
    expect(u.pathname).toBe("/dig");
    expect(u.searchParams.get("utm_source")).toBe("threads");
  });
  it.each(["email", "bluesky", "threads", "instagram"] as const)("%s is a recognised traffic source, so landings are credited", (s) => {
    expect(isTrafficSource(new URL(digLineUrl(s)).searchParams.get("utm_source"))).toBe(true);
  });
});
```

```ts
// digLine.test.ts
import { describe, expect, it, vi } from "vitest";
vi.mock("./server", () => ({ readDay: vi.fn() }));
vi.mock("./clock", () => ({ digLaunchDate: () => "2026-11-07", isDigOpen: () => true }));
import { readDay } from "./server";
import { getDigLine } from "./digLine";

describe("getDigLine", () => {
  it("uses only the first prompt's text", async () => {
    vi.mocked(readDay).mockResolvedValue({ prompts: [{ id: "a", kind: "theme", text: "Name a beverage", payload: "SECRET" }, { id: "b", kind: "theme", text: "Second", payload: "S2" }] } as never);
    expect(await getDigLine()).toEqual({ prompt: "Name a beverage" });
  });
  it("is null when there is no day or the read throws", async () => {
    vi.mocked(readDay).mockResolvedValueOnce(null);
    expect(await getDigLine()).toBeNull();
    vi.mocked(readDay).mockRejectedValueOnce(new Error("redis"));
    expect(await getDigLine()).toBeNull();
  });
});
```
(Confirm the real signature of `isTrafficSource` in `lib/traffic.ts` and adapt the call; do not guess.)
- [ ] **Step 2: Run, FAIL.** `npx vitest run lib/dig/digLineText.test.ts lib/dig/digLine.test.ts`
- [ ] **Step 3: Implement** both files. `getDigLine` body: guard clauses above, `const d = await readDay(dayKey(now)); const t = d?.prompts?.[0]?.text; return typeof t === "string" && t.trim() ? { prompt: t.trim() } : null;` inside try/catch returning null. Add a one-line guard test or lint comment that `digLineText.ts` imports nothing from `./server`.
- [ ] **Step 4: Run, PASS.**
- [ ] **Step 5: Commit** `feat(dig): the one-line dig invitation for email and social`

### Task C2: Digest renders the line (parallel with C3)

**Files:**
- Modify: `lib/email.ts` (`buildDigestHtml`, `buildDigestMessage`, `sendDailyDigests`), `app/sample-email/route.ts`
- Test: `lib/email.test.ts`, `app/sample-email/route.test.ts` (extend)

**Interfaces:**
- Consumes: `DigLine`, `digLineText`, `digLineUrl` from `lib/dig/digLineText.ts` (C1; the pure file, never `digLine.ts`, so `lib/email.ts` does not pull in `server.ts`).
- Produces: `buildDigestHtml(word, dateStr, unsubscribeUrl, storyUrl?, dig?: DigLine | null)`, `buildDigestMessage(email, word, date, secret, dig?: DigLine | null)`, and `sendDailyDigests(..., opts)` gains `dig?: DigLine | null` threaded to each message. The new parameter is last and optional so existing callers and tests keep working.
- HTML block: below the story link, above the footer; text 16px Helvetica, `escapeHtml` on the prompt (reuse the file's escaper; add a tiny one if none exists), link "Play today's dig" underlined, `href` from `digLineUrl("email")` (`"sample"` on `/sample-email`). The footer text "One word, once a day." stays as is. Plain-text part: the two sentences, then the bare URL on its own line, before "Unsubscribe".

- [ ] **Step 1: Failing tests**

```ts
it("adds the dig block when a dig exists, escaped, first prompt only", () => {
  const html = buildDigestHtml(word, "7 Nov 2026", "#", "https://x/y", { prompt: 'Name a "beverage" <b>' });
  expect(html).toContain("Today&#39;s dig starts with");
  expect(html).toContain("&lt;b&gt;");
  expect(html).toContain("Play today");
  expect(html).toContain("utm_source=email");
  expect(html).toContain("One word, once a day.");
});
it("leaves the email unchanged when there is no dig", () => {
  expect(buildDigestHtml(word, "d", "#", "https://x/y", null)).toBe(buildDigestHtml(word, "d", "#", "https://x/y"));
});
it("puts the line and bare URL in the plain-text part", () => {
  const m = buildDigestMessage("a@b.co", word, new Date("2026-11-08T09:00:00Z"), "s", { prompt: "Name a beverage" });
  expect(m.text).toContain("Today's dig starts with “Name a beverage”. Seven prompts, about three minutes.");
  expect(m.text).toMatch(/\nhttps:\/\/[^\s]*\/dig\?[^\s]*utm_source=email/);
  expect(bannedHits(m.text)).toEqual([]);
});
```
(`word` comes from the file's existing fixture; if the HTML escaper turns `'` into `&#39;` adjust the first assertion to what the escaper emits.) (import `bannedHits` from `@/lib/dig/copyAudit`.) In `route.test.ts`, mock `@/lib/dig/digLine` `getDigLine` to `{ prompt: "Name a beverage" }` and assert the response HTML contains `Play today` and `utm_source=sample`; with `getDigLine` null, assert it does not.
- [ ] **Step 2: Run, FAIL.** `npx vitest run lib/email.test.ts app/sample-email/route.test.ts`
- [ ] **Step 3: Implement.** Sample route: `const dig = await getDigLine();` pass it to `buildDigestHtml(word, ..., "#", storyUrl, dig)`; the block's URL must use the sample tag there (add an optional `digSource` arg or derive: when `unsubscribeUrl === "#"` use `"sample"`; prefer an explicit `digSource?: "email" | "sample"` as a sixth parameter).
- [ ] **Step 4: Run, PASS.** Plus `npx vitest run lib/email`.
- [ ] **Step 5: Commit** `feat(email): add today's dig line to the digest`

### Task C3: Social builders carry the line (parallel with C2)

**Files:**
- Modify: `lib/blueskyPost.ts` (`buildBlueskyPost`), `lib/socialPost.ts` (`buildThreadsPost`, `buildInstagramCaption`), `lib/bluesky.ts`, `lib/threads.ts`, `lib/instagram.ts` (accept and pass `dig`)
- Test: `lib/blueskyPost` tests (`lib/bluesky.test.ts`), `lib/socialPost.test.ts`, `lib/threads.test.ts`, `lib/instagram.test.ts`

**Interfaces:**
- Consumes: `DigLine`, `digLineText`, `digLineUrl` from `lib/dig/digLineText.ts` (C1; the pure file).
- Produces: `buildBlueskyPost(word, dig?: DigLine | null)`, `buildThreadsPost(word, dig?)`, `buildInstagramCaption(word, dig?)`. The posting functions take an optional `dig` last parameter.
- Rules: Bluesky: dig paragraph (`digLineText` + newline + `digLineUrl("bluesky")`) is inserted before the hashtags; if `graphemeLength` of the result exceeds 300, retry with `{ short: true }`; if still over, omit the dig paragraph (never truncate the word or lineage). Read `lib/blueskyFacets.ts` first: confirm a bare URL gets a link facet, else add one. Threads: same paragraph, URL `digLineUrl("threads")`, before `#etymology`. Instagram: `digLineText(prompt)` + ` Link in bio.` and no URL, before the hashtags.

- [ ] **Step 1: Failing tests** (per builder): with `{ prompt: "Name a beverage" }` the output contains the quoted line; with `null`/undefined the output equals the current output byte for byte; Bluesky output `graphemeLength <= 300` for the longest word in `WORDS` (use whichever fixture the existing 300 test uses); Instagram has no `http` in the dig sentence and ends that line with `Link in bio.`
- [ ] **Step 2: Run, FAIL.** `npx vitest run lib/bluesky.test.ts lib/socialPost.test.ts lib/threads.test.ts lib/instagram.test.ts lib/blueskyFacets.test.ts`
- [ ] **Step 3: Implement as above.**
- [ ] **Step 4: Run, PASS.**
- [ ] **Step 5: Commit** `feat(social): add today's dig line to Bluesky, Threads and Instagram posts`

### Task C4: Cron wires the line in

**Files:**
- Modify: `app/api/cron/send-daily/route.ts` (where `sendDailyDigests` at ~L145, the Bluesky post, and the Threads/IG cron callers are invoked; read the file and `app/api/cron/` siblings first)
- Test: the route's existing test file (find with `Glob app/api/cron/**/*.test.ts`); add a case that a `getDigLine` rejection or null leaves the run unchanged.

- [ ] **Step 1:** (`getDigLine` comes from `lib/dig/digLine.ts`; only this route, the other cron callers and the sample route import it.) Failing test: with `getDigLine` mocked to `{ prompt: "P" }`, the digest and posts are called with it; with `getDigLine` throwing, they are called with `null` and the send still completes.
- [ ] **Step 2:** Run, FAIL. **Step 3:** In each cron, `const dig = await getDigLine().catch(() => null);` once per run and pass it down. **Step 4:** PASS (`npx vitest run app/api/cron`). **Step 5:** Commit `feat(cron): pass today's dig line to the digest and social posts`
- [ ] **Step 6 (gate, no deploy):** Run `npm run dev`, open `/sample-email`, check HTML and plain text by eye at 375px, and screenshot it for Sam. Do not send any email. Hold the production push for Sam's email-promise answer.

---

## Group P0: Prep for the UI branch (sequential, Stage 2, before the lanes)

### Task P0a: Split `screens.test.tsx` by component (pure move)

**Files:**
- Delete: `components/dig/screens.test.tsx`
- Create: `components/dig/Intro.test.tsx`, `components/dig/PromptScreen.test.tsx`, `components/dig/Reveal.test.tsx`, `components/dig/testFixtures.ts`

Why: B2, B3 and D4 each edit tests for a different component. One shared test file would make them collide. After the split each lane owns its own file.

- [ ] **Step 1:** Move each `describe` block to the file for its component (Intro, PromptScreen, Reveal and `announceReveal`). Any other block (for example Loading or error screens) goes to a new `screens.misc.test.tsx`. Hoist shared fixtures (`base` props, sample `secret`, `noop`) into `testFixtures.ts` and import them.
- [ ] **Step 2:** No assertion changes. `npx vitest run components/dig` must pass with the same number of tests as before the split (compare counts).
- [ ] **Step 3:** Commit `test(dig): split screens.test.tsx per component`

### Task P0b: All new event kinds in one commit

**Files:**
- Modify: `lib/dig/events.ts`, `lib/dig/events.test.ts` (nobody else edits these in Stage 2)

**Interfaces:**
- Produces: event kinds `{ kind: "timer" }` (field `timer:switch`) and `{ kind: "row"; to: "play" | "past" }` (fields `row:play`, `row:past`); `planFinish` adds `[funnelKey, "fossil", n]` when `n` (count of `"fossil"` in the finish's `tiers`) is above 0. `parseDigEvent` allowlists `to` by enum, so a junk value returns null and can never name a Redis field.

- [ ] **Step 1: Failing tests** (append to `events.test.ts`)

```ts
it("accepts the timer event and only the two row targets", () => {
  expect(parseDigEvent({ kind: "timer" }, today)).toEqual({ kind: "timer" });
  expect(funnelField({ kind: "timer" })).toBe("timer:switch");
  expect(parseDigEvent({ kind: "timers" }, today)).toBeNull();
  expect(parseDigEvent({ kind: "row", to: "play" }, today)).toEqual({ kind: "row", to: "play" });
  expect(parseDigEvent({ kind: "row", to: "past" }, today)).toEqual({ kind: "row", to: "past" });
  expect(parseDigEvent({ kind: "row", to: "evil:field" }, today)).toBeNull();
  expect(funnelField({ kind: "row", to: "play" })).toBe("row:play");
  expect(funnelField({ kind: "row", to: "past" })).toBe("row:past");
});
it("planFinish counts fossils found, and writes nothing when none", () => {
  const withFossil = planFinish({ kind: "finish", date: today, score: SCORE, tiers: tiers as never, rejected: [] });
  expect(withFossil).toContainEqual([expect.stringContaining(today), "fossil", 1]);
  const none = planFinish({ kind: "finish", date: today, score: 10, tiers: ["common", ...Array(6).fill(null)] as never, rejected: [] });
  expect(none.some(([, f]) => f === "fossil")).toBe(false);
});
```
(`tiers` and `SCORE` are the file's existing fixtures; if the existing finish fixture has no fossil tier, build one with a `"fossil"` entry and update the expected count.) Also assert `RATE_LIMITS` already covers `timer` and `row` (they are cheap increments: reuse the `start`/`past` limit; do not leave them unlimited).
- [ ] **Step 2:** `npx vitest run lib/dig/events.test.ts` FAIL. **Step 3:** implement in `events.ts` (extend `DigEvent`, `parseDigEvent`, `funnelField`, `planFinish`, `RATE_LIMITS`). **Step 4:** PASS, plus `npx vitest run lib/dig`. **Step 5:** Commit `feat(dig): timer, row and fossil funnel counters`

---

## Group B: Play-screen cleanup (Stage 2, Lane P)

### Task B1: Reducer `timer` action

**Files:**
- Modify: `lib/dig/game.ts`
- Test: `lib/dig/game.test.ts`, `lib/dig/resume.test.ts`

**Interfaces:**
- Produces: `GameAction` gains `{ type: "timer"; noTimer: boolean }`.
- Rules: phase `answering`: to `noTimer:true` -> `{ ...s, noTimer: true, clock: 0 }`; to `false` -> `{ ...s, noTimer: false, clock: ANSWER_SECONDS }` (no read pause). Phase `reading`: to `true` -> phase `answering`, clock 0, noTimer true; to `false` -> `{ ...s, noTimer: false }` unchanged phase and clock. Phase `reveal`: sets `noTimer` only (applies to the next `enterPrompt`). `intro`/`done`: ignored. `toSavedRun`, `SavedRun` and `resumeGame` are unchanged.

- [ ] **Step 1: Failing tests** in `game.test.ts` (reuse that file's `reduce`/state helpers; if none, build with `createReducer(prepareDay(...devDay))`):

```ts
describe("timer action", () => {
  it("answering -> No timer stops the clock and stays answering", () => {
    const s = { ...started, phase: "answering" as const, clock: 12 };
    expect(reduce(s, { type: "timer", noTimer: true })).toMatchObject({ phase: "answering", noTimer: true, clock: 0 });
  });
  it("answering -> timer on restarts the prompt clock at 25", () => {
    const s = { ...started, phase: "answering" as const, noTimer: true, clock: 0 };
    expect(reduce(s, { type: "timer", noTimer: false })).toMatchObject({ phase: "answering", noTimer: false, clock: ANSWER_SECONDS });
  });
  it("reading -> No timer goes straight to answering", () => {
    const s = { ...started, phase: "reading" as const, clock: 2 };
    expect(reduce(s, { type: "timer", noTimer: true })).toMatchObject({ phase: "answering", noTimer: true, clock: 0 });
  });
  it("reveal: only records the setting; next prompt honours it", () => {
    const r = reduce({ ...started, phase: "reveal" as const }, { type: "timer", noTimer: true });
    expect(r.phase).toBe("reveal");
    expect(reduce(r, { type: "next" })).toMatchObject({ phase: "answering", noTimer: true });
  });
  it("is ignored in intro and done", () => {
    expect(reduce(initialGame(), { type: "timer", noTimer: true }).noTimer).toBe(false);
  });
});
```
`resume.test.ts`: switch mid-answering then `toSavedRun(date, state, [])` has `noTimer: true`; `resumeGame` of it returns `phase: "answering"`, `noTimer: true`, `clock: 0`; switching back on then resuming returns phase `reading`, clock `READ_SECONDS` (existing resume behaviour); results are untouched by a switch.
- [ ] **Step 2:** `npx vitest run lib/dig/game.test.ts lib/dig/resume.test.ts` FAIL. **Step 3:** add the `case "timer"` and extend the `GameAction` union. **Step 4:** PASS. **Step 5:** Commit `feat(dig): switch the timer on or off mid-game`

### Task B2: Timer pill and two-tap Pass (needs B1; Lane P)

**Files:**
- Modify: `components/dig/PromptScreen.tsx`
- Test: `components/dig/PromptScreen.test.tsx` (created by P0a)

**Interfaces:**
- Consumes: reducer action from B1 (not dispatched here); `ToggleGroup` from `@/components/ui/SegmentedControl` and its props as used in `Intro.tsx`.
- Produces: `PromptScreen` props gain OPTIONAL `onTimer?: (noTimer: boolean) => void` (the pill renders only when it is passed, so this commit builds before I1 wires it). Exported pure helper `nextPassState(state: "idle" | "armed", event: "tap" | "type" | "blur"): { state: "idle" | "armed"; fire: boolean }`.
- Behaviour (spec 5.2, 5.3): the timer row shows the pill on the right (`aria-pressed`, label fixed as "No timer" in both states, `min-h-11`). With No timer on, the bar and seconds line are replaced by the text "Take your time." at the left and the pill shows pressed. Pass: first tap arms and sets the label "Pass? Tap again" (focus stays); the second tap calls `onPass`. There is NO timeout (a confirmation that expires on its own can be lost by slower, switch or screen-reader users, WCAG 2.2.1). It disarms on typing in the field, on blur of the button, and on prompt change (`key={index}` already remounts). Polite live text: "Tap Pass again to give up this prompt." on the first tap; "Timer off." and "Timer on. 25 seconds." when the pill is used. Pass stays disabled outside `answering`. The answer field is scrolled into view on focus (`scrollIntoView({ block: "nearest" })`) so Dig and the error line stay visible with the iOS keyboard open.

- [ ] **Step 1: Failing tests** (`PromptScreen.test.tsx`, `renderToStaticMarkup`):

```ts
import { bannedHits } from "@/lib/dig/copyAudit";

it("shows a fixed 'No timer' pill; aria-pressed carries the state", () => {
  const timed = renderToStaticMarkup(<PromptScreen {...base} phase="answering" clock={10} noTimer={false} feedback={null} onTimer={noop} />);
  expect(timed).toContain('aria-pressed="false"');
  expect(timed).toContain("No timer");
  expect(timed).toContain('role="progressbar"');
  const off = renderToStaticMarkup(<PromptScreen {...base} phase="answering" clock={0} noTimer feedback={null} onTimer={noop} />);
  expect(off).toContain('aria-pressed="true"');
  expect(off).toContain("Take your time.");
  expect(off).not.toContain("No timer: on");
  expect(off).not.toContain('role="progressbar"');
});
it("renders no pill until onTimer is supplied", () => {
  expect(renderToStaticMarkup(<PromptScreen {...base} phase="answering" clock={10} noTimer={false} feedback={null} />)).not.toContain("aria-pressed");
});
it("Pass starts as 'Pass' and is disabled while reading", () => {
  const html = renderToStaticMarkup(<PromptScreen {...base} phase="reading" clock={3} noTimer={false} feedback={null} onTimer={noop} />);
  expect(html).toMatch(/<button[^>]*disabled[^>]*>Pass<\/button>/);
});
it("nextPassState: first tap arms, second fires; typing and blur disarm; nothing is timed", () => {
  expect(nextPassState("idle", "tap")).toEqual({ state: "armed", fire: false });
  expect(nextPassState("armed", "tap")).toEqual({ state: "idle", fire: true });
  expect(nextPassState("armed", "type")).toEqual({ state: "idle", fire: false });
  expect(nextPassState("armed", "blur")).toEqual({ state: "idle", fire: false });
  expect(nextPassState("idle", "blur")).toEqual({ state: "idle", fire: false });
});
it("the prompt screen passes the copy audit", () => {
  const html = renderToStaticMarkup(<PromptScreen {...base} phase="answering" clock={10} noTimer={false} feedback={null} onTimer={noop} />);
  expect(bannedHits(html)).toEqual([]);
});
```
The existing PromptScreen tests keep working because `onTimer` is optional. Add one test that the source has no `setTimeout` tied to Pass (`readFileSync("components/dig/PromptScreen.tsx", "utf8")` does not match `/setTimeout\([^)]*3000/`).
- [ ] **Step 2:** `npx vitest run components/dig/PromptScreen.test.tsx` FAIL. **Step 3:** implement. Do not hand-roll new buttons: use `Button`/`ToggleGroup`. **Step 4:** PASS, then `npm run lint`. **Step 5:** Commit `feat(dig): timer switch control and a second tap to pass`

### Task B3: Intro absorbs "How it works" (independent; Lane P)

**Files:**
- Modify: `components/dig/Intro.tsx`, `app/dig/page.tsx` (the `<noscript>` change only; the heading moves in I1)
- Test: `components/dig/Intro.test.tsx` (created by P0a), new `lib/dig/introSample.test.ts`

- [ ] **Step 1: Failing tests.**

```ts
// Intro.test.tsx
import { bannedHits } from "@/lib/dig/copyAudit";
it("explains the game before Start with a real sample and no 'How it works' below", () => {
  const html = renderToStaticMarkup(<Intro noTimer={false} onToggleTimer={noop} onStart={noop} />);
  expect(html).toContain("Each prompt hides one word nobody expects.");
  expect(html).toContain("7 prompts. 25 seconds each. Rarer answers dig deeper.");
  expect(html).toContain("Your answers build a cross-section as you go. The hidden word is the fossil, buried in the bedrock.");
  expect(html).toContain("For example: Name a fruit");
  expect(html).toContain("apple lands in the topsoil. quince digs down to the clay.");
  expect(html).toContain("No timer counts the same. Use it any time.");
  expect(bannedHits(html)).toEqual([]);
});
```
`introSample.test.ts`: the spec requires the sample to be true. Import the zipf tier function that `lib/dig` uses (find it with `Grep tierFromZipf lib`; it may be a pipeline script under `scripts/`, in which case import from there) and assert `tierFromZipf(zipf("apple"))` is `common` or `popular` and `quince` is `uncommon`. If either assertion fails, pick a fruit that fits, change the sentence and the test together (the sentence must be true). If the frequency data cannot be loaded in vitest, replace with a documented manual check in the commit message.
- [ ] **Step 2:** FAIL. **Step 3:** Intro: add the two lines, the sample block (`border border-line`, `p-4`, `font-serif`, no arbitrary values). `page.tsx`: delete the "How it works" `<section>`; add two `<noscript>` blocks: the "How it works" text kept verbatim (so crawlers and no-JS visitors still see it, including the `Past digs` link) and `curio dig needs JavaScript to play. Curio's word stories and the Past digs list still work without it.` Keep `metadata` unchanged. `<noscript>` is plain React, so no Next docs lookup is needed beyond the standard "read the docs first" rule for any `app/` edit.
- [ ] **Step 4:** PASS; `npm run build` (the page must still prerender). **Step 5:** Commit `feat(dig): explain the game in the intro, drop the always-on how-it-works`

---

## Group D: Dig you watch grow (Stage 2, Lane D)

### Task D1: Motion tokens and keyframes (parallel with D2)

**Files:**
- Modify: `app/globals.css` (`@theme inline` block: `--duration-drop: 420ms; --duration-found: 700ms; --ease-settle: cubic-bezier(0.2, 0.8, 0.2, 1);` and, outside it, keyframes plus utility classes), `docs/design-system.md` (Motion table, three rows)
- Test: `lib/dig/motion.test.ts` (reads the CSS file as text)

- [ ] **Step 1: Failing test** (the media block is found by brace matching, not a lazy regex that assumes the block closes at column 0)

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const css = readFileSync("app/globals.css", "utf8");

/** Returns the full text of the first block whose header matches `head`, braces balanced. */
function block(src: string, head: RegExp): string {
  const m = head.exec(src);
  if (!m) return "";
  let depth = 0;
  for (let i = src.indexOf("{", m.index); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(m.index, i + 1);
  }
  return "";
}

describe("dig motion", () => {
  it("registers the three tokens", () => {
    for (const t of ["--duration-drop: 420ms", "--duration-found: 700ms", "--ease-settle: cubic-bezier(0.2, 0.8, 0.2, 1)"]) expect(css).toContain(t);
  });
  const media = block(css, /@media \(prefers-reduced-motion: no-preference\)/);
  it("only animates under prefers-reduced-motion: no-preference", () => {
    expect(media).toContain("dig-drop");
    expect(media).toContain("dig-found");
    expect(css.replace(media, "")).not.toMatch(/animation:\s*dig-/);
  });
  it("scales SVG shapes from their own centre, not the viewBox origin", () => {
    for (const cls of [".dig-drop", ".dig-found"]) {
      const rule = block(media, new RegExp(`\\${cls}\\s*\\{`));
      expect(rule).toContain("transform-box: fill-box");
      expect(rule).toContain("transform-origin: center");
    }
  });
});
```
- [ ] **Step 2:** `npx vitest run lib/dig/motion.test.ts` FAIL. **Step 3:** add `@keyframes dig-drop { from { transform: translateY(var(--drop-from)); } to { transform: translateY(0); } }` and `dig-found { from { transform: scale(0.6); opacity: 1; } to { transform: scale(1.8); opacity: 0; } }`; classes `.dig-drop { animation: dig-drop var(--duration-drop) var(--ease-settle) both; transform-box: fill-box; transform-origin: center; }` and `.dig-found` likewise with `--duration-found`, both defined only inside the `no-preference` media block. `--drop-from` is set inline on the marker group as a negative SVG-unit offset. **Step 4:** PASS. Then `npm run build` and grep the emitted CSS (`.next/static/chunks/*.css`) for `--duration-drop`: with `@theme inline`, Tailwind may drop theme variables nothing references. If it is missing, read how existing motion tokens are consumed in `globals.css` and follow that pattern (or reference the tokens through the utility classes so they are kept). **Step 5:** Commit `feat(design): motion tokens for the strata drop and fossil pulse`

### Task D2: Reveal copy tables, facts, origin parse (parallel with D1)

**Files:**
- Create: `lib/dig/revealCopy.ts`
- Test: `lib/dig/revealCopy.test.ts`

**Interfaces:**
- Consumes: `PromptResult`, `Tier`, `PromptSecret` (types only), `normalizeKey` from `./normalize`. `TIER_LABEL` is NOT used for the variant text.
- Produces:
  - `layerLine(tier: Tier, priorSameTier: number): string | null` (variants per spec table 2.2; `variant = priorSameTier % 3`; fossil returns null). Every non-fossil line starts with its layer name: Topsoil (common, popular), Loam (familiar), Clay (uncommon), Stone (rare).
  - `priorSameTier(results: PromptResult[], index: number): number` (count of `results[0..index-1]` with the same tier as `results[index]`)
  - `originLanguage(promptText: string): string | null`
  - `type RevealFact = { kind: "text"; text: string } | { kind: "story"; text: string; slug: string; linkText: string }`
  - `revealFact(args: { answer: string; tier: Tier; kind: "theme" | "origin"; promptText: string; secret: Pick<PromptSecret, "answers" | "stories"> }): RevealFact | null`
- Fact priority (spec 2.3): (1) tier is `uncommon` or deeper AND its `TIERS` index is strictly greater than the median index of the tiers of `secret.answers` entries with `core === 1` only (accepted-only entries with `core: 0` are never shown and would skew the median; median = `sorted[Math.floor(n / 2)]`; no `core === 1` entries means no rule 1) -> text "Rarer than most words that fit this prompt."; (2) `secret.stories[normalizeKey(answer)]` -> `{ kind: "story", text: \`Curio has the story of ${answer}.\`, slug, linkText: \`Read the story of ${answer}\` }`; (3) `kind === "origin"` and `originLanguage` non-null -> `English took ${answer} from ${Language}.`; else null. Never for a fossil-tier answer (the fossil moment replaces it) and never on a miss. Confirm the `secret.answers` tuple shape (`[answer, tier, core]`) in `lib/dig/types.ts` before writing the code.

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { bannedHits } from "./copyAudit";
import { normalizeKey } from "./normalize";
import { layerLine, originLanguage, priorSameTier, revealFact } from "./revealCopy";
import { TIERS } from "./types";

const LAYER: Record<string, string> = { common: "Topsoil", popular: "Topsoil", familiar: "Loam", uncommon: "Clay", rare: "Stone" };

describe("layerLine", () => {
  it("gives three different lines for three Familiar results in one run", () => {
    const lines = [0, 1, 2].map((n) => layerLine("familiar", n));
    expect(new Set(lines).size).toBe(3);
    expect(layerLine("familiar", 3)).toBe(lines[0]);
  });
  it("is deterministic and non-null for every tier but fossil", () => {
    for (const t of TIERS.filter((x) => x !== "fossil")) for (const n of [0, 1, 2, 5]) expect(layerLine(t, n)).toBe(layerLine(t, n));
    expect(layerLine("fossil", 0)).toBeNull();
  });
  it("starts every line with its layer name, so the band vocabulary is taught each time", () => {
    for (const t of TIERS.filter((x) => x !== "fossil")) for (const n of [0, 1, 2]) expect(layerLine(t, n)).toMatch(new RegExp(`^${LAYER[t]}\\.`));
  });
  it("passes the copy audit for every variant", () => {
    for (const t of TIERS) for (const n of [0, 1, 2]) expect(bannedHits(layerLine(t, n) ?? "")).toEqual([]);
  });
});
describe("priorSameTier", () => {
  it("counts earlier results of the same tier only, so a refresh gives the same line", () => {
    const r = (tier: never) => ({ answer: "x", tier, rejected: [], lastGuess: null });
    const results = [r("familiar" as never), r("rare" as never), r("familiar" as never), r("familiar" as never)];
    expect(priorSameTier(results, 3)).toBe(2);
    expect(priorSameTier(results, 0)).toBe(0);
  });
});
describe("originLanguage", () => {
  it.each([
    ["Name a word English took from Russian", "Russian"],
    ["a word English took from Arabic", "Arabic"],
    ["Name a word from sailing", null],
  ])("%s -> %s", (text, want) => expect(originLanguage(text)).toBe(want));
});
describe("revealFact", () => {
  // [answer, tier, core]: the core:0 entry is accepted-only, never shown, and must not move the median.
  const secret = {
    answers: [["a", "common", 1], ["b", "familiar", 1], ["c", "uncommon", 1], ["d", "rare", 0], ["e", "rare", 0]] as never,
    stories: { [normalizeKey("Cappuccino")]: "cappuccino" },
  };
  it("rarity line needs clay or deeper AND above the median of shown answers", () => {
    expect(revealFact({ answer: "z", tier: "rare", kind: "theme", promptText: "p", secret })).toEqual({ kind: "text", text: "Rarer than most words that fit this prompt." });
    expect(revealFact({ answer: "z", tier: "uncommon", kind: "theme", promptText: "p", secret })).toEqual({ kind: "text", text: "Rarer than most words that fit this prompt." });
    // familiar is not above the shown median (familiar), and is below the clay floor anyway
    expect(revealFact({ answer: "z", tier: "familiar", kind: "theme", promptText: "p", secret })).toBeNull();
  });
  it("never pairs the rarity line with a topsoil or loam answer", () => {
    const low = { answers: [["a", "common", 1], ["b", "common", 1], ["c", "common", 1]] as never, stories: {} };
    for (const t of ["common", "popular", "familiar"] as const) expect(revealFact({ answer: "z", tier: t, kind: "theme", promptText: "p", secret: low })).toBeNull();
  });
  it("a story beats an origin line; the story map is read by normalised key", () => {
    expect(revealFact({ answer: "Cappuccino", tier: "common", kind: "theme", promptText: "p", secret })).toEqual({ kind: "story", text: "Curio has the story of Cappuccino.", slug: "cappuccino", linkText: "Read the story of Cappuccino" });
    expect(revealFact({ answer: "kvass", tier: "common", kind: "origin", promptText: "a word English took from Russian", secret })?.text).toBe("English took kvass from Russian.");
  });
  it("is null otherwise and for a fossil", () => {
    expect(revealFact({ answer: "q", tier: "common", kind: "theme", promptText: "p", secret })).toBeNull();
    expect(revealFact({ answer: "q", tier: "fossil", kind: "origin", promptText: "took from Russian", secret })).toBeNull();
  });
  it("fact text passes the copy audit", () => {
    const f = revealFact({ answer: "z", tier: "rare", kind: "theme", promptText: "p", secret });
    expect(bannedHits(f?.text ?? "")).toEqual([]);
  });
});
```
- [ ] **Step 2:** FAIL. **Step 3: Implement.** Copy tables are the spec's 2.2 table verbatim (`as const` arrays per tier); `originLanguage` regex `/took from ([A-Z][A-Za-z' -]+?)\s*$/`. Before finalising, run `Grep "kind: \"origin\"" lib scripts` to list every real origin prompt phrasing and add each as an `it.each` row so the spec's "tests for each phrasing in current data" holds. **Step 4:** PASS. **Step 5:** Commit `feat(dig): varied reveal lines, one fact per reveal`

### Task D3: Strata compact strip (needs D1)

**Files:**
- Modify: `components/dig/Strata.tsx`
- Test: `components/dig/Strata.test.tsx`, `lib/dig/strata.test.ts` (existing checker must still pass; extend it for contrast)

**Interfaces:**
- Produces: `Strata` props gain `compact?: boolean`, `height?: number` (viewBox height; default 360, compact default 80; the postcard passes 240), `current?: number` (column showing the surface ring), `justDropped?: number` (the one animated column). Compact: viewBox `360 x 80`, bands 16 units, no band names, no word labels, marker r 5.5 (fossil 7.5), `aria-hidden="true"` and no `role="img"`, no `<figure>` label. Unanswered columns get a faint dotted guide marked `data-guide` (decorative). A `tiers` entry of `undefined` (strip is passed `undefined` for unanswered) renders the guide; `null` (pass or timeout) renders the open surface ring and never animates. Widen the prop type to `(Tier | null | undefined)[]` (the end screen still passes `Tier | null`). Un-compact output is unchanged apart from the type and the optional `height`. Read how `strataLayout` takes its height before parameterising.
- Animation: only the `justDropped` column's marker group, and only when its tier is non-null, gets class `dig-drop` and inline `style={{ ["--drop-from" as string]: \`${-(cy - 8)}px\` }}` (SVG user units); a fossil at `justDropped` additionally renders a ring `<circle className="dig-found ...">`. `.dig-drop` and `.dig-found` already set `transform-box: fill-box; transform-origin: center` (D1).
- Skeleton: export `StrataSkeleton` (seven faint columns, five empty bands, `aria-hidden`, same 80-unit viewBox) for the loading state.

- [ ] **Step 1: Failing tests**

```tsx
const rest6 = [undefined, undefined, undefined, undefined, undefined, undefined];
it("compact: hidden from assistive tech, no band names or word labels, 80 units tall", () => {
  const html = renderToStaticMarkup(<Strata compact tiers={["rare", ...rest6]} words={["halyard"]} label="Your dig" current={1} />);
  expect(html).toContain('aria-hidden="true"');
  expect(html).not.toContain('role="img"');
  expect(html).not.toContain("topsoil");
  expect(html).not.toContain("halyard");
  expect(html).toContain('viewBox="0 0 360 80"');
});
it("height overrides the viewBox for the postcard drawing and keeps it accessible", () => {
  const html = renderToStaticMarkup(<Strata height={240} tiers={["rare", null]} words={["halyard", null]} label="Your dig, 7 November 2026" />);
  expect(html).toContain('viewBox="0 0 360 240"');
  expect(html).toContain('role="img"');
});
it("only the justDropped column animates, and only when it holds an answer", () => {
  const two = ["common", "rare", ...Array(5).fill(undefined)];
  expect(renderToStaticMarkup(<Strata compact tiers={two} label="x" justDropped={1} />).match(/dig-drop/g)).toHaveLength(1);
  expect(renderToStaticMarkup(<Strata compact tiers={two} label="x" />)).not.toContain("dig-drop");
  expect(renderToStaticMarkup(<Strata compact tiers={[null, ...rest6]} label="x" justDropped={0} />)).not.toContain("dig-drop");
});
it("a found fossil adds one pulse ring in its column", () => {
  expect(renderToStaticMarkup(<Strata compact tiers={["fossil", ...rest6]} label="x" justDropped={0} />).match(/dig-found/g)).toHaveLength(1);
});
it("a pass or timeout is an open RING (a circle with no fill), not a rect", () => {
  const html = renderToStaticMarkup(<Strata compact tiers={[null, ...rest6]} label="x" />);
  expect(html.match(/<circle(?=[^>]*fill="none")(?=[^>]*r="5\.5")[^>]*>/g)).toHaveLength(1);
});
it("the dotted guide appears only in unanswered columns", () => {
  expect(renderToStaticMarkup(<Strata compact tiers={["common", "rare", ...Array(5).fill(undefined)]} label="x" />).match(/data-guide/g)).toHaveLength(5);
  expect(renderToStaticMarkup(<Strata compact tiers={Array(7).fill("common")} label="x" />)).not.toContain("data-guide");
});
it("the full drawing keeps its accessible name", () => {
  expect(renderToStaticMarkup(<Strata tiers={["rare", null]} words={["halyard", null]} label="Your dig" />)).toContain("halyard, Rare, in the stone");
});
```
Contrast (extend `lib/dig/strata.test.ts`, reusing its checker): for every band token in light AND dark, the filled marker, the open ring stroke and the fossil mark against that band must be at least 3:1 (WCAG 1.4.11), and the dotted guide must be distinguishable from each band (any non-zero contrast; it is decorative). Fix the tokens used on the strip, not the test, if a pair fails.
- [ ] **Step 2:** FAIL. **Step 3:** implement by parameterising the existing geometry constants (`H`, marker radii, stroke widths) on `compact` and `height`; reuse `strataLayout`. Unanswered (`undefined`) tiers map to `null` only for `strataLayout`'s y; keep a separate `answered` array. **Step 4:** PASS (`npx vitest run components/dig/Strata.test.tsx lib/dig/strata.test.ts`). **Step 5:** Commit `feat(dig): compact strata strip with a one-column drop`

### Task D4: Reveal rewrite and fossil moment (needs D2, D1)

**Files:**
- Create: `components/dig/BoneMark.tsx`
- Modify: `components/dig/Reveal.tsx` (new OPTIONAL props `variantIndex?: number` default 0, `kind?: PromptKind` default `"theme"`, `promptText?: string` default `""`, `onStory?: () => void`; `announceReveal` gains a `found` rule)
- Test: `components/dig/Reveal.test.tsx` (created by P0a)

**Interfaces:**
- Consumes: `layerLine`, `revealFact` from D2; `TIER_POINTS` for the points line.
- Produces: `announceReveal(result, secret, passed)` returns `"{answer}, {Label}, {points} points. You found the fossil."` when `result.tier === "fossil"`, else the existing text. `BoneMark`: inline SVG, `currentColor`, 20px via `className="size-5"`, `aria-hidden="true"`.
- Layout per spec wireframe: answer `h2`; layer line (`font-sans text-base text-ink-soft`); optional fact line (a story fact renders a `Link` with the descriptive `linkText` ("Read the story of {answer}") to `/story/{slug}`, calling `onStory` when passed); `{TIER_POINTS[tier]} points`; hairline; fossil block. Found: ONE block, not two: in place of the layer line the block header is `BoneMark` and "You found the fossil." followed by the fossil fact once (a different fossil-tier word reads "You found a fossil. The fossil was {word}." in that same block). Not found: label "The fossil was". No tier line on a miss ("Time's up" / "Passed" unchanged). Raw fossil facts stay hidden (`presentableFact` rules unchanged).

- [ ] **Step 1: Failing tests**

```tsx
import { bannedHits } from "@/lib/dig/copyAudit";
it("varies the layer line by how many times that layer was already hit", () => {
  const mk = (n: number) => renderToStaticMarkup(<Reveal {...rbase} result={{ answer: "tea", tier: "familiar", rejected: [], lastGuess: null }} variantIndex={n} />);
  expect(new Set([mk(0), mk(1), mk(2)]).size).toBe(3);
});
it("a fossil hit is one block with the bone mark, no layer line and no second 'fossil' heading", () => {
  const html = renderToStaticMarkup(<Reveal {...rbase} result={{ answer: "halyard", tier: "fossil", rejected: [], lastGuess: null }} />);
  expect(html).toContain("You found the fossil.");
  expect(html).toContain('aria-hidden="true"');
  expect(html.match(/You found the fossil\./g)).toHaveLength(1);
  expect(html).not.toContain("This prompt&#x27;s fossil");
});
it("a miss shows The fossil was, no layer line, no points", () => {
  const html = renderToStaticMarkup(<Reveal {...rbase} result={{ answer: null, tier: null, rejected: [], lastGuess: null }} />);
  expect(html).toContain("The fossil was");
  expect(html).not.toMatch(/points/);
});
it("a story fact links with descriptive text", () => {
  const html = renderToStaticMarkup(<Reveal {...rbase} secret={{ ...rbase.secret, stories: { tea: "tea" } }} result={{ answer: "tea", tier: "common", rejected: [], lastGuess: null }} />);
  expect(html).toContain("Read the story of tea");
  expect(html).not.toContain(">Read it<");
});
it("announces the fossil only when found", () => {
  expect(announceReveal({ answer: "halyard", tier: "fossil", rejected: [], lastGuess: null }, secret, false)).toContain("You found the fossil.");
  expect(announceReveal({ answer: "tea", tier: "common", rejected: [], lastGuess: null }, secret, false)).toContain("Fossil: halyard.");
});
it("every tier's reveal passes the copy audit", () => {
  for (const tier of ["common", "popular", "familiar", "uncommon", "rare", "fossil"] as const) for (const n of [0, 1, 2]) {
    expect(bannedHits(renderToStaticMarkup(<Reveal {...rbase} result={{ answer: "tea", tier, rejected: [], lastGuess: null }} variantIndex={n} />))).toEqual([]);
  }
});
```
(`rbase` = the existing Reveal test props. The old "Familiar, 30 points, into the loam" and "This prompt's fossil" expectations are updated here.)
- [ ] **Step 2:** FAIL. **Step 3:** implement; keep the persistent live-region contract in `DigGame` (unchanged). **Step 4:** PASS. **Step 5:** Commit `feat(dig): reveals that differ, and a fossil moment`

### Task D5: Strip state helper (needs D3; Lane D)

**Files:**
- Create: `lib/dig/strip.ts`
- Test: `lib/dig/strip.test.ts`

The wiring into `DigGame` is task I1. This task is pure and has no shared files.

**Interfaces:**
- Produces: `stripState(state: Pick<GameState, "results" | "current" | "phase">, resumedReveal: number): { tiers: (Tier | null | undefined)[]; current: number | undefined; justDropped: number | undefined }`. A result counts as answered for index `i` when `i < current`, or `i === current` and `phase === "reveal"`; a prompt answered with no tier yields `null`; later columns `undefined`. `current` (the surface ring column) is the current index while the phase is `answering` or `reading`. `justDropped` is derived with NO effect and NO state: it is `current` when `phase === "reveal"` and `current !== resumedReveal`, else `undefined`. `resumedReveal` is the index of the reveal a refreshed run resumed into, or `-1` for a fresh run. (Setting it in an effect after the phase change would paint the marker at its final spot and then restart the animation, a visible flicker.)

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { stripState } from "./strip";

const miss = { answer: null, tier: null, rejected: [], lastGuess: null };
const hit = (tier: string) => ({ answer: "x", tier, rejected: [], lastGuess: null }) as never;
describe("stripState", () => {
  it("a live reveal animates its own column", () => {
    const s = stripState({ phase: "reveal", current: 2, results: [hit("common"), hit("rare"), hit("familiar"), ...Array(4).fill(miss)] }, -1);
    expect(s.justDropped).toBe(2);
    expect(s.tiers.slice(0, 4)).toEqual(["common", "rare", "familiar", undefined]);
  });
  it("a resumed reveal shows its marker with nothing animating", () => {
    const s = stripState({ phase: "reveal", current: 2, results: [hit("common"), hit("rare"), hit("familiar"), ...Array(4).fill(miss)] }, 2);
    expect(s.justDropped).toBeUndefined();
    expect(s.tiers[2]).toBe("familiar");
    expect(s.tiers[3]).toBeUndefined();
  });
  it("the next live reveal after a resumed one animates again", () => {
    const base = { results: [hit("common"), hit("rare"), hit("familiar"), hit("rare"), ...Array(3).fill(miss)] };
    expect(stripState({ ...base, phase: "reveal", current: 3 }, 2).justDropped).toBe(3);
  });
  it("a pass shows an open ring (null) and later columns stay empty", () => {
    const s = stripState({ phase: "reveal", current: 0, results: Array(7).fill(miss) }, -1);
    expect(s.tiers.slice(0, 2)).toEqual([null, undefined]);
  });
  it("while answering, the current column shows the surface ring and earlier answers show", () => {
    const s = stripState({ phase: "answering", current: 1, results: [hit("common"), ...Array(6).fill(miss)] }, -1);
    expect(s.current).toBe(1);
    expect(s.justDropped).toBeUndefined();
    expect(s.tiers.slice(0, 3)).toEqual(["common", undefined, undefined]);
  });
});
```
- [ ] **Step 2:** `npx vitest run lib/dig/strip.test.ts` FAIL. **Step 3:** implement (import types only). **Step 4:** PASS. **Step 5:** Commit `feat(dig): pure strip state for the growing strata`

---

## Group E: Postcard end screen (Lane E)

### Task E1: Tomorrow slot (parallel with E2)

**Files:**
- Create: `lib/dig/tomorrow.ts` (`export const TOMORROW_HINT: string | null = null;`), `components/dig/TomorrowHint.tsx`
- Test: `components/dig/TomorrowHint.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TomorrowHint from "./TomorrowHint";
describe("TomorrowHint", () => {
  it("renders nothing while no hint is set", () => expect(renderToStaticMarkup(<TomorrowHint isToday />)).toBe(""));
  it("renders one plain line when a hint is supplied on today's dig", () => {
    expect(renderToStaticMarkup(<TomorrowHint isToday hint="a word English took from Japanese" />)).toContain("Tomorrow: a word English took from Japanese");
  });
  it("never renders on a past dig, even with a hint (that 'tomorrow' has already happened)", () => {
    expect(renderToStaticMarkup(<TomorrowHint isToday={false} hint="a word English took from Japanese" />)).toBe("");
  });
});
```
- [ ] **Step 2:** FAIL. **Step 3:** `TomorrowHint({ hint = TOMORROW_HINT, isToday }: { hint?: string | null; isToday: boolean })` returns null unless `isToday && hint`, else `<p className="font-sans text-base text-ink-soft">{`Tomorrow: ${hint}`}</p>`: one plain line, no time attached, never paired with urgency copy. The `hint` prop exists for the test only; `EndScreen` never passes it, so the slot stays hidden until Sam decides (decision A/B). **Step 4:** PASS. **Step 5:** Commit `feat(dig): hidden tomorrow-hint slot`

### Task E2: Postcard structure, row events, percentile threshold (needs D3)

**Files:**
- Modify: `components/dig/EndScreen.tsx`, `components/SignupOffer.tsx` (only if Join cannot already be non-red), `lib/dig/share.ts` (`MIN_FINISHERS` 50 to 100)
- Test: `components/dig/EndScreen.test.tsx` (update + extend), `lib/dig/share.test.ts` (threshold boundary only)

**Interfaces:**
- Consumes: `Strata` (un-compact, new `height` prop from D3), `TomorrowHint`, `SignupOffer`; event kinds `row` from P0b.
- Produces: pure helpers exported from `EndScreen.tsx`: `formatDigDate(date: string): string` -> `"7 November 2026"` (`new Date(date + "T00:00:00Z")` with `toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })`), and `rowEvent(to: "play" | "past", isToday: boolean)` returning `{ kind: "row", to }` or `null` on past days (no events are sent there).
- Structure and copy exactly as spec section 3, payoff first: postcard surface (`border border-line-strong rounded-lg bg-paper-raised p-4`): `curio dig` (font-display, lowercase, `text-lg`) left, `Dig #N` right; the depth `h2` (keeps `ref`, `tabIndex={-1}`, `autoFocus` behaviour) DIRECTLY under the header; percentile line today only (hidden below 100 finishers by `percentileLine`); date line; then `Strata` with `height={240}` and label `Your dig, ${formatDigDate(day.date)}` (the date, never "day N"). Then **Share** (red, replaces "Copy result"; same `copy` handler) and **Save image** (secondary, replaces "Share image"; same `image` handler); status line always mounted with texts `Shared`, `Copied. Paste it anywhere.`, `Image saved`, `Couldn't copy.`, `Couldn't make the image.`; then today only: `A new dig opens at midnight UTC.`; then a ruled `<ul>` come-back row: `<TomorrowHint isToday={isToday} />` (first item, renders nothing), `SignupOffer` (existing pitch, unchanged; its Join button is the secondary, non-red variant: read `components/ui/Button` and `SignupOffer`; if Join hard-codes the red variant add an optional `joinVariant?: "primary" | "secondary"` prop whose default keeps every other page unchanged, and pass `"secondary"` here), play row (today) `Cool down with a clue puzzle` / `Guess the word from three clues.` -> `/play`, or past-day row `Today's dig` / `Dig today's prompts.` -> `/dig`; `Past digs` / `Play or read any earlier dig.` -> `/dig/past`; then two closed `<details>`: `Words worth knowing` (the existing list inside) and `Today's answers` / `The day's answers` (the existing per-prompt details nested inside). Remove the old standalone Past digs/play paragraphs and the headings. The play and past links call `sendDigEvent(rowEvent(to, isToday))` in `onClick` when it is non-null, and keep `prefetch={false}`.
- `share:text` result mapping: `copyResult` returns `"shared" | "copied" | "failed" | other`; map `shared` -> `Shared`, `copied` -> `Copied. Paste it anywhere.`
- `share.ts`: `MIN_FINISHERS` becomes 100. In `share.test.ts` double the existing spread fixtures (`{ "20": 72, "30": 20, "40": 8 }` with score 300 still gives "Deeper than 72% of today's diggers") and add the boundary: total 99 -> null, total 100 -> non-null.

- [ ] **Step 1: Failing tests** (replace the "Copy result" / "Share image" expectations):

```tsx
import { bannedHits } from "@/lib/dig/copyAudit";
it("is a postcard: wordmark, dig number, UTC date, depth, depth before the drawing", () => {
  const html = renderToStaticMarkup(<EndScreen day={day} game={game} isToday />);
  expect(html).toContain("curio dig");
  expect(html).toContain("Dig #5");
  expect(html).toContain("5 December 2026");
  expect(html).toContain("1.1 m down");
  expect(html.indexOf("1.1 m down")).toBeLessThan(html.indexOf("<svg"));
  expect(html).toContain('viewBox="0 0 360 240"');
  expect(html).toContain("Your dig, 5 December 2026");
  expect(html).not.toMatch(/Your dig, day/);
  expect(html).toContain(">Share<");
  expect(html).toContain("Save image");
  expect(html).not.toContain("Copy result");
});
it("Share is the only red action (Join is secondary)", () => {
  const html = renderToStaticMarkup(<EndScreen day={day} game={game} isToday />);
  expect(html.match(/bg-accent-button/g)).toHaveLength(1);
});
it("today: midnight line, play row, no Today's dig row; past: the reverse, no percentile or midnight line", () => {
  const today = renderToStaticMarkup(<EndScreen day={day} game={game} isToday />);
  expect(today).toContain("A new dig opens at midnight UTC.");
  expect(today).toContain("Cool down with a clue puzzle");
  expect(today).toContain('href="/play"');
  const past = renderToStaticMarkup(<EndScreen day={day} game={game} isToday={false} />);
  expect(past).not.toContain("midnight UTC");
  expect(past).not.toContain("Deeper than");
  expect(past).toContain("Today&#x27;s dig");
  expect(past).toContain('href="/dig"');
  expect(past).not.toContain('href="/play"');
});
it("keeps the email offer, Past digs, and both disclosures closed by default", () => {
  const html = renderToStaticMarkup(<EndScreen day={day} game={game} isToday />);
  expect(html).toContain("Email address");
  expect(html).toContain("/dig/past");
  expect(html).toContain("Words worth knowing");
  expect(html).toContain("Today&#x27;s answers");
  expect(html).not.toMatch(/<details[^>]*\sopen/);
});
it("renders no tomorrow line while the slot is unset", () => {
  expect(renderToStaticMarkup(<EndScreen day={day} game={game} isToday />)).not.toContain("Tomorrow:");
});
it("hides the depth percentile below 100 finishers", () => {
  const few = { ...game, spread: { "10": 40, "30": 9 } };
  expect(renderToStaticMarkup(<EndScreen day={day} game={few} isToday />)).not.toContain("Deeper than");
});
it("rowEvent sends on today's dig only", () => {
  expect(rowEvent("play", true)).toEqual({ kind: "row", to: "play" });
  expect(rowEvent("past", true)).toEqual({ kind: "row", to: "past" });
  expect(rowEvent("play", false)).toBeNull();
});
it("copy audit over the whole rendered postcard, today and past", () => {
  for (const isToday of [true, false]) expect(bannedHits(renderToStaticMarkup(<EndScreen day={day} game={game} isToday={isToday} />))).toEqual([]);
});
```
Keep the existing `wordsWorthKnowing` and `announceDone` tests and the tier-label-from-`TIER_LABEL` check unchanged. Add `formatDigDate("2026-11-07")` equals `"7 November 2026"`. Contrast of depth and body text on `paper-raised` is a light and dark test using the existing contrast checker (not a to-do). Copy-audit hits (for example an existing "played" or "come back") are fixed in the component, never by weakening the shared list.
- [ ] **Step 2:** `npx vitest run components/dig/EndScreen.test.tsx lib/dig/share.test.ts` FAIL. **Step 3:** implement. **Step 4:** PASS, plus `npx vitest run lib/dig/score.test.ts` (must pass untouched: share text stays spoiler-free). **Step 5:** Commit `feat(dig): postcard end screen with a come-back row`

---

## Group I: Integration (Stage 3, sequential, after lanes P and D)

### Task I1: Wire the strip, the timer pill, the reveals and the headings into `DigGame`

**Files:**
- Modify: `components/dig/DigGame.tsx`, `app/dig/page.tsx`, `app/dig/[date]/play/page.tsx`
- Test: new `components/dig/strip.test.tsx`

This is the only task that edits `DigGame.tsx` in Stage 2 to 3. It consumes the optional props added by B2, D3 and D4.

**Behaviour:**
- Strip: render `<Strata compact {...stripState(state, resumedReveal.current)} label="" />` above the prompt and reveal screens (not on intro, not on the end screen). While the day loads, render `<StrataSkeleton/>` with the existing "Loading the dig…" line. `const resumedReveal = useRef(resumed?.state.phase === "reveal" ? resumed.state.current : -1)`; there is no `dropped` state and no effect (D5 explains why).
- Reveal: pass `variantIndex={priorSameTier(state.results, state.current)}`, `kind`, `promptText`, and `onStory` (the existing story event).
- Timer: pass `onTimer` to `PromptScreen`: `dispatch({ type: "timer", noTimer }); setNoTimer(noTimer); if (isToday) sendDigEvent({ kind: "timer" })`.
- Headings: the page h1 moves into `DigGame` via an optional `heading?: string` prop (both dig pages pass it, so `[date]/play/page.tsx` stops rendering its own). It renders visibly on the intro and with `sr-only` on prompt, reveal and end screens (the postcard carries the wordmark; hiding the h1 frees room above the iOS keyboard).
- Answer field: `scrollIntoView({ block: "nearest" })` on focus (the prop is already wired in B2; verify it works here).
- Resume: the saved-run effect is unchanged. A mid-game timer switch changes `noTimer`, which the existing save effect already depends on.

- [ ] **Step 1: Failing tests** (`strip.test.tsx`, `renderToStaticMarkup` of the pieces `DigGame` composes; do not render the whole client game):
  - `stripState` plus `Strata compact` composition: `["common", "rare", "familiar", ...]` with `phase: "reveal"` yields exactly one `dig-drop` when `resumedReveal` is `-1` and none when it equals `current`.
  - The heading helper (export a tiny pure `headingClass(phase)`): `"intro"` -> visible classes, every other phase -> `"sr-only"`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS; `npm run lint`; `npm run build`. Then manual, `npm run dev`: play a full dig at 375px (devtools, and at about 375 x 400 for the keyboard-open height), confirm the drop, the pulse on a fossil, refresh mid-dig (markers in place, nothing animates, including after a mid-game timer switch), `prefers-reduced-motion` emulation (no drop, no pulse). Do not submit finish events from dev unless `VERCEL_ENV` is non-production (writes are gated, verify first). **Step 5:** Commit `feat(dig): the strata strip grows with every answer`

---

## Group F: Audit, docs, final verification (Stage 4)

### Task F1: End-to-end copy audit

**Files:**
- Create: `lib/dig/copyAudit.test.ts`

- [ ] **Step 1:** One test file that renders Intro, PromptScreen, Reveal (every tier, three variants), EndScreen (today and past), the digest HTML and plain text with a dig line, and calls `digLineText`, `shareText`, the share-image text and the OG-image text, and the three social builders. It asserts `bannedHits(text)` is `[]` for each, importing `bannedHits` from `./copyAudit` (no local regex). The share image and OG image are the surfaces the first plan missed: find their text with `Grep ImageResponse app/dig lib/dig components/dig/shareImage.ts`; where the text is built inline in JSX, extract the strings into an exported pure function in the same file (no behaviour change) and test that. Use a fixture game whose spread is under 100 finishers, and one over 100 where only the exact `Deeper than N% of today's diggers` phrase is allowed.

```ts
import { bannedHits } from "./copyAudit";
const surfaces: Record<string, string> = { intro, prompt, reveals, endToday, endPast, digest, digestText, digLine, share, shareImage, ogImage, bluesky, threads, instagram };
for (const [name, text] of Object.entries(surfaces)) it(`${name} is clean`, () => expect(bannedHits(text)).toEqual([]));
```
- [ ] **Step 2:** Run `npx vitest run lib/dig/copyAudit.test.ts`; fix any hit in the owning component (not in the shared list). **Step 3:** Commit `test(dig): copy audit for archive-never-backlog`

### Task F2: Docs and full verification

**Files:**
- Modify: `docs/handover/dig.md` (new Redis funnel fields `start:ret:*`, `fossil`, `row:play|past`, `timer:switch`; the baseline readout plan; caveats below), `handover.md` (one line pointer if the dig bullet changes)
- [ ] Handover content: read returning-start share daily from day 2, review at day 7 and day 14, target at least 30% by days 8 to 14, a floor on absolute returning starters; the count undercounts (Safari clears script-written storage after 7 days without a visit, private windows lose it); do not read the `d7` bucket as retention, because the device flag cannot distinguish a lapsed player from an evicted store; note that the release check in A5 wrote one fake returning start (record its day and bucket) and that it is excluded from the baseline; note the existing UTC rollover behaviour (a page loaded before 00:00 UTC and started after it gets a 400, so that start is lost); note the guardrail from the spec (no random or surprise rewards that carry across days or are tied to coming back).
- [ ] Run, in order, and read the output: `npx vitest run`, `npm run lint`, `npm run build`. All must pass.
- [ ] Walk the done-means checklist at 375px and note results: return counter visible in admin; full play-through; the postcard shows the depth and Share on arrival at 375 x about 700; the prompt screen keeps the field, Dig and the error line visible with the iOS keyboard open; resume after refresh including a mid-game timer switch; revisit after finishing shows the postcard and midnight line; keyboard-only and screen-reader pass; reduced motion; contrast tests in light and dark; copy audit clean; `/sample-email` render checked.
- [ ] Use `superpowers:requesting-code-review`, then a `ux-reviewer` pass on D and E, then `release-manager`. Say "live" only after production is verified at `curioword.com/dig` including the digest preview and the admin returning column. Group C ships only after Sam answers the email-promise decision.
- [ ] Commit `docs(dig): handover for retention release 1`

---

## Self-review

- Spec coverage: item 1 -> A1-A5; item 2 -> D1-D5 plus I1 (strip, variants, facts, fossil moment; the intro line is B3; the `fossil` counter is P0b); item 3 -> E1-E2 (postcard, row, disclosures, tomorrow slot, `row` events via P0b); item 4 -> C1-C4; item 5 -> B1-B3 (intro, noscript, timer, two-tap Pass; the `timer` event is P0b and its wiring is I1). Copy audit -> Z1 plus F1 plus per-task assertions. Storage untouched.
- Review fixes mapped: shared banned list (Z1, F1); percentile threshold (E2); tomorrow today-only (E1); reveal copy and fact rules (D2); no Pass timeout and fixed pill label (B2); postcard payoff first (E2, D3 `height`); keyboard-open fit and h1 (B2, I1); fossil pulse origin (D1); flicker-free drop (D5, I1); ring test on the circle (D3); file ownership and test-file split (ownership table, P0a); optional props so every commit builds (B2, D4); pure vs server digLine (C1); UTM assertions (C1); `core === 1` median and `normalizeKey` (D2); A5 fake-data note and F2 caveats; branches so A ships alone.
- Spec deviations to flag to the CEO: (1) `ret` bucket logic sits in `lib/dig/client.ts` as specced, with the allowlist `RETURN_BUCKETS` duplicated in `events.ts` to keep the client module out of server imports; (2) the `row`, `timer` and `fossil` increments ship with the UI branch (P0b), not with the counter, so Group A deploys alone and early; (3) the depth percentile threshold moves from 50 to 100 finishers.
- Type consistency: `ReturnBucket` strings `"d1" | "d2_6" | "d7"` match across A1, A2, A3; `DigLine = { prompt: string }` across C1-C4; `Strata` tiers type `(Tier | null | undefined)[]` across D3, D5 and I1; `Reveal` new optional props `variantIndex`, `kind`, `promptText`, `onStory` across D2, D4 and I1; `PromptScreen.onTimer` (optional) across B2 and I1; `stripState(state, resumedReveal)` across D5 and I1.
- Open item for the executor: where this plan says "find / read first" (zipf tier function, existing escaper in `lib/email.ts`, Bluesky facets, send-daily call sites, `copyResult` return values, `strataLayout` height handling, `SignupOffer` Join variant), read that file before writing code; do not guess.

## Addendum: Sam's decisions (2026-11-07) — overrides the plan where they conflict

Spec section "Sam's decisions" is binding. Changes to this plan:

- **Branches.** No release gate between groups: everything is approved. Group A still ships to production first, alone (Claude, the orchestrator, deploys it); the UI branch is cut from `feat/dig-return-counter`; Group C is merged into the UI branch before F1 (no throwaway merge). Nothing is pushed by implementers; the orchestrator merges and deploys.
- **Task A6 (new, Lane A, after A3): kill line on returners.** Change the admin "curio dig" kill-line row (`components/AdminDashboard.tsx` / `components/dig/DigFunnelTable.tsx` and `lib/dig/funnel.ts`, whichever computes it) from median daily `start` to median daily returning starts (the `ret:*` funnel fields from A2) over days 22–28, with "stop below 5", and show the returning share next to it. Tests: median computed from returning fields; label text. Update `docs/handover/dig.md` "The kill line" section to the new rule.
- **Task E1 (changed): tomorrow hint is live.** `lib/dig/tomorrow.ts` exports `tomorrowHint(promptText: string): string | null` (strip a leading "Name ", trim, null if no "Name " prefix or empty). `app/api/dig/today/route.ts` reads tomorrow's day (`readDay(<tomorrow date>)`, same production gating as today's read; local dev falls back as `readDay` already does) and adds `tomorrow: tomorrowHint(day.prompts[0].text) ?? null` to the response; a failed read gives `null` and never fails the request. `DigDayResponse`/`PreparedDay` gain optional `tomorrow?: string | null`. `EndScreen` passes `day.tomorrow` to `TomorrowHint` (today only). Tests: hint parsing; route includes `tomorrow` and survives a missing tomorrow; TomorrowHint renders "Tomorrow: …" on today and nothing on a past dig; copy audit over the line.
