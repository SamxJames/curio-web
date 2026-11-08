# Dig pre-launch release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before the 2026-11-15 hand launch: real share sheets on phones, share and challenge numbers the 12-04 gate can actually read, fairer rejection wording, a tighter phone end screen, working expired challenge links, and an email offer that sells tomorrow's dig.

**Architecture:** One client-safe share helper shared by Dig and Puzzle. New funnel fields are added beside the old ones (old fields never change meaning). Everything else is copy and layout inside `components/dig/`.

**Tech Stack:** Next.js 16 (read `AGENTS.md`), React 19, TypeScript, Tailwind v4, Vitest, Upstash.

**Spec:** Approved in the planning conversation of 2026-11-08; the requirements are restated in Global Constraints and each task.

## Global Constraints

- Work only in this worktree (`.claude/worktrees/dig-prelaunch`, branch `feat/dig-prelaunch`). Do not push. Do not edit `handover.md`, `docs/handover/*` or `docs/strategy/*`: the main checkout has uncommitted edits to them.
- "Archive, never backlog": no streaks, no "you missed", no counts of unplayed days, no completion percentages. The word "streak" is banned even negated (`lib/dig/copyAudit.ts`).
- Share text stays spoiler-free: depths and tier row only, never words.
- Existing funnel fields keep their meaning. New field names must not start with `share:` (`summarizeDigFunnel` sums that prefix). Use `shared:*`.
- No new hand-rolled `<button>`/`<input>` or arbitrary Tailwind values outside `DigFunnelTable.tsx`; use `components/ui/` and tokens.
- Any new player-facing string must be covered by `lib/dig/copyAudit.test.tsx`.
- Client components may only `import type` from `lib/words.ts`.
- Check after each task: `npx vitest run <touched tests>`, and `npx tsc --noEmit` before committing. Full suite and `npm run lint` at the end of each task.
- Commit messages end with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

---

### Task 1: Real share on phones (Dig and Puzzle)

**Files:**
- Create: `lib/shareOrCopy.ts`, `lib/shareOrCopy.test.ts`
- Modify: `components/dig/shareImage.ts`, `components/dig/EndScreen.tsx`, `components/dig/EndScreen.test.tsx`, `lib/dig/share.ts`, `lib/dig/share.test.ts`, `components/PuzzleGame.tsx`, `lib/dig/copyAudit.test.tsx`, `components/dig/PromptScreen.tsx` (one attribute)

**Interfaces:**
- Produces: `shareOrCopy(text: string): Promise<ShareOutcome>`; `type ShareOutcome = "shared" | "copied" | "dismissed" | "failed"`; `prefersShareSheet(): boolean`; `CHALLENGE_HOOK` (from `lib/dig/share.ts`); `renderShareImage(input): Promise<Blob | null>`; `shareImage(input, ready?: Blob | null)`.

- [ ] **Step 1: Write failing tests** in `lib/shareOrCopy.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { shareOrCopy } from "./shareOrCopy";

const abort = () => Object.assign(new Error("x"), { name: "AbortError" });
function stub(coarse: boolean, share?: unknown, writeText?: unknown) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: coarse && q === "(pointer: coarse)" }));
  Object.defineProperty(window, "matchMedia", { configurable: true, value: (q: string) => ({ matches: coarse && q === "(pointer: coarse)" }) });
  Object.defineProperty(navigator, "share", { configurable: true, value: share });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: writeText ? { writeText } : undefined });
}
afterEach(() => vi.unstubAllGlobals());

describe("shareOrCopy", () => {
  it("opens the sheet first on a touch device and does not copy", async () => {
    const share = vi.fn().mockResolvedValue(undefined), writeText = vi.fn().mockResolvedValue(undefined);
    stub(true, share, writeText);
    await expect(shareOrCopy("hi")).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ text: "hi" });
    expect(writeText).not.toHaveBeenCalled();
  });
  it("treats a cancelled sheet as dismissed and does not copy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stub(true, vi.fn().mockRejectedValue(abort()), writeText);
    await expect(shareOrCopy("hi")).resolves.toBe("dismissed");
    expect(writeText).not.toHaveBeenCalled();
  });
  it("copies when the sheet errors on a touch device", async () => {
    stub(true, vi.fn().mockRejectedValue(new Error("nope")), vi.fn().mockResolvedValue(undefined));
    await expect(shareOrCopy("hi")).resolves.toBe("copied");
  });
  it("copies first on desktop even when a share API exists", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stub(false, share, vi.fn().mockResolvedValue(undefined));
    await expect(shareOrCopy("hi")).resolves.toBe("copied");
    expect(share).not.toHaveBeenCalled();
  });
  it("copies on a touch device with no share API (in-app browsers)", async () => {
    stub(true, undefined, vi.fn().mockResolvedValue(undefined));
    await expect(shareOrCopy("hi")).resolves.toBe("copied");
  });
  it("fails when neither works", async () => {
    stub(false, undefined, vi.fn().mockRejectedValue(new Error("blocked")));
    await expect(shareOrCopy("hi")).resolves.toBe("failed");
  });
});
```

Delete the `describe("copyResult", ...)` block from `components/dig/EndScreen.test.tsx` and its `copyResult` import (this file replaces it). In `lib/dig/share.test.ts`, update expectations: the challenge text's last two lines are `Can you go deeper?` then `https://curioword.com/dig?vs=<code>&utm_source=challenge`; the `challenge = false` text has no hook and ends `https://curioword.com/dig`.

- [ ] **Step 2: Run them, expect FAIL.** `npx vitest run lib/shareOrCopy.test.ts lib/dig/share.test.ts`

- [ ] **Step 3: Create `lib/shareOrCopy.ts`:**

```ts
"use client";

export type ShareOutcome = "shared" | "copied" | "dismissed" | "failed";

const isAbort = (e: unknown) => (e as { name?: string } | null)?.name === "AbortError";

/** Phones and tablets get the share sheet; a mouse or trackpad gets the clipboard. Pointer, not
 * user agent: iPadOS reports a desktop agent. */
export function prefersShareSheet(): boolean {
  if (typeof window === "undefined" || typeof navigator.share !== "function") return false;
  return !!window.matchMedia?.("(pointer: coarse)").matches;
}

async function viaSheet(text: string): Promise<"shared" | "dismissed" | null> {
  if (typeof navigator.share !== "function") return null;
  try {
    await navigator.share({ text });
    return "shared";
  } catch (e) {
    return isAbort(e) ? "dismissed" : null;
  }
}

async function viaClipboard(text: string): Promise<"copied" | null> {
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return null;
  }
}

/** Must be called directly from the tap handler: browsers only open a share sheet from a fresh
 * tap, so nothing may be awaited before this. "dismissed" means the player changed their mind:
 * say nothing and count nothing. */
export async function shareOrCopy(text: string): Promise<ShareOutcome> {
  const order = prefersShareSheet() ? [viaSheet, viaClipboard] : [viaClipboard, viaSheet];
  for (const attempt of order) {
    const r = await attempt(text);
    if (r) return r;
  }
  return "failed";
}
```

- [ ] **Step 4: Update `lib/dig/share.ts`:**

```ts
export const CHALLENGE_HOOK = "Can you go deeper?";

/** The agreed spoiler-free share text (architecture §10). The link carries https:// so it is
 * tappable in every app; it stays in the text because some apps drop text sent beside a url. */
export function shareText(n: number, score: number, tiers: (Tier | null)[], challenge = true): string {
  const link = challenge ? `https://curioword.com/dig?vs=${encodeVs(n, tiers)}&utm_source=challenge` : "https://curioword.com/dig";
  return [`curio dig, day ${n}`, `${formatDepth(score)} down`, shareRow(tiers), ...(challenge ? [CHALLENGE_HOOK] : []), link].join("\n");
}
```

- [ ] **Step 5: Split rendering from sharing in `components/dig/shareImage.ts`.** Delete `copyResult` and its comment. `isAbort` stays. Change `shareImageLines` and split `shareImage`:

```ts
import { CHALLENGE_HOOK } from "@/lib/dig/share";

export function shareImageLines(number: number, score: number, challenge = false): string[] {
  return ["curio dig", `day ${number}`, `${formatDepth(score)} down`, ...STRATA, ...(challenge ? [CHALLENGE_HOOK] : [])];
}

type ImageInput = { number: number; score: number; tiers: (Tier | null)[]; text: string; challenge?: boolean };

/** Draws the card. Done ahead of the tap by EndScreen: fonts and toBlob take long enough that a
 * browser can refuse a share sheet opened after them. */
export async function renderShareImage(input: Omit<ImageInput, "text">): Promise<Blob | null> {
  // (the existing font loading, canvas setup and drawing, unchanged, using
  //  shareImageLines(input.number, input.score) for the indexed lines)
  // after the markers are drawn, add:
  if (input.challenge) {
    ctx.fillStyle = INK;
    ctx.font = '400 40px "Work Sans", system-ui, sans-serif';
    ctx.fillText(CHALLENGE_HOOK, 80, 1050);
  }
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
}

export async function shareImage(input: ImageInput, ready?: Blob | null): Promise<"shared" | "downloaded" | "dismissed" | "failed"> {
  try {
    const blob = ready ?? (await renderShareImage(input));
    if (!blob) return "failed";
    // (the existing canShare / navigator.share / download code, unchanged)
  } catch {
    return "failed";
  }
}
```

`renderShareImage` returns `null` where the old code returned `"failed"` for a missing canvas context.

- [ ] **Step 6: Update `components/dig/EndScreen.tsx`.** Import `shareOrCopy, prefersShareSheet` from `@/lib/shareOrCopy`; import `renderShareImage, shareImage` from `./shareImage`. Keep the existing `sendDigEvent` calls for now (Task 2 replaces them). Inside the component:

```ts
const sheet = useSyncExternalStore(noSubscribe, prefersShareSheet, () => false);
const preparedImage = useRef<Blob | null>(null);
useEffect(() => {
  let alive = true;
  renderShareImage({ number: day.number, score: game.score, tiers: game.tiers, challenge: isToday })
    .then((b) => { if (alive) preparedImage.current = b; })
    .catch(() => {});
  return () => { alive = false; };
}, [day.number, game, isToday]);
```

`copy` calls `shareOrCopy(text)` with status text: `"Shared"`, `"Copied. Paste it anywhere."`, `"Couldn't share."`, or nothing when dismissed. `image` calls `shareImage({ number: day.number, score: game.score, tiers: game.tiers, text, challenge: isToday }, preparedImage.current)`. The second button reads `{sheet ? "Share image" : "Save image"}`.

- [ ] **Step 7: Update `components/PuzzleGame.tsx`.** Import `shareOrCopy` from `@/lib/shareOrCopy` and replace `handleShare`:

```ts
async function handleShare() {
  const text = buildPuzzleShareText(puzzleNumber, state.cluesUsedToSolve, window.location.origin);
  const how = await shareOrCopy(text);
  if (how === "shared" || how === "copied") sendTrafficEvent({ kind: "share", what: "puzzle" });
  if (how === "copied") {
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }
}
```

Add to the guess `TextField` (`PuzzleGame.tsx` ~line 204): `autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="go"`. Add `autoCorrect="off"` to the Dig `TextField` in `PromptScreen.tsx`.

- [ ] **Step 8: Audit.** In `lib/dig/copyAudit.test.tsx` change the share image entry to `shareImageLines(5, 125, true).join("\n")`.

- [ ] **Step 9: Run** `npx vitest run`, `npx tsc --noEmit`, `npm run lint`. Expect PASS. Fix any other test that asserted the old text (`Save image` remains the server-rendered label).

- [ ] **Step 10: Commit** `feat(share): open the share sheet on phones, keep copy on desktop`.

---

### Task 2: Honest share counts, challenge attribution, prompt-4 counter

**Files:**
- Modify: `lib/dig/events.ts`, `lib/dig/client.ts`, `lib/dig/storage.ts`, `lib/dig/cohort.ts`, `components/dig/EndScreen.tsx`, `components/dig/DigGame.tsx`, `components/dig/DigFunnelTable.tsx`
- Test: `lib/dig/events.test.ts`, `lib/dig/client.test.ts`, `lib/dig/cohort.test.ts`, `lib/dig/storage.test.ts` (use the existing files of these names, creating any that don't exist)

**Interfaces:**
- Consumes: `ShareOutcome` from Task 1.
- Produces funnel fields: `shared:once` (a device's first real share of today's dig), `shared:new` (same, first-time player), `shared:third` (the device's third day of sharing, fires once), `start:vs`, `finish:vs`, `finish:vs:new` (valid same-day challenge link), `reached:4`, `reached:4:new`. Produces `buildShareEvent`, `markShared`, and `buildStartEvent(date, games, vs?)`, `buildFinishEvent(..., isNew, vs?)`.

- [ ] **Step 1: Write failing tests.**

`lib/dig/events.test.ts`:

```ts
describe("new counters", () => {
  const today = "2026-11-10";
  it("a counted first-timer share writes old and new fields", () => {
    const ev = parseDigEvent({ kind: "share", how: "text", once: true, isNew: true }, today)!;
    expect(funnelFields(ev)).toEqual(["share:text", "shared:once", "shared:new"]);
  });
  it("isNew and third are ignored without once", () => {
    const ev = parseDigEvent({ kind: "share", how: "image", isNew: true, third: true }, today)!;
    expect(funnelFields(ev)).toEqual(["share:image"]);
  });
  it("marks the third sharing day", () => {
    const ev = parseDigEvent({ kind: "share", how: "text", once: true, third: true }, today)!;
    expect(funnelFields(ev)).toContain("shared:third");
  });
  it("a challenge start adds start:vs", () => {
    const ev = parseDigEvent({ kind: "start", date: today, vs: true }, today)!;
    expect(funnelFields(ev)).toEqual(["start", "start:vs"]);
  });
  it("reached carries the first-timer split", () => {
    expect(funnelFields(parseDigEvent({ kind: "reached" }, today)!)).toEqual(["reached:4"]);
    expect(funnelFields(parseDigEvent({ kind: "reached", isNew: true }, today)!)).toEqual(["reached:4", "reached:4:new"]);
  });
  it("planFinish writes challenge fields", () => {
    const tiers = Array(7).fill(null);
    const fields = planFinish({ kind: "finish", date: today, score: 0, tiers, rejected: [], isNew: true, vs: true }).map((i) => i[1]);
    expect(fields).toEqual(expect.arrayContaining(["finish:vs", "finish:vs:new"]));
    expect(planFinish({ kind: "finish", date: today, score: 0, tiers, rejected: [], vs: true }).map((i) => i[1])).not.toContain("finish:vs:new");
  });
});
```

`lib/dig/client.test.ts`:

```ts
describe("buildShareEvent", () => {
  const g = (finishedAt: string, shared?: boolean) => ({ finishedAt, ...(shared ? { shared } : {}) });
  const date = "2026-11-10";
  it("is uncounted when it isn't a real share of today's dig", () => {
    expect(buildShareEvent("image", date, { [date]: g(`${date}T09:00:00Z`) }, false)).toEqual({ kind: "share", how: "image" });
  });
  it("counts a first-timer's first share once", () => {
    expect(buildShareEvent("text", date, { [date]: g(`${date}T09:00:00Z`) }, true)).toEqual({ kind: "share", how: "text", once: true, isNew: true });
  });
  it("does not count a second share of the same dig", () => {
    expect(buildShareEvent("text", date, { [date]: g(`${date}T09:00:00Z`, true) }, true)).toEqual({ kind: "share", how: "text" });
  });
  it("flags the third sharing day and not first-timers", () => {
    const games = { "2026-11-08": g("2026-11-08T09:00:00Z", true), "2026-11-09": g("2026-11-09T09:00:00Z", true), [date]: g(`${date}T09:00:00Z`) };
    expect(buildShareEvent("text", date, games, true)).toEqual({ kind: "share", how: "text", once: true, third: true });
  });
});

it("buildStartEvent and buildFinishEvent carry vs only when true", () => {
  expect(buildStartEvent("2026-11-10", {}, true)).toMatchObject({ vs: true });
  expect(buildStartEvent("2026-11-10", {})).not.toHaveProperty("vs");
  expect(buildFinishEvent("2026-11-10", Array(7).fill(null), 0, [], false, true, true)).toMatchObject({ isNew: true, vs: true });
});
```

`lib/dig/storage.test.ts`: `parseStore` keeps `shared: true` on a game and drops `shared: "yes"` while keeping the game.

`lib/dig/cohort.test.ts`: `summarizeCohorts({}, { "2026-11-10": { "finish:new": 10, "shared:new": 3, "finish:vs": 4, "finish:vs:new": 2, "reached:4:new": 12, "shared:third": 1 } }, ["2026-11-10"])[0]` matches `{ newFinishers: 10, sharedNew: 3, finishVs: 4, finishVsNew: 2, reachedNew: 12, repeatSharers: 1 }`. Update any existing `toEqual` on this function.

- [ ] **Step 2: Run them, expect FAIL.**

- [ ] **Step 3: `lib/dig/events.ts`.** Extend the union and parsing:

```ts
| { kind: "start"; date: string; ret?: (typeof RETURN_BUCKETS)[number]; first?: string; vs?: true }
| { kind: "share"; how: "text" | "image"; once?: true; isNew?: true; third?: true }
| { kind: "reached"; isNew?: true }
| { kind: "finish"; date: string; score: number; tiers: (Tier | null)[]; rejected: [number, string][]; isNew?: true; vs?: true }
```

```ts
// in case "start", add to the returned object:
...(b.vs === true ? { vs: true as const } : {})
// replace case "share":
case "share": {
  if (b.how !== "text" && b.how !== "image") return null;
  if (b.once !== true) return { kind: "share", how: b.how };
  return { kind: "share", how: b.how, once: true, ...(b.isNew === true ? { isNew: true as const } : {}), ...(b.third === true ? { third: true as const } : {}) };
}
case "reached":
  return { kind: "reached", ...(b.isNew === true ? { isNew: true as const } : {}) };
// in case "finish", add to the returned object:
...(b.vs === true ? { vs: true as const } : {})
// funnelField:
case "reached": return "reached:4";
```

```ts
export function funnelFields(ev: DigEvent): string[] {
  const f = funnelField(ev);
  if (!f) return [];
  if (ev.kind === "start") return [f, ...(ev.ret ? [`start:ret:${ev.ret}`] : []), ...(ev.vs ? ["start:vs"] : [])];
  if (ev.kind === "share" && ev.once) return [f, "shared:once", ...(ev.isNew ? ["shared:new"] : []), ...(ev.third ? ["shared:third"] : [])];
  if (ev.kind === "reached" && ev.isNew) return [f, "reached:4:new"];
  return [f];
}
```

In `planFinish`, after the `isNew` line:

```ts
if (ev.vs) out.push([digKeys.funnel(ev.date), "finish:vs", 1]);
if (ev.vs && ev.isNew) out.push([digKeys.funnel(ev.date), "finish:vs:new", 1]);
```

Keep the doc comment that currently sits above `funnelFields` above `RATE_LIMITS`, where it belongs. Check `app/api/dig/event/route.ts` passes a `reached` event to `recordFunnel` without an allow-list; add it if there is one.

- [ ] **Step 4: `lib/dig/client.ts`.**

```ts
import { firstPlayDate, isNewPlayer } from "./cohort";

export function buildFinishEvent(date: string, tiers: (Tier | null)[], score: number, results: PromptResult[], includeGuesses: boolean, isNew: boolean, vs = false) {
  // (rejected unchanged)
  return { kind: "finish" as const, date, score, tiers, rejected, ...(isNew ? { isNew: true as const } : {}), ...(vs ? { vs: true as const } : {}) };
}

export function buildStartEvent(date: string, games: Record<string, { finishedAt: string }>, vs = false) {
  const ret = returningBucket(games, date);
  const first = firstPlayDate(games, date);
  return { kind: "start" as const, date, ...(ret ? { ret } : {}), ...(first ? { first } : {}), ...(vs ? { vs: true as const } : {}) };
}

/** `real` means the player actually shared or copied today's dig (not a download, not a past dig).
 * Only the first real share of a dig is counted, so the 12-04 rate reads as people, not taps. */
export function buildShareEvent(how: "text" | "image", date: string, games: Record<string, { finishedAt: string; shared?: boolean }>, real: boolean) {
  const base = { kind: "share" as const, how };
  if (!real || !games[date] || games[date].shared) return base;
  const sharingDays = Object.values(games).filter((g) => g.shared).length + 1;
  return { ...base, once: true as const, ...(isNewPlayer(games, date) ? { isNew: true as const } : {}), ...(sharingDays === 3 ? { third: true as const } : {}) };
}
```

- [ ] **Step 5: `lib/dig/storage.ts`.** Add `shared?: boolean` with a comment to `StoredGame`; in `parseGame` add `if (g.shared === true) game.shared = true;`; add:

```ts
export function markShared(date: string) {
  const s = readStore();
  const g = s.games[date];
  if (g && !g.shared) writeStore(withGame(s, date, { ...g, shared: true }));
}
```

- [ ] **Step 6: `lib/dig/cohort.ts`,** inside the `summarizeCohorts` map:

```ts
const f = funnel[date] ?? {};
// return adds:
newFinishers: f["finish:new"] ?? 0, sharedNew: f["shared:new"] ?? 0, finishVs: f["finish:vs"] ?? 0,
finishVsNew: f["finish:vs:new"] ?? 0, reachedNew: f["reached:4:new"] ?? 0, repeatSharers: f["shared:third"] ?? 0,
```

- [ ] **Step 7: `components/dig/EndScreen.tsx`.** Import `buildShareEvent` and `markShared`, `readStore`:

```ts
const recordShare = (how: "text" | "image", real: boolean) => {
  sendDigEvent(buildShareEvent(how, day.date, readStore().games, real && isToday));
  if (real && isToday) markShared(day.date);
};
// in copy:
if (how === "copied" || how === "shared") recordShare("text", true);
// in image (a download keeps its old counter but is not a share):
if (how === "shared" || how === "downloaded") recordShare("image", how === "shared");
```

- [ ] **Step 8: `components/dig/DigGame.tsx`.** Pass `friend !== null` as `vs`: `buildStartEvent(day.date, readStore().games, friend !== null)` and `buildFinishEvent(..., isNew, friend !== null)`. Add inside `DigRun` after the phase destructure:

```ts
// Sent once per run when the fourth prompt appears, so a drop-off can be told apart from a bounce.
// A resumed run already past it never sends again.
const reachedSent = useRef((resumed?.state.current ?? 0) >= 3);
useEffect(() => {
  if (!isToday || reachedSent.current || current !== 3 || (phase !== "reading" && phase !== "answering")) return;
  reachedSent.current = true;
  sendDigEvent({ kind: "reached", ...(isNewPlayer(readStore().games, day.date) ? { isNew: true } : {}) });
}, [isToday, current, phase, day.date]);
```

- [ ] **Step 9: `components/dig/DigFunnelTable.tsx`.** Add four `w-24` columns to the cohort table after "Back days 8–13": `Shared` (`c.sharedNew`), `From challenge` (`c.finishVsNew`), `Reached prompt 4` (`c.reachedNew`), `3rd-day sharers` (`c.repeatSharers`). Append to the sentence under the heading: `Share rate for the 12-04 gate = Shared ÷ New finishers. Counts start at this release.`

- [ ] **Step 10: Run** full `npx vitest run`, `npx tsc --noEmit`, `npm run lint`. Expect PASS.

- [ ] **Step 11: Commit** `feat(dig): count real shares per person, challenge finishes and mid-game drop-off`.

---

### Task 3: Fairer rejection and phone-aware prompt wording

**Files:**
- Modify: `components/dig/PromptScreen.tsx`, `components/dig/PromptScreen.test.tsx`, `components/dig/Reveal.tsx`, `components/dig/Reveal.test.tsx`, `components/dig/DigGame.tsx`, `lib/dig/copyAudit.test.tsx`

**Interfaces:**
- Produces: `PromptScreen` props `canClaim?: boolean`, `onClaim?: (guess: string) => void`. `DigRun`'s `claimed` becomes `Record<number, string>`.

- [ ] **Step 1: Update tests.** `PromptScreen.test.tsx:27` expects `Not one we know yet. Try another, or Skip.` Add: with `feedback={{ kind: "miss", guess: "medlar" }}`, `canClaim` and `onClaim`, the HTML contains `should count` and `medlar`; without `canClaim` it doesn't. Add: server render has `placeholder="Tap to type"` and near-miss text `Tap Yes to accept.`. `Reveal.test.tsx:88` expects `Thanks, we&#x27;ll check it.`. Add the miss and near-miss feedback states to the prompt surfaces in `lib/dig/copyAudit.test.tsx` if not already rendered.

- [ ] **Step 2: Run them, expect FAIL.**

- [ ] **Step 3: `components/dig/PromptScreen.tsx`.** Add `canClaim`, `onClaim` to `Props` and destructuring. Add state:

```ts
const [hasMouse] = useState(() => focusOnShow(typeof window === "undefined" ? undefined : (q) => window.matchMedia(q)));
const [claimedGuess, setClaimedGuess] = useState<string | null>(null);
```

Add `placeholder={hasMouse ? undefined : "Tap to type"}` to the `TextField`. Change the near-miss sentence to `{hasMouse ? "Press Enter to accept." : "Tap Yes to accept."}`. Replace the miss line:

```tsx
{feedback?.kind === "miss" && (
  <p key={round}>
    Not one we know yet. Try another, or Skip.{" "}
    {canClaim && onClaim && (claimedGuess === feedback.guess ? "Thanks, we'll check it." : (
      <Button variant="link" className="min-h-11 text-left" onClick={() => { onClaim(feedback.guess); setClaimedGuess(feedback.guess); }}>{`“${feedback.guess}” should count`}</Button>
    ))}
  </p>
)}
```

- [ ] **Step 4: `components/dig/Reveal.tsx:105`:** the thanks text becomes `Thanks, we'll check it.`

- [ ] **Step 5: `components/dig/DigGame.tsx`.** Import `normalizeKey` from `@/lib/dig/normalize`. So a word claimed at the prompt isn't offered again on the reveal, and a different last guess still can be:

```ts
const [claimed, setClaimed] = useState<Record<number, string>>({});
const claim = (guess: string) => {
  if (!isToday) return;
  sendDigEvent({ kind: "claim", date: day.date, prompt: state.current, guess });
  setClaimed((c) => ({ ...c, [state.current]: guess }));
};
```

Reveal gets `onClaim={claim}` and:

```ts
claimed={(() => { const last = state.results[state.current].lastGuess, c = claimed[state.current]; return !!last && !!c && normalizeKey(last) === normalizeKey(c); })()}
```

`PromptScreen` gets `canClaim={isToday}` and `onClaim={claim}`.

- [ ] **Step 6: Run** full `npx vitest run`, `npx tsc --noEmit`, `npm run lint`. Expect PASS.

- [ ] **Step 7: Commit** `feat(dig): fairer wording for words we don't know, claim at the point of rejection`.

---

### Task 4: Phone end screen, expired challenge links, email offer

**Files:**
- Modify: `components/dig/EndScreen.tsx`, `components/dig/DigGame.tsx`, `lib/dig/challenge.ts`, `lib/dig/copyAudit.test.tsx`
- Test: `lib/dig/challenge.test.ts`, `components/dig/EndScreen.test.tsx`

**Interfaces:**
- Produces: `staleChallengeLine(raw: string | null, n: number): string | null`.

- [ ] **Step 1: Write failing tests.** `lib/dig/challenge.test.ts`:

```ts
describe("staleChallengeLine", () => {
  const code = "12.012345-".slice(0, 3) + "01234-0";
  it("names the earlier day", () => {
    expect(staleChallengeLine(code, 14)).toBe("A friend played this on day 12. Today's dig is ready.");
  });
  it("is silent for today's link, a future day, junk or nothing", () => {
    expect(staleChallengeLine(code, 12)).toBeNull();
    expect(staleChallengeLine(code, 11)).toBeNull();
    expect(staleChallengeLine("nonsense", 14)).toBeNull();
    expect(staleChallengeLine(null, 14)).toBeNull();
  });
});
```

`EndScreen.test.tsx`: the end-screen HTML for today contains `Tomorrow&#x27;s first prompt, by email`, and the rollover line appears before `Today&#x27;s word on Curio`. Add `staleChallengeLine("12.01234-0", 14)` to `copyAudit.test.tsx`'s surfaces.

- [ ] **Step 2: Run them, expect FAIL.**

- [ ] **Step 3: `lib/dig/challenge.ts`:**

```ts
/** What an old challenge link says instead of going quiet. Links expire at midnight UTC, which is
 * early evening in the US, so this is common. */
export function staleChallengeLine(raw: string | null, n: number): string | null {
  const m = raw?.match(/^(\d{1,5})\.([0-5-]+)$/);
  if (!m || m[2].length !== PROMPTS_PER_DAY || Number(m[1]) >= n) return null;
  return `A friend played this on day ${Number(m[1])}. Today's dig is ready.`;
}
```

- [ ] **Step 4: `components/dig/DigGame.tsx`:** `challenge={friend ? challengeLine(friend) : isToday ? staleChallengeLine(vsRaw, day.number) : null}`.

- [ ] **Step 5: `components/dig/EndScreen.tsx`.** Add near `useRolloverLine`:

```ts
/** Phone width (matches Tailwind's sm breakpoint). False on the server and at hydration. */
function useNarrow(): boolean {
  return useSyncExternalStore(noSubscribe, () => !!window.matchMedia?.("(max-width: 639px)").matches, () => false);
}
```

Then:
1. The drawing wrapper renders only when `!(narrow && friend)`, because a challenge recipient on a phone already sees both digs in the comparison, and it uses `height={narrow ? 160 : 240}`.
2. Move `<TomorrowHint isToday={isToday} hint={day.tomorrow} />` out of the `<ul>` (remove its `<li>`) to directly after the `{isToday && <p ...>{rollover}</p>}` line, wrapped in `<div className="mt-2 empty:hidden">`.
3. Replace the `SignupOffer` pitch:

```tsx
<h2 className="font-display text-2xl">Tomorrow&apos;s first prompt, by email</h2>
<p className="mt-2 font-sans text-base text-ink-soft">One short email each morning: the day&apos;s word, its story and the dig&apos;s first prompt.</p>
```

- [ ] **Step 6: Run** full `npx vitest run`, `npx tsc --noEmit`, `npm run lint`. Expect PASS.

- [ ] **Step 7: Commit** `feat(dig): tighter phone end screen, expired challenge links, email offer for tomorrow's dig`.
