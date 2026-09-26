# One Shared Word Per Day Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every surface (home, `/history`, `/collection`, the story-page date, the daily digest, `/play`, Bluesky) shows the same shared calendar word on a given date, for anonymous visitors and accounts alike, resolved through one clock. Accounts keep a History of the shared days since they joined, plus synced favourites.

**Architecture:** A new `lib/day.ts` is the one clock (UTC day key + UTC date formatting) every surface uses. A new locked-range resolver, `resolveHistorySince(joinedAt, today)`, sits beside `resolveHistory`; both read the same `curio:wordoftheday:<date>` Redis locks, so an account and an anonymous visitor structurally can't diverge. Every call site of the per-account rotation switches to the shared resolvers, then the rotation code is deleted — but its Redis data (`curio:user:<id>:wordFor:<date>`) is left in place, unread, as a cheap revert path. `/play` additionally avoids the next 30 shared days. A one-off script (dry-run by default, backup first, idempotent) resets the two existing accounts' `joinedAt` to the cutover date.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest, `@upstash/redis`, `tsx` for scripts.

**Spec:** the Phase 1 brief plus the owner's 2026-09-26 amendments, restated under "Brief" below (both live in the user's chat, not the repo).

## Brief (decisions already made — do not re-litigate)

- **Option A, shared word for everyone.** Drop the per-account shuffled rotation, including the slot-0 join-day pin.
- History for an account = the shared words from its join date to today, as a **neutral dated list**: no read/unread state, no counts, no "X of N", no "you missed", no "you read" wording.
- Favourites keep syncing (untouched).
- Remove `getPersonalOrder`, `getWordForUser`, `getHistoryForUser`, their `resolve*` wrappers and `getDigestWordForSubscriber`/`resolveDigestWordForSubscriber`, with their tests. **Do not delete the per-account Redis data** (`curio:user:<id>:wordFor:<date>`) — stop reading/writing it; `handover.md` notes it can be dropped in a later cleanup.
- Copy audit: any UI/email/account wording implying a personal word becomes "today's word". Every changed string is listed in the task report.
- `/play` avoids shared daily words from the last 30 days **and the next 30 days**.
- One clock: home, the digest, the Bluesky post, the puzzle, story-page dates and History all derive "today" and format dates through one function, tested at the day boundary.
- Consistency tests: for a given date, signed-out home, signed-in home, the digest (anonymous and account-holder subscriber), the Bluesky post payload and the story-page date label all resolve to the same word. Past shared dates are immutable.
- Existing accounts: reset `joinedAt` to the cutover date via a **one-off script** (dry-run mode, backup first, idempotent, never touches favourites). The real run happens **only after the owner has seen the dry-run output and confirmed.** Accepted side effect: the admin portal shows both accounts joining on the cutover date.
- `/history` stays in the sitemap.
- Write the **archive-vs-backlog** principle, a dated **Decisions** entry (A over B, with reasons) and the **revisit triggers** into `handover.md`; the principle also goes in `AGENTS.md` (`CLAUDE.md` is just `@AGENTS.md`).

## Global Constraints

- npm only. Run `npx vitest run`, `npm run lint`, `npm run build` from the root of whichever checkout you're working in.
- A "day" is a **UTC calendar date**. Derive it with `dayKey()` and format it with `formatDay()` from `lib/day.ts` (Task 1) — never a bare `toLocaleDateString`/`toISOString().slice(0, 10)` in `app/`, `components/` or `lib/` outside `lib/day.ts`.
- Resolve words through the **locking layer** (`resolveTodayWord` / `resolveWordForDate` / `resolveHistory` / `resolveHistorySince`), never raw `getWordForDate`/`getHistory`, in anything under `app/`.
- Match the existing code style: short *why* comments, design tokens only (`docs/design-system.md`).
- Nothing under `app/story/[slug]/page.tsx` may call `auth()`, `cookies()`, `headers()` or Redis — the page must stay SSG (`●` in the build route table).
- Local dev points at the **production** Upstash. Never run the reset script with `--apply` outside Task 9, and only after the owner confirms. Never create accounts; the owner signs in themselves in the browser pane for signed-in checks.
- Don't change `/collection`'s structure, counts or stats — see "Open question" at the end; only its data source and the one copy string in Task 3 change.
- If working in a worktree under `.claude/worktrees/`, remove it before running lint/tests from the main checkout (see `handover.md`, 2026-09-12 session).

## File map

| File | Change |
|---|---|
| `lib/day.ts` + `.test.ts` (new) | The one clock: `dayKey`, `dayStart`, `formatDay`, `DAY_MS`. |
| `lib/words.ts` | Use the clock; `resolveTodayWord(now?)`; add `resolveHistorySince`; delete the personal rotation (Task 6). |
| `lib/wordsLocking.test.ts`, `lib/words.test.ts` | New range + immutability tests; delete rotation tests. |
| `app/page.tsx`, `components/HomeContent.tsx`, `components/TodayHero.tsx` | Shared word for everyone; "Today's word · {date}" label. |
| `app/history/page.tsx`, `components/HistoryList.tsx` | "My days" from `resolveHistorySince`; neutral copy; UTC date labels. |
| `app/collection/page.tsx`, `components/CollectionScreen.tsx`, `lib/collection.ts` | Data source + one copy string + `formatDay`. |
| `components/EmailSignupInline.tsx` | Copy string. |
| `app/api/story/[slug]/date/route.ts` | Shared date only, `formatDay`. |
| `app/api/cron/send-daily/route.ts` + `route.test.ts` (new), `lib/email.ts`, `lib/auth.ts` | Shared word to every subscriber; one clock; delete `getUserIdByEmail`. |
| `lib/puzzle.ts`, `lib/puzzle.test.ts`, `components/PuzzleGame.tsx`, `app/play/page.tsx` | Next-30-days exclusion; one clock. |
| `app/sharedDay.test.ts` (new) | Cross-surface consistency suite. |
| `lib/userData.ts`, `scripts/approveDraft.ts`, `app/story/[slug]/page.tsx` | Comment-only updates. |
| `scripts/resetJoinedAt.ts` + `.test.ts` (new), `.gitignore` | One-off reset script; `backups/` ignored. |
| `AGENTS.md`, `handover.md` | Principle, Decisions, revisit triggers, reversal record. |

---

### Task 1: One clock — `lib/day.ts`

**Files:**
- Create: `lib/day.ts`, `lib/day.test.ts`
- Modify: `lib/words.ts` (replace its local `DAY_MS`; route `wordOfDayKey` date strings and `resolveTodayWord` through the clock)

**Interfaces:**
- Produces:
  - `DAY_MS: number`
  - `dayKey(at?: Date): string` — UTC `YYYY-MM-DD`
  - `dayStart(key: string): Date` — 00:00:00Z of that day
  - `LONG_DAY: Intl.DateTimeFormatOptions` — `{ weekday: "long", month: "long", day: "numeric" }`
  - `formatDay(key: string, options?: Intl.DateTimeFormatOptions): string` — `en-US`, always `timeZone: "UTC"`, default `LONG_DAY`
  - `resolveTodayWord(now?: Date): Promise<WordEntry>` (signature widened; default `new Date()`)

- [ ] **Step 1: Write the failing test** — `lib/day.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dayKey, dayStart, formatDay } from "./day";

describe("the one clock", () => {
  // A viewer west of Greenwich is exactly where a missing timeZone:"UTC"
  // shows the previous day — run these under one to prove it can't.
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/Los_Angeles";
  });
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("rolls over at 00:00 UTC, not at local midnight", () => {
    expect(dayKey(new Date("2026-09-26T23:59:59.999Z"))).toBe("2026-09-26");
    expect(dayKey(new Date("2026-09-27T00:00:00.000Z"))).toBe("2026-09-27");
  });

  it("formats a day as its UTC date for a viewer west of UTC", () => {
    expect(formatDay("2026-09-26")).toBe("Saturday, September 26");
    expect(formatDay("2026-09-26", { month: "short", day: "numeric" })).toBe("Sep 26");
  });

  it("dayStart and dayKey round-trip", () => {
    expect(dayStart("2026-09-26").toISOString()).toBe("2026-09-26T00:00:00.000Z");
    expect(dayKey(dayStart("2026-09-26"))).toBe("2026-09-26");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/day.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `lib/day.ts`:

```ts
/** Curio's one clock. A "day" is a UTC calendar date: the word changes at
 * 00:00 UTC for everyone, and home, the digest, Bluesky, /play, story-page
 * dates and History all derive "today" and format dates through here, so
 * no two surfaces can disagree at the boundary. */

export const DAY_MS = 24 * 60 * 60 * 1000;

export const LONG_DAY: Intl.DateTimeFormatOptions = {
  weekday: "long",
  month: "long",
  day: "numeric",
};

export function dayKey(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

export function dayStart(key: string): Date {
  return new Date(key + "T00:00:00Z");
}

/** Always formats in UTC — without it, a viewer west of Greenwich sees a
 * UTC-midnight date as the previous evening's. */
export function formatDay(key: string, options: Intl.DateTimeFormatOptions = LONG_DAY): string {
  return dayStart(key).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}
```

In `lib/words.ts`: `import { DAY_MS, dayKey } from "./day";` and delete the local `const DAY_MS = …`. Replace every `x.toISOString().slice(0, 10)` in the file with `dayKey(x)`. Change `resolveTodayWord` to:

```ts
export async function resolveTodayWord(now: Date = new Date()): Promise<WordEntry> {
  return resolveWordForDate(now);
}
```

- [ ] **Step 4: Verify** — `npx vitest run` → all pass. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add lib/day.ts lib/day.test.ts lib/words.ts
git commit -m "feat: add lib/day.ts, Curio's one UTC clock"
```

---

### Task 2: `resolveHistorySince` + past-day immutability

**Files:**
- Modify: `lib/words.ts` (locking layer, `resolveHistory`)
- Test: `lib/wordsLocking.test.ts`

**Interfaces:**
- Consumes: `dayKey`, `DAY_MS` (Task 1).
- Produces: `resolveHistorySince(joinedAt: Date, today?: Date): Promise<HistoryDay[]>` — shared-calendar days from `joinedAt` (clamped to 2026-01-01) through `today`, newest first, through the same `curio:wordoftheday:<date>` locks as `resolveHistory`. `[]` if `joinedAt` is after `today`.

- [ ] **Step 1: Write the failing tests** — add `resolveHistorySince` and `daysSinceStart` to the destructured `await import("./words")` at the top of `lib/wordsLocking.test.ts`, then append:

```ts
describe("resolveHistorySince (an account's History)", () => {
  it("covers exactly the shared days from the join date through today, newest first", async () => {
    const history = await resolveHistorySince(
      new Date("2026-01-03T00:00:00Z"),
      new Date("2026-01-05T00:00:00Z")
    );
    expect(history.map((d) => d.date)).toEqual(["2026-01-05", "2026-01-04", "2026-01-03"]);
  });

  it("returns nothing when the join date is after today", async () => {
    const history = await resolveHistorySince(
      new Date("2026-01-06T00:00:00Z"),
      new Date("2026-01-05T00:00:00Z")
    );
    expect(history).toEqual([]);
  });

  it("gives an account the same word an anonymous visitor gets, day by day", async () => {
    const today = new Date("2026-01-06T00:00:00Z");
    const account = await resolveHistorySince(new Date("2026-01-02T00:00:00Z"), today);
    const anonymous = await resolveHistory(today);
    for (const day of account) {
      expect(day.word).toEqual(anonymous.find((d) => d.date === day.date)!.word);
    }
    expect(account[0].word).toEqual(await resolveWordForDate(today));
  });

  it("honours the same shared lock as anonymous visitors, even when it disagrees with live computation", async () => {
    // Proves both paths read one Redis key rather than merely computing the
    // same formula — a content batch that shifts getWordForDate can't split them.
    const today = new Date("2026-01-05T00:00:00Z");
    const lockedWord = WORDS.find((w) => w.slug !== getWordForDate(today).slug)!;
    fakeRedis.store.set("curio:wordoftheday:2026-01-05", lockedWord.slug);

    const account = await resolveHistorySince(new Date("2026-01-01T00:00:00Z"), today);
    expect(account[0].word).toEqual(lockedWord);
    expect(await resolveWordForDate(today)).toEqual(lockedWord);
  });
});

describe("past shared days are immutable", () => {
  const today = new Date("2026-01-10T00:00:00Z");

  function restore(original: typeof WORDS) {
    WORDS.splice(0, WORDS.length, ...original);
  }

  it("once served, a past date's word survives any reordering of the word bank", async () => {
    const before = await resolveHistory(today);
    const original = WORDS.slice();
    WORDS.reverse();
    try {
      expect(await resolveHistory(today)).toEqual(before);
    } finally {
      restore(original);
    }
  });

  it("reordering only slots after today leaves every past date's pick unchanged, locked or not", () => {
    const todayIndex = daysSinceStart(today);
    const pastBefore = Array.from({ length: todayIndex + 1 }, (_, i) =>
      getWordForDate(new Date(Date.UTC(2026, 0, 1 + i))).slug
    );
    const original = WORDS.slice();
    const future = WORDS.splice(todayIndex + 1);
    WORDS.push(...future.reverse());
    try {
      const pastAfter = Array.from({ length: todayIndex + 1 }, (_, i) =>
        getWordForDate(new Date(Date.UTC(2026, 0, 1 + i))).slug
      );
      expect(pastAfter).toEqual(pastBefore);
    } finally {
      restore(original);
    }
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run lib/wordsLocking.test.ts` → FAIL (`resolveHistorySince is not a function`). The two immutability tests may already pass — that's fine; they pin existing behaviour.

- [ ] **Step 3: Implement** — replace `resolveHistory` in `lib/words.ts` with:

```ts
/** Every shared-calendar day from `from` (clamped to START_DATE) through
 * `today`, most recent first, each resolved through the same
 * curio:wordoftheday lock — the one code path both anonymous History and an
 * account's History read, so the two can't drift apart. */
async function resolveSharedRange(from: Date, today: Date): Promise<HistoryDay[]> {
  const first = Math.max(0, daysSinceStart(from));
  const last = daysSinceStart(today);
  const dates: Date[] = [];
  for (let i = last; i >= first; i--) dates.push(new Date(START_DATE + i * DAY_MS));

  const words = await resolveLockedMany(
    dates.map((d) => ({ key: wordOfDayKey(dayKey(d)), compute: () => getWordForDate(d) }))
  );
  return dates.map((d, i) => ({ date: dayKey(d), word: words[i] }));
}

/** Stable counterpart to getHistory. */
export async function resolveHistory(today: Date = new Date()): Promise<HistoryDay[]> {
  return resolveSharedRange(new Date(START_DATE), today);
}

/** An account's History: the shared days since it joined. Starts at the
 * join date on purpose — earlier days would be manufactured history for
 * days the account never experienced. */
export async function resolveHistorySince(
  joinedAt: Date,
  today: Date = new Date()
): Promise<HistoryDay[]> {
  return resolveSharedRange(joinedAt, today);
}
```

- [ ] **Step 4: Verify** — `npx vitest run lib/wordsLocking.test.ts` → PASS (pre-existing `resolveHistory` tests unchanged).

- [ ] **Step 5: Commit**

```bash
git add lib/words.ts lib/wordsLocking.test.ts
git commit -m "feat: add resolveHistorySince and pin past-day immutability"
```

---

### Task 3: Pages read the shared calendar + copy audit

**Files:**
- Modify: `app/page.tsx`, `components/HomeContent.tsx`, `components/TodayHero.tsx`
- Modify: `app/history/page.tsx`, `components/HistoryList.tsx`
- Modify: `app/collection/page.tsx`, `components/CollectionScreen.tsx`, `lib/collection.ts`
- Modify: `components/EmailSignupInline.tsx`
- Modify: `app/api/story/[slug]/date/route.ts`, `app/story/[slug]/page.tsx` (comment)

**Interfaces:**
- Consumes: `resolveHistorySince` (Task 2); `dayKey`, `formatDay` (Task 1).
- Produces: `HomeContent` / `TodayHero` props are `{ word: WordEntry; date: string }` (no `isPersonalized`). `/api/story/[slug]/date` returns `{ date: string | null }` where `date` is `formatDay(<day key>)`.

**Copy changes (the complete list from the audit — report each in the task summary):**

| Where | Before | After |
|---|---|---|
| `components/TodayHero.tsx` (signed-in) | `Your word · {date}` | `Today's word · {date}` |
| `components/TodayHero.tsx` (signed-out) | `{date}` | `Today's word · {date}` |
| `components/HistoryList.tsx` "My days" note | `Your personal word order — one new word a day since you joined. It'll grow day by day; browse all words in the meantime.` | `Each day's word since you joined. Browse all words any time.` ("all words" stays the link to the All tab) |
| `components/CollectionScreen.tsx` empty state | `Your first word arrives tomorrow morning.` | `Tomorrow's word arrives in the morning.` |
| `components/EmailSignupInline.tsx` success | `You're in. Your first word arrives tomorrow.` | `You're in. Tomorrow's word arrives in the morning.` |

The audit found **no** personal-word wording in `lib/email.ts` (digest and sign-in templates), `app/account/*`, `app/login/page.tsx`, `components/ArrivalHero.tsx` or `components/Header.tsx`. Re-run `git grep -niE "your (word|rotation|daily|personal)|personal (word|order|rotation)" -- app components lib` at the end of this task: expected no matches outside `lib/words.ts` content and tests.

- [ ] **Step 1: Home** — `app/page.tsx`:

```tsx
import { after } from "next/server";
import HomeContent from "@/components/HomeContent";
import ServerSessionMarker from "@/components/ServerSessionMarker";
import { auth } from "@/lib/auth";
import { dayKey, formatDay } from "@/lib/day";
import { recordUserSeen } from "@/lib/userData";
import { resolveTodayWord } from "@/lib/words";

export default async function TodayPage() {
  const session = await auth();
  if (session?.user?.id) after(() => recordUserSeen(session.user.id));
  // One shared word for everyone, signed in or not — the "did you see
  // today's word?" conversation depends on it.
  const now = new Date();
  const word = await resolveTodayWord(now);

  return (
    <>
      <ServerSessionMarker signedIn={!!session?.user?.id} />
      <HomeContent word={word} date={formatDay(dayKey(now))} />
    </>
  );
}
```

`components/HomeContent.tsx`: remove `isPersonalized` from props/destructuring; render `<TodayHero word={word} date={date} />`.
`components/TodayHero.tsx`: remove `isPersonalized` from props; the label line becomes `Today&apos;s word &middot; {date}`.

- [ ] **Step 2: History** — `app/history/page.tsx`: import `resolveHistorySince` instead of `resolveHistoryForUser`, and:

```ts
  const personalEntries = joinedAtStr
    ? toPreview(await resolveHistorySince(new Date(joinedAtStr + "T00:00:00Z")))
    : null;
```

`components/HistoryList.tsx`:
- `personalEntries` doc comment → `/** The shared words since this account joined, one entry per day (lib/words.ts's resolveHistorySince). Null when signed out. */`
- The "mine" note becomes:

```tsx
          Each day&apos;s word since you joined. Browse{" "}
          <Button variant="link" className="inline" onClick={() => setFilter("all")}>all words</Button> any time.
```
- `groupByMonth`'s label and the row's `displayDate` switch to the clock (fixes an off-by-one for viewers west of UTC — both currently omit `timeZone`):

```ts
    const label = formatDay(entry.date, { month: "long", year: "numeric" });
```
```ts
              const displayDate = formatDay(date, { month: "short", day: "numeric" });
```
(import `formatDay` from `@/lib/day`).

- [ ] **Step 3: Collection** — `app/collection/page.tsx`: import `resolveHistorySince`, and:

```ts
  const entries = joinedAtStr
    ? await resolveHistorySince(new Date(joinedAtStr + "T00:00:00Z"))
    : [];
```

`components/CollectionScreen.tsx`: the `entries` doc comment → `/** The shared words since this account joined, newest first (lib/words.ts's resolveHistorySince). */`; the empty-state copy per the table. `lib/collection.ts`: route its two `toLocaleDateString` calls through `formatDay` with the same options (they already use UTC — this is for the one-clock rule, output unchanged).

- [ ] **Step 4: Signup copy** — `components/EmailSignupInline.tsx` per the table.

- [ ] **Step 5: Story date route** — `app/api/story/[slug]/date/route.ts`:

```ts
import { NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { formatDay } from "@/lib/day";
import { recordUserSeen } from "@/lib/userData";
import { getWordBySlug, resolveHistory } from "@/lib/words";

/** The "featured on <date>" line for a story page, and the recordUserSeen
 * side effect that used to fire from the page body.
 *
 * This lives behind a request rather than in app/story/[slug]/page.tsx
 * because that page must never call auth() — reading cookies there forces
 * all 1,147 story pages to render dynamically. See docs/superpowers/specs/
 * 2026-09-20-search-discoverability-design.md.
 *
 * The date is the shared calendar's, the same for every visitor (no
 * per-account rotation since 2026-09-26); auth() is only here for
 * recordUserSeen. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getWordBySlug(slug)) {
    return NextResponse.json({ date: null }, { status: 404 });
  }

  const session = await auth();
  if (session?.user?.id) after(() => recordUserSeen(session.user.id));
  const historyEntry = (await resolveHistory()).find((d) => d.word.slug === slug);
  const date = historyEntry ? formatDay(historyEntry.date) : null;

  // Every request must reach the function so recordUserSeen fires for
  // signed-in visitors — never let a CDN answer this.
  return NextResponse.json({ date }, { headers: { "Cache-Control": "private, no-store" } });
}
```

`app/story/[slug]/page.tsx`: comment "(the personalized date, recordUserSeen)" → "(the featured-on date, recordUserSeen)".

- [ ] **Step 6: Verify** — `npx vitest run` (all pass), `npx tsc --noEmit` (clean), `npm run lint` (only the 3 pre-existing warnings: `lib/puzzle.test.ts:3`, `scripts/approveDraft.test.ts:36,211`), and the copy `git grep` above.

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx components/HomeContent.tsx components/TodayHero.tsx app/history/page.tsx components/HistoryList.tsx app/collection/page.tsx components/CollectionScreen.tsx lib/collection.ts components/EmailSignupInline.tsx "app/api/story/[slug]/date/route.ts" "app/story/[slug]/page.tsx"
git commit -m "feat: every page reads the shared calendar; drop personal-word copy"
```

---

### Task 4: The digest sends the shared word to every subscriber

**Files:**
- Modify: `app/api/cron/send-daily/route.ts`, `lib/email.ts:100-105`, `lib/auth.ts` (delete `getUserIdByEmail`)
- Create: `app/api/cron/send-daily/route.test.ts`

**Interfaces:**
- Consumes: `resolveTodayWord(now)` (Task 1), `dayKey`, `formatDay`.
- Produces: cron JSON `{ word, attempted, sent, failed, bluesky }` (no `personalized`).

- [ ] **Step 1: Write the failing test** — `app/api/cron/send-daily/route.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const sharedWord = { slug: "custard", word: "custard" };

vi.mock("@/lib/words", () => ({ resolveTodayWord: vi.fn(async () => sharedWord) }));
vi.mock("@/lib/db", () => ({
  // An anonymous subscriber and one whose address also has an account —
  // both must get the same word.
  getAllSubscribers: vi.fn(async () => ["anon@example.com", "account-holder@example.com"]),
}));
vi.mock("@/lib/email", () => ({ sendDailyDigest: vi.fn(async () => undefined) }));
vi.mock("@/lib/bluesky", () => ({ postDailyWordToBluesky: vi.fn(async () => ({ posted: true })) }));

const { GET } = await import("./route");
const { resolveTodayWord } = await import("@/lib/words");
const { sendDailyDigest } = await import("@/lib/email");
const { postDailyWordToBluesky } = await import("@/lib/bluesky");

function cronRequest() {
  return new NextRequest("http://localhost/api/cron/send-daily", {
    headers: { authorization: "Bearer test-secret" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
});

describe("GET /api/cron/send-daily", () => {
  it("sends every subscriber, account or not, the shared word — the same one Bluesky posts", async () => {
    const body = await (await GET(cronRequest())).json();

    expect(sendDailyDigest).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(sendDailyDigest).mock.calls) expect(call[1]).toBe(sharedWord);
    expect(vi.mocked(postDailyWordToBluesky).mock.calls[0][0]).toBe(sharedWord);
    expect(body).toEqual({ word: "custard", attempted: 2, sent: 2, failed: 0, bluesky: true });
  });

  it("resolves the word and dates every send from one instant", async () => {
    await GET(cronRequest());
    const now = vi.mocked(resolveTodayWord).mock.calls[0][0];
    for (const call of vi.mocked(sendDailyDigest).mock.calls) expect(call[2]).toBe(now);
    expect(vi.mocked(postDailyWordToBluesky).mock.calls[0][1]).toBe(now);
  });

  it("rejects a request without the cron secret", async () => {
    const res = await GET(new NextRequest("http://localhost/api/cron/send-daily"));
    expect(res.status).toBe(401);
    expect(sendDailyDigest).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run app/api/cron/send-daily/route.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `app/api/cron/send-daily/route.ts` (keep the first line `import { NextRequest, NextResponse } from "next/server";`, replace the rest):

```ts
import { getAllSubscribers } from "@/lib/db";
import { sendDailyDigest } from "@/lib/email";
import { postDailyWordToBluesky } from "@/lib/bluesky";
import { resolveTodayWord } from "@/lib/words";

/** Configured in vercel.json to run once a day at 0 9 * * * (9am UTC) — the
 * Vercel Hobby plan caps cron at once/day, so there is no per-hour bucket
 * to honor here even though Subscriber still carries an `hour` field
 * (vestigial — see lib/db.ts). Every subscriber — anonymous or an account
 * holder — gets the one shared word, the same word the site shows everyone
 * today and the same run posts to Bluesky, all resolved from one `now`. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 401 });
  }
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const word = await resolveTodayWord(now);
  const subscribers = await getAllSubscribers();

  const [emailResults, blueskyResult] = await Promise.allSettled([
    Promise.allSettled(subscribers.map((email) => sendDailyDigest(email, word, now))),
    postDailyWordToBluesky(word, now),
  ]);

  const emailOutcomes = emailResults.status === "fulfilled" ? emailResults.value : [];
  const sent = emailOutcomes.filter((r) => r.status === "fulfilled").length;
  const failed = emailOutcomes.length - sent;
  const bluesky =
    blueskyResult.status === "fulfilled" ? blueskyResult.value.posted : false;

  return NextResponse.json({ word: word.slug, attempted: emailOutcomes.length, sent, failed, bluesky });
}
```

`lib/email.ts`'s `sendDailyDigest`: replace the `date.toLocaleDateString(...)` block with `const dateStr = formatDay(dayKey(date));` (import from `./day`).
`lib/auth.ts`: delete `getUserIdByEmail` and its doc comment; `getUserEmail`'s doc comment opening "The reverse lookup of getUserIdByEmail — an account's email address" → "An account's email address".

- [ ] **Step 4: Verify** — the new test passes; `npx vitest run` all pass (incl. `lib/email.test.ts`); `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/send-daily/route.ts app/api/cron/send-daily/route.test.ts lib/email.ts lib/auth.ts
git commit -m "feat: daily digest sends every subscriber the shared word"
```

---

### Task 5: `/play` avoids the last 30 and the next 30 shared days; one clock

**Files:**
- Modify: `lib/puzzle.ts`, `lib/puzzle.test.ts`, `components/PuzzleGame.tsx:20-22`, `app/play/page.tsx` (comment), `app/play/opengraph-image.tsx` (comment)

**Interfaces:**
- Consumes: `DAY_MS`, `dayKey`, `dayStart` (Task 1).
- Produces: `export const PUZZLE_MIN_DAYS_UNTIL_SHOWN = 30;` `getTodayPuzzle(now?: Date): Puzzle | null`. Structural pool size becomes `words.length − 60` (29 past days + today + 30 future days excluded).

- [ ] **Step 1: Resize the fixtures and write the failing test** — in `lib/puzzle.test.ts`:
  - `LARGE_WORD_LIST` length `40` → `70` (pool stays exactly `PUZZLE_MIN_POOL_SIZE` = 10); `BELOW_MIN_POOL_WORD_LIST` `35` → `65` (pool 5); `ABOVE_MIN_POOL_WORD_LIST` `41` → `71` (pool 11). Update every comment that states those sizes or the `words.length - 30` pool formula. Keep `SMALL_WORD_LIST` (5) and the 3,000-word perf test as they are.
  - The 200-day variety test's threshold ("30 of 40") becomes "30 of 70" — keep the `>= 30` assertion. If it fails at the new size, **stop and report** rather than loosening it.
  - Add `PUZZLE_MIN_DAYS_UNTIL_SHOWN` to the imports and append inside `describe("getEligiblePuzzleWords")`:

```ts
  it("excludes every word scheduled as the daily word in the next PUZZLE_MIN_DAYS_UNTIL_SHOWN days", () => {
    const today = new Date("2026-06-01T00:00:00Z");
    const pool = getEligiblePuzzleWords(today, LARGE_WORD_LIST).map((w) => w.slug);
    expect(pool.length).toBeGreaterThan(0);
    for (let i = 1; i <= PUZZLE_MIN_DAYS_UNTIL_SHOWN; i++) {
      const day = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
      const n = LARGE_WORD_LIST.length;
      const upcoming = LARGE_WORD_LIST[((daysSinceStart(day) % n) + n) % n];
      expect(pool).not.toContain(upcoming.slug);
    }
  });

  it("with the real word bank, never picks a shared daily word from the last or next 30 days", () => {
    const today = new Date("2026-09-26T00:00:00Z");
    const pool = new Set(getEligiblePuzzleWords(today).map((w) => w.slug));
    for (let i = -29; i <= PUZZLE_MIN_DAYS_UNTIL_SHOWN; i++) {
      const day = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
      expect(pool.has(getWordForDate(day).slug)).toBe(false);
    }
  });
```
  (import `getWordForDate` from `./words` if not already imported.)

- [ ] **Step 2: Run to verify it fails** — `npx vitest run lib/puzzle.test.ts` → FAIL (the two new tests; resized-fixture tests may also fail until Step 3).

- [ ] **Step 3: Implement** in `lib/puzzle.ts`:
  - `import { DAY_MS, dayKey, dayStart } from "./day";` and delete the local `DAY_MS`.
  - Add, under `PUZZLE_MIN_DAYS_SINCE_SHOWN`:

```ts
/** …and at least this many days before it next runs as the shared daily
 * word — so the puzzle can't spoil tomorrow's word either. Only possible
 * because everyone shares one schedule (2026-09-26). */
export const PUZZLE_MIN_DAYS_UNTIL_SHOWN = 30;

function upcomingSlugs(today: Date, words: WordEntry[]): Set<string> {
  const slugs = new Set<string>();
  for (let i = 1; i <= PUZZLE_MIN_DAYS_UNTIL_SHOWN; i++) {
    slugs.add(wordForDateFrom(words, new Date(today.getTime() + i * DAY_MS)).slug);
  }
  return slugs;
}
```
  - In `getEligiblePuzzleWords`, compute `const upcoming = upcomingSlugs(today, words);` and add `if (upcoming.has(w.slug)) return false;` as the second line of the filter.
  - Replace the whole "Scope note:" paragraph of its doc comment with: `Scope note: both windows are checked against getWordForDate's calendar rotation, which since 2026-09-26 is the one word every visitor, account and digest recipient sees — so the guarantee holds for every player.` Update `PUZZLE_MIN_POOL_SIZE`'s comment: the structural pool size is now `words.length - PUZZLE_MIN_DAYS_SINCE_SHOWN - PUZZLE_MIN_DAYS_UNTIL_SHOWN`, validated against a 70-word synthetic bank. In `getPuzzleForDate`'s doc comment change "(same hashSeed/mulberry32 PRNG lib/words.ts uses for per-account personalization)" to "(lib/words.ts's hashSeed/mulberry32 PRNG)".
  - `getTodayPuzzle`:

```ts
export function getTodayPuzzle(now: Date = new Date()): Puzzle | null {
  return getPuzzleForDate(dayStart(dayKey(now)));
}
```
  - `components/PuzzleGame.tsx`: `todayDateString()` returns `dayKey()` (import from `@/lib/day`; `lib/day.ts` has no server imports, safe in a client component).
  - `app/play/page.tsx` / `app/play/opengraph-image.tsx`: "(via `new Date()`)" in the comments → "(via lib/day.ts's clock)".

- [ ] **Step 4: Verify** — `npx vitest run lib/puzzle.test.ts` → PASS; full `npx vitest run` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/puzzle.ts lib/puzzle.test.ts components/PuzzleGame.tsx app/play/page.tsx app/play/opengraph-image.tsx
git commit -m "feat: puzzle avoids the next 30 shared days too; one clock"
```

---

### Task 6: Delete the per-account rotation code (keep its Redis data)

**Files:**
- Modify: `lib/words.ts` — delete `getPersonalOrder` (incl. the slot-0 anchor pin), `getDigestWordForSubscriber`, `daysBetweenUtcMidnights`, `getWordForUser`, `getHistoryForUser`, `userWordKey`, `resolveWordForUser`, `resolveHistoryForUser`, `resolveDigestWordForSubscriber`. **Keep** `hashSeed` and `mulberry32` (`lib/puzzle.ts` uses them).
- Modify: `lib/words.test.ts`, `lib/wordsLocking.test.ts`
- Modify (comments): `lib/userData.ts:8-10`, `scripts/approveDraft.ts:56-57` and `:127`

- [ ] **Step 1: Confirm no callers remain**

Run: `git grep -nE "getPersonalOrder|getWordForUser|getHistoryForUser|resolveWordForUser|resolveHistoryForUser|DigestWordForSubscriber|userWordKey|getUserIdByEmail" -- app components lib scripts`
Expected: only `lib/words.ts`, `lib/words.test.ts`, `lib/wordsLocking.test.ts`, and comments in `scripts/approveDraft.ts`. Anything else → stop and fix that call site first.

- [ ] **Step 2: Delete the tests** — `lib/words.test.ts`: remove the `getPersonalOrder`, `getWordForUser`, `getHistoryForUser` and `getDigestWordForSubscriber` describe blocks and their imports. `lib/wordsLocking.test.ts`: remove the `resolveWordForUser / resolveHistoryForUser` and `resolveDigestWordForSubscriber` describe blocks and their destructured imports.

- [ ] **Step 3: Delete the code** (list above). `hashSeed`'s doc comment: "a stable per-user seed so the same account always gets the same shuffle back" → "a stable seed for lib/puzzle.ts's per-day pick". In the locking-layer header comment delete the four lines starting "getPersonalOrder is worse:", change "the first time a given date (or account-day) is resolved" → "the first time a given date is resolved", and add:

```ts
// Accounts used to have their own per-account locks too
// (curio:user:<id>:wordFor:<date>) — removed with the per-account rotation
// on 2026-09-26. Those Redis keys are deliberately left in place, unread,
// as a cheap revert path; see handover.md before deleting them.
```

- [ ] **Step 4: Comments elsewhere** — `lib/userData.ts` `recordUserJoined`: "used to anchor its personalized word rotation" → "which marks where the account's History starts". `scripts/approveDraft.ts`: "inside getHistoryForUser" → "inside getHistory"; "(getWordBySlug, getPersonalOrder, …)" → "(getWordBySlug, getRelatedWords, …)".

- [ ] **Step 5: Verify** — Step 1 `git grep` → no matches. `npx vitest run` → all pass (note the new total). `npx tsc --noEmit` clean. `npm run lint` → same 3 warnings. `npm run build` → `● /story/[slug]` (1,147 paths), `○ /words`; `/` and `/api/story/[slug]/date` stay `ƒ`. Then `rm -rf .next`.

- [ ] **Step 6: Commit**

```bash
git add lib/words.ts lib/words.test.ts lib/wordsLocking.test.ts lib/userData.ts scripts/approveDraft.ts
git commit -m "refactor: remove the per-account word rotation code"
```

---

### Task 7: Cross-surface consistency suite

**Files:**
- Create: `app/sharedDay.test.ts`

**Interfaces:**
- Consumes: `app/page.tsx` default export, the cron and story-date `GET` handlers, `resolveWordForDate`, `formatDay`, real `lib/bluesky.ts` with a mocked `@atproto/api`.

- [ ] **Step 1: Write the test** — `app/sharedDay.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { NextRequest } from "next/server";

// Every surface that shows "today's word", driven through its real code
// path with only the edges (Redis, auth, email transport, Bluesky network)
// faked — so this fails if any one of them starts resolving the day or
// the word differently from the rest.
const { fakeRedis, session, posted } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    fakeRedis: {
      store,
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      set: vi.fn(async (k: string, v: string, o?: { nx?: boolean }) => {
        if (o?.nx && store.has(k)) return null;
        store.set(k, v);
        return "OK";
      }),
      mget: vi.fn(async (...ks: string[]) => ks.map((k) => store.get(k) ?? null)),
    },
    session: { current: null as null | { user: { id: string } } },
    posted: [] as { text: string }[],
  };
});

vi.mock("@/lib/redis", () => ({ redis: fakeRedis, usingUpstash: true }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session.current) }));
vi.mock("@/lib/userData", () => ({ recordUserSeen: vi.fn(async () => {}) }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/components/HomeContent", () => ({ default: () => null }));
vi.mock("@/components/ServerSessionMarker", () => ({ default: () => null }));
vi.mock("@/lib/db", () => ({
  getAllSubscribers: vi.fn(async () => ["anon@example.com", "account-holder@example.com"]),
}));
vi.mock("@/lib/email", () => ({ sendDailyDigest: vi.fn(async () => undefined) }));
vi.mock("@atproto/api", () => ({
  AtpAgent: class {
    login = vi.fn(async () => {});
    post = vi.fn(async (record: { text: string }) => {
      posted.push(record);
    });
  },
  RichText: class {
    text: string;
    facets = [];
    constructor({ text }: { text: string }) {
      this.text = text;
    }
    detectFacets = vi.fn(async () => {});
  },
}));

const { default: TodayPage } = await import("@/app/page");
const { GET: cron } = await import("@/app/api/cron/send-daily/route");
const { GET: storyDate } = await import("@/app/api/story/[slug]/date/route");
const { resolveWordForDate } = await import("@/lib/words");
const { sendDailyDigest } = await import("@/lib/email");
const { formatDay } = await import("@/lib/day");

type HomeTree = ReactElement<{ children: ReactElement<{ word: { slug: string } }>[] }>;

async function homeWordSlug(signedIn: boolean) {
  session.current = signedIn ? { user: { id: "user-1" } } : null;
  const tree = (await TodayPage()) as HomeTree;
  return tree.props.children[1].props.word.slug;
}

async function everySurfaceAt(iso: string) {
  vi.setSystemTime(new Date(iso));
  const signedOut = await homeWordSlug(false);
  const signedIn = await homeWordSlug(true);

  session.current = null;
  await cron(
    new NextRequest("http://localhost/api/cron/send-daily", {
      headers: { authorization: "Bearer test-secret" },
    })
  );
  const digests = vi.mocked(sendDailyDigest).mock.calls.map((c) => c[1].slug);
  const blueskyText = posted[0]?.text ?? "";

  const res = await storyDate(new Request("http://localhost"), {
    params: Promise.resolve({ slug: signedOut }),
  });
  const { date } = (await res.json()) as { date: string | null };
  return { signedOut, signedIn, digests, blueskyText, date };
}

beforeEach(() => {
  fakeRedis.store.clear();
  posted.length = 0;
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  process.env.CRON_SECRET = "test-secret";
  process.env.BLUESKY_IDENTIFIER = "curio.test";
  process.env.BLUESKY_APP_PASSWORD = "test-app-password";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("one shared word, every surface", () => {
  it.each(["2026-09-26T09:00:00.000Z", "2026-09-26T23:59:59.999Z", "2026-09-27T00:00:00.000Z"])(
    "home (signed out and in), both digests, the Bluesky post and the story date all agree at %s",
    async (iso) => {
      const expected = await resolveWordForDate(new Date(iso));
      const s = await everySurfaceAt(iso);

      expect(s.signedOut).toBe(expected.slug);
      expect(s.signedIn).toBe(expected.slug);
      expect(s.digests).toEqual([expected.slug, expected.slug]);
      expect(s.blueskyText).toContain(expected.word);
      expect(s.date).toBe(formatDay(iso.slice(0, 10)));
    }
  );

  it("every surface moves to the next word at the same instant, 00:00 UTC", async () => {
    const before = await everySurfaceAt("2026-09-26T23:59:59.999Z");
    fakeRedis.store.clear();
    posted.length = 0;
    vi.clearAllMocks();
    const after = await everySurfaceAt("2026-09-27T00:00:00.000Z");

    expect(after.signedOut).not.toBe(before.signedOut);
    expect(after.signedIn).toBe(after.signedOut);
    expect(after.digests).toEqual([after.signedOut, after.signedOut]);
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run app/sharedDay.test.ts` → PASS (Tasks 1–6 already made this true; this suite is the guard). If it fails, the failure names the surface that diverges — fix that surface, not the test. If `app/page.tsx`'s element shape differs from `children[1]`, adjust `homeWordSlug` to find the `HomeContent` element, and say so in the report.

- [ ] **Step 3: Verify** — `npx vitest run` all pass; `npx tsc --noEmit` clean; `npm run lint` same 3 warnings.

- [ ] **Step 4: Commit**

```bash
git add app/sharedDay.test.ts
git commit -m "test: every surface resolves the same word for a given date"
```

---

### Task 8: One-off `joinedAt` reset script (dry-run only in this task)

**Files:**
- Create: `scripts/resetJoinedAt.ts`, `scripts/resetJoinedAt.test.ts`
- Modify: `.gitignore` (add `/backups/`)

**Interfaces:**
- Produces: `planJoinedAtReset(joined: Record<string, string>, cutover: string, today: string): AccountPlan[]`, where `joined` maps full `curio:user:<id>:joinedAt` keys to `YYYY-MM-DD`, and `AccountPlan = { key: string; userId: string; current: string; proposed: string; changes: boolean; historyFrom: string; historyTo: string }`.

- [ ] **Step 1: Write the failing test** — `scripts/resetJoinedAt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { planJoinedAtReset } from "./resetJoinedAt";

const joined = {
  "curio:user:a:joinedAt": "2026-09-10",
  "curio:user:b:joinedAt": "2026-09-12",
};

describe("planJoinedAtReset", () => {
  it("moves earlier join dates to the cutover and reports the resulting History range", () => {
    expect(planJoinedAtReset(joined, "2026-09-27", "2026-09-27")).toEqual([
      { key: "curio:user:a:joinedAt", userId: "a", current: "2026-09-10", proposed: "2026-09-27", changes: true, historyFrom: "2026-09-27", historyTo: "2026-09-27" },
      { key: "curio:user:b:joinedAt", userId: "b", current: "2026-09-12", proposed: "2026-09-27", changes: true, historyFrom: "2026-09-27", historyTo: "2026-09-27" },
    ]);
  });

  it("is idempotent: planning again after applying changes nothing", () => {
    const applied = Object.fromEntries(
      planJoinedAtReset(joined, "2026-09-27", "2026-09-27").map((p) => [p.key, p.proposed])
    );
    expect(planJoinedAtReset(applied, "2026-09-27", "2026-09-28").every((p) => !p.changes)).toBe(true);
  });

  it("never moves a join date that's already on or after the cutover", () => {
    const [p] = planJoinedAtReset({ "curio:user:c:joinedAt": "2026-09-28" }, "2026-09-27", "2026-09-28");
    expect(p).toMatchObject({ current: "2026-09-28", proposed: "2026-09-28", changes: false });
  });

  it("only ever plans writes to joinedAt keys — never favourites or anything else", () => {
    const plans = planJoinedAtReset(
      { ...joined, "curio:user:a:favorites": "x" } as Record<string, string>,
      "2026-09-27",
      "2026-09-27"
    );
    expect(plans.every((p) => p.key.endsWith(":joinedAt"))).toBe(true);
  });

  it("rejects a malformed cutover date", () => {
    expect(() => planJoinedAtReset(joined, "27/09/2026", "2026-09-27")).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run scripts/resetJoinedAt.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `scripts/resetJoinedAt.ts`:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { redis } from "../lib/redis";
import { dayKey } from "../lib/day";

/** One-off, for the 2026-09-26 switch to one shared word for everyone.
 * Existing accounts' History was built from their old personal rotation;
 * recomputing it from the shared calendar would show words they were never
 * shown. Moving joinedAt to the cutover date starts their History clean.
 * Touches only curio:user:<id>:joinedAt — never favourites, never the old
 * per-account word locks (kept as a revert path). Dry run unless --apply;
 * --apply backs up every affected value to backups/ first. Idempotent:
 * re-running with the same --cutover changes nothing. Delete after use. */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const JOINED = /^curio:user:([^:]+):joinedAt$/;

export type AccountPlan = {
  key: string;
  userId: string;
  current: string;
  proposed: string;
  changes: boolean;
  historyFrom: string;
  historyTo: string;
};

export function planJoinedAtReset(
  joined: Record<string, string>,
  cutover: string,
  today: string
): AccountPlan[] {
  if (!DATE.test(cutover)) throw new Error(`Bad --cutover date: ${cutover}`);
  return Object.entries(joined)
    .filter(([key]) => JOINED.test(key))
    .map(([key, current]) => {
      const proposed = current < cutover ? cutover : current;
      return {
        key,
        userId: key.match(JOINED)![1],
        current,
        proposed,
        changes: proposed !== current,
        historyFrom: proposed,
        historyTo: today,
      };
    });
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const cutover = args.find((a) => a.startsWith("--cutover="))?.slice("--cutover=".length);
  if (!cutover) {
    console.error("Usage: npx tsx --env-file=.env.local scripts/resetJoinedAt.ts --cutover=YYYY-MM-DD [--dry-run | --apply]");
    process.exit(1);
  }
  if (!redis) {
    console.error("Upstash isn't configured — pass --env-file=.env.local.");
    process.exit(1);
  }

  const keys = await redis.keys("curio:user:*:joinedAt");
  const values = keys.length > 0 ? await redis.mget<(string | null)[]>(...keys) : [];
  const joined: Record<string, string> = {};
  keys.forEach((key, i) => {
    if (values[i]) joined[key] = values[i]!;
  });
  const plans = planJoinedAtReset(joined, cutover, dayKey());

  console.log(`${apply ? "APPLY" : "DRY RUN"} — cutover ${cutover}, ${plans.length} account(s)\n`);
  for (const p of plans) {
    console.log(
      `${p.userId}\n  joinedAt: ${p.current} -> ${p.proposed}${p.changes ? "" : " (unchanged)"}\n  History:  ${p.historyFrom} .. ${p.historyTo}`
    );
  }
  const toWrite = plans.filter((p) => p.changes);
  if (!apply) {
    console.log(`\n${toWrite.length} write(s) planned. Nothing written. Re-run with --apply to write.`);
    return;
  }
  if (toWrite.length === 0) {
    console.log("\nNothing to change — already applied.");
    return;
  }

  mkdirSync("backups", { recursive: true });
  const backupPath = join("backups", `joinedAt-${cutover}-${Date.now()}.json`);
  writeFileSync(
    backupPath,
    JSON.stringify({ takenAt: new Date().toISOString(), cutover, joinedAt: Object.fromEntries(toWrite.map((p) => [p.key, p.current])) }, null, 2)
  );
  console.log(`\nBacked up ${toWrite.length} value(s) to ${backupPath}`);

  for (const p of toWrite) await redis.set(p.key, p.proposed);
  console.log(`Applied ${toWrite.length} write(s).`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

Append `/backups/` to `.gitignore`.

- [ ] **Step 4: Run tests, then a real dry run (read-only)**

Run: `npx vitest run scripts/resetJoinedAt.test.ts` → PASS.
Run: `npx tsx --env-file=.env.local scripts/resetJoinedAt.ts --cutover=2026-09-27 --dry-run`
Expected: `DRY RUN`, exactly 2 accounts, each `joinedAt: 2026-09-1x -> 2026-09-27`, then "Nothing written." **Never pass `--apply` in this task.** Paste the output into the task report; if it lists anything other than 2 accounts, stop and report.

- [ ] **Step 5: Commit**

```bash
git add scripts/resetJoinedAt.ts scripts/resetJoinedAt.test.ts .gitignore
git commit -m "chore: add one-off joinedAt reset script (dry-run by default, backs up first)"
```

---

### Task 9: Docs, dry run for the owner, deploy, reset (controller-run)

Run by the controller, not a subagent — it deploys to production and writes to production Redis.

**Files:**
- Modify: `AGENTS.md`, `handover.md`
- Delete (after the reset runs): `scripts/resetJoinedAt.ts`, `scripts/resetJoinedAt.test.ts`

- [ ] **Step 1: `AGENTS.md`** — append after "Design system":

```markdown
## Product principle: archive, never backlog

Curio may let people *pull* any word — the story pages, the A–Z list and related-word links are fine. Curio must never *push* unread-ness. That rules out:

- counts of words not yet seen, or "X of 1,147";
- "you missed" messaging;
- streaks, or completion percentages;
- manufactured history for days a user didn't experience.

Test every future feature against this rule.
```

- [ ] **Step 2: `handover.md`**
  - Add the same principle as `## Product principle: archive, never backlog`, right after "What this is".
  - "What this is": "accounts with synced favorites and a personalized word order" → "accounts with synced favorites and a History of the shared words since they joined".
  - Add a `## Decisions` section (after the principle) with this entry:

```markdown
### 2026-09-26 — Chose a shared word (A) over per-account rotation (B)

Why:
- The family-and-friends launch depends on "did you see today's word?".
- The puzzle can only avoid recent *and* upcoming daily words if the schedule is shared.
- Bluesky, email, the site and story pages must agree on the day's word.
- It removes the slot-0 join-day pin workaround and a second code path.
- A shared word lets us judge word quality per day.

Revisit ~4 weeks after the F&F launch, if:
1. Dud days visibly lower next-day returns → fix by reordering the shared schedule, not per-user rotation.
2. 2+ users report "I'd already read today's word" → build a "You read this on <date>" note.
3. Near-zero social mentions after week 2 → consider hybrids, not B.
4. The shared cycle nears wrap-around (currently 2029-02-21 at 1,147 words).
```

  - Architecture map, `lib/words.ts` entry: replace the `getWordForUser`/`getHistoryForUser` bullet with "`resolveHistorySince(joinedAt, today?)` — an account's History: the shared-calendar days since it joined, through the same locks as `resolveHistory`. No per-account rotation since 2026-09-26." Add a `lib/day.ts` entry: "the one clock — `dayKey`/`dayStart`/`formatDay`, UTC. Every surface derives and formats 'today' through it; `app/sharedDay.test.ts` guards that they agree."
  - "Word bank" section: "`resolveTodayWord`/`resolveWordForUser`/etc." → "`resolveTodayWord`/`resolveHistory`/`resolveHistorySince`"; "`getWordForDate`/`getWordForUser`/etc." → "`getWordForDate`/`getHistory`".
  - `/play` note: pool now excludes the last 30 **and** next 30 shared days; structural pool = `WORDS.length − 60`.
  - Replace the "Accounts / auth system" rotation sentences ("A brand-new account gets a personal word rotation…" through "…unless the user explicitly asks to change it.") with:

```markdown
Every visitor, account holder, digest recipient, `/play` and Bluesky get the
same shared calendar word on a given date. An account's `joinedAt`
(`recordUserJoined`, fired from Auth.js's `createUser` event) marks where
its History starts — shared days from then to today, as a neutral dated
list — and favorites sync across devices.

**Reversed 2026-09-26, at the owner's explicit request** (see Decisions):
accounts used to get a per-account shuffled rotation (`getPersonalOrder`,
with a slot-0 pin for the join day). The code is gone; its data is not:
`curio:user:<id>:wordFor:<date>` keys are left in Redis, unread and
unwritten, as a cheap revert path — safe to delete in a later cleanup.
The two existing accounts had `joinedAt` reset to the cutover date by a
one-off script (`scripts/resetJoinedAt.ts`, deleted after it ran — see git
history; the pre-reset values are in the local, gitignored `backups/`), so
their History starts clean instead of showing shared words they were never
shown. Accepted side effect: the admin portal shows both joining on the
cutover date.
```

  - Add `## This session (2026-09-26): one shared word` — what landed (Tasks 1–8), test totals, the copy strings changed, the schedule report (see the controller's summary), and the reset's cutover date.

- [ ] **Step 3: Merge (don't deploy yet)** — merge the worktree branch into `master` locally, remove the worktree, then from the main checkout run `npx vitest run`, `npm run lint`, `npm run build` (then `rm -rf .next`). Commit the docs.

- [ ] **Step 4: STOP — show the owner the dry run.** Run `npx tsx --env-file=.env.local scripts/resetJoinedAt.ts --cutover=<deploy day, UTC> --dry-run` and send the output. Wait for an explicit "yes". (The dry run is shown *before* deploying so the deploy and the real reset can run back to back — deploying first would show both accounts shared words from their old join dates until the reset runs.)

- [ ] **Step 5: After the owner's yes — deploy and reset back to back.** `git push` (Vercel deploys `master`); once the deployment is Ready, immediately run the same command with `--apply` instead of `--dry-run`. Run it once more with `--dry-run` to show "unchanged" for both (idempotency, live).

- [ ] **Step 6: Verify live**
  - Signed out: `/` word == `/history` "All words" first entry.
  - Signed in (the owner signs in themselves in the browser pane): `/` shows the same word and "Today's word · <date>"; `/history` "My days" and `/collection` each show exactly one entry — today's shared word; `/api/story/<today's slug>/date` returns today's date.
  - Next 9am UTC cron: Resend logs show every digest carried the same word, and the Bluesky post matches.

- [ ] **Step 7: Delete the script and push**

```bash
git rm scripts/resetJoinedAt.ts scripts/resetJoinedAt.test.ts
git commit -m "chore: remove the one-off joinedAt reset script after running it"
git push
```

---

## Resolved: Collection stays as it is

Owner delegated the call; decision (2026-09-26): **keep `/collection` unchanged** apart from its data source and empty-state copy. Its counts and language stats only ever count words already shown — never unseen ones — so it passes the archive-vs-backlog rule; turning it into favourites is a redesign outside this pre-launch phase. Task 9 records this in `handover.md`'s Decisions section. Original flag, for context:

The amendment says "Collection = favourites, unchanged". In the code, `/collection` is **not** favourites: it's a signed-in "shelf" of every word the account has been shown, with a counts subline ("N words · M languages · since <month>"), a language-width band ("Widths are how many of your words passed through each language" / "Three languages so far."), and a History tab ("Every morning since you joined."). Favourites live as a "Favorites" filter inside `/history`. This plan changes only `/collection`'s data source (to the shared days since joining) and its empty-state copy. Whether to keep those counts and stats (they count words seen, never unseen), remove them, or make Collection mean favourites is the owner's call.
