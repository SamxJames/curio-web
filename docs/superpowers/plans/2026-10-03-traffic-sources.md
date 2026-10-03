# Traffic Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure where Curio's visitors and subscribers come from, using a first-party counter shown on `/admin` and printed by a read-only script that the weekly check-in runs.

**Architecture:**
- A tiny client beacon classifies each browser session's arrival once, by `utm_source` or referrer host, then POSTs `{kind:"visit", source}` to `/api/traffic`.
- `/api/subscribe` records a signup against the source the client passes.
- Share buttons record a share tap.
- The server increments one Redis hash per UTC day: `curio:traffic:<YYYY-MM-DD>`, with fields like `visit:search`, `signup:share`, `share:puzzle`, and a 90-day TTL.
- It writes **only in production**, because local dev shares production's Upstash.
- `/admin` and `npm run traffic:report` read the last N days and summarise them with a pure function.

**Tech Stack:** Next.js 16.3.4 App Router (route handlers), React 19 client components, `@upstash/redis`, vitest, tsx.

**Spec:** The owner approved the design in chat on 2026-10-03. It's reproduced here because there's no separate spec file. The design came out of the first weekly check-in (`C:\Users\Sam\Documents\Claude\Projects\Curio\checkins\2026-10-02.md`, "Proposed Claude work #1"). Planning found that Vercel Web Analytics on Hobby shows **no UTM parameters and no custom events** (https://vercel.com/docs/analytics/limits-and-pricing), so tagging links alone would be invisible. The approved design:
1. On the first page of a browser session, classify the source (`email | bluesky | threads | instagram | share` from `utm_source`, else `search | bluesky | threads | instagram | reddit | hn | other` from the referrer host, else `direct`) and count one visit per day per source in Redis. No cookies, IPs or IDs. 90-day expiry.
2. Count signups against the visit's source. Count story and puzzle share taps.
3. The story share URL gains `?utm_source=share`. The puzzle share stays plain text (the 2026-09-12 rule: no link, no preview card) but its domain line becomes `curioword.com/play`.
4. A new `/admin` section, "Where visitors come from (last 28 days)", shows source, visits, signups and rate, plus share taps.
5. Document `curioword.com/?utm_source=instagram` as the Instagram bio link.
6. Give the weekly check-in read-only access to these counts (a read-only script; the owner said yes on 2026-10-03).

## Global Constraints

- **Production-only writes:** Redis writes happen only when `process.env.VERCEL_ENV === "production"` and `redis` is non-null, read at call time so tests can stub it. Everywhere else, recording is a silent no-op. (Local dev shares production's Upstash database; see `lib/digestRuns.ts`.)
- **No personal data:** never store or log email addresses, IPs, user agents, user IDs or full referrer URLs. Store only the counter field names defined in `lib/traffic.ts`.
- **Allowlist:** the server accepts only events that `parseTrafficEvent` validates against fixed lists. Anything else gets a 400 and no write.
- **Expiry:** every write refreshes a 90-day TTL on its day key: `TRAFFIC_TTL_SECONDS = 90 * 24 * 60 * 60`.
- **Time:** day keys use `dayKey()` from `lib/day.ts` (UTC).
- **Failure isolation:** analytics must never break the feature it's attached to. Client sends swallow every error. In `/api/subscribe`, a recording failure must not turn a successful subscribe into an error.
- **The product principle** ("archive, never backlog", in `AGENTS.md`) applies. Nothing here is user-facing apart from the share URL and the puzzle text; no counts are shown to readers.
- **Design system:** `components/AdminDashboard.tsx` is the documented exception. Match its existing local styles (Section/StatRow) rather than `components/ui`. No other UI changes.
- **Puzzle share** stays plain text: no `https://`, no `url` field in `navigator.share`, three lines.
- **Next.js:** before writing the route handler, read `node_modules/next/dist/docs/` for route handlers, and mirror `app/api/subscribe/route.ts`.
- **Tests:** `npm test` (vitest), `npx tsc --noEmit`, `npm run lint` must all pass. Mock Redis with the `vi.hoisted` fake pattern from `lib/digestRuns.test.ts`.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **No push or deploy** without the owner's go-ahead. Never trigger production crons.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/traffic.ts` (new) | Pure code only: source and event types, `classifySource`, `isLikelyBot`, `parseTrafficEvent`, `eventField`, `summarizeTraffic`. No Redis, no DOM. |
| `lib/traffic.test.ts` (new) | Unit tests for the above. |
| `lib/trafficStats.ts` (new) | Redis I/O: `recordTrafficEvent`, `getTrafficDays`. |
| `lib/trafficStats.test.ts` (new) | Uses the Redis fake. Covers the production-only guard, TTL and reads. |
| `app/api/traffic/route.ts` + `route.test.ts` (new) | POST endpoint: bot filter, parse, record, 204. |
| `app/api/subscribe/route.ts` (+ new `route.test.ts`) | Accepts an optional `source` and records `signup:<source>` after a successful upsert. |
| `lib/trafficClient.ts` (new) | Browser-side: `sendTrafficEvent`, plus `rememberArrivalSource` / `getArrivalSource` in sessionStorage. |
| `components/TrafficBeacon.tsx` (new) | Runs once per page load from the layout and sends the visit. |
| `app/layout.tsx` | Mounts `<TrafficBeacon />`. |
| `components/EmailSignupInline.tsx` | Sends `source` with the subscribe request. |
| `components/StoryView.tsx` | Share URL gets `?utm_source=share` and records a story share tap. |
| `components/PuzzleGame.tsx` | Records a puzzle share tap. |
| `lib/puzzle.ts` / `lib/puzzle.test.ts` | Share text domain line becomes `<domain>/play`. |
| `app/admin/page.tsx`, `components/AdminDashboard.tsx` | New "Where visitors come from" section. |
| `scripts/trafficReport.ts` (new), `package.json` | `npm run traffic:report -- [days=28]`: read-only console report. |
| `handover.md`, `README.md`, `.env.example` (no new vars) | Docs: the measuring section, the Instagram bio link, Hobby analytics limits. |

---

### Task 1: Pure traffic model (`lib/traffic.ts`)

**Files:**
- Create: `lib/traffic.ts`
- Test: `lib/traffic.test.ts`

**Interfaces:**
- Produces:
  - `TRAFFIC_SOURCES` (readonly tuple)
  - `type TrafficSource`
  - `isTrafficSource(x: unknown): x is TrafficSource`
  - `classifySource(search: string, referrer: string, ownHost: string): TrafficSource | null`
  - `isLikelyBot(userAgent: string | null): boolean`
  - `type TrafficEvent`
  - `parseTrafficEvent(body: unknown): TrafficEvent | null`
  - `eventField(ev: TrafficEvent): string`
  - `type TrafficSummary`
  - `summarizeTraffic(days: Record<string, Record<string, number>>): TrafficSummary`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/traffic.test.ts
import { describe, expect, it } from "vitest";
import {
  classifySource,
  eventField,
  isLikelyBot,
  isTrafficSource,
  parseTrafficEvent,
  summarizeTraffic,
} from "./traffic";

const HOST = "curioword.com";

describe("classifySource", () => {
  it("prefers an allowlisted utm_source over the referrer", () => {
    expect(classifySource("?utm_source=email&utm_medium=email", "https://www.google.com/", HOST)).toBe("email");
    expect(classifySource("?utm_source=share", "", HOST)).toBe("share");
    expect(classifySource("?utm_source=threads", "", HOST)).toBe("threads");
  });

  it("ignores an unknown utm_source and falls back to the referrer", () => {
    expect(classifySource("?utm_source=evil%3Ahack", "https://www.google.co.uk/", HOST)).toBe("search");
  });

  it("buckets search engines", () => {
    for (const ref of [
      "https://www.google.com/",
      "https://www.google.co.uk/",
      "https://www.bing.com/search?q=x",
      "https://duckduckgo.com/",
      "https://search.brave.com/",
      "https://www.ecosia.org/",
      "https://search.yahoo.com/",
      "https://yandex.ru/",
    ]) {
      expect(classifySource("", ref, HOST)).toBe("search");
    }
  });

  it("buckets known social and community hosts", () => {
    expect(classifySource("", "https://bsky.app/profile/x", HOST)).toBe("bluesky");
    expect(classifySource("", "https://www.threads.net/", HOST)).toBe("threads");
    expect(classifySource("", "https://www.threads.com/", HOST)).toBe("threads");
    expect(classifySource("", "https://l.instagram.com/", HOST)).toBe("instagram");
    expect(classifySource("", "https://out.reddit.com/", HOST)).toBe("reddit");
    expect(classifySource("", "https://www.reddit.com/r/etymology", HOST)).toBe("reddit");
    expect(classifySource("", "https://news.ycombinator.com/item?id=1", HOST)).toBe("hn");
  });

  it("calls any other external referrer 'other'", () => {
    expect(classifySource("", "https://t.co/abc", HOST)).toBe("other");
    expect(classifySource("", "https://example.org/blog", HOST)).toBe("other");
  });

  it("calls no referrer 'direct'", () => {
    expect(classifySource("", "", HOST)).toBe("direct");
  });

  it("returns null for an internal referrer (not an arrival)", () => {
    expect(classifySource("", "https://curioword.com/words", HOST)).toBeNull();
    expect(classifySource("", "https://www.curioword.com/", HOST)).toBeNull();
  });

  it("treats an unparseable referrer as 'other', not a crash", () => {
    expect(classifySource("", "not a url", HOST)).toBe("other");
  });
});

describe("isLikelyBot", () => {
  it("flags crawlers and link-preview fetchers", () => {
    expect(isLikelyBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isLikelyBot("facebookexternalhit/1.1")).toBe(true);
    expect(isLikelyBot("Mozilla/5.0 HeadlessChrome/120.0")).toBe(true);
    expect(isLikelyBot(null)).toBe(true);
    expect(isLikelyBot("")).toBe(true);
  });

  it("lets ordinary browsers through", () => {
    expect(
      isLikelyBot("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")
    ).toBe(false);
  });
});

describe("parseTrafficEvent / eventField", () => {
  it("accepts the three event kinds and maps each to one field", () => {
    const visit = parseTrafficEvent({ kind: "visit", source: "search" });
    const signup = parseTrafficEvent({ kind: "signup", source: "share" });
    const share = parseTrafficEvent({ kind: "share", what: "puzzle" });
    expect(visit && eventField(visit)).toBe("visit:search");
    expect(signup && eventField(signup)).toBe("signup:share");
    expect(share && eventField(share)).toBe("share:puzzle");
  });

  it("rejects anything off the allowlist", () => {
    expect(parseTrafficEvent(null)).toBeNull();
    expect(parseTrafficEvent("visit")).toBeNull();
    expect(parseTrafficEvent({ kind: "visit", source: "myspace" })).toBeNull();
    expect(parseTrafficEvent({ kind: "share", what: "story; drop" })).toBeNull();
    expect(parseTrafficEvent({ kind: "delete", source: "search" })).toBeNull();
  });

  it("isTrafficSource narrows only real sources", () => {
    expect(isTrafficSource("direct")).toBe(true);
    expect(isTrafficSource("Direct")).toBe(false);
    expect(isTrafficSource(3)).toBe(false);
  });
});

describe("summarizeTraffic", () => {
  it("sums days per source, computes a signup rate, ignores unknown fields, sorts by visits", () => {
    const summary = summarizeTraffic({
      "2026-10-01": { "visit:search": 5, "visit:direct": 2, "signup:search": 1, "share:story": 1, "junk:x": 9 },
      "2026-10-02": { "visit:search": 3, "signup:direct": 1, "share:puzzle": 2, "share:story": 1 },
    });
    expect(summary.rows).toEqual([
      { source: "search", visits: 8, signups: 1, rate: 1 / 8 },
      { source: "direct", visits: 2, signups: 1, rate: 1 / 2 },
    ]);
    expect(summary.totals).toEqual({ visits: 10, signups: 2 });
    expect(summary.shares).toEqual({ story: 2, puzzle: 2 });
  });

  it("gives a null rate when a source has signups but no counted visit", () => {
    const summary = summarizeTraffic({ "2026-10-01": { "signup:email": 1 } });
    expect(summary.rows).toEqual([{ source: "email", visits: 0, signups: 1, rate: null }]);
  });

  it("is empty for no data", () => {
    expect(summarizeTraffic({})).toEqual({
      rows: [],
      totals: { visits: 0, signups: 0 },
      shares: { story: 0, puzzle: 0 },
    });
  });
});
```

- [ ] **Step 2: Run the tests and check they fail**

Run: `npx vitest run lib/traffic.test.ts`
Expected: FAIL. `Failed to resolve import "./traffic"`.

- [ ] **Step 3: Implement `lib/traffic.ts`**

```ts
/** Where a visit came from, in a fixed vocabulary so the counters stay a
 * short, known list (see lib/trafficStats.ts). Pure: no Redis, no DOM —
 * the browser passes in location.search / document.referrer / host. */
export const TRAFFIC_SOURCES = [
  "email",
  "bluesky",
  "threads",
  "instagram",
  "share",
  "search",
  "reddit",
  "hn",
  "other",
  "direct",
] as const;
export type TrafficSource = (typeof TRAFFIC_SOURCES)[number];

export function isTrafficSource(x: unknown): x is TrafficSource {
  return typeof x === "string" && (TRAFFIC_SOURCES as readonly string[]).includes(x);
}

/** utm_source values our own links carry (digest, social posts, share). */
const TAGGED: readonly TrafficSource[] = ["email", "bluesky", "threads", "instagram", "share"];

const REFERRER_RULES: { source: TrafficSource; test: RegExp }[] = [
  { source: "search", test: /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.brave\.com|ecosia\.org|search\.yahoo\.com|yandex\.[a-z.]+)$/ },
  { source: "bluesky", test: /(^|\.)bsky\.app$/ },
  { source: "threads", test: /(^|\.)threads\.(net|com)$/ },
  { source: "instagram", test: /(^|\.)instagram\.com$/ },
  { source: "reddit", test: /(^|\.)reddit\.com$/ },
  { source: "hn", test: /^news\.ycombinator\.com$/ },
];

const stripWww = (host: string) => host.toLowerCase().replace(/^www\./, "");

/** Our own tag first, then the referrer's host, then "direct". Returns
 * null for a referrer on our own site: that's a reload or a new tab from
 * Curio, not an arrival, so the caller counts nothing. */
export function classifySource(search: string, referrer: string, ownHost: string): TrafficSource | null {
  const tag = new URLSearchParams(search).get("utm_source");
  if (tag && (TAGGED as readonly string[]).includes(tag)) return tag as TrafficSource;
  if (!referrer) return "direct";
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "other";
  }
  if (stripWww(host) === stripWww(ownHost)) return null;
  return REFERRER_RULES.find((r) => r.test.test(host))?.source ?? "other";
}

/** Crawlers (Googlebot renders JS and would fire the beacon), link-preview
 * fetchers and headless browsers. A missing user agent counts as a bot. */
export function isLikelyBot(userAgent: string | null): boolean {
  if (!userAgent) return true;
  return /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|python|curl|wget/i.test(userAgent);
}

export type ShareKind = "story" | "puzzle";
export type TrafficEvent =
  | { kind: "visit"; source: TrafficSource }
  | { kind: "signup"; source: TrafficSource }
  | { kind: "share"; what: ShareKind };

/** The only gate between a request body and a Redis field name. */
export function parseTrafficEvent(body: unknown): TrafficEvent | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if ((b.kind === "visit" || b.kind === "signup") && isTrafficSource(b.source)) {
    return { kind: b.kind, source: b.source };
  }
  if (b.kind === "share" && (b.what === "story" || b.what === "puzzle")) {
    return { kind: "share", what: b.what };
  }
  return null;
}

export function eventField(ev: TrafficEvent): string {
  return ev.kind === "share" ? `share:${ev.what}` : `${ev.kind}:${ev.source}`;
}

export type TrafficRow = { source: TrafficSource; visits: number; signups: number; rate: number | null };
export type TrafficSummary = {
  rows: TrafficRow[];
  totals: { visits: number; signups: number };
  shares: { story: number; puzzle: number };
};

/** Folds per-day counter hashes into one row per source (only sources with
 * any activity), most visits first. `rate` is signups ÷ visits, or null with
 * no visits, so the admin page shows "—" rather than a misleading figure.
 * Unknown field names are ignored. */
export function summarizeTraffic(days: Record<string, Record<string, number>>): TrafficSummary {
  const visits = new Map<TrafficSource, number>();
  const signups = new Map<TrafficSource, number>();
  const shares = { story: 0, puzzle: 0 };
  for (const fields of Object.values(days)) {
    for (const [field, raw] of Object.entries(fields)) {
      const n = Number(raw) || 0;
      const [kind, name] = field.split(":");
      if (kind === "share" && (name === "story" || name === "puzzle")) shares[name] += n;
      else if (kind === "visit" && isTrafficSource(name)) visits.set(name, (visits.get(name) ?? 0) + n);
      else if (kind === "signup" && isTrafficSource(name)) signups.set(name, (signups.get(name) ?? 0) + n);
    }
  }
  const sources = TRAFFIC_SOURCES.filter((s) => visits.has(s) || signups.has(s));
  const rows = sources
    .map((source) => {
      const v = visits.get(source) ?? 0;
      const s = signups.get(source) ?? 0;
      return { source, visits: v, signups: s, rate: v === 0 ? null : s / v };
    })
    .sort((a, b) => b.visits - a.visits);
  return {
    rows,
    totals: {
      visits: rows.reduce((t, r) => t + r.visits, 0),
      signups: rows.reduce((t, r) => t + r.signups, 0),
    },
    shares,
  };
}
```

- [ ] **Step 4: Run the tests and check they pass**

Run: `npx vitest run lib/traffic.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add lib/traffic.ts lib/traffic.test.ts
git commit -m "feat: traffic source model — classify arrivals, allowlist events, summarise counts"
```

---

### Task 2: Server-side counting (`lib/trafficStats.ts`, `/api/traffic`, `/api/subscribe`)

**Files:**
- Create: `lib/trafficStats.ts`, `lib/trafficStats.test.ts`
- Create: `app/api/traffic/route.ts`, `app/api/traffic/route.test.ts`
- Modify: `app/api/subscribe/route.ts`
- Create: `app/api/subscribe/route.test.ts`

**Interfaces:**
- Consumes (Task 1): `TrafficEvent`, `eventField`, `parseTrafficEvent`, `isLikelyBot`, `isTrafficSource`.
- Produces:
  - `TRAFFIC_TTL_SECONDS: number`
  - `trafficKey(day: string): string`, which returns `curio:traffic:<day>`
  - `recordTrafficEvent(ev: TrafficEvent, day?: string): Promise<void>`
  - `getTrafficDays(days: number, today?: Date): Promise<Record<string, Record<string, number>>>`, keyed by `YYYY-MM-DD`. Days with no data are omitted.
  - `POST /api/traffic`: JSON `TrafficEvent` → 204, 400 if invalid, 204 with no write for bots.
  - `POST /api/subscribe`: body `{ email, source? }`.

- [ ] **Step 1: Write the failing tests for `lib/trafficStats.ts`**

```ts
// lib/trafficStats.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => {
  const hashes = new Map<string, Map<string, number>>();
  const ttls = new Map<string, number>();
  return {
    fake: {
      hashes,
      ttls,
      enabled: true,
      hincrby: vi.fn(async (k: string, f: string, by: number) => {
        const h = hashes.get(k) ?? new Map<string, number>();
        h.set(f, (h.get(f) ?? 0) + by);
        hashes.set(k, h);
        return h.get(f);
      }),
      expire: vi.fn(async (k: string, s: number) => (ttls.set(k, s), 1)),
      hgetall: vi.fn(async (k: string) => {
        const h = hashes.get(k);
        return h ? Object.fromEntries(h) : null;
      }),
    },
  };
});

vi.mock("./redis", () => ({
  get redis() {
    return fake.enabled ? fake : null;
  },
  usingUpstash: true,
}));

const { recordTrafficEvent, getTrafficDays, trafficKey, TRAFFIC_TTL_SECONDS } = await import("./trafficStats");

beforeEach(() => {
  fake.hashes.clear();
  fake.ttls.clear();
  fake.enabled = true;
  vi.clearAllMocks();
  vi.stubEnv("VERCEL_ENV", "production");
});
afterEach(() => vi.unstubAllEnvs());

describe("recordTrafficEvent", () => {
  it("increments the day's field and refreshes a 90-day TTL", async () => {
    await recordTrafficEvent({ kind: "visit", source: "search" }, "2026-10-03");
    await recordTrafficEvent({ kind: "visit", source: "search" }, "2026-10-03");
    await recordTrafficEvent({ kind: "share", what: "puzzle" }, "2026-10-03");
    expect(Object.fromEntries(fake.hashes.get("curio:traffic:2026-10-03")!)).toEqual({
      "visit:search": 2,
      "share:puzzle": 1,
    });
    expect(fake.ttls.get(trafficKey("2026-10-03"))).toBe(TRAFFIC_TTL_SECONDS);
    expect(TRAFFIC_TTL_SECONDS).toBe(90 * 24 * 60 * 60);
  });

  it("writes nothing outside production (local dev shares production's Upstash)", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    await recordTrafficEvent({ kind: "visit", source: "direct" }, "2026-10-03");
    vi.stubEnv("VERCEL_ENV", "");
    await recordTrafficEvent({ kind: "visit", source: "direct" }, "2026-10-03");
    expect(fake.hincrby).not.toHaveBeenCalled();
  });

  it("is a no-op without Upstash", async () => {
    fake.enabled = false;
    await expect(recordTrafficEvent({ kind: "visit", source: "direct" })).resolves.toBeUndefined();
  });
});

describe("getTrafficDays", () => {
  it("reads the last N UTC days including today, omitting empty days, coercing to numbers", async () => {
    fake.hashes.set("curio:traffic:2026-10-03", new Map([["visit:search", 4]]));
    fake.hashes.set("curio:traffic:2026-10-01", new Map([["signup:direct", 1]]));
    fake.hashes.set("curio:traffic:2026-09-20", new Map([["visit:direct", 9]])); // outside window
    const days = await getTrafficDays(3, new Date("2026-10-03T12:00:00Z"));
    expect(days).toEqual({
      "2026-10-03": { "visit:search": 4 },
      "2026-10-01": { "signup:direct": 1 },
    });
    expect(fake.hgetall).toHaveBeenCalledTimes(3);
  });

  it("reads in every environment (reading is safe) but returns {} without Upstash", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    fake.hashes.set("curio:traffic:2026-10-03", new Map([["visit:hn", 1]]));
    expect(await getTrafficDays(1, new Date("2026-10-03T00:00:00Z"))).toEqual({
      "2026-10-03": { "visit:hn": 1 },
    });
    fake.enabled = false;
    expect(await getTrafficDays(1, new Date("2026-10-03T00:00:00Z"))).toEqual({});
  });
});
```

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run lib/trafficStats.test.ts`
Expected: FAIL. `Failed to resolve import "./trafficStats"`.

- [ ] **Step 3: Implement `lib/trafficStats.ts`**

```ts
import { redis } from "./redis";
import { DAY_MS, dayKey } from "./day";
import { eventField, type TrafficEvent } from "./traffic";

/** Long enough for a quarter's comparison; short enough to clean itself up. */
export const TRAFFIC_TTL_SECONDS = 90 * 24 * 60 * 60;

export const trafficKey = (day: string) => `curio:traffic:${day}`;

/** One counter hash per UTC day. Writes only in production: local dev can
 * share production's Upstash database (see lib/digestRuns.ts), and a dev
 * session must not inflate the real numbers. Read at call time so tests can
 * stub VERCEL_ENV. Stores field names only — never who, never a URL. */
export async function recordTrafficEvent(ev: TrafficEvent, day: string = dayKey()): Promise<void> {
  if (!redis || process.env.VERCEL_ENV !== "production") return;
  const key = trafficKey(day);
  await redis.hincrby(key, eventField(ev), 1);
  await redis.expire(key, TRAFFIC_TTL_SECONDS);
}

/** The last `days` UTC days (today included), keyed by day. Days with no
 * counters are left out. Read-only, so it's safe from any environment —
 * the admin page and scripts/trafficReport.ts both use it. */
export async function getTrafficDays(
  days: number,
  today: Date = new Date()
): Promise<Record<string, Record<string, number>>> {
  if (!redis) return {};
  const client = redis;
  const keys = Array.from({ length: days }, (_, i) => dayKey(new Date(today.getTime() - i * DAY_MS)));
  const hashes = await Promise.all(keys.map((d) => client.hgetall<Record<string, unknown>>(trafficKey(d))));
  const out: Record<string, Record<string, number>> = {};
  keys.forEach((d, i) => {
    const h = hashes[i];
    if (h && Object.keys(h).length > 0) {
      out[d] = Object.fromEntries(Object.entries(h).map(([f, v]) => [f, Number(v) || 0]));
    }
  });
  return out;
}
```

- [ ] **Step 4: Run them and check they pass**

Run: `npx vitest run lib/trafficStats.test.ts`
Expected: PASS.

- [ ] **Step 5: Read the route-handler docs.** Skim `node_modules/next/dist/docs/` for the route handlers guide: search the folder for `route.ts` and `NextRequest`. Confirm `export async function POST(req: NextRequest)` returning `new NextResponse(null, { status: 204 })` is still the current shape. Do it the way the docs say if they differ.

- [ ] **Step 6: Write failing route tests**

```ts
// app/api/traffic/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/trafficStats", () => ({ recordTrafficEvent: vi.fn(async () => undefined) }));

const { POST } = await import("./route");
const { recordTrafficEvent } = await import("@/lib/trafficStats");

const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

function post(body: unknown, ua: string | null = BROWSER) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (ua) headers["user-agent"] = ua;
  return new NextRequest("http://localhost/api/traffic", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/traffic", () => {
  it("records a valid event and returns 204", async () => {
    const res = await POST(post({ kind: "visit", source: "search" }));
    expect(res.status).toBe(204);
    expect(recordTrafficEvent).toHaveBeenCalledWith({ kind: "visit", source: "search" });
  });

  it("rejects an off-allowlist event with 400 and no write", async () => {
    const res = await POST(post({ kind: "visit", source: "myspace" }));
    expect(res.status).toBe(400);
    expect(recordTrafficEvent).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await POST(post("{nope"));
    expect(res.status).toBe(400);
    expect(recordTrafficEvent).not.toHaveBeenCalled();
  });

  it("quietly ignores bots: 204, no write", async () => {
    const res = await POST(post({ kind: "visit", source: "direct" }, "Googlebot/2.1"));
    expect(res.status).toBe(204);
    expect(recordTrafficEvent).not.toHaveBeenCalled();
  });

  it("still returns 204 when recording throws (analytics never errors the page)", async () => {
    vi.mocked(recordTrafficEvent).mockRejectedValueOnce(new Error("upstash down"));
    const res = await POST(post({ kind: "share", what: "story" }));
    expect(res.status).toBe(204);
  });
});
```

```ts
// app/api/subscribe/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({ upsertSubscriber: vi.fn(async () => undefined) }));
vi.mock("@/lib/trafficStats", () => ({ recordTrafficEvent: vi.fn(async () => undefined) }));

const { POST } = await import("./route");
const { upsertSubscriber } = await import("@/lib/db");
const { recordTrafficEvent } = await import("@/lib/trafficStats");

const post = (body: unknown) =>
  new NextRequest("http://localhost/api/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/subscribe", () => {
  it("subscribes and records the signup against a valid source", async () => {
    const res = await POST(post({ email: "a@example.com", source: "search" }));
    expect(res.status).toBe(200);
    expect(upsertSubscriber).toHaveBeenCalledWith("a@example.com");
    expect(recordTrafficEvent).toHaveBeenCalledWith({ kind: "signup", source: "search" });
  });

  it("files a missing or unknown source under 'direct'", async () => {
    await POST(post({ email: "a@example.com" }));
    await POST(post({ email: "b@example.com", source: "myspace" }));
    expect(recordTrafficEvent).toHaveBeenNthCalledWith(1, { kind: "signup", source: "direct" });
    expect(recordTrafficEvent).toHaveBeenNthCalledWith(2, { kind: "signup", source: "direct" });
  });

  it("records nothing when the email is invalid", async () => {
    const res = await POST(post({ email: "nope", source: "search" }));
    expect(res.status).toBe(400);
    expect(recordTrafficEvent).not.toHaveBeenCalled();
  });

  it("still succeeds when recording throws", async () => {
    vi.mocked(recordTrafficEvent).mockRejectedValueOnce(new Error("upstash down"));
    const res = await POST(post({ email: "a@example.com", source: "share" }));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 7: Run them and check they fail**

Run: `npx vitest run app/api/traffic app/api/subscribe`
Expected:
- the traffic tests FAIL because `./route` can't be resolved;
- the subscribe "records the signup" tests FAIL because `recordTrafficEvent` isn't called.

- [ ] **Step 8: Implement the traffic route**

```ts
// app/api/traffic/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isLikelyBot, parseTrafficEvent } from "@/lib/traffic";
import { recordTrafficEvent } from "@/lib/trafficStats";

/** First-party arrival and share counter (see lib/trafficStats.ts). Counts
 * only allowlisted field names; never stores who sent it. Analytics must
 * never surface an error to the page, so a recording failure still gets
 * 204. Bots get a silent 204 too: no point telling a crawler anything. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const ev = parseTrafficEvent(body);
  if (!ev) return NextResponse.json({ error: "Unknown event." }, { status: 400 });
  if (isLikelyBot(req.headers.get("user-agent"))) return new NextResponse(null, { status: 204 });
  try {
    await recordTrafficEvent(ev);
  } catch (err) {
    console.error("traffic: record failed", err instanceof Error ? err.name : "unknown");
  }
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 9: Change the subscribe route** to replace the destructure and the tail:

```ts
import { NextRequest, NextResponse } from "next/server";
import { upsertSubscriber } from "@/lib/db";
import { isTrafficSource } from "@/lib/traffic";
import { recordTrafficEvent } from "@/lib/trafficStats";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { email, source } = (body ?? {}) as { email?: string; source?: unknown };

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  await upsertSubscriber(email);
  // Which arrival this signup came from (lib/trafficClient.ts). Counting
  // must never fail a real subscribe; an unknown source files as "direct".
  try {
    await recordTrafficEvent({ kind: "signup", source: isTrafficSource(source) ? source : "direct" });
  } catch (err) {
    console.error("traffic: signup record failed", err instanceof Error ? err.name : "unknown");
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 10: Run the tests and check they pass**

Run: `npx vitest run app/api/traffic app/api/subscribe lib/trafficStats.test.ts`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add lib/trafficStats.ts lib/trafficStats.test.ts app/api/traffic app/api/subscribe
git commit -m "feat: count arrivals, signups and share taps per day (production only)"
```

---

### Task 3: Browser wiring (beacon, signup source, share links)

**Files:**
- Create: `lib/trafficClient.ts`, `components/TrafficBeacon.tsx`
- Modify:
  - `app/layout.tsx` (mount the beacon after `<Footer />`, inside `SessionProvider`)
  - `components/EmailSignupInline.tsx`
  - `components/StoryView.tsx`
  - `components/PuzzleGame.tsx`
  - `lib/puzzle.ts`
  - `lib/puzzle.test.ts`

**Interfaces:**
- Consumes (Task 1): `classifySource`, `TrafficEvent`, `TrafficSource`, `isTrafficSource`. Consumes (Task 2): `POST /api/traffic`, `POST /api/subscribe { email, source }`.
- Produces:
  - `sendTrafficEvent(ev: TrafficEvent): void`
  - `rememberArrivalSource(): TrafficSource | null`, which returns the source **only the first time in a session**, so the caller knows to send a visit
  - `getArrivalSource(): TrafficSource`, which falls back to `"direct"`

- [ ] **Step 1: Update the puzzle share test first** (TDD). In `lib/puzzle.test.ts`, change the first `buildPuzzleShareText` test:

```ts
  it("includes the puzzle number, the grid, and the puzzle's address as plain text", () => {
    const text = buildPuzzleShareText(142, 1, "https://curioword.com");
    expect(text).toContain("Curio puzzle #142");
    expect(text).toContain("🟫⬜⬜");
    expect(text.split("\n")[2]).toBe("curioword.com/play");
    expect(text).not.toContain("https://");
    expect(text).not.toContain("http://");
  });

  it("copes with a trailing slash on the site URL", () => {
    expect(buildPuzzleShareText(1, 2, "https://curioword.com/").split("\n")[2]).toBe("curioword.com/play");
  });
```

- [ ] **Step 2: Run it and check it fails**

Run: `npx vitest run lib/puzzle.test.ts`
Expected: FAIL. `expected 'curioword.com' to be 'curioword.com/play'`.

- [ ] **Step 3: Change `buildPuzzleShareText`** in `lib/puzzle.ts`. Change the doc comment's first sentence and the return line:

```ts
/** The full share text — puzzle number, the result grid, and the puzzle's
 * address (`curioword.com/play`) as plain text (deliberately not a link: a
 * real URL would let social platforms render a preview card, which this
 * share is designed to avoid — see this plan's Global Constraints). It
 * names /play so a friend lands on the puzzle, not the homepage. Derived
 * from `siteUrl` rather than hardcoded, so it always names this app's
 * actual current domain (see Flagged decision B). */
export function buildPuzzleShareText(
  puzzleNumber: number,
  cluesUsedToSolve: 1 | 2 | 3 | null,
  siteUrl: string
): string {
  const domain = siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const grid = buildPuzzleResultGrid(cluesUsedToSolve);
  return `Curio puzzle #${puzzleNumber}\n${grid}\n${domain}/play`;
}
```

- [ ] **Step 4: Run it and check it passes**

Run: `npx vitest run lib/puzzle.test.ts`
Expected: PASS. The "never reveals" test still sees 3 lines.

- [ ] **Step 5: Create `lib/trafficClient.ts`**

```ts
import { classifySource, isTrafficSource, type TrafficEvent, type TrafficSource } from "./traffic";

const ARRIVAL_KEY = "curio:arrivalSource"; // sessionStorage: one arrival per tab session

/** Fire-and-forget. keepalive lets it finish if the page is closing (a
 * share sheet, a navigation). Analytics never throws into the caller. */
export function sendTrafficEvent(ev: TrafficEvent): void {
  try {
    void fetch("/api/traffic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ev),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // best-effort only
  }
}

/** Classifies this tab's arrival once and remembers it for the session.
 * Returns the source only on that first call, so the caller sends exactly
 * one visit; null afterwards, for an internal referrer, or when storage is
 * unavailable (private mode) — better to under-count than double-count. */
export function rememberArrivalSource(): TrafficSource | null {
  try {
    if (window.sessionStorage.getItem(ARRIVAL_KEY)) return null;
    const source = classifySource(window.location.search, document.referrer, window.location.host);
    if (!source) return null;
    window.sessionStorage.setItem(ARRIVAL_KEY, source);
    return source;
  } catch {
    return null;
  }
}

/** The source to credit a signup to: this session's arrival, else direct. */
export function getArrivalSource(): TrafficSource {
  try {
    const stored = window.sessionStorage.getItem(ARRIVAL_KEY);
    return isTrafficSource(stored) ? stored : "direct";
  } catch {
    return "direct";
  }
}
```

- [ ] **Step 6: Create `components/TrafficBeacon.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { rememberArrivalSource, sendTrafficEvent } from "@/lib/trafficClient";

/** Counts one arrival per browser-tab session (lib/trafficStats.ts). The
 * root layout stays mounted across client navigations, so this runs once
 * per full page load; sessionStorage stops a reload counting twice.
 * Renders nothing. */
export default function TrafficBeacon() {
  useEffect(() => {
    const source = rememberArrivalSource();
    if (source) sendTrafficEvent({ kind: "visit", source });
  }, []);
  return null;
}
```

Add it to `app/layout.tsx`: import `TrafficBeacon from "@/components/TrafficBeacon"` and render `<TrafficBeacon />` straight after `<Footer />`.

- [ ] **Step 7: `components/EmailSignupInline.tsx`.** Import `getArrivalSource` from `@/lib/trafficClient`, then change the body:

```ts
        body: JSON.stringify({ email, source: getArrivalSource() }),
```

- [ ] **Step 8: `components/StoryView.tsx`.** Import `sendTrafficEvent` from `@/lib/trafficClient`, then change `handleShare`'s first lines:

```ts
  async function handleShare() {
    // Tagged so a friend's visit counts as "share" (lib/traffic.ts). The
    // page's canonical URL is untagged, so search engines still see one
    // address per story.
    const url = `${window.location.origin}/story/${word.slug}?utm_source=share`;
    sendTrafficEvent({ kind: "share", what: "story" });
```

The rest of the function is unchanged.

- [ ] **Step 9: `components/PuzzleGame.tsx`.** Import `sendTrafficEvent` from `@/lib/trafficClient`. Add `sendTrafficEvent({ kind: "share", what: "puzzle" });` as the first line of `handleShare`.

- [ ] **Step 10: Verify everything.**
  - Run `npm test && npx tsc --noEmit && npm run lint`. Expected: all pass.
  - Then start the dev server (preview_start) and check in the browser:
    - load `/story/<any>?utm_source=share`;
    - in the network panel, see one `POST /api/traffic` with body `{"kind":"visit","source":"share"}` returning 204;
    - reload and see **no** second visit POST;
    - press Share (copy fallback): the copied URL ends `?utm_source=share` and a `{"kind":"share","what":"story"}` POST goes out.
  - In local dev nothing is written to Redis (VERCEL_ENV isn't production). That's expected; the 204 is enough.

- [ ] **Step 11: Commit**

```bash
git add lib/trafficClient.ts components/TrafficBeacon.tsx app/layout.tsx components/EmailSignupInline.tsx components/StoryView.tsx components/PuzzleGame.tsx lib/puzzle.ts lib/puzzle.test.ts
git commit -m "feat: arrival beacon, signup source, tagged story share, puzzle share → /play"
```

---

### Task 4: Admin section, read-only report script, docs

**Files:**
- Modify: `app/admin/page.tsx`, `components/AdminDashboard.tsx`
- Create: `scripts/trafficReport.ts`
- Modify: `package.json` (script), `handover.md`, `README.md`

**Interfaces:**
- Consumes: `getTrafficDays` (Task 2), `summarizeTraffic`, `TrafficSummary` (Task 1).

- [ ] **Step 1: Admin data.** In `app/admin/page.tsx`:
  - import `getTrafficDays` from `@/lib/trafficStats` and `summarizeTraffic` from `@/lib/traffic`;
  - add `getTrafficDays(28, now)` to the `Promise.all` (as `trafficDays`);
  - pass `traffic={summarizeTraffic(trafficDays)}` to `<AdminDashboard>`.

- [ ] **Step 2: Admin UI.** In `components/AdminDashboard.tsx`:
  - add `traffic: TrafficSummary` to `Props` (import the type from `@/lib/traffic`) and to the destructure;
  - insert this section between "Growth" and "People":

```tsx
      <Section title="Where visitors come from">
        <p className="font-serif text-[13.5px] leading-[1.5] text-ink-soft italic">
          Last 28 days, one visit per browser session, production only. Counting began with
          the 2026-10 traffic-sources deploy.
        </p>
        {traffic.rows.length === 0 ? (
          <p className="mt-3 font-serif text-[13.5px] text-ink-soft italic">No visits counted yet.</p>
        ) : (
          <div className="mt-3">
            <div className="flex items-baseline justify-between py-1.5 font-sans text-[9.5px] tracking-[0.18em] text-ink-soft uppercase">
              <span className="flex-1">Source</span>
              <span className="w-16 text-right">Visits</span>
              <span className="w-16 text-right">Signups</span>
              <span className="w-16 text-right">Rate</span>
            </div>
            {traffic.rows.map((row) => (
              <div
                key={row.source}
                className="flex items-baseline justify-between border-t border-line py-1.5"
              >
                <span className="flex-1 font-sans text-[11px] tracking-[0.06em] text-ink-soft">{row.source}</span>
                <span className="w-16 text-right font-serif text-[13px]">{row.visits}</span>
                <span className="w-16 text-right font-serif text-[13px]">{row.signups}</span>
                <span className="w-16 text-right font-serif text-[13px]">
                  {row.rate === null ? "—" : `${Math.round(row.rate * 100)}%`}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4">
          <StatRow label="Total visits / signups" value={`${traffic.totals.visits} / ${traffic.totals.signups}`} />
          <StatRow label="Share taps (story / puzzle)" value={`${traffic.shares.story} / ${traffic.shares.puzzle}`} />
        </div>
      </Section>
```

- [ ] **Step 3: Read-only report script `scripts/trafficReport.ts`**

```ts
// Prints Curio's first-party traffic counters for the last N days: visits
// and signups by source, plus share taps. Read-only — HGETALL only, never a
// write. Needs UPSTASH_REDIS_REST_URL/TOKEN in .env.local (the weekly
// check-in runs this). Prints counts only; no personal data exists here.
// Usage: npm run traffic:report -- [days=28]
import { getTrafficDays } from "../lib/trafficStats";
import { summarizeTraffic } from "../lib/traffic";
import { usingUpstash } from "../lib/redis";

const days = Number(process.argv[2] ?? 28);
if (!Number.isInteger(days) || days < 1 || days > 90) {
  console.error("Usage: npm run traffic:report -- [days=28]   (1–90)");
  process.exit(1);
}
if (!usingUpstash) {
  console.error("Upstash isn't configured (UPSTASH_REDIS_REST_URL/TOKEN missing from .env.local).");
  process.exit(1);
}

const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);

// No top-level await: tsx runs this repo's scripts as CommonJS.
async function main() {
  const perDay = await getTrafficDays(days);
  const s = summarizeTraffic(perDay);
  console.log(`Curio traffic — last ${days} days (UTC), ${Object.keys(perDay).length} days with data`);
  console.log("source       visits  signups  rate");
  for (const r of s.rows) {
    console.log(`${r.source.padEnd(12)} ${String(r.visits).padStart(6)}  ${String(r.signups).padStart(7)}  ${pct(r.rate)}`);
  }
  console.log(`total        ${String(s.totals.visits).padStart(6)}  ${String(s.totals.signups).padStart(7)}`);
  console.log(`share taps: story ${s.shares.story}, puzzle ${s.shares.puzzle}`);
  console.log("\nby day (visits):");
  for (const day of Object.keys(perDay).sort()) {
    const v = Object.entries(perDay[day])
      .filter(([f]) => f.startsWith("visit:"))
      .reduce((t, [, n]) => t + n, 0);
    console.log(`  ${day}  ${v}`);
  }
}

main().catch((err) => {
  console.error("traffic:report failed:", err instanceof Error ? err.name : "unknown");
  process.exit(1);
});
```

Add to `package.json` scripts: `"traffic:report": "tsx --env-file=.env.local scripts/trafficReport.ts"`.

Run `npm run traffic:report -- 7`. Expected: the header line plus an empty table (nothing is counted until production deploys), exit code 0. If tsx rejects `--env-file`, use `node --env-file=.env.local --import tsx scripts/trafficReport.ts` instead and record that in the script's usage comment.

- [ ] **Step 4: Docs.**
  - **`handover.md`:** add a "Measuring growth (traffic sources)" section in the runbooks area. Cover:
    - what's counted and the key format;
    - production-only writes;
    - 90-day TTL;
    - `/admin` "Where visitors come from";
    - `npm run traffic:report -- [days]` (read-only, used by the weekly check-in);
    - Vercel Hobby Web Analytics shows page views and referrers only — no UTM, no custom events — which is why this exists. The existing `track()` events are dropped on Hobby.
  - **`handover.md`, "Threads + Instagram: owner setup":** the Instagram bio link should be `https://curioword.com/?utm_source=instagram`.
  - **`handover.md`:** add a dated session section (2026-10-03) listing what shipped, with a Verification placeholder for the first production numbers.
  - **`README.md`:** one line under scripts for `traffic:report`.

- [ ] **Step 5: Verify everything.**
  - Run `npm test && npx tsc --noEmit && npm run lint && npm run build`. Expected: all pass, and the build shows `/api/traffic` as a dynamic route while story pages stay static (●/○, as before).
  - Then, in the browser pane with the owner signed in: `/admin` shows the new section with "No visits counted yet."

- [ ] **Step 6: Commit**

```bash
git add app/admin/page.tsx components/AdminDashboard.tsx scripts/trafficReport.ts package.json handover.md README.md
git commit -m "feat: admin traffic-sources section, read-only traffic:report script, docs"
```

---

## After the plan (controller, not a task)

- Final code review across all four tasks, then merge locally to `master`.
- **The owner decides on push** (outside 08:45–11:00 UTC).
- After deploy, smoke-check production:
  - `curl -sS -X POST https://curioword.com/api/traffic -H 'content-type: application/json' -H 'user-agent: Googlebot' -d '{"kind":"visit","source":"direct"}'` returns 204 and makes no write;
  - an off-allowlist body returns 400;
  - one real browser visit to `/?utm_source=share` then shows up in `npm run traffic:report -- 1`.

  Note the test visit in handover so it isn't mistaken for a real share.
- Update the weekly check-in's prompt (scheduled task `curio-weekly-checkin`) so it can run `npm run traffic:report -- 7` and `-- 28` in `curio-web`. It stays read-only, counts only.
