# Weekly Demand Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A weekly, fully automated report that shows which of Curio's words have real search demand (English Wiktionary pageviews) and which story pages earn Google impressions (Search Console). It is published to a private repo without triggering a Vercel deploy.

**Architecture:**
- A `tsx` script, `scripts/demandReport.ts`, does as little as possible: parse arguments, build the fetchers, print a summary.
- The pipeline lives in `scripts/demand/`:
  - `http.ts`: throttled, retrying fetch.
  - `wiktionary.ts` and `searchConsole.ts`: the two data sources.
  - `report.ts`: pure joining, section building and Markdown.
  - `run.ts`: collect everything, then write.
- Nothing is written until every source has succeeded.
- A GitHub Actions workflow runs it every Monday and pushes `latest.md` plus a dated JSON snapshot to the private `SamxJames/curio-reports` repo.

**Tech Stack:** TypeScript, `tsx`, Vitest 5, Node 22 global `fetch`, `node:crypto` (RS256 JWT, no new dependencies), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-03-demand-report-design.md`

## Global Constraints

- **No public surface.** Never touch `app/`, `components/`, `vercel.json`, `LAUNCH_OPENERS` or anything served.
- **Branch:** work on `demand-report`. **Never push or merge without the owner's sign-off.** Every push to `master` deploys to production through Vercel's git integration.
- **Phase gates.** Stop for the owner's sign-off after Task 5 (Phase 1), Task 8 (Phase 2) and Task 13 (Phase 3).
- **Secrets.** Never print, log or commit credentials. Error messages carry the HTTP status and Google's short error code (`invalid_grant`, `PERMISSION_DENIED`), never response bodies, `error_description`, key material or tokens. Secrets live only in GitHub Actions secrets and `.env.local`.
- **Public CI logs.** `curio-web` is a public repo, so its Actions logs are public. The script's stdout must never print Search Console data (queries, pages, figures). Counts only.
- **User-Agent (exact):** `CurioDemandReport/1.0 (https://curioword.com; samfillingham@protonmail.com)`
- **Wiktionary API calls:**
  - Pageviews: `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wiktionary.org/all-access/user/...`, agent type `user`.
  - Title lookup: `https://en.wiktionary.org/w/api.php`, at most 50 titles per request.
- **Title order:** the exact spelling from `lib/words.ts` first, then the other-case form. (The owner approved this departure from "lowercase first".)
- **Search Console:**
  - property `sc-domain:curioword.com`
  - scope `https://www.googleapis.com/auth/webmasters.readonly`
  - key in env var `GSC_SERVICE_ACCOUNT_KEY`, as base64 of the JSON key file
  - window: 28 days ending 3 days before the run.
- **Wiktionary caveat (verbatim in the report):** "A Wiktionary page covers every language's entry for that spelling, so these views are a proxy for interest in the word, not a count of English etymology searches."
- **Tests:** Vitest, beside the code, fixtures in `scripts/__fixtures__/demand/`. **No live network calls in tests.**
- **Checks before every phase stop:** `npm test`, `npx tsc --noEmit` and `npm run lint` all pass.
- **Commits** end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/demandReport.ts` (new) | Command-line entry point for `npm run demand:report -- [--out <dir>]`. Default output is `.reports/demand`. |
| `scripts/demand/types.ts` (new) | Shared types: `WordDemand`, `WiktionaryData`, `GscRow`, `SearchConsoleData`, `Snapshot`. |
| `scripts/demand/http.ts` (+test) | `createFetcher` (minimum gap, retries, backoff, `Retry-After`) and `retryAfterMs`. |
| `scripts/demand/wiktionary.ts` (+test) | Titles, encoding, month window, title lookup, pageviews, summary, ranking, `collectWiktionary`. |
| `scripts/demand/searchConsole.ts` (+test) | Loading the key, signing the JWT, the access token, the 28-day window, paginated queries, `collectSearchConsole`. |
| `scripts/demand/report.ts` (+test) | Pure: page paths, joining by word, the five sections, week-on-week, `renderReport`. |
| `scripts/demand/run.ts` (+test) | `runDemandReport`: collect, then read the previous snapshot, then render, then write. |
| `scripts/demand/testing.ts` (new) | Test-only helpers: loading fixtures, JSON responses, fake Wikimedia and Google routes, a generated service account. |
| `scripts/__fixtures__/demand/*.json` (new) | Recorded API response shapes. |
| `docs/demand-report-setup.md` (new) | The owner's manual setup steps (Search Console, then `curio-reports`). |
| `.github/workflows/demand-report.yml` (new) | Weekly and manual-dispatch workflow. |
| `package.json` | Adds `"demand:report"`. |
| `.gitignore` | Adds `/.reports/`. |
| `handover.md` | Phase 4 section. |

---

# Phase 1: Wiktionary pageviews

### Task 1: Throttled, retrying fetch

**Files:**
- Create: `scripts/demand/http.ts`
- Test: `scripts/demand/http.test.ts`

**Interfaces:**
- Produces:
  - `type FetchLike = (url: string, init?: RequestInit) => Promise<Response>`
  - `type FetcherOptions = { fetch?: FetchLike; sleep?: (ms: number) => Promise<void>; now?: () => number; attempts?: number; baseDelayMs?: number; minGapMs?: number }`
  - `createFetcher(options?: FetcherOptions): FetchLike`
  - `retryAfterMs(header: string | null, nowMs: number): number | null`

- [ ] **Step 1: Write the failing test** in `scripts/demand/http.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createFetcher, retryAfterMs, type FetchLike } from "./http";

function clock() {
  let t = 0;
  return {
    now: () => t,
    sleep: vi.fn(async (ms: number) => {
      t += ms;
    }),
  };
}

const res = (status: number, headers: Record<string, string> = {}) =>
  new Response("{}", { status, headers });

function sequence(...steps: (Response | Error)[]) {
  return vi.fn<FetchLike>(async () => {
    const next = steps.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  });
}

describe("createFetcher", () => {
  it("returns a successful response without waiting", async () => {
    const c = clock();
    const fetch = sequence(res(200));
    const response = await createFetcher({ fetch, ...c })("https://x.test/a");
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(c.sleep).not.toHaveBeenCalled();
  });

  it("does not retry a 404", async () => {
    const c = clock();
    const fetch = sequence(res(404));
    const response = await createFetcher({ fetch, ...c })("https://x.test/a");
    expect(response.status).toBe(404);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 with exponential backoff when there's no Retry-After", async () => {
    const c = clock();
    const fetch = sequence(res(429), res(503), res(200));
    const response = await createFetcher({ fetch, ...c })("https://x.test/a");
    expect(response.status).toBe(200);
    expect(c.sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000]);
  });

  it("honours Retry-After in seconds", async () => {
    const c = clock();
    const fetch = sequence(res(429, { "retry-after": "3" }), res(200));
    await createFetcher({ fetch, ...c })("https://x.test/a");
    expect(c.sleep).toHaveBeenCalledWith(3000);
  });

  it("gives up after the last attempt and returns the last retryable response", async () => {
    const c = clock();
    const fetch = sequence(res(500), res(500), res(500));
    const response = await createFetcher({ fetch, attempts: 3, ...c })("https://x.test/a");
    expect(response.status).toBe(500);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("retries network errors and rethrows after the last attempt", async () => {
    const c = clock();
    const fetch = sequence(new Error("socket hang up"), new Error("socket hang up"), new Error("socket hang up"));
    await expect(createFetcher({ fetch, attempts: 3, ...c })("https://x.test/a")).rejects.toThrow("socket hang up");
    expect(c.sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000]);
  });

  it("keeps a minimum gap between consecutive requests", async () => {
    const c = clock();
    const fetch = sequence(res(200), res(200));
    const fetcher = createFetcher({ fetch, minGapMs: 100, ...c });
    await fetcher("https://x.test/a");
    await fetcher("https://x.test/b");
    expect(c.sleep.mock.calls.map(([ms]) => ms)).toEqual([100]);
  });

  it("passes the URL and init through unchanged", async () => {
    const c = clock();
    const fetch = sequence(res(200));
    const init = { headers: { "User-Agent": "test" } };
    await createFetcher({ fetch, ...c })("https://x.test/a", init);
    expect(fetch).toHaveBeenCalledWith("https://x.test/a", init);
  });
});

describe("retryAfterMs", () => {
  it("reads seconds, HTTP dates, caps at 60s and ignores junk", () => {
    expect(retryAfterMs(null, 0)).toBeNull();
    expect(retryAfterMs("2", 0)).toBe(2000);
    expect(retryAfterMs("600", 0)).toBe(60_000);
    const now = Date.parse("Wed, 21 Oct 2015 07:28:00 GMT");
    expect(retryAfterMs("Wed, 21 Oct 2015 07:28:10 GMT", now)).toBe(10_000);
    expect(retryAfterMs("soon", 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run scripts/demand/http.test.ts`
Expected: FAIL, "Failed to resolve import ./http".

- [ ] **Step 3: Implement** `scripts/demand/http.ts`:

```ts
// Shared HTTP plumbing for the demand report: requests go out one at a
// time with a minimum gap between their starts, and 429s, 5xx responses
// and network errors are retried with exponential backoff (or the server's
// Retry-After, when it gives one). fetch, sleep and the clock are
// injectable so tests never touch the network or wait in real time.

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type FetcherOptions = {
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Total tries per request, including the first. */
  attempts?: number;
  /** First backoff delay; doubles on each retry. */
  baseDelayMs?: number;
  /** Minimum time between the starts of consecutive requests. */
  minGapMs?: number;
};

const MAX_RETRY_AFTER_MS = 60_000;

/** A Retry-After header (seconds or an HTTP date) as milliseconds, capped at a minute. */
export function retryAfterMs(header: string | null, nowMs: number): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
  const at = Date.parse(header);
  if (Number.isNaN(at)) return null;
  return Math.min(Math.max(at - nowMs, 0), MAX_RETRY_AFTER_MS);
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export function createFetcher(options: FetcherOptions = {}): FetchLike {
  const doFetch = options.fetch ?? ((url, init) => fetch(url, init));
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const attempts = options.attempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const minGapMs = options.minGapMs ?? 0;
  let lastStart = Number.NEGATIVE_INFINITY;

  return async (url, init) => {
    for (let attempt = 1; ; attempt++) {
      const wait = lastStart + minGapMs - now();
      if (wait > 0) await sleep(wait);
      lastStart = now();

      const lastTry = attempt >= attempts;
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      let response: Response;
      try {
        response = await doFetch(url, init);
      } catch (error) {
        if (lastTry) throw error;
        await sleep(backoff);
        continue;
      }
      if (!isRetryable(response.status) || lastTry) return response;

      const delay = retryAfterMs(response.headers.get("retry-after"), now()) ?? backoff;
      await response.body?.cancel().catch(() => undefined);
      await sleep(delay);
    }
  };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run scripts/demand/http.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/demand/http.ts scripts/demand/http.test.ts
git commit -m "feat: demand report — throttled, retrying fetch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Wiktionary pure helpers and shared types

**Files:**
- Create: `scripts/demand/types.ts`
- Create: `scripts/demand/wiktionary.ts` (pure helpers only in this task)
- Test: `scripts/demand/wiktionary.test.ts`

**Interfaces:**
- Produces, in `types.ts`, exactly:

```ts
// Shared shapes for the demand report. A Snapshot is what gets written to
// snapshots/<date>.json each week and read back for week-on-week.

export type WordDemand = {
  slug: string;
  word: string;
  /** The Wiktionary title counted, or null when no page exists for any candidate. */
  title: string | null;
  /** Monthly user pageviews, oldest first, aligned with WiktionaryData.months. */
  views: number[];
  /** Sum of the 12 months. */
  total12: number;
  /** Mean of the last 3 months. */
  avg3: number;
  /** (last-3 mean − previous-3 mean) / previous-3 mean; null when the previous-3 mean is 0. */
  trend: number | null;
};

export type WiktionaryData = {
  /** "YYYYMM", oldest first: the last 12 complete UTC months before the run. */
  months: string[];
  words: WordDemand[];
};

export type GscRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type SearchConsoleData = {
  site: string;
  startDate: string;
  endDate: string;
  byPage: GscRow[];
  byQuery: GscRow[];
  byPageQuery: GscRow[];
};

export type Snapshot = {
  version: 1;
  /** Run date, YYYY-MM-DD (UTC). */
  date: string;
  generatedAt: string;
  wiktionary: WiktionaryData;
  /** null when Search Console was skipped (no credentials). */
  searchConsole: SearchConsoleData | null;
};
```

- Produces, in `wiktionary.ts`:
  - `USER_AGENT: string`
  - `titleCandidates(word: string): string[]`
  - `encodeTitle(title: string): string`
  - `lastCompleteMonths(now: Date, count?: number): string[]`
  - `summarizeViews(views: number[]): { total12: number; avg3: number; trend: number | null }`
  - `formatTrend(trend: number | null, avg3: number): string`
  - `rankByDemand<T extends WordDemand>(words: T[]): T[]`

- [ ] **Step 1: Write the failing test** in `scripts/demand/wiktionary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { WordDemand } from "./types";
import {
  encodeTitle,
  formatTrend,
  lastCompleteMonths,
  rankByDemand,
  summarizeViews,
  titleCandidates,
  USER_AGENT,
} from "./wiktionary";

describe("titleCandidates", () => {
  it("tries the exact spelling first, then the other case", () => {
    expect(titleCandidates("quarantine")).toEqual(["quarantine", "Quarantine"]);
    expect(titleCandidates("December")).toEqual(["December", "december"]);
  });

  it("returns one candidate when swapping case changes nothing", () => {
    expect(titleCandidates("1984")).toEqual(["1984"]);
  });
});

describe("encodeTitle", () => {
  it("turns spaces into underscores and percent-encodes the rest", () => {
    expect(encodeTitle("hoi polloi")).toBe("hoi_polloi");
    expect(encodeTitle("café")).toBe("caf%C3%A9");
    expect(encodeTitle("AC/DC")).toBe("AC%2FDC");
    expect(encodeTitle("what?")).toBe("what%3F");
  });
});

describe("lastCompleteMonths", () => {
  it("returns the 12 complete months before the run, oldest first", () => {
    const months = lastCompleteMonths(new Date("2026-10-03T12:00:00Z"));
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("202510");
    expect(months[11]).toBe("202609");
  });

  it("crosses a year boundary", () => {
    expect(lastCompleteMonths(new Date("2026-01-01T00:00:00Z"), 2)).toEqual(["202511", "202512"]);
  });
});

describe("summarizeViews", () => {
  const months = (prev3: number[], last3: number[]) => [0, 0, 0, 0, 0, 0, ...prev3, ...last3];

  it("totals 12 months, averages the last 3 and compares them with the 3 before", () => {
    const s = summarizeViews([1200, 1100, 0, 900, 800, 1000, 950, 1050, 1000, 1300, 1500, 1700]);
    expect(s.total12).toBe(12500);
    expect(s.avg3).toBe(1500);
    expect(s.trend).toBeCloseTo(0.5);
  });

  it("reports a fall as a negative trend", () => {
    expect(summarizeViews(months([100, 100, 100], [50, 50, 50])).trend).toBeCloseTo(-0.5);
  });

  it("has no trend when the previous 3 months were zero", () => {
    expect(summarizeViews(months([0, 0, 0], [10, 0, 0])).trend).toBeNull();
    expect(summarizeViews(months([0, 0, 0], [0, 0, 0])).trend).toBeNull();
  });
});

describe("formatTrend", () => {
  it("formats signed whole percentages", () => {
    expect(formatTrend(0.5, 1)).toBe("+50%");
    expect(formatTrend(-0.123, 1)).toBe("-12%");
    expect(formatTrend(0, 1)).toBe("0%");
    expect(formatTrend(-0.001, 1)).toBe("0%");
  });

  it("says new or a dash when there's no baseline", () => {
    expect(formatTrend(null, 3)).toBe("new");
    expect(formatTrend(null, 0)).toBe("—");
  });
});

describe("rankByDemand", () => {
  const w = (word: string, total12: number, title: string | null = word): WordDemand => ({
    slug: word,
    word,
    title,
    views: [],
    total12,
    avg3: 0,
    trend: null,
  });

  it("sorts by 12-month total, ties alphabetically, and drops words with no page", () => {
    const ranked = rankByDemand([w("b", 5), w("a", 5), w("c", 9), w("x", 100, null)]);
    expect(ranked.map((r) => r.word)).toEqual(["c", "a", "b"]);
  });
});

describe("USER_AGENT", () => {
  it("names the tool and gives a contact address", () => {
    expect(USER_AGENT).toBe(
      "CurioDemandReport/1.0 (https://curioword.com; samfillingham@protonmail.com)"
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run scripts/demand/wiktionary.test.ts`
Expected: FAIL, "Failed to resolve import ./wiktionary".

- [ ] **Step 3: Implement.** Create `scripts/demand/types.ts` with the exact content in **Interfaces** above. Then create `scripts/demand/wiktionary.ts`:

```ts
// English Wiktionary demand for each word: which page to count, its monthly
// pageviews from the Wikimedia Pageviews API (agent type "user", so known
// bots are excluded), and the per-word summary the report ranks on.
//
// Caveat carried into the report: a Wiktionary page holds every language's
// entry for that spelling, so its views are a proxy for interest in the
// word, not a count of English etymology lookups.
import type { WordDemand } from "./types";

/** Wikimedia's API policy asks for a descriptive User-Agent with a contact. */
export const USER_AGENT =
  "CurioDemandReport/1.0 (https://curioword.com; samfillingham@protonmail.com)";

/** The exact spelling first, then the same word with its first letter's case
 * swapped. Exact-first matters for the capitalised words (December,
 * Jupiter…): Wiktionary's lowercase "december" holds other languages'
 * entries, so lowercase-first would count the wrong page. */
export function titleCandidates(word: string): string[] {
  const first = word.charAt(0);
  const swapped = first === first.toUpperCase() ? first.toLowerCase() : first.toUpperCase();
  const other = swapped + word.slice(1);
  return other === word ? [word] : [word, other];
}

/** A title as the Pageviews API wants it in the URL path. */
export function encodeTitle(title: string): string {
  return encodeURIComponent(title.replace(/ /g, "_"));
}

/** The `count` complete UTC months before `now`, as "YYYYMM", oldest first. */
export function lastCompleteMonths(now: Date, count = 12): string[] {
  const months: string[] = [];
  for (let back = count; back >= 1; back--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    months.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

const sum = (xs: number[]) => xs.reduce((total, x) => total + x, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);

export function summarizeViews(views: number[]): Pick<WordDemand, "total12" | "avg3" | "trend"> {
  const avg3 = mean(views.slice(-3));
  const previous = mean(views.slice(-6, -3));
  return {
    total12: sum(views),
    avg3,
    trend: previous === 0 ? null : (avg3 - previous) / previous,
  };
}

export function formatTrend(trend: number | null, avg3: number): string {
  if (trend === null) return avg3 > 0 ? "new" : "—";
  const pct = Math.round(trend * 100);
  if (pct === 0) return "0%";
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

/** Words that have a Wiktionary page, highest 12-month total first. */
export function rankByDemand<T extends WordDemand>(words: T[]): T[] {
  return words
    .filter((w) => w.title !== null)
    .sort((a, b) => b.total12 - a.total12 || a.word.localeCompare(b.word));
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run scripts/demand/wiktionary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/demand/types.ts scripts/demand/wiktionary.ts scripts/demand/wiktionary.test.ts
git commit -m "feat: demand report — Wiktionary titles, months and trend maths

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Title lookup, pageviews and `collectWiktionary`

**Files:**
- Create: `scripts/__fixtures__/demand/mediawiki-exact.json`
- Create: `scripts/__fixtures__/demand/mediawiki-fallback.json`
- Create: `scripts/__fixtures__/demand/pageviews-quarantine.json`
- Create: `scripts/demand/testing.ts`
- Modify: `scripts/demand/wiktionary.ts` (append)
- Test: `scripts/demand/wiktionary.test.ts` (append)

**Interfaces:**
- Consumes: `FetchLike` (Task 1); `WordDemand` and `WiktionaryData` (Task 2).
- Produces, in `wiktionary.ts`:
  - `existingTitles(titles: string[], fetcher: FetchLike): Promise<Map<string, string>>`, mapping each input title that exists to its canonical title
  - `resolveTitles(words: string[], fetcher: FetchLike): Promise<Map<string, string | null>>`
  - `fetchMonthlyViews(title: string, months: string[], fetcher: FetchLike): Promise<number[]>`
  - `collectWiktionary(entries: { slug: string; word: string }[], options: { fetcher: FetchLike; now: Date; onProgress?: (done: number, total: number) => void }): Promise<WiktionaryData>`
- Produces, in `testing.ts`:
  - `fixture(name: string): string`
  - `jsonResponse(body: string, status?: number): Response`
  - `FIXTURE_ENTRIES`
  - `wikimediaRoute(url: string): Response | null`
  - `fakeFetch(...routes): Mock<FetchLike>`

- [ ] **Step 1: Create the fixtures.**

`scripts/__fixtures__/demand/mediawiki-exact.json`:

```json
{
  "batchcomplete": true,
  "query": {
    "pages": [
      { "pageid": 4110, "ns": 0, "title": "quarantine" },
      { "ns": 0, "title": "December", "missing": true },
      { "ns": 0, "title": "zzxqv", "missing": true }
    ]
  }
}
```

`scripts/__fixtures__/demand/mediawiki-fallback.json`:

```json
{
  "batchcomplete": true,
  "query": {
    "pages": [
      { "pageid": 8812, "ns": 0, "title": "december" },
      { "ns": 0, "title": "Zzxqv", "missing": true }
    ]
  }
}
```

`scripts/__fixtures__/demand/pageviews-quarantine.json`. December 2025 is left out on purpose: the API omits months with no data.

```json
{
  "items": [
    { "project": "en.wiktionary", "article": "quarantine", "granularity": "monthly", "timestamp": "2025100100", "access": "all-access", "agent": "user", "views": 1200 },
    { "project": "en.wiktionary", "article": "quarantine", "granularity": "monthly", "timestamp": "2025110100", "access": "all-access", "agent": "user", "views": 1100 },
    { "project": "en.wiktionary", "article": "quarantine", "granularity": "monthly", "timestamp": "2026010100", "access": "all-access", "agent": "user", "views": 900 },
    { "project": "en.wiktionary", "article": "quarantine", "granularity": "monthly", "timestamp": "2026020100", "access": "all-access", "agent": "user", "views": 800 },
    { "project": "en.wiktionary", "article": "quarantine", "granularity": "monthly", "timestamp": "2026030100", "access": "all-access", "agent": "user", "views": 1000 },
    { "project": "en.wiktionary", "article": "quarantine", "granularity": "monthly", "timestamp": "2026040100", "access": "all-access", "agent": "user", "views": 950 },
    { "project": "en.wiktionary", "article": "quarantine", "granularity": "monthly", "timestamp": "2026050100", "access": "all-access", "agent": "user", "views": 1050 },
    { "project": "en.wiktionary", "article": "quarantine", "granularity": "monthly", "timestamp": "2026060100", "access": "all-access", "agent": "user", "views": 1000 },
    { "project": "en.wiktionary", "article": "quarantine", "granularity": "monthly", "timestamp": "2026070100", "access": "all-access", "agent": "user", "views": 1300 },
    { "project": "en.wiktionary", "article": "quarantine", "granularity": "monthly", "timestamp": "2026080100", "access": "all-access", "agent": "user", "views": 1500 },
    { "project": "en.wiktionary", "article": "quarantine", "granularity": "monthly", "timestamp": "2026090100", "access": "all-access", "agent": "user", "views": 1700 }
  ]
}
```

- [ ] **Step 2: Create `scripts/demand/testing.ts`.** These are test-only helpers; only `*.test.ts` files import this.

```ts
// Test-only helpers for the demand report: fixture loading and a fake fetch
// that answers from recorded API responses, so no test touches the network.
import { readFileSync } from "node:fs";
import path from "node:path";
import { vi } from "vitest";
import type { FetchLike } from "./http";

export function fixture(name: string): string {
  return readFileSync(path.join(__dirname, "..", "__fixtures__", "demand", name), "utf8");
}

export function jsonResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

/** quarantine has a page and views; December only exists as "december",
 * which has no recorded views (404); zzxqv has no page at all. */
export const FIXTURE_ENTRIES = [
  { slug: "quarantine", word: "quarantine" },
  { slug: "december", word: "December" },
  { slug: "zzxqv", word: "zzxqv" },
];

export function wikimediaRoute(url: string): Response | null {
  const u = new URL(url);
  if (u.hostname === "en.wiktionary.org" && u.pathname === "/w/api.php") {
    const titles = u.searchParams.get("titles");
    if (titles === "quarantine|December|zzxqv") return jsonResponse(fixture("mediawiki-exact.json"));
    if (titles === "december|Zzxqv") return jsonResponse(fixture("mediawiki-fallback.json"));
  }
  if (u.hostname === "wikimedia.org") {
    if (u.pathname.includes("/user/quarantine/monthly/")) {
      return jsonResponse(fixture("pageviews-quarantine.json"));
    }
    if (u.pathname.includes("/user/december/monthly/")) {
      return jsonResponse('{"title":"Not found."}', 404);
    }
  }
  return null;
}

type Route = (url: string, init?: RequestInit) => Response | null;

/** A fetch that asks each route in turn and fails loudly on anything unrouted. */
export function fakeFetch(...routes: Route[]) {
  return vi.fn<FetchLike>(async (url, init) => {
    for (const route of routes) {
      const response = route(url, init);
      if (response) return response;
    }
    throw new Error(`Unexpected request in test: ${url}`);
  });
}
```

- [ ] **Step 3: Write the failing tests.** Append to `scripts/demand/wiktionary.test.ts`, and add these imports at the top of the file:

```ts
import { collectWiktionary, existingTitles, fetchMonthlyViews, resolveTitles } from "./wiktionary";
import { FIXTURE_ENTRIES, fakeFetch, fixture, jsonResponse, wikimediaRoute } from "./testing";
```

(Merge the `./wiktionary` import into the existing one.) Then append:

```ts
const MONTHS = lastCompleteMonths(new Date("2026-10-03T12:00:00Z"));

describe("existingTitles", () => {
  it("maps titles that exist to their canonical title and leaves out missing ones", async () => {
    const fetch = fakeFetch(wikimediaRoute);
    const found = await existingTitles(["quarantine", "December", "zzxqv"], fetch);
    expect([...found]).toEqual([["quarantine", "quarantine"]]);
  });

  it("follows the API's normalisation", async () => {
    const fetch = fakeFetch(() =>
      jsonResponse(
        JSON.stringify({
          query: {
            normalized: [{ from: "hoi_polloi", to: "hoi polloi" }],
            pages: [{ pageid: 1, ns: 0, title: "hoi polloi" }],
          },
        })
      )
    );
    const found = await existingTitles(["hoi_polloi"], fetch);
    expect(found.get("hoi_polloi")).toBe("hoi polloi");
  });

  it("asks for at most 50 titles per request, with the User-Agent", async () => {
    const fetch = fakeFetch(() => jsonResponse('{"query":{"pages":[]}}'));
    const titles = Array.from({ length: 120 }, (_, i) => `w${i}`);
    await existingTitles(titles, fetch);
    expect(fetch).toHaveBeenCalledTimes(3);
    const batches = fetch.mock.calls.map(([url]) => new URL(url).searchParams.get("titles")!.split("|"));
    expect(batches.map((b) => b.length)).toEqual([50, 50, 20]);
    const init = fetch.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers["User-Agent"]).toBe(USER_AGENT);
  });

  it("makes no request for an empty list", async () => {
    const fetch = fakeFetch();
    expect((await existingTitles([], fetch)).size).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails on an HTTP error", async () => {
    const fetch = fakeFetch(() => jsonResponse("{}", 500));
    await expect(existingTitles(["a"], fetch)).rejects.toThrow("Wiktionary title lookup failed: HTTP 500");
  });
});

describe("resolveTitles", () => {
  it("uses the exact spelling, falls back to the other case, and records no page as null", async () => {
    const fetch = fakeFetch(wikimediaRoute);
    const titles = await resolveTitles(["quarantine", "December", "zzxqv"], fetch);
    expect(titles.get("quarantine")).toBe("quarantine");
    expect(titles.get("December")).toBe("december");
    expect(titles.get("zzxqv")).toBeNull();
  });
});

describe("fetchMonthlyViews", () => {
  it("requests the user-agent monthly series for the window and fills gaps with 0", async () => {
    const fetch = fakeFetch(wikimediaRoute);
    const views = await fetchMonthlyViews("quarantine", MONTHS, fetch);
    expect(fetch.mock.calls[0][0]).toBe(
      "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wiktionary.org/all-access/user/quarantine/monthly/20251001/20260930"
    );
    expect(views).toEqual([1200, 1100, 0, 900, 800, 1000, 950, 1050, 1000, 1300, 1500, 1700]);
  });

  it("treats a 404 for an existing page as zero views", async () => {
    const fetch = fakeFetch(wikimediaRoute);
    expect(await fetchMonthlyViews("december", MONTHS, fetch)).toEqual(Array(12).fill(0));
  });

  it("fails on any other HTTP error", async () => {
    const fetch = fakeFetch(() => jsonResponse("{}", 503));
    await expect(fetchMonthlyViews("quarantine", MONTHS, fetch)).rejects.toThrow(
      'Wiktionary pageviews failed for "quarantine": HTTP 503'
    );
  });
});

describe("collectWiktionary", () => {
  it("summarises every word and records words with no page instead of failing", async () => {
    const fetch = fakeFetch(wikimediaRoute);
    const progress: number[] = [];
    const data = await collectWiktionary(FIXTURE_ENTRIES, {
      fetcher: fetch,
      now: new Date("2026-10-03T12:00:00Z"),
      onProgress: (done) => progress.push(done),
    });
    expect(data.months).toEqual(MONTHS);
    const [quarantine, december, zzxqv] = data.words;
    expect(quarantine).toMatchObject({ slug: "quarantine", title: "quarantine", total12: 12500, avg3: 1500, trend: 0.5 });
    expect(december).toMatchObject({ word: "December", title: "december", total12: 0, trend: null });
    expect(zzxqv).toMatchObject({ title: null, total12: 0, views: Array(12).fill(0) });
    expect(progress).toEqual([1, 2, 3]);
    const pageviewCalls = fetch.mock.calls.filter(([url]) => url.startsWith("https://wikimedia.org/"));
    expect(pageviewCalls).toHaveLength(2);
  });

  it("uses the fixture file for the pageviews shape", () => {
    expect(JSON.parse(fixture("pageviews-quarantine.json")).items).toHaveLength(11);
  });
});
```

- [ ] **Step 4: Run them and confirm they fail**

Run: `npx vitest run scripts/demand/wiktionary.test.ts`
Expected: FAIL, "existingTitles is not a function" or a similar import error.

- [ ] **Step 5: Implement.** Append to `scripts/demand/wiktionary.ts`, and change its type import to `import type { WiktionaryData, WordDemand } from "./types";` plus add `import type { FetchLike } from "./http";`:

```ts
const HEADERS = { "User-Agent": USER_AGENT, Accept: "application/json" };
const MEDIAWIKI_API = "https://en.wiktionary.org/w/api.php";
const PAGEVIEWS_API =
  "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wiktionary.org/all-access/user";
/** The MediaWiki API's per-request title limit for non-bot clients. */
const TITLE_BATCH = 50;

type QueryResponse = {
  query?: {
    normalized?: { from: string; to: string }[];
    pages?: { title: string; missing?: boolean; invalid?: boolean }[];
  };
};

/** Each given title that exists on English Wiktionary, mapped to its canonical title. */
export async function existingTitles(
  titles: string[],
  fetcher: FetchLike
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (let i = 0; i < titles.length; i += TITLE_BATCH) {
    const batch = titles.slice(i, i + TITLE_BATCH);
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      titles: batch.join("|"),
    });
    const response = await fetcher(`${MEDIAWIKI_API}?${params}`, { headers: HEADERS });
    if (!response.ok) throw new Error(`Wiktionary title lookup failed: HTTP ${response.status}`);
    const body = (await response.json()) as QueryResponse;
    const normalized = new Map((body.query?.normalized ?? []).map((n) => [n.from, n.to]));
    const live = new Set(
      (body.query?.pages ?? []).filter((p) => !p.missing && !p.invalid).map((p) => p.title)
    );
    for (const title of batch) {
      const canonical = normalized.get(title) ?? title;
      if (live.has(canonical)) found.set(title, canonical);
    }
  }
  return found;
}

/** The Wiktionary title to count for each word: the exact spelling if it has
 * a page, else the other-case form, else null (no page). Checking existence
 * up front matters because the Pageviews API answers 404 both for a missing
 * page and for a real page with no views. */
export async function resolveTitles(
  words: string[],
  fetcher: FetchLike
): Promise<Map<string, string | null>> {
  const resolved = new Map<string, string | null>();
  const exact = await existingTitles(words, fetcher);
  const fallbacks = new Map<string, string>();
  for (const word of words) {
    const hit = exact.get(word);
    const other = titleCandidates(word)[1];
    if (hit) resolved.set(word, hit);
    else if (other) fallbacks.set(word, other);
    else resolved.set(word, null);
  }
  const second = await existingTitles([...fallbacks.values()], fetcher);
  for (const [word, other] of fallbacks) resolved.set(word, second.get(other) ?? null);
  return resolved;
}

function lastDayOfMonth(yyyymm: string): string {
  const year = Number(yyyymm.slice(0, 4));
  const month = Number(yyyymm.slice(4));
  return String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0");
}

type PageviewsResponse = { items?: { timestamp: string; views: number }[] };

/** Monthly user pageviews for one existing title, aligned with `months`. */
export async function fetchMonthlyViews(
  title: string,
  months: string[],
  fetcher: FetchLike
): Promise<number[]> {
  const first = months[0];
  const last = months[months.length - 1];
  const url = `${PAGEVIEWS_API}/${encodeTitle(title)}/monthly/${first}01/${last}${lastDayOfMonth(last)}`;
  const response = await fetcher(url, { headers: HEADERS });
  // The page's existence was confirmed by resolveTitles, so a 404 here
  // means "no recorded views in the range", not "no such page".
  if (response.status === 404) return months.map(() => 0);
  if (!response.ok) {
    throw new Error(`Wiktionary pageviews failed for "${title}": HTTP ${response.status}`);
  }
  const body = (await response.json()) as PageviewsResponse;
  const byMonth = new Map((body.items ?? []).map((item) => [item.timestamp.slice(0, 6), item.views]));
  return months.map((month) => byMonth.get(month) ?? 0);
}

export async function collectWiktionary(
  entries: { slug: string; word: string }[],
  options: { fetcher: FetchLike; now: Date; onProgress?: (done: number, total: number) => void }
): Promise<WiktionaryData> {
  const months = lastCompleteMonths(options.now);
  const titles = await resolveTitles(
    entries.map((e) => e.word),
    options.fetcher
  );
  const words: WordDemand[] = [];
  for (const [i, entry] of entries.entries()) {
    const title = titles.get(entry.word) ?? null;
    const views = title
      ? await fetchMonthlyViews(title, months, options.fetcher)
      : months.map(() => 0);
    words.push({ slug: entry.slug, word: entry.word, title, views, ...summarizeViews(views) });
    options.onProgress?.(i + 1, entries.length);
  }
  return { months, words };
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run scripts/demand`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/__fixtures__/demand scripts/demand/testing.ts scripts/demand/wiktionary.ts scripts/demand/wiktionary.test.ts
git commit -m "feat: demand report — Wiktionary title lookup and monthly pageviews

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Pipeline, command-line entry point and npm script (Wiktionary only)

**Files:**
- Create: `scripts/demand/run.ts`
- Test: `scripts/demand/run.test.ts`
- Create: `scripts/demandReport.ts`
- Modify: `package.json` (`scripts` block), `.gitignore`

**Interfaces:**
- Consumes: `collectWiktionary`, `rankByDemand`, `formatTrend` (Tasks 2–3); `createFetcher` (Task 1); `WORDS` from `lib/words.ts`.
- Produces:
  - `type RunOptions = { entries: { slug: string; word: string }[]; now: Date; outDir: string; wikiFetcher: FetchLike; log?: (line: string) => void }`
  - `runDemandReport(options: RunOptions): Promise<{ snapshot: Snapshot }>`
  - `snapshotPath(outDir: string, date: string): string`

- [ ] **Step 1: Write the failing test** in `scripts/demand/run.test.ts`:

```ts
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runDemandReport, snapshotPath } from "./run";
import { FIXTURE_ENTRIES, fakeFetch, jsonResponse, wikimediaRoute } from "./testing";
import type { Snapshot } from "./types";

const NOW = new Date("2026-10-05T06:00:00Z");
let outDir: string;

beforeEach(async () => {
  outDir = await mkdtemp(path.join(os.tmpdir(), "demand-report-"));
});
afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
});

describe("runDemandReport", () => {
  it("writes a dated snapshot with the Wiktionary half", async () => {
    const { snapshot } = await runDemandReport({
      entries: FIXTURE_ENTRIES,
      now: NOW,
      outDir,
      wikiFetcher: fakeFetch(wikimediaRoute),
    });
    expect(snapshot.date).toBe("2026-10-05");
    const written = JSON.parse(await readFile(snapshotPath(outDir, "2026-10-05"), "utf8")) as Snapshot;
    expect(written.version).toBe(1);
    expect(written.wiktionary.words.map((w) => w.title)).toEqual(["quarantine", "december", null]);
  });

  it("writes nothing when a source fails", async () => {
    const wikiFetcher = fakeFetch((url) =>
      url.startsWith("https://wikimedia.org/") ? jsonResponse("{}", 500) : wikimediaRoute(url)
    );
    await expect(
      runDemandReport({ entries: FIXTURE_ENTRIES, now: NOW, outDir, wikiFetcher })
    ).rejects.toThrow("HTTP 500");
    expect(existsSync(path.join(outDir, "snapshots"))).toBe(false);
  });

  it("refuses to write when no word has any views", async () => {
    const wikiFetcher = fakeFetch((url) =>
      url.startsWith("https://wikimedia.org/") ? jsonResponse("{}", 404) : wikimediaRoute(url)
    );
    await expect(
      runDemandReport({ entries: FIXTURE_ENTRIES, now: NOW, outDir, wikiFetcher })
    ).rejects.toThrow("No word has any Wiktionary pageviews");
    expect(existsSync(path.join(outDir, "snapshots"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run scripts/demand/run.test.ts`
Expected: FAIL, "Failed to resolve import ./run".

- [ ] **Step 3: Implement** `scripts/demand/run.ts`:

```ts
// The demand report pipeline: collect every source first, and only once all
// of them have succeeded, write anything. A failure anywhere rejects before
// the output folder is touched, so a broken run can never replace a good
// report with an empty one.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FetchLike } from "./http";
import type { Snapshot } from "./types";
import { collectWiktionary } from "./wiktionary";

export type RunOptions = {
  entries: { slug: string; word: string }[];
  now: Date;
  outDir: string;
  wikiFetcher: FetchLike;
  log?: (line: string) => void;
};

export function snapshotPath(outDir: string, date: string): string {
  return path.join(outDir, "snapshots", `${date}.json`);
}

export async function runDemandReport(options: RunOptions): Promise<{ snapshot: Snapshot }> {
  const log = options.log ?? (() => {});

  const wiktionary = await collectWiktionary(options.entries, {
    fetcher: options.wikiFetcher,
    now: options.now,
    onProgress: (done, total) => {
      if (done % 100 === 0 || done === total) log(`Wiktionary: ${done}/${total}`);
    },
  });
  if (!wiktionary.words.some((w) => w.total12 > 0)) {
    throw new Error("No word has any Wiktionary pageviews; refusing to write an empty report.");
  }

  const snapshot: Snapshot = {
    version: 1,
    date: options.now.toISOString().slice(0, 10),
    generatedAt: options.now.toISOString(),
    wiktionary,
    searchConsole: null,
  };

  await mkdir(path.join(options.outDir, "snapshots"), { recursive: true });
  await writeFile(snapshotPath(options.outDir, snapshot.date), `${JSON.stringify(snapshot)}\n`);
  return { snapshot };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run scripts/demand/run.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the entry point** `scripts/demandReport.ts`. This Phase 1 version prints the top 50 and bottom 50; Task 12 replaces that with a counts-only summary.

```ts
// Weekly demand report: English Wiktionary pageviews for every word in
// lib/words.ts, written to <out>/snapshots/<date>.json.
// Usage: npm run demand:report -- [--out <dir>]   (default .reports/demand)
import { WORDS } from "../lib/words";
import { createFetcher } from "./demand/http";
import { runDemandReport } from "./demand/run";
import type { WordDemand } from "./demand/types";
import { formatTrend, rankByDemand } from "./demand/wiktionary";

const USAGE = "Usage: npm run demand:report -- [--out <dir>]";

function outDirFromArgs(args: string[]): string {
  const i = args.indexOf("--out");
  if (i === -1) return ".reports/demand";
  const value = args[i + 1];
  if (!value || value.startsWith("--")) {
    console.error(USAGE);
    process.exit(1);
  }
  return value;
}

function row(w: WordDemand): string {
  const title = w.title !== w.word ? ` (as "${w.title}")` : "";
  return `${String(w.total12).padStart(9)}  ${w.avg3.toFixed(0).padStart(7)}  ${formatTrend(w.trend, w.avg3).padStart(6)}  ${w.word}${title}`;
}

async function main() {
  const outDir = outDirFromArgs(process.argv.slice(2));
  const { snapshot } = await runDemandReport({
    entries: WORDS,
    now: new Date(),
    outDir,
    wikiFetcher: createFetcher({ minGapMs: 100 }),
    log: (line) => console.log(`[demand-report] ${line}`),
  });

  const ranked = rankByDemand(snapshot.wiktionary.words);
  const missing = snapshot.wiktionary.words.filter((w) => w.title === null);
  const header = `${"12-month".padStart(9)}  ${"3-mo avg".padStart(7)}  ${"trend".padStart(6)}  word`;
  console.log(`\nTop 50 by Wiktionary demand (${snapshot.wiktionary.months[0]}–${snapshot.wiktionary.months[11]})\n${header}`);
  ranked.slice(0, 50).forEach((w) => console.log(row(w)));
  console.log(`\nBottom 50\n${header}`);
  ranked.slice(-50).forEach((w) => console.log(row(w)));
  console.log(`\nNo Wiktionary page (${missing.length}): ${missing.map((w) => w.word).join(", ") || "none"}`);
}

main().catch((error: unknown) => {
  console.error(`[demand-report] FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
```

- [ ] **Step 6: Add the npm script and the gitignore entry.** In `package.json`'s `scripts`, after `"social:preview"`, add:

```json
    "demand:report": "tsx --env-file-if-exists=.env.local scripts/demandReport.ts"
```

(Add a trailing comma to the `social:preview` line.) Append to `.gitignore`:

```
# demand report output when run locally (npm run demand:report)
/.reports/
```

- [ ] **Step 7: Run all checks**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add scripts/demand/run.ts scripts/demand/run.test.ts scripts/demandReport.ts package.json .gitignore
git commit -m "feat: npm run demand:report — Wiktionary snapshot for every word

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Real run, then **STOP for Phase 1 sign-off**

- [ ] **Step 1: Run it for real.** It takes a few minutes.

Run: `npm run demand:report`
Expected:
- progress lines `[demand-report] Wiktionary: 100/1147` … `1147/1147`;
- the top 50 and bottom 50 tables;
- the no-page list;
- `.reports/demand/snapshots/<today>.json` exists.

- [ ] **Step 2: Sanity-check the output.**
  - Spot-check two words by hand at `https://pageviews.wmcloud.org/?project=en.wiktionary.org&platform=all-access&agent=user&range=last-year&pages=<title>` and confirm the 12-month totals roughly match.
  - Confirm the seven capitalised words (December, January, Jupiter, October, Pluto, Thursday, Wednesday) counted their capitalised page.
- [ ] **Step 3: Show the owner** the top 50, the bottom 50 and the no-page list, and **stop**. Don't start Phase 2 until the owner signs off.

---

# Phase 2: Search Console

### Task 6: Service account key, JWT and access token

**Files:**
- Create: `scripts/demand/searchConsole.ts`
- Test: `scripts/demand/searchConsole.test.ts`
- Modify: `scripts/demand/testing.ts` (append `testServiceAccount`)

**Interfaces:**
- Produces:
  - `GSC_SITE = "sc-domain:curioword.com"`
  - `GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"`
  - `TOKEN_URL = "https://oauth2.googleapis.com/token"`
  - `type ServiceAccountKey = { client_email: string; private_key: string }`
  - `loadServiceAccountKey(env?: Record<string, string | undefined>): ServiceAccountKey | null`
  - `buildJwt(key: ServiceAccountKey, nowSeconds: number): string`
  - `getAccessToken(key: ServiceAccountKey, fetcher: FetchLike, nowSeconds: number): Promise<string>`
  - in `testing.ts`: `testServiceAccount(): { key: ServiceAccountKey; publicKey: string; envValue: string }`

- [ ] **Step 1: Append to `scripts/demand/testing.ts`** (add `import { generateKeyPairSync } from "node:crypto";` and `import type { ServiceAccountKey } from "./searchConsole";` at the top):

```ts
/** A throwaway RSA service account, generated per test run. envValue is the
 * key file JSON base64-encoded, the way GSC_SERVICE_ACCOUNT_KEY holds it. */
export function testServiceAccount(): { key: ServiceAccountKey; publicKey: string; envValue: string } {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const key = { client_email: "demand-report@curio-test.iam.gserviceaccount.com", private_key: privateKey };
  const file = { type: "service_account", project_id: "curio-test", ...key };
  return { key, publicKey, envValue: Buffer.from(JSON.stringify(file)).toString("base64") };
}
```

- [ ] **Step 2: Write the failing test** in `scripts/demand/searchConsole.test.ts`:

```ts
import { createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GSC_SCOPE, TOKEN_URL, buildJwt, getAccessToken, loadServiceAccountKey } from "./searchConsole";
import { fakeFetch, jsonResponse, testServiceAccount } from "./testing";

const account = testServiceAccount();
const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

describe("loadServiceAccountKey", () => {
  it("returns null when the variable is unset or blank", () => {
    expect(loadServiceAccountKey({})).toBeNull();
    expect(loadServiceAccountKey({ GSC_SERVICE_ACCOUNT_KEY: "   " })).toBeNull();
  });

  it("decodes a base64 JSON key file", () => {
    const key = loadServiceAccountKey({ GSC_SERVICE_ACCOUNT_KEY: account.envValue });
    expect(key).toEqual(account.key);
  });

  it("throws without echoing the value when it isn't base64 JSON", () => {
    const value = "not-a-key-but-pretend-it-is-secret";
    expect(() => loadServiceAccountKey({ GSC_SERVICE_ACCOUNT_KEY: value })).toThrow(
      "GSC_SERVICE_ACCOUNT_KEY is set but isn't base64-encoded JSON"
    );
    try {
      loadServiceAccountKey({ GSC_SERVICE_ACCOUNT_KEY: value });
    } catch (error) {
      expect(String(error)).not.toContain(value);
    }
  });

  it("throws when client_email or private_key is missing", () => {
    const value = Buffer.from(JSON.stringify({ client_email: "x@y" })).toString("base64");
    expect(() => loadServiceAccountKey({ GSC_SERVICE_ACCOUNT_KEY: value })).toThrow(
      "GSC_SERVICE_ACCOUNT_KEY has no client_email or private_key"
    );
  });
});

describe("buildJwt", () => {
  it("builds an RS256 JWT for the read-only scope, signed by the key", () => {
    const jwt = buildJwt(account.key, 1_790_000_000);
    const [header, claims, signature] = jwt.split(".");
    expect(decode(header)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decode(claims)).toEqual({
      iss: account.key.client_email,
      scope: GSC_SCOPE,
      aud: TOKEN_URL,
      iat: 1_790_000_000,
      exp: 1_790_003_600,
    });
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${claims}`);
    expect(verifier.verify(account.publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  });
});

describe("getAccessToken", () => {
  it("exchanges the JWT for an access token", async () => {
    const fetch = fakeFetch(() => jsonResponse('{"access_token":"ya29.test","expires_in":3599}'));
    const token = await getAccessToken(account.key, fetch, 1_790_000_000);
    expect(token).toBe("ya29.test");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(TOKEN_URL);
    expect(init?.method).toBe("POST");
    const form = new URLSearchParams(String(init?.body));
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(form.get("assertion")?.split(".")).toHaveLength(3);
  });

  it("reports only the status and Google's error code on failure", async () => {
    const fetch = fakeFetch(() =>
      jsonResponse('{"error":"invalid_grant","error_description":"Invalid JWT Signature for key abc123"}', 400)
    );
    const error = await getAccessToken(account.key, fetch, 1_790_000_000).catch((e: unknown) => e);
    expect(String(error)).toContain("Search Console token request failed: HTTP 400 (invalid_grant)");
    expect(String(error)).not.toContain("abc123");
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run scripts/demand/searchConsole.test.ts`
Expected: FAIL, "Failed to resolve import ./searchConsole".

- [ ] **Step 4: Implement** `scripts/demand/searchConsole.ts`:

```ts
// Google Search Console, read-only, through a service account. The JWT is
// signed here with node:crypto (RS256, the OAuth JWT bearer grant) rather
// than pulling in google-auth-library for one request.
//
// Secrets: the key arrives base64-encoded in GSC_SERVICE_ACCOUNT_KEY and is
// never printed. Errors carry the HTTP status and Google's short error code
// only, never response bodies (error_description can quote key ids).
import { createSign } from "node:crypto";
import type { FetchLike } from "./http";

export const GSC_SITE = "sc-domain:curioword.com";
export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";

export type ServiceAccountKey = { client_email: string; private_key: string };

/** The service account key from GSC_SERVICE_ACCOUNT_KEY, or null when it
 * isn't set (Search Console is then skipped, not failed). A set but
 * malformed value throws: a broken key mustn't pass for "not set up yet". */
export function loadServiceAccountKey(
  env: Record<string, string | undefined> = process.env
): ServiceAccountKey | null {
  const raw = env.GSC_SERVICE_ACCOUNT_KEY?.trim();
  if (!raw) return null;
  let parsed: Partial<ServiceAccountKey> | null;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as Partial<ServiceAccountKey> | null;
  } catch {
    throw new Error("GSC_SERVICE_ACCOUNT_KEY is set but isn't base64-encoded JSON.");
  }
  if (typeof parsed?.client_email !== "string" || typeof parsed.private_key !== "string") {
    throw new Error("GSC_SERVICE_ACCOUNT_KEY has no client_email or private_key.");
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

const base64url = (value: string) => Buffer.from(value).toString("base64url");

export function buildJwt(key: ServiceAccountKey, nowSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: GSC_SCOPE,
      aud: TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(key.private_key).toString("base64url")}`;
}

/** " (CODE)" from a Google error body — `{"error":"invalid_grant"}` from the
 * token endpoint, `{"error":{"status":"PERMISSION_DENIED"}}` from the API —
 * or "" when there isn't one. Nothing else from the body is used. */
export async function googleErrorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string | { status?: string } };
    const code = typeof body.error === "string" ? body.error : body.error?.status;
    return code ? ` (${code})` : "";
  } catch {
    return "";
  }
}

export async function getAccessToken(
  key: ServiceAccountKey,
  fetcher: FetchLike,
  nowSeconds: number
): Promise<string> {
  const response = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: buildJwt(key, nowSeconds),
    }).toString(),
  });
  if (!response.ok) {
    throw new Error(
      `Search Console token request failed: HTTP ${response.status}${await googleErrorCode(response)}`
    );
  }
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("Search Console token response had no access_token.");
  return body.access_token;
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run scripts/demand/searchConsole.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/demand/searchConsole.ts scripts/demand/searchConsole.test.ts scripts/demand/testing.ts
git commit -m "feat: demand report — Search Console service-account auth

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Search Analytics queries and `collectSearchConsole`

**Files:**
- Create: `scripts/__fixtures__/demand/gsc-page.json`, `gsc-query.json`, `gsc-page-query.json`
- Modify: `scripts/demand/searchConsole.ts` (append)
- Modify: `scripts/demand/testing.ts` (append `googleRoute`)
- Test: `scripts/demand/searchConsole.test.ts` (append)

**Interfaces:**
- Consumes: `getAccessToken`, `googleErrorCode`, `GSC_SITE` (Task 6); `GscRow` and `SearchConsoleData` (Task 2).
- Produces:
  - `LAG_DAYS = 3`
  - `searchConsoleWindow(now: Date): { startDate: string; endDate: string }`
  - `queryAll(accessToken: string, dimensions: string[], window: { startDate: string; endDate: string }, fetcher: FetchLike, rowLimit?: number): Promise<GscRow[]>`
  - `collectSearchConsole(key: ServiceAccountKey, options: { fetcher: FetchLike; now: Date }): Promise<SearchConsoleData>`
  - in `testing.ts`: `googleRoute(url: string, init?: RequestInit): Response | null`

- [ ] **Step 1: Create the fixtures.**

`scripts/__fixtures__/demand/gsc-page.json`:

```json
{
  "rows": [
    { "keys": ["https://curioword.com/story/quarantine"], "clicks": 4, "impressions": 120, "ctr": 0.0333, "position": 11.5 },
    { "keys": ["https://www.curioword.com/story/quarantine"], "clicks": 1, "impressions": 30, "ctr": 0.0333, "position": 14 },
    { "keys": ["https://curioword.com/story/december"], "clicks": 0, "impressions": 6, "ctr": 0, "position": 42.3 },
    { "keys": ["https://curioword.com/"], "clicks": 9, "impressions": 80, "ctr": 0.1125, "position": 3.2 }
  ],
  "responseAggregationType": "byPage"
}
```

`scripts/__fixtures__/demand/gsc-query.json`:

```json
{
  "rows": [
    { "keys": ["curio word"], "clicks": 9, "impressions": 80, "ctr": 0.1125, "position": 3.2 },
    { "keys": ["quarantine origin"], "clicks": 3, "impressions": 60, "ctr": 0.05, "position": 9.8 },
    { "keys": ["quarantine meaning"], "clicks": 1, "impressions": 50, "ctr": 0.02, "position": 18.1 },
    { "keys": ["forty days venice"], "clicks": 1, "impressions": 40, "ctr": 0.025, "position": 12 }
  ],
  "responseAggregationType": "byProperty"
}
```

`scripts/__fixtures__/demand/gsc-page-query.json`:

```json
{
  "rows": [
    { "keys": ["https://curioword.com/", "curio word"], "clicks": 9, "impressions": 80, "ctr": 0.1125, "position": 3.2 },
    { "keys": ["https://curioword.com/story/quarantine", "quarantine origin"], "clicks": 3, "impressions": 60, "ctr": 0.05, "position": 9.8 },
    { "keys": ["https://curioword.com/story/quarantine", "forty days venice"], "clicks": 1, "impressions": 40, "ctr": 0.025, "position": 12 },
    { "keys": ["https://curioword.com/story/quarantine", "quarantine meaning"], "clicks": 1, "impressions": 30, "ctr": 0.0333, "position": 18 },
    { "keys": ["https://www.curioword.com/story/quarantine", "quarantine meaning"], "clicks": 0, "impressions": 20, "ctr": 0, "position": 18.25 }
  ],
  "responseAggregationType": "byPage"
}
```

- [ ] **Step 2: Append `googleRoute` to `scripts/demand/testing.ts`:**

```ts
const GSC_FIXTURES: Record<string, string> = {
  page: "gsc-page.json",
  query: "gsc-query.json",
  "page+query": "gsc-page-query.json",
};

/** The token endpoint and the three Search Analytics queries, from fixtures. */
export function googleRoute(url: string, init?: RequestInit): Response | null {
  if (url === "https://oauth2.googleapis.com/token") {
    return jsonResponse('{"access_token":"ya29.test","expires_in":3599,"token_type":"Bearer"}');
  }
  if (url.startsWith("https://searchconsole.googleapis.com/")) {
    const body = JSON.parse(String(init?.body)) as { dimensions: string[] };
    const name = GSC_FIXTURES[body.dimensions.join("+")];
    if (name) return jsonResponse(fixture(name));
  }
  return null;
}
```

- [ ] **Step 3: Write the failing tests.** Append to `scripts/demand/searchConsole.test.ts`. Extend the `./searchConsole` import with `GSC_SITE, collectSearchConsole, queryAll, searchConsoleWindow`, and the `./testing` import with `googleRoute`.

```ts
const QUERY_URL =
  "https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain%3Acurioword.com/searchAnalytics/query";
const WINDOW = { startDate: "2026-09-03", endDate: "2026-09-30" };
const row = (key: string) => ({ keys: [key], clicks: 1, impressions: 2, ctr: 0.5, position: 3 });

describe("searchConsoleWindow", () => {
  it("covers 28 days ending 3 days before the run", () => {
    expect(searchConsoleWindow(new Date("2026-10-03T06:00:00Z"))).toEqual(WINDOW);
    expect(searchConsoleWindow(new Date("2026-03-03T23:59:00Z"))).toEqual({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });
  });
});

describe("queryAll", () => {
  it("posts the query with the bearer token and paginates until a short page", async () => {
    const pages = [[row("a"), row("b")], [row("c")]];
    const fetch = fakeFetch(() => jsonResponse(JSON.stringify({ rows: pages.shift() })));
    const rows = await queryAll("ya29.test", ["page"], WINDOW, fetch, 2);
    expect(rows.map((r) => r.keys[0])).toEqual(["a", "b", "c"]);
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, init] = fetch.mock.calls[1];
    expect(url).toBe(QUERY_URL);
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer ya29.test");
    expect(JSON.parse(String(init?.body))).toEqual({
      ...WINDOW,
      dimensions: ["page"],
      type: "web",
      rowLimit: 2,
      startRow: 2,
    });
  });

  it("treats a response with no rows as empty", async () => {
    const fetch = fakeFetch(() => jsonResponse('{"responseAggregationType":"auto"}'));
    expect(await queryAll("t", ["query"], WINDOW, fetch)).toEqual([]);
  });

  it("names the dimension and Google's status on failure", async () => {
    const fetch = fakeFetch(() =>
      jsonResponse('{"error":{"code":403,"message":"User does not have sufficient permission","status":"PERMISSION_DENIED"}}', 403)
    );
    await expect(queryAll("t", ["page", "query"], WINDOW, fetch)).rejects.toThrow(
      "Search Console query (page+query) failed: HTTP 403 (PERMISSION_DENIED)"
    );
  });
});

describe("collectSearchConsole", () => {
  it("gets a token, then pulls by page, by query and by page and query", async () => {
    const fetch = fakeFetch(googleRoute);
    const data = await collectSearchConsole(account.key, {
      fetcher: fetch,
      now: new Date("2026-10-03T06:00:00Z"),
    });
    expect(data.site).toBe(GSC_SITE);
    expect(data.startDate).toBe("2026-09-03");
    expect(data.endDate).toBe("2026-09-30");
    expect(data.byPage).toHaveLength(4);
    expect(data.byQuery).toHaveLength(4);
    expect(data.byPageQuery).toHaveLength(5);
    expect(fetch.mock.calls[0][0]).toBe(TOKEN_URL);
  });
});
```

- [ ] **Step 4: Run them and confirm they fail**

Run: `npx vitest run scripts/demand/searchConsole.test.ts`
Expected: FAIL, "queryAll is not a function" or a similar import error.

- [ ] **Step 5: Implement.** Append to `scripts/demand/searchConsole.ts`, and add `import type { GscRow, SearchConsoleData } from "./types";`:

```ts
/** Search Console data lags by a few days, so the window ends this many days before the run. */
export const LAG_DAYS = 3;
const WINDOW_DAYS = 28;
const DAY_MS = 24 * 60 * 60 * 1000;
const QUERY_URL = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
  GSC_SITE
)}/searchAnalytics/query`;
/** The API's maximum rows per request. */
const ROW_LIMIT = 25_000;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function searchConsoleWindow(now: Date): { startDate: string; endDate: string } {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = new Date(today - LAG_DAYS * DAY_MS);
  const start = new Date(end.getTime() - (WINDOW_DAYS - 1) * DAY_MS);
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

/** Every row for one dimension set, paging with startRow until a short page. */
export async function queryAll(
  accessToken: string,
  dimensions: string[],
  window: { startDate: string; endDate: string },
  fetcher: FetchLike,
  rowLimit = ROW_LIMIT
): Promise<GscRow[]> {
  const rows: GscRow[] = [];
  for (let startRow = 0; ; startRow += rowLimit) {
    const response = await fetcher(QUERY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...window, dimensions, type: "web", rowLimit, startRow }),
    });
    if (!response.ok) {
      throw new Error(
        `Search Console query (${dimensions.join("+")}) failed: HTTP ${response.status}${await googleErrorCode(response)}`
      );
    }
    const page = ((await response.json()) as { rows?: GscRow[] }).rows ?? [];
    for (const r of page) {
      rows.push({ keys: r.keys, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position });
    }
    if (page.length < rowLimit) return rows;
  }
}

export async function collectSearchConsole(
  key: ServiceAccountKey,
  options: { fetcher: FetchLike; now: Date }
): Promise<SearchConsoleData> {
  const token = await getAccessToken(key, options.fetcher, Math.floor(options.now.getTime() / 1000));
  const window = searchConsoleWindow(options.now);
  const byPage = await queryAll(token, ["page"], window, options.fetcher);
  const byQuery = await queryAll(token, ["query"], window, options.fetcher);
  const byPageQuery = await queryAll(token, ["page", "query"], window, options.fetcher);
  return { site: GSC_SITE, ...window, byPage, byQuery, byPageQuery };
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run scripts/demand`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/__fixtures__/demand/gsc-*.json scripts/demand/searchConsole.ts scripts/demand/searchConsole.test.ts scripts/demand/testing.ts
git commit -m "feat: demand report — Search Analytics by page, query and both

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Wire Search Console into the pipeline, write the owner's setup steps, **STOP for Phase 2 sign-off**

**Files:**
- Modify: `scripts/demand/run.ts`, `scripts/demand/run.test.ts`, `scripts/demandReport.ts`
- Create: `docs/demand-report-setup.md`

**Interfaces:**
- Consumes: `loadServiceAccountKey`, `collectSearchConsole` (Tasks 6–7).
- Produces: `RunOptions` gains `googleFetcher: FetchLike` and `env: Record<string, string | undefined>`.

- [ ] **Step 1: Write the failing tests.**
  - Update the three existing `runDemandReport` calls in `scripts/demand/run.test.ts` to also pass `googleFetcher: fakeFetch(), env: {}`.
  - Extend the `./testing` import with `googleRoute, testServiceAccount`.
  - Append:

```ts
describe("runDemandReport with Search Console", () => {
  const account = testServiceAccount();

  it("skips Search Console, and says so, when the key isn't set", async () => {
    const lines: string[] = [];
    const { snapshot } = await runDemandReport({
      entries: FIXTURE_ENTRIES,
      now: NOW,
      outDir,
      wikiFetcher: fakeFetch(wikimediaRoute),
      googleFetcher: fakeFetch(),
      env: {},
      log: (line) => lines.push(line),
    });
    expect(snapshot.searchConsole).toBeNull();
    expect(lines).toContain("Search Console: skipped (GSC_SERVICE_ACCOUNT_KEY is not set)");
  });

  it("includes Search Console when the key is set, logging counts only", async () => {
    const lines: string[] = [];
    const { snapshot } = await runDemandReport({
      entries: FIXTURE_ENTRIES,
      now: NOW,
      outDir,
      wikiFetcher: fakeFetch(wikimediaRoute),
      googleFetcher: fakeFetch(googleRoute),
      env: { GSC_SERVICE_ACCOUNT_KEY: account.envValue },
      log: (line) => lines.push(line),
    });
    expect(snapshot.searchConsole?.byPage).toHaveLength(4);
    expect(lines).toContain("Search Console: 4 page rows, 4 query rows, 5 page+query rows");
    expect(lines.join("\n")).not.toContain("quarantine origin");
  });

  it("fails, writing nothing, when the key is set but Search Console refuses", async () => {
    const googleFetcher = fakeFetch((url) =>
      url.startsWith("https://searchconsole.googleapis.com/")
        ? jsonResponse('{"error":{"status":"PERMISSION_DENIED"}}', 403)
        : googleRoute(url)
    );
    await expect(
      runDemandReport({
        entries: FIXTURE_ENTRIES,
        now: NOW,
        outDir,
        wikiFetcher: fakeFetch(wikimediaRoute),
        googleFetcher,
        env: { GSC_SERVICE_ACCOUNT_KEY: account.envValue },
      })
    ).rejects.toThrow("PERMISSION_DENIED");
    expect(existsSync(path.join(outDir, "snapshots"))).toBe(false);
  });

  it("fails before the slow Wiktionary pass when the key is malformed", async () => {
    const wikiFetcher = fakeFetch(wikimediaRoute);
    await expect(
      runDemandReport({
        entries: FIXTURE_ENTRIES,
        now: NOW,
        outDir,
        wikiFetcher,
        googleFetcher: fakeFetch(),
        env: { GSC_SERVICE_ACCOUNT_KEY: "garbage" },
      })
    ).rejects.toThrow("isn't base64-encoded JSON");
    expect(wikiFetcher).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run scripts/demand/run.test.ts`
Expected: FAIL. The new tests fail (`searchConsole` is always null, and no log line appears).

- [ ] **Step 3: Implement.** In `scripts/demand/run.ts`:
  - Add the imports `import { collectSearchConsole, loadServiceAccountKey } from "./searchConsole";` and `import type { SearchConsoleData, Snapshot } from "./types";` (replacing the `Snapshot`-only import).
  - Add `googleFetcher: FetchLike;` and `env: Record<string, string | undefined>;` to `RunOptions`.
  - Make the start of `runDemandReport` read:

```ts
export async function runDemandReport(options: RunOptions): Promise<{ snapshot: Snapshot }> {
  const log = options.log ?? (() => {});
  // Read the key first: a malformed key fails now, not after the slow
  // Wiktionary pass.
  const key = loadServiceAccountKey(options.env);

  const wiktionary = await collectWiktionary(options.entries, {
    fetcher: options.wikiFetcher,
    now: options.now,
    onProgress: (done, total) => {
      if (done % 100 === 0 || done === total) log(`Wiktionary: ${done}/${total}`);
    },
  });
  if (!wiktionary.words.some((w) => w.total12 > 0)) {
    throw new Error("No word has any Wiktionary pageviews; refusing to write an empty report.");
  }

  let searchConsole: SearchConsoleData | null = null;
  if (key) {
    searchConsole = await collectSearchConsole(key, { fetcher: options.googleFetcher, now: options.now });
    // Counts only: the Actions log is public, the queries aren't.
    log(
      `Search Console: ${searchConsole.byPage.length} page rows, ${searchConsole.byQuery.length} query rows, ${searchConsole.byPageQuery.length} page+query rows`
    );
  } else {
    log("Search Console: skipped (GSC_SERVICE_ACCOUNT_KEY is not set)");
  }

  const snapshot: Snapshot = {
    version: 1,
    date: options.now.toISOString().slice(0, 10),
    generatedAt: options.now.toISOString(),
    wiktionary,
    searchConsole,
  };
```

  The rest (`mkdir`, `writeFile`, `return`) is unchanged.

  In `scripts/demandReport.ts`, add `googleFetcher: createFetcher(),` and `env: process.env,` to the `runDemandReport` call. Update the header comment's first line to "English Wiktionary pageviews and (when GSC_SERVICE_ACCOUNT_KEY is set) Google Search Console data".

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run scripts/demand`
Expected: PASS.

- [ ] **Step 5: Write `docs/demand-report-setup.md`.** This is Part A only; Task 13 adds Part B.

```markdown
# Demand report: owner setup

These are the parts of the weekly demand report (`npm run demand:report`,
`.github/workflows/demand-report.yml`) that only the owner can do. None of
these values should ever be pasted into a chat, a commit or a log.

## Part A: Search Console service account

You need a Google account with **Owner** access to the
`curioword.com` Domain property in Search Console.

1. **Create a Google Cloud project.** Go to
   <https://console.cloud.google.com/projectcreate>, name it
   `curio-reports`, and create it. You don't need a billing account.
2. **Enable the API.** With that project selected, open
   <https://console.cloud.google.com/apis/library/searchconsole.googleapis.com>
   and click **Enable**.
3. **Create the service account.** Go to **IAM & Admin → Service Accounts**
   (<https://console.cloud.google.com/iam-admin/serviceaccounts>), then click
   **Create service account**:
   - Name it `curio-demand-report`.
   - Click **Create and continue**.
   - **Skip** the "Grant this service account access to project" step. It
     needs no Cloud roles.
   - Click **Done**.
4. **Create a key.** Open the new service account, go to the **Keys** tab,
   and click **Add key → Create new key → JSON → Create**. A `.json` file
   downloads.
   - If you see "Service account key creation is disabled", an organisation
     policy is blocking it. Stop there and tell Claude.
5. **Copy the service account's email.** It looks like
   `curio-demand-report@curio-reports-XXXXXX.iam.gserviceaccount.com` and is
   shown on its details page.
6. **Add it to Search Console.** Open <https://search.google.com/search-console>
   and select the `curioword.com` Domain property. Then go to **Settings →
   Users and permissions → Add user**:
   - Paste the email.
   - Set **Permission: Restricted**. That's read-only, and enough for this
     report.
   - Click **Add**.
7. **Store the key in GitHub.** In PowerShell, from the folder holding the
   downloaded file, run this. It base64-encodes the file and pipes it
   straight into the secret, so it never appears on screen:

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\<downloaded-file>.json")) | gh secret set GSC_SERVICE_ACCOUNT_KEY --repo SamxJames/curio-web
   ```

   (Or go to GitHub → `curio-web` → **Settings → Secrets and variables →
   Actions → New repository secret**, name it `GSC_SERVICE_ACCOUNT_KEY`, and
   paste the base64 text.)
8. **Store the key in `.env.local`.** Copy the base64 text to the clipboard:

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\<downloaded-file>.json")) | Set-Clipboard
   ```

   Then add one line to `curio-web/.env.local`:
   `GSC_SERVICE_ACCOUNT_KEY=` followed by a paste.
9. **Delete the downloaded `.json` file**, or move it into your password
   manager. The two stored copies are all you need.
10. **Check it works.** Run `npm run demand:report`. The log should say
    `Search Console: N page rows, …` rather than `skipped`. Search Console
    can take a few minutes to recognise a newly added user. If it says
    `PERMISSION_DENIED`, wait a little and try again, then re-check step 6.

### Rotating the service account key

1. In the service account's **Keys** tab, create a new JSON key (step 4).
2. Repeat steps 7 and 8 with the new file. `gh secret set` overwrites the
   old secret.
3. Run `npm run demand:report` locally and confirm Search Console is
   included.
4. Back in the **Keys** tab, delete the **old** key (check the key ID and
   creation date).
5. Delete the downloaded file.
```

- [ ] **Step 6: Run all checks**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add scripts/demand/run.ts scripts/demand/run.test.ts scripts/demandReport.ts docs/demand-report-setup.md
git commit -m "feat: demand report includes Search Console when its key is set

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Real run without credentials.** Run `npm run demand:report` with no `GSC_SERVICE_ACCOUNT_KEY`. Confirm it logs `Search Console: skipped (…)` and still writes the snapshot.
- [ ] **Step 9: STOP.** Send the owner the Part A steps from `docs/demand-report-setup.md`. Once they confirm the key is in `.env.local`, run `npm run demand:report` again. Report the **row counts only** in chat (no queries), plus the date window. Wait for Phase 2 sign-off.

---

# Phase 3: the combined report and the schedule

### Task 9: Joining and the four Search Console sections

**Files:**
- Create: `scripts/demand/report.ts`
- Test: `scripts/demand/report.test.ts`

**Interfaces:**
- Consumes: the `types.ts` types; `rankByDemand` and `lastCompleteMonths` (Task 2); fixtures `gsc-*.json` (Task 7).
- Produces, in `testing.ts`: `MONTHS`, `word(slug, total12, overrides?)`, `gscFromFixtures()`, `makeSnapshot(overrides?)`.
- Produces (all exported from `report.ts`):
  - `type PageStats = { impressions: number; clicks: number; ctr: number; position: number }`
  - `type JoinedWord = WordDemand & { gsc: PageStats | null }`
  - `type PageRow = PageStats & { path: string; word: string | null }`
  - `type QueryRow = PageStats & { query: string; path: string; word: string }`
  - `TOP_LIMIT = 30`, `OPPORTUNITY_MAX_IMPRESSIONS = 10`, `INTENT_STEMS: string[]`
  - `pagePath(url: string): string | null`
  - `storySlug(path: string): string | null`
  - `pageStatsByPath(rows: GscRow[]): Map<string, PageStats>`
  - `wordsBySlug(snapshot: Snapshot): Map<string, string>`
  - `joinByWord(snapshot: Snapshot): JoinedWord[]`
  - `topByDemand(joined: JoinedWord[], limit?: number): JoinedWord[]`
  - `opportunities(joined: JoinedWord[], limit?: number): JoinedWord[]`
  - `nearlyThere(data: SearchConsoleData, bySlug: Map<string, string>, limit?: number): PageRow[]`
  - `offPatternQueries(data: SearchConsoleData, bySlug: Map<string, string>, limit?: number): { offWord: QueryRow[]; otherIntent: QueryRow[] }`

- [ ] **Step 1: Add the shared report fixtures to `scripts/demand/testing.ts`.** Tasks 9–12 all use them. Add these imports at the top: `import type { SearchConsoleData, Snapshot, WordDemand } from "./types";` and `import { lastCompleteMonths } from "./wiktionary";`. Then append:

```ts
/** A week's snapshot for the report tests: nine words, with Search Console
 * data from the gsc-*.json fixtures. The 8 words with a page and views put
 * quarantine and December in the top quarter. */
export const MONTHS = lastCompleteMonths(new Date("2026-10-05T06:00:00Z"));

export function word(slug: string, total12: number, overrides: Partial<WordDemand> = {}): WordDemand {
  return {
    slug,
    word: slug,
    title: slug,
    views: [...Array(11).fill(0), total12],
    total12,
    avg3: total12 / 3,
    trend: null,
    ...overrides,
  };
}

export function gscFromFixtures(): SearchConsoleData {
  return {
    site: "sc-domain:curioword.com",
    startDate: "2026-09-03",
    endDate: "2026-09-30",
    byPage: JSON.parse(fixture("gsc-page.json")).rows,
    byQuery: JSON.parse(fixture("gsc-query.json")).rows,
    byPageQuery: JSON.parse(fixture("gsc-page-query.json")).rows,
  };
}

export function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    version: 1,
    date: "2026-10-05",
    generatedAt: "2026-10-05T06:00:00.000Z",
    wiktionary: {
      months: MONTHS,
      words: [
        word("quarantine", 12500),
        word("december", 9000, { word: "December", title: "December" }),
        word("algebra", 8000),
        word("zephyr", 7000),
        word("bank", 300),
        word("thistle", 200),
        word("quixotic", 100),
        word("lexicon", 50),
        word("zzxqv", 0, { title: null }),
      ],
    },
    searchConsole: gscFromFixtures(),
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing test** in `scripts/demand/report.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  joinByWord,
  nearlyThere,
  offPatternQueries,
  opportunities,
  pagePath,
  pageStatsByPath,
  storySlug,
  topByDemand,
  wordsBySlug,
} from "./report";
import { gscFromFixtures, makeSnapshot, word } from "./testing";
import type { SearchConsoleData } from "./types";
import { lastCompleteMonths } from "./wiktionary";

describe("pagePath and storySlug", () => {
  it("normalises curioword.com URLs, apex or www, to a path", () => {
    expect(pagePath("https://curioword.com/story/quarantine")).toBe("/story/quarantine");
    expect(pagePath("https://www.curioword.com/story/quarantine/")).toBe("/story/quarantine");
    expect(pagePath("https://curioword.com/")).toBe("/");
    expect(pagePath("https://example.com/story/x")).toBeNull();
    expect(pagePath("not a url")).toBeNull();
  });

  it("finds the slug of a story path only", () => {
    expect(storySlug("/story/quarantine")).toBe("quarantine");
    expect(storySlug("/words")).toBeNull();
    expect(storySlug("/story/a/b")).toBeNull();
  });
});

describe("pageStatsByPath", () => {
  it("merges apex and www rows, weighting position by impressions", () => {
    const stats = pageStatsByPath(gscFromFixtures().byPage).get("/story/quarantine")!;
    expect(stats.impressions).toBe(150);
    expect(stats.clicks).toBe(5);
    expect(stats.ctr).toBeCloseTo(5 / 150);
    expect(stats.position).toBeCloseTo(12);
  });
});

describe("joinByWord and topByDemand", () => {
  it("attaches each word's story-page stats and ranks by Wiktionary demand", () => {
    const top = topByDemand(joinByWord(makeSnapshot()));
    expect(top[0]).toMatchObject({ slug: "quarantine", gsc: { impressions: 150, clicks: 5 } });
    expect(top[1]).toMatchObject({ slug: "december", gsc: { impressions: 6 } });
    expect(top.find((w) => w.slug === "algebra")?.gsc).toBeNull();
    expect(top.map((w) => w.slug)).not.toContain("zzxqv");
  });

  it("leaves gsc null for every word when Search Console was skipped", () => {
    expect(joinByWord(makeSnapshot({ searchConsole: null })).every((w) => w.gsc === null)).toBe(true);
  });

  it("caps the list", () => {
    expect(topByDemand(joinByWord(makeSnapshot()), 3)).toHaveLength(3);
  });
});

describe("opportunities", () => {
  it("keeps top-quarter words with fewer than 10 impressions", () => {
    // 8 words with a page and views → top quarter is quarantine (150 impressions) and December (6).
    expect(opportunities(joinByWord(makeSnapshot())).map((w) => w.slug)).toEqual(["december"]);
  });

  it("counts a word with no Search Console row as zero impressions", () => {
    const snapshot = makeSnapshot({ searchConsole: { ...gscFromFixtures(), byPage: [] } });
    expect(opportunities(joinByWord(snapshot)).map((w) => w.slug)).toEqual(["quarantine", "december"]);
  });
});

describe("nearlyThere", () => {
  it("lists pages averaging position 8 to 20, by impressions", () => {
    const snapshot = makeSnapshot();
    const rows = nearlyThere(snapshot.searchConsole!, wordsBySlug(snapshot));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ path: "/story/quarantine", word: "quarantine", impressions: 150 });
    expect(rows[0].position).toBeCloseTo(12);
  });
});

describe("offPatternQueries", () => {
  it("splits story-page queries into off-word and other-intent", () => {
    const snapshot = makeSnapshot();
    const { offWord, otherIntent } = offPatternQueries(snapshot.searchConsole!, wordsBySlug(snapshot));
    expect(offWord.map((r) => r.query)).toEqual(["forty days venice"]);
    expect(otherIntent).toHaveLength(1);
    expect(otherIntent[0]).toMatchObject({ query: "quarantine meaning", path: "/story/quarantine", impressions: 50, clicks: 1 });
    expect(otherIntent[0].position).toBeCloseTo(18.1);
  });

  it("matches the word case-insensitively and treats origin stems as on-pattern", () => {
    const snapshot = makeSnapshot();
    const data: SearchConsoleData = {
      ...snapshot.searchConsole!,
      byPageQuery: [
        { keys: ["https://curioword.com/story/december", "december etymology"], clicks: 0, impressions: 5, ctr: 0, position: 9 },
        { keys: ["https://curioword.com/story/december", "where does december come from"], clicks: 0, impressions: 4, ctr: 0, position: 9 },
        { keys: ["https://curioword.com/story/december", "December calendar"], clicks: 0, impressions: 3, ctr: 0, position: 9 },
      ],
    };
    const { offWord, otherIntent } = offPatternQueries(data, wordsBySlug(snapshot));
    expect(offWord).toEqual([]);
    expect(otherIntent.map((r) => r.query)).toEqual(["December calendar"]);
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run scripts/demand/report.test.ts`
Expected: FAIL, "Failed to resolve import ./report".

- [ ] **Step 4: Implement** `scripts/demand/report.ts`:

```ts
// The weekly demand report, built from a snapshot (and, for week-on-week,
// the previous one). Pure: no I/O and no clock, so every rule here is
// testable against fixtures.
import type { GscRow, SearchConsoleData, Snapshot, WordDemand } from "./types";
import { rankByDemand } from "./wiktionary";

export type PageStats = { impressions: number; clicks: number; ctr: number; position: number };
export type JoinedWord = WordDemand & { gsc: PageStats | null };
export type PageRow = PageStats & { path: string; word: string | null };
export type QueryRow = PageStats & { query: string; path: string; word: string };

export const TOP_LIMIT = 30;
export const OPPORTUNITY_MAX_IMPRESSIONS = 10;
const NEARLY_THERE = { min: 8, max: 20 };
/** Story titles promise the word's origin. A query naming the word with none
 * of these stems is after something else (meaning, pronunciation…). */
export const INTENT_STEMS = ["origin", "etymolog", "histor", "come from", "comes from", "came from", "deriv"];

const SITE_HOSTS = new Set(["curioword.com", "www.curioword.com"]);

/** "/story/quarantine" for a curioword.com URL, apex or www; null for anything else. */
export function pagePath(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!SITE_HOSTS.has(parsed.hostname)) return null;
  const path = parsed.pathname.replace(/\/+$/, "");
  return path === "" ? "/" : path;
}

export function storySlug(path: string): string | null {
  const match = /^\/story\/([^/]+)$/.exec(path);
  return match ? decodeURIComponent(match[1]) : null;
}

type Totals = { impressions: number; clicks: number; weightedPosition: number };

function accumulate(totals: Map<string, Totals>, key: string, row: GscRow) {
  const t = totals.get(key) ?? { impressions: 0, clicks: 0, weightedPosition: 0 };
  t.impressions += row.impressions;
  t.clicks += row.clicks;
  t.weightedPosition += row.position * row.impressions;
  totals.set(key, t);
}

function toStats(t: Totals): PageStats {
  return {
    impressions: t.impressions,
    clicks: t.clicks,
    ctr: t.impressions ? t.clicks / t.impressions : 0,
    position: t.impressions ? t.weightedPosition / t.impressions : 0,
  };
}

/** Page stats keyed by path, with apex and www rows for the same path merged
 * (position weighted by impressions). Off-site URLs are dropped. */
export function pageStatsByPath(rows: GscRow[]): Map<string, PageStats> {
  const totals = new Map<string, Totals>();
  for (const row of rows) {
    const path = pagePath(row.keys[0]);
    if (path) accumulate(totals, path, row);
  }
  return new Map([...totals].map(([path, t]) => [path, toStats(t)]));
}

export function wordsBySlug(snapshot: Snapshot): Map<string, string> {
  return new Map(snapshot.wiktionary.words.map((w) => [w.slug, w.word]));
}

export function joinByWord(snapshot: Snapshot): JoinedWord[] {
  const pages = snapshot.searchConsole ? pageStatsByPath(snapshot.searchConsole.byPage) : null;
  return snapshot.wiktionary.words.map((w) => ({ ...w, gsc: pages?.get(`/story/${w.slug}`) ?? null }));
}

export function topByDemand(joined: JoinedWord[], limit = TOP_LIMIT): JoinedWord[] {
  return rankByDemand(joined).slice(0, limit);
}

/** High Wiktionary demand (the top quarter of words with any views) but
 * fewer than OPPORTUNITY_MAX_IMPRESSIONS Search Console impressions. */
export function opportunities(joined: JoinedWord[], limit = TOP_LIMIT): JoinedWord[] {
  const ranked = rankByDemand(joined).filter((w) => w.total12 > 0);
  return ranked
    .slice(0, Math.ceil(ranked.length / 4))
    .filter((w) => (w.gsc?.impressions ?? 0) < OPPORTUNITY_MAX_IMPRESSIONS)
    .slice(0, limit);
}

const byImpressions = <T extends PageStats>(key: (row: T) => string) => (a: T, b: T) =>
  b.impressions - a.impressions || key(a).localeCompare(key(b));

export function nearlyThere(
  data: SearchConsoleData,
  bySlug: Map<string, string>,
  limit = TOP_LIMIT
): PageRow[] {
  return [...pageStatsByPath(data.byPage)]
    .map(([path, stats]) => {
      const slug = storySlug(path);
      return { path, word: (slug && bySlug.get(slug)) || null, ...stats };
    })
    .filter((p) => p.position >= NEARLY_THERE.min && p.position <= NEARLY_THERE.max)
    .sort(byImpressions<PageRow>((p) => p.path))
    .slice(0, limit);
}

export function offPatternQueries(
  data: SearchConsoleData,
  bySlug: Map<string, string>,
  limit = TOP_LIMIT
): { offWord: QueryRow[]; otherIntent: QueryRow[] } {
  const totals = new Map<string, Totals>();
  for (const row of data.byPageQuery) {
    const path = pagePath(row.keys[0]);
    const slug = path && storySlug(path);
    if (path && slug && bySlug.has(slug)) accumulate(totals, `${path}\t${row.keys[1]}`, row);
  }
  const rows: QueryRow[] = [...totals].map(([key, t]) => {
    const [path, query] = key.split("\t");
    return { path, query, word: bySlug.get(storySlug(path)!)!, ...toStats(t) };
  });
  const sort = byImpressions<QueryRow>((r) => r.query);
  const offWord = rows.filter((r) => !r.query.toLowerCase().includes(r.word.toLowerCase()));
  const otherIntent = rows.filter((r) => {
    const q = r.query.toLowerCase();
    return q.includes(r.word.toLowerCase()) && !INTENT_STEMS.some((stem) => q.includes(stem));
  });
  return {
    offWord: offWord.sort(sort).slice(0, limit),
    otherIntent: otherIntent.sort(sort).slice(0, limit),
  };
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run scripts/demand/report.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/demand/report.ts scripts/demand/report.test.ts scripts/demand/testing.ts
git commit -m "feat: demand report — join by word; opportunities, nearly-there, off-pattern queries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Week on week

**Files:**
- Modify: `scripts/demand/report.ts` (append)
- Test: `scripts/demand/report.test.ts` (append)

**Interfaces:**
- Produces:
  - `type Change = { label: string; before: number; after: number }`
  - `type WeekOnWeek = { previousDate: string | null; searchConsole: { impressions: Change; clicks: Change; gains: Change[]; losses: Change[]; positionGains: Change[]; newPages: Change[] } | null; wiktionary: { gains: Change[]; losses: Change[] } | null }`
  - `MOVER_LIMIT = 10`, `POSITION_MIN_IMPRESSIONS = 10`
  - `weekOnWeek(current: Snapshot, previous: Snapshot | null): WeekOnWeek`

- [ ] **Step 1: Write the failing tests.** Append to `scripts/demand/report.test.ts`, adding `weekOnWeek` to the `./report` import:

```ts
describe("weekOnWeek", () => {
  const previousGsc = (): SearchConsoleData => ({
    ...gscFromFixtures(),
    startDate: "2026-08-27",
    endDate: "2026-09-23",
    byPage: [
      { keys: ["https://curioword.com/story/quarantine"], clicks: 2, impressions: 60, ctr: 0.033, position: 15 },
      { keys: ["https://curioword.com/story/december"], clicks: 0, impressions: 10, ctr: 0, position: 40 },
      { keys: ["https://curioword.com/story/bank"], clicks: 1, impressions: 20, ctr: 0.05, position: 30 },
    ],
  });

  it("says there's nothing to compare on the first run", () => {
    expect(weekOnWeek(makeSnapshot(), null)).toEqual({ previousDate: null, searchConsole: null, wiktionary: null });
  });

  it("compares Search Console page by page", () => {
    const previous = makeSnapshot({ date: "2026-09-28", searchConsole: previousGsc() });
    const w = weekOnWeek(makeSnapshot(), previous);
    expect(w.previousDate).toBe("2026-09-28");
    const s = w.searchConsole!;
    expect(s.impressions).toEqual({ label: "impressions", before: 90, after: 236 });
    expect(s.clicks).toEqual({ label: "clicks", before: 3, after: 14 });
    expect(s.gains.map((c) => [c.label, c.after - c.before])).toEqual([
      ["/story/quarantine", 90],
      ["/", 80],
    ]);
    expect(s.losses.map((c) => [c.label, c.after - c.before])).toEqual([
      ["/story/bank", -20],
      ["/story/december", -4],
    ]);
    expect(s.positionGains).toHaveLength(1);
    expect(s.positionGains[0]).toMatchObject({ label: "/story/quarantine", before: 15 });
    expect(s.positionGains[0].after).toBeCloseTo(12);
    expect(s.newPages).toEqual([{ label: "/", before: 0, after: 80 }]);
  });

  it("skips the Search Console comparison when either week skipped it", () => {
    const previous = makeSnapshot({ date: "2026-09-28", searchConsole: null });
    expect(weekOnWeek(makeSnapshot(), previous).searchConsole).toBeNull();
  });

  it("compares Wiktionary only when the month window has rolled over", () => {
    const sameMonths = makeSnapshot({ date: "2026-09-28" });
    expect(weekOnWeek(makeSnapshot(), sameMonths).wiktionary).toBeNull();

    const older = makeSnapshot({ date: "2026-09-28" });
    older.wiktionary = {
      months: lastCompleteMonths(new Date("2026-09-28T06:00:00Z")),
      words: [word("quarantine", 10000), word("december", 9500, { word: "December" })],
    };
    const w = weekOnWeek(makeSnapshot(), older).wiktionary!;
    expect(w.gains).toEqual([{ label: "quarantine", before: 10000, after: 12500 }]);
    expect(w.losses).toEqual([{ label: "December", before: 9500, after: 9000 }]);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run scripts/demand/report.test.ts`
Expected: FAIL, "weekOnWeek is not a function".

- [ ] **Step 3: Implement.** Append to `scripts/demand/report.ts`:

```ts
export type Change = { label: string; before: number; after: number };
export type WeekOnWeek = {
  previousDate: string | null;
  searchConsole: {
    impressions: Change;
    clicks: Change;
    gains: Change[];
    losses: Change[];
    positionGains: Change[];
    newPages: Change[];
  } | null;
  wiktionary: { gains: Change[]; losses: Change[] } | null;
};

export const MOVER_LIMIT = 10;
/** Position moves on pages with fewer impressions than this are mostly noise. */
export const POSITION_MIN_IMPRESSIONS = 10;

/** The `limit` changes with the highest score (ties by label), dropping any scoring 0 or less. */
function topChanges(changes: Change[], score: (c: Change) => number, limit = MOVER_LIMIT): Change[] {
  return changes
    .filter((c) => score(c) > 0)
    .sort((a, b) => score(b) - score(a) || a.label.localeCompare(b.label))
    .slice(0, limit);
}

const sumOf = (pages: Map<string, PageStats>, field: "impressions" | "clicks") =>
  [...pages.values()].reduce((total, p) => total + p[field], 0);

function compareSearchConsole(
  current: SearchConsoleData | null,
  previous: SearchConsoleData | null
): WeekOnWeek["searchConsole"] {
  if (!current || !previous) return null;
  const now = pageStatsByPath(current.byPage);
  const before = pageStatsByPath(previous.byPage);
  const paths = [...new Set([...now.keys(), ...before.keys()])];
  const impressionChanges = paths.map((path) => ({
    label: path,
    before: before.get(path)?.impressions ?? 0,
    after: now.get(path)?.impressions ?? 0,
  }));
  const positionChanges = [...now]
    .filter(([path, stats]) => before.has(path) && stats.impressions >= POSITION_MIN_IMPRESSIONS)
    .map(([path, stats]) => ({ label: path, before: before.get(path)!.position, after: stats.position }));
  const newPages = [...now]
    .filter(([path]) => !before.has(path))
    .map(([path, stats]) => ({ label: path, before: 0, after: stats.impressions }));
  return {
    impressions: { label: "impressions", before: sumOf(before, "impressions"), after: sumOf(now, "impressions") },
    clicks: { label: "clicks", before: sumOf(before, "clicks"), after: sumOf(now, "clicks") },
    gains: topChanges(impressionChanges, (c) => c.after - c.before),
    losses: topChanges(impressionChanges, (c) => c.before - c.after),
    positionGains: topChanges(positionChanges, (c) => c.before - c.after),
    newPages: topChanges(newPages, (c) => c.after, TOP_LIMIT),
  };
}

function compareWiktionary(current: Snapshot["wiktionary"], previous: Snapshot["wiktionary"]): WeekOnWeek["wiktionary"] {
  // Monthly data only changes when a new month completes.
  if (current.months[current.months.length - 1] === previous.months[previous.months.length - 1]) return null;
  const before = new Map(previous.words.map((w) => [w.slug, w.total12]));
  const changes = current.words
    .filter((w) => w.title !== null && before.has(w.slug))
    .map((w) => ({ label: w.word, before: before.get(w.slug)!, after: w.total12 }));
  return {
    gains: topChanges(changes, (c) => c.after - c.before),
    losses: topChanges(changes, (c) => c.before - c.after),
  };
}

export function weekOnWeek(current: Snapshot, previous: Snapshot | null): WeekOnWeek {
  if (!previous) return { previousDate: null, searchConsole: null, wiktionary: null };
  return {
    previousDate: previous.date,
    searchConsole: compareSearchConsole(current.searchConsole, previous.searchConsole),
    wiktionary: compareWiktionary(current.wiktionary, previous.wiktionary),
  };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run scripts/demand/report.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/demand/report.ts scripts/demand/report.test.ts
git commit -m "feat: demand report — week-on-week against the previous snapshot

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Render the Markdown report

**Files:**
- Modify: `scripts/demand/report.ts` (append)
- Test: `scripts/demand/report.test.ts` (append)

**Interfaces:**
- Consumes: everything from Tasks 9–10; `formatTrend` (Task 2).
- Produces:
  - `WIKTIONARY_CAVEAT: string`
  - `GSC_LAG_NOTE: string`
  - `renderReport(current: Snapshot, previous: Snapshot | null): string`

- [ ] **Step 1: Write the failing tests.** Append to `scripts/demand/report.test.ts`, adding `renderReport` and `WIKTIONARY_CAVEAT` to the `./report` import:

```ts
describe("renderReport", () => {
  it("has the header, caveat, lag note and every section", () => {
    const md = renderReport(makeSnapshot(), null);
    expect(md).toContain("# Curio demand report — 2026-10-05");
    expect(md).toContain(WIKTIONARY_CAVEAT);
    expect(md).toContain("Oct 2025 to Sep 2026");
    expect(md).toContain("2026-09-03 to 2026-09-30");
    expect(md).toContain("lags by a few days");
    for (const heading of [
      "## 1. Top 30 words by Wiktionary demand",
      "## 2. Opportunities",
      "## 3. Nearly there",
      "## 4. Queries that don't match the title pattern",
      "## 5. Week on week",
      "## No Wiktionary page (1)",
    ]) {
      expect(md).toContain(heading);
    }
  });

  it("renders the top table with Search Console figures", () => {
    const md = renderReport(makeSnapshot(), null);
    expect(md).toContain(
      "| 1 | [quarantine](https://curioword.com/story/quarantine) | 12,500 | 4,167 | new | 150 | 5 | 12.0 |"
    );
    expect(md).toContain("| 3 | [algebra](https://curioword.com/story/algebra) | 8,000 | 2,667 | new | — | — | — |");
  });

  it("lists off-pattern queries, the no-page footer and the first-run note", () => {
    const md = renderReport(makeSnapshot(), null);
    expect(md).toContain("| forty days venice | [/story/quarantine](https://curioword.com/story/quarantine) | 40 | 1 | 12.0 |");
    expect(md).toContain("| quarantine meaning |");
    expect(md).toContain("zzxqv");
    expect(md).toContain("No earlier snapshot to compare with");
  });

  it("says clearly when Search Console was skipped", () => {
    const md = renderReport(makeSnapshot({ searchConsole: null }), null);
    expect(md).toContain("**Search Console: skipped.**");
    expect(md).toContain("_Search Console was skipped this run._");
    expect(md).not.toContain("lags by a few days");
  });

  it("escapes pipes in queries", () => {
    const snapshot = makeSnapshot();
    snapshot.searchConsole!.byPageQuery = [
      { keys: ["https://curioword.com/story/quarantine", "a|b"], clicks: 0, impressions: 9, ctr: 0, position: 5 },
    ];
    expect(renderReport(snapshot, null)).toContain("| a\\|b |");
  });

  it("renders the comparison when there's an earlier snapshot", () => {
    const previous = makeSnapshot({ date: "2026-09-28" });
    const md = renderReport(makeSnapshot(), previous);
    expect(md).toContain("Compared with the snapshot from 2026-09-28.");
    expect(md).toContain("the month window hasn't rolled over");
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run scripts/demand/report.test.ts`
Expected: FAIL, "renderReport is not a function".

- [ ] **Step 3: Implement.** Append to `scripts/demand/report.ts`, and add `formatTrend` to the `./wiktionary` import:

```ts
export const WIKTIONARY_CAVEAT =
  "A Wiktionary page covers every language's entry for that spelling, so these views are a proxy for interest in the word, not a count of English etymology searches.";
export const GSC_LAG_NOTE =
  "Search Console data lags by a few days, so the window ends 3 days before this run. Google leaves rare queries out of query-level data, so the query tables undercount.";

const SITE = "https://curioword.com";
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SKIPPED = "_Search Console was skipped this run._";

const monthLabel = (yyyymm: string) => `${MONTH_NAMES[Number(yyyymm.slice(4)) - 1]} ${yyyymm.slice(0, 4)}`;
const int = (n: number) => Math.round(n).toLocaleString("en-US");
const pos = (p: number) => p.toFixed(1);
const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
const signed = (n: number, format: (n: number) => string) =>
  n > 0 ? `+${format(n)}` : n < 0 ? `-${format(-n)}` : "0";
const pageLink = (path: string) => `[${path}](${SITE}${path})`;

function wordCell(w: WordDemand): string {
  const link = `[${w.word}](${SITE}/story/${w.slug})`;
  return w.title && w.title !== w.word ? `${link} (as “${w.title}”)` : link;
}

function table(headers: string[], rows: string[][]): string[] {
  if (rows.length === 0) return ["_None this week._"];
  const cell = (c: string) => c.replace(/\|/g, "\\|");
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`),
  ];
}

function changeTable(label: string, rows: Change[], format: (n: number) => string = int): string[] {
  return table(
    [label, "Before", "After", "Change"],
    rows.map((c) => [c.label, format(c.before), format(c.after), signed(c.after - c.before, format)])
  );
}

function renderWeekOnWeek(w: WeekOnWeek): string[] {
  if (!w.previousDate) return ["_No earlier snapshot to compare with; this is the first run._"];
  const out = [`Compared with the snapshot from ${w.previousDate}.`, ""];
  const s = w.searchConsole;
  if (s) {
    out.push(
      `- Impressions (summed over pages): ${int(s.impressions.before)} → ${int(s.impressions.after)} (${signed(s.impressions.after - s.impressions.before, int)})`,
      `- Clicks: ${int(s.clicks.before)} → ${int(s.clicks.after)} (${signed(s.clicks.after - s.clicks.before, int)})`,
      "",
      "### Biggest impression gains",
      "",
      ...changeTable("Page", s.gains),
      "",
      "### Biggest impression losses",
      "",
      ...changeTable("Page", s.losses),
      "",
      `### Biggest position improvements (pages with at least ${POSITION_MIN_IMPRESSIONS} impressions)`,
      "",
      ...changeTable("Page", s.positionGains, pos),
      "",
      "### New pages",
      "",
      ...table(["Page", "Impressions"], s.newPages.map((c) => [c.label, int(c.after)]))
    );
  } else {
    out.push("_No Search Console comparison: it was skipped this week or in the earlier snapshot._");
  }
  out.push("");
  if (w.wiktionary) {
    out.push(
      "### Wiktionary: biggest 12-month gains",
      "",
      ...changeTable("Word", w.wiktionary.gains),
      "",
      "### Wiktionary: biggest 12-month falls",
      "",
      ...changeTable("Word", w.wiktionary.losses)
    );
  } else {
    out.push("_Wiktionary figures are monthly, and the month window hasn't rolled over since the earlier snapshot._");
  }
  return out;
}

export function renderReport(current: Snapshot, previous: Snapshot | null): string {
  const joined = joinByWord(current);
  const bySlug = wordsBySlug(current);
  const gsc = current.searchConsole;
  const { months } = current.wiktionary;
  const out: string[] = [];
  const section = (title: string, ...body: string[]) => out.push("", `## ${title}`, "", ...body);
  const queryTable = (rows: QueryRow[]) =>
    table(
      ["Query", "Page", "Impressions", "Clicks", "Position"],
      rows.map((r) => [r.query, pageLink(r.path), int(r.impressions), int(r.clicks), pos(r.position)])
    );

  out.push(
    `# Curio demand report — ${current.date}`,
    "",
    `Generated ${current.generatedAt}.`,
    "",
    `- **Wiktionary:** monthly pageviews from people (bots excluded), ${monthLabel(months[0])} to ${monthLabel(months[months.length - 1])}. ${WIKTIONARY_CAVEAT}`,
    gsc
      ? `- **Search Console:** ${gsc.startDate} to ${gsc.endDate} (28 days). ${GSC_LAG_NOTE}`
      : "- **Search Console: skipped.** `GSC_SERVICE_ACCOUNT_KEY` was not set, so this report has the Wiktionary half only."
  );

  section(
    `1. Top ${TOP_LIMIT} words by Wiktionary demand`,
    ...table(
      ["#", "Word", "12-month views", "3-month avg", "Trend", "Impressions", "Clicks", "Position"],
      topByDemand(joined).map((w, i) => [
        String(i + 1),
        wordCell(w),
        int(w.total12),
        int(w.avg3),
        formatTrend(w.trend, w.avg3),
        w.gsc ? int(w.gsc.impressions) : "—",
        w.gsc ? int(w.gsc.clicks) : "—",
        w.gsc ? pos(w.gsc.position) : "—",
      ])
    )
  );

  section(
    "2. Opportunities",
    `Words in the top quarter for Wiktionary demand with fewer than ${OPPORTUNITY_MAX_IMPRESSIONS} Search Console impressions in 28 days.`,
    "",
    ...(gsc
      ? table(
          ["Word", "12-month views", "Trend", "Impressions"],
          opportunities(joined).map((w) => [
            wordCell(w),
            int(w.total12),
            formatTrend(w.trend, w.avg3),
            int(w.gsc?.impressions ?? 0),
          ])
        )
      : [SKIPPED])
  );

  section(
    "3. Nearly there",
    "Pages averaging position 8 to 20, where a better title or more internal links could lift them onto page one.",
    "",
    ...(gsc
      ? table(
          ["Page", "Word", "Impressions", "Clicks", "CTR", "Position"],
          nearlyThere(gsc, bySlug).map((p) => [
            pageLink(p.path),
            p.word ?? "—",
            int(p.impressions),
            int(p.clicks),
            pct(p.ctr),
            pos(p.position),
          ])
        )
      : [SKIPPED])
  );

  if (gsc) {
    const { offWord, otherIntent } = offPatternQueries(gsc, bySlug);
    section(
      "4. Queries that don't match the title pattern",
      "Story titles read “<word>: the origin of the word — Curio”.",
      "",
      "### Off-word: the query doesn't contain the page's word",
      "",
      ...queryTable(offWord),
      "",
      "### Other intent: the word, but not its origin",
      "",
      ...queryTable(otherIntent)
    );
  } else {
    section("4. Queries that don't match the title pattern", SKIPPED);
  }

  section("5. Week on week", ...renderWeekOnWeek(weekOnWeek(current, previous)));

  const missing = current.wiktionary.words.filter((w) => w.title === null).map((w) => w.word);
  section(`No Wiktionary page (${missing.length})`, missing.length ? missing.join(", ") : "_Every word has a page._");

  return `${out.join("\n")}\n`;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run scripts/demand/report.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/demand/report.ts scripts/demand/report.test.ts
git commit -m "feat: demand report — Markdown rendering

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Previous snapshot, `latest.md`, and a counts-only console summary

**Files:**
- Modify: `scripts/demand/run.ts`, `scripts/demand/run.test.ts`, `scripts/demandReport.ts`

**Interfaces:**
- Consumes: `renderReport` (Task 11).
- Produces:
  - `readPreviousSnapshot(outDir: string, date: string): Promise<Snapshot | null>`
  - `runDemandReport(...)` now returns `Promise<{ snapshot: Snapshot; markdown: string }>`
  - `latestPath(outDir: string): string`

- [ ] **Step 1: Write the failing tests.** Append to `scripts/demand/run.test.ts`. Add `readPreviousSnapshot, latestPath` to the `./run` import, and add `mkdir, writeFile` to the `node:fs/promises` import.

```ts
describe("latest.md and the previous snapshot", () => {
  const options = () => ({
    entries: FIXTURE_ENTRIES,
    now: NOW,
    outDir,
    wikiFetcher: fakeFetch(wikimediaRoute),
    googleFetcher: fakeFetch(),
    env: {},
  });

  it("writes latest.md beside the snapshot", async () => {
    const { markdown } = await runDemandReport(options());
    expect(await readFile(latestPath(outDir), "utf8")).toBe(markdown);
    expect(markdown).toContain("# Curio demand report — 2026-10-05");
    expect(markdown).toContain("No earlier snapshot to compare with");
  });

  it("compares with the most recent earlier snapshot, ignoring same-day and stray files", async () => {
    await mkdir(path.join(outDir, "snapshots"), { recursive: true });
    const first = await runDemandReport({ ...options(), now: new Date("2026-09-21T06:00:00Z") });
    const second = { ...first.snapshot, date: "2026-09-28" };
    await writeFile(snapshotPath(outDir, "2026-09-28"), JSON.stringify(second));
    await writeFile(path.join(outDir, "snapshots", "notes.json"), "{}");
    await writeFile(snapshotPath(outDir, "2026-10-05"), JSON.stringify({ ...second, date: "2026-10-05" }));

    expect((await readPreviousSnapshot(outDir, "2026-10-05"))?.date).toBe("2026-09-28");
    const { markdown } = await runDemandReport(options());
    expect(markdown).toContain("Compared with the snapshot from 2026-09-28.");
  });

  it("returns null when there's no snapshots folder", async () => {
    expect(await readPreviousSnapshot(path.join(outDir, "nope"), "2026-10-05")).toBeNull();
  });

  it("leaves an existing latest.md untouched when the run fails", async () => {
    await writeFile(latestPath(outDir), "last week's report\n");
    const wikiFetcher = fakeFetch((url) =>
      url.startsWith("https://wikimedia.org/") ? jsonResponse("{}", 500) : wikimediaRoute(url)
    );
    await expect(runDemandReport({ ...options(), wikiFetcher })).rejects.toThrow("HTTP 500");
    expect(await readFile(latestPath(outDir), "utf8")).toBe("last week's report\n");
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run scripts/demand/run.test.ts`
Expected: FAIL, "latestPath is not a function".

- [ ] **Step 3: Implement.** Replace `scripts/demand/run.ts` with:

```ts
// The demand report pipeline: collect every source first, and only once all
// of them have succeeded (and the report has rendered), write anything. A
// failure anywhere rejects before the output folder is touched, so a broken
// run can never replace a good report with an empty one.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FetchLike } from "./http";
import { renderReport } from "./report";
import { collectSearchConsole, loadServiceAccountKey } from "./searchConsole";
import type { SearchConsoleData, Snapshot } from "./types";
import { collectWiktionary } from "./wiktionary";

export type RunOptions = {
  entries: { slug: string; word: string }[];
  now: Date;
  outDir: string;
  wikiFetcher: FetchLike;
  googleFetcher: FetchLike;
  env: Record<string, string | undefined>;
  log?: (line: string) => void;
};

export function snapshotPath(outDir: string, date: string): string {
  return path.join(outDir, "snapshots", `${date}.json`);
}

export function latestPath(outDir: string): string {
  return path.join(outDir, "latest.md");
}

/** The newest snapshot dated strictly before `date`, or null on a first run. */
export async function readPreviousSnapshot(outDir: string, date: string): Promise<Snapshot | null> {
  let files: string[];
  try {
    files = await readdir(path.join(outDir, "snapshots"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const earlier = files
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) < date)
    .sort();
  if (earlier.length === 0) return null;
  const newest = earlier[earlier.length - 1].slice(0, 10);
  return JSON.parse(await readFile(snapshotPath(outDir, newest), "utf8")) as Snapshot;
}

export async function runDemandReport(
  options: RunOptions
): Promise<{ snapshot: Snapshot; markdown: string }> {
  const log = options.log ?? (() => {});
  // Read the key first: a malformed key fails now, not after the slow
  // Wiktionary pass.
  const key = loadServiceAccountKey(options.env);

  const wiktionary = await collectWiktionary(options.entries, {
    fetcher: options.wikiFetcher,
    now: options.now,
    onProgress: (done, total) => {
      if (done % 100 === 0 || done === total) log(`Wiktionary: ${done}/${total}`);
    },
  });
  if (!wiktionary.words.some((w) => w.total12 > 0)) {
    throw new Error("No word has any Wiktionary pageviews; refusing to write an empty report.");
  }

  let searchConsole: SearchConsoleData | null = null;
  if (key) {
    searchConsole = await collectSearchConsole(key, { fetcher: options.googleFetcher, now: options.now });
    // Counts only: the Actions log is public, the queries aren't.
    log(
      `Search Console: ${searchConsole.byPage.length} page rows, ${searchConsole.byQuery.length} query rows, ${searchConsole.byPageQuery.length} page+query rows`
    );
  } else {
    log("Search Console: skipped (GSC_SERVICE_ACCOUNT_KEY is not set)");
  }

  const snapshot: Snapshot = {
    version: 1,
    date: options.now.toISOString().slice(0, 10),
    generatedAt: options.now.toISOString(),
    wiktionary,
    searchConsole,
  };
  const previous = await readPreviousSnapshot(options.outDir, snapshot.date);
  const markdown = renderReport(snapshot, previous);

  await mkdir(path.join(options.outDir, "snapshots"), { recursive: true });
  await writeFile(snapshotPath(options.outDir, snapshot.date), `${JSON.stringify(snapshot)}\n`);
  await writeFile(latestPath(options.outDir), markdown);
  return { snapshot, markdown };
}
```

  Then replace `main` in `scripts/demandReport.ts`, and drop the now-unused `row`, `WordDemand`, `formatTrend` and `rankByDemand` imports and helpers. **Counts only**, because the Actions log is public:

```ts
async function main() {
  const outDir = outDirFromArgs(process.argv.slice(2));
  const { snapshot } = await runDemandReport({
    entries: WORDS,
    now: new Date(),
    outDir,
    wikiFetcher: createFetcher({ minGapMs: 100 }),
    googleFetcher: createFetcher(),
    env: process.env,
    log: (line) => console.log(`[demand-report] ${line}`),
  });
  const missing = snapshot.wiktionary.words.filter((w) => w.title === null).length;
  console.log(
    `[demand-report] Wrote ${latestPath(outDir)} and ${snapshotPath(outDir, snapshot.date)}: ${snapshot.wiktionary.words.length - missing} words with a Wiktionary page, ${missing} without; Search Console ${snapshot.searchConsole ? "included" : "skipped"}.`
  );
}
```

  Import `latestPath` and `snapshotPath` from `./demand/run`. Update the header comment to read `written to <out>/latest.md and <out>/snapshots/<date>.json`.

- [ ] **Step 4: Run all checks**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all pass.

- [ ] **Step 5: Real end-to-end run.** Run `npm run demand:report`, then read `.reports/demand/latest.md` and check every section renders sensibly against the real data.

- [ ] **Step 6: Commit**

```bash
git add scripts/demand/run.ts scripts/demand/run.test.ts scripts/demandReport.ts
git commit -m "feat: demand report writes latest.md with week-on-week

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Weekly workflow, publishing setup, **STOP for Phase 3 sign-off**

**Files:**
- Create: `.github/workflows/demand-report.yml`
- Modify: `docs/demand-report-setup.md` (append Part B)

- [ ] **Step 1: Create `.github/workflows/demand-report.yml`:**

```yaml
# Weekly demand report: Wiktionary pageviews + Search Console for every word,
# published to the private SamxJames/curio-reports repo (never to this repo:
# every push to master here is a production deploy, and this repo is public).
# Setup and key rotation: docs/demand-report-setup.md.
name: Demand report

on:
  schedule:
    - cron: "0 6 * * 1" # Mondays 06:00 UTC, clear of the 09:00 UTC digest cron
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: demand-report
  cancel-in-progress: false

jobs:
  report:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Check out curio-reports
        uses: actions/checkout@v5
        with:
          repository: SamxJames/curio-reports
          token: ${{ secrets.REPORTS_REPO_TOKEN }}
          path: published

      # Fails the job (and so skips the publish step) on any error; the
      # script writes nothing until every source has succeeded.
      - name: Build the report
        run: npm run demand:report -- --out published
        env:
          GSC_SERVICE_ACCOUNT_KEY: ${{ secrets.GSC_SERVICE_ACCOUNT_KEY }}

      - name: Publish
        working-directory: published
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add latest.md snapshots
          git commit -m "Demand report $(date -u +%F)"
          git push
```

- [ ] **Step 2: Check the YAML parses.**

Run: `node -e "const s=require('fs').readFileSync('.github/workflows/demand-report.yml','utf8'); if(!/cron: \"0 6 \* \* 1\"/.test(s)) process.exit(1); console.log('ok')"`

Then read the file through once more against the GitHub Actions syntax. (`actionlint` isn't installed; don't add it.)

- [ ] **Step 3: Append Part B to `docs/demand-report-setup.md`:**

```markdown
## Part B: the private `curio-reports` repo

The workflow publishes to a separate **private** repo. Nothing is ever
committed to `curio-web` (every push to its `master` deploys to
production, and `curio-web` is public).

1. **Create the repo.** Go to <https://github.com/new>:
   - Owner `SamxJames`, name `curio-reports`, **Private**.
   - Tick **Add a README file**. The workflow needs a `main` branch to
     check out.
   - Click **Create repository**.
2. **Create a fine-grained token.** Go to
   <https://github.com/settings/personal-access-tokens/new>:
   - **Token name:** `curio-reports publisher`
   - **Expiration:** 1 year. Put a reminder in your calendar a week before.
   - **Resource owner:** `SamxJames`
   - **Repository access:** **Only select repositories** → `curio-reports`
   - **Permissions → Repository permissions → Contents:** **Read and
     write**. "Metadata: Read-only" is added automatically. Leave
     everything else at "No access".
   - Click **Generate token**, then copy it.
3. **Store it as a secret on `curio-web`.** Run:

   ```powershell
   gh secret set REPORTS_REPO_TOKEN --repo SamxJames/curio-web
   ```

   Paste the token at the prompt. It isn't echoed.
4. **Read the report** at
   <https://github.com/SamxJames/curio-reports/blob/main/latest.md>. Past
   weeks are in `snapshots/` and in the repo's history.

### Rotating `REPORTS_REPO_TOKEN`

Before it expires, either **regenerate** the same token (open it in
<https://github.com/settings/personal-access-tokens> and click
**Regenerate token**) or create a new one as in step 2. Then repeat step
3, and delete the old token if you made a new one. An expired token makes
the "Check out curio-reports" step fail, and GitHub emails you about the
failed run.
```

- [ ] **Step 4: Dry-run the publish step locally.**
  1. Once the owner has done Part B steps 1–2, clone `curio-reports` into the scratchpad directory.
  2. Run `npm run demand:report -- --out <that clone>`.
  3. Confirm it contains `latest.md` and `snapshots/<today>.json`.
  4. Then **discard the clone without committing**. The first real publish belongs to the workflow.

- [ ] **Step 5: Run all checks and commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add .github/workflows/demand-report.yml docs/demand-report-setup.md
git commit -m "feat: weekly demand-report workflow, published to private curio-reports

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: STOP.** Tell the owner:
  - Phase 3 is ready on `demand-report`.
  - GitHub only runs scheduled and manually dispatched workflows from the default branch, so going live needs **one merge to `master`**, which **will trigger one production deploy**. App code is unchanged; Vercel will still rebuild.
  - Ask for sign-off before merging or pushing.
  - After sign-off and the merge, trigger the workflow by hand: `gh workflow run demand-report.yml --repo SamxJames/curio-web`. Watch it with `gh run watch`, and confirm `latest.md` appears in `curio-reports`.

---

# Phase 4: documentation

### Task 14: `handover.md`

**Files:**
- Modify: `handover.md`
  - Insert a new `## Demand report (weekly, internal)` section directly before `## Architecture map`.
  - Update the "Last updated" paragraph at the top.

- [ ] **Step 1: Insert this section before `## Architecture map`:**

```markdown
## Demand report (weekly, internal)

A weekly Markdown report on which words have real search demand and which
story pages earn Google impressions. It's internal tooling only: no
route, page or component reads it. It's built by `npm run demand:report`
(`scripts/demandReport.ts` and `scripts/demand/`). The design is in
`docs/superpowers/specs/2026-10-03-demand-report-design.md`.

- **Sources** (both free):
  - English Wiktionary monthly pageviews for every word, last 12 complete
    months, user agents only.
  - Google Search Console for the last 28 days, by page, query, and page
    and query, read-only through a service account.
- **Where it's published:**
  <https://github.com/SamxJames/curio-reports/blob/main/latest.md>, a
  private repo. Dated JSON snapshots are in `snapshots/`.
  - Never publish it to `curio-web`. Every push to `master` is a
    production deploy, and this repo is public.
  - For the same reason the script logs counts only: Actions logs on a
    public repo are public.
- **Schedule:** `.github/workflows/demand-report.yml`, Mondays 06:00 UTC
  (clear of the 09:00 digest cron), plus manual dispatch:
  `gh workflow run demand-report.yml --repo SamxJames/curio-web`.
  - A failed run shows as failed and publishes nothing. The script writes
    nothing until every source has succeeded.
- **Running it locally:** `npm run demand:report`. Output goes to
  `.reports/demand/` (gitignored), or use `-- --out <dir>`.
  - It reads `GSC_SERVICE_ACCOUNT_KEY` from `.env.local`. Without it, the
    Search Console half is skipped and the report says so.
  - A full run takes a few minutes: about 1,150 Wikimedia requests,
    throttled to about 10 a second.
- **Secrets:** `GSC_SERVICE_ACCOUNT_KEY` (the base64 of the service
  account's JSON key) and `REPORTS_REPO_TOKEN` (a fine-grained token,
  Contents read and write on `curio-reports` only, expires yearly).
  - Setup and **rotation for both** are in `docs/demand-report-setup.md`.
  - Neither belongs in Vercel; the deployed app never uses them.
- **Wiktionary caveat:** a Wiktionary page covers every language's entry
  for that spelling, so these views are a proxy for interest in the word,
  not a count of English etymology searches.
  - Capitalised words count their exact-case page first (`December`, not
    the Danish/Swedish `december`).
- **Search Console caveats:** its data lags by a few days (the window ends
  3 days before the run), and Google leaves rare queries out of
  query-level data.
- **The report informs decisions; it doesn't make them.** Title,
  metadata and internal-link changes are separate work.
```

- [ ] **Step 2: Update the opening paragraph's first sentence** to: `Last updated: <date of this task>, after the weekly demand report (see "Demand report (weekly, internal)").` Keep the rest of that paragraph.

- [ ] **Step 3: Commit, then STOP for the owner's final sign-off**

```bash
git add handover.md
git commit -m "docs: handover — weekly demand report

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Pushing or merging this commit follows the same rule: one more production deploy, so only with the owner's sign-off. Ideally, merge it together with Phase 3.
