# Double Opt-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** an anonymous email signup gets one "confirm your subscription" email. The address joins the daily digest only after its owner presses Confirm. This is the prerequisite for any public promotion (`docs/launch-kit.md`).

**Architecture:**
- `/api/subscribe` no longer stores the address. Instead it emails a **stateless, HMAC-signed, 7-day confirm link** carrying `{email, source, issuedAt}`. Nothing about an unconfirmed address is stored, apart from a 10-minute send cooldown keyed by address.
- The link opens a confirm page, `/subscribe/confirm`. That page changes nothing, because link scanners prefetch GETs. Its Confirm button POSTs to `/api/subscribe/confirm`.
- The POST verifies the token, adds the subscriber if they're new, counts a confirmed signup against the original arrival source, and 303s to `/subscribed`.
- This mirrors the unsubscribe flow shipped on 2026-09-28 (`lib/unsubscribeToken.ts`, `app/unsubscribe/page.tsx`, `app/api/unsubscribe/route.ts`).

**Tech Stack:** Next.js 16.3.4 App Router, React 19, `node:crypto` HMAC, Resend 6.27, Upstash Redis, vitest.

**Spec:**
- The owner asked for this on 2026-10-03 ("start the double opt-in plan").
- It's the deferred item in `handover.md` ("Deferred / parked items"), which the first weekly check-in brief described (`C:\Users\Sam\Documents\Claude\Projects\Curio\checkins\2026-10-02.md`, "Proposed Claude work #2"). That brief asked for:
  - one confirmation email with an HMAC-signed link, reusing the unsubscribe token approach;
  - adding to the digest only after confirming;
  - grandfathering existing subscribers;
  - unconfirmed entries expiring after 7 days;
  - a cooldown on repeat requests (the sign-in cooldown pattern);
  - TDD, a feature worktree, verification against a real send to an owner `+alias` only, and updating `handover.md` and the README.
- Where this plan departs from that brief, the Flagged decisions below explain why. **The owner approves or amends them before execution.**

### Flagged decisions (owner to confirm)

- **A. Stateless token instead of a Redis "pending" record.**
  - The 7-day expiry lives inside the signed token (`issuedAt` plus a 7-day TTL check), so no unconfirmed address is ever stored. That's better for privacy, and there's nothing to clean up.
  - It still meets the brief's "unconfirmed entries expire after 7 days": the link stops working after 7 days, and the address was never stored.
  - It reuses `UNSUBSCRIBE_SECRET`, with a different HMAC context string (`curio:confirm:v1:`), so a confirm token can never pass as an unsubscribe token or the reverse. No new environment variable is needed.
- **B. Confirmation is a button on a page, not the link itself.**
  - Outlook Safe Links and corporate mail scanners open every link in an email. If the GET confirmed, a scanner would confirm addresses a bot typed in, which defeats double opt-in.
  - This is one extra tap, the same as unsubscribe.
- **C. Existing subscriber submits the form again:** they get the same "check your inbox" reply, but **no email is sent and nothing is counted**. The reply never reveals whether an address is subscribed.
- **D. Cooldown:** one confirmation email per address per **10 minutes**. Sign-in uses 60 seconds; this is longer because a signup has no urgency. If the send fails, the cooldown is released so the person can retry at once.
- **E. Signed-in users (`/account`) keep subscribing directly.** Their address was already proven by the magic-link sign-in.
- **F. Counting:**
  - `signup:<source>` is now counted **only on confirmation**, so it means a real, confirmed subscriber. A confirmed re-subscribe of an existing address isn't counted.
  - A new server-side counter, `request:<source>`, is counted when a confirmation email is sent, so `/admin` and `traffic:report` show requests next to signups. Requests minus signups is roughly the confirmation drop-off.
  - **Also a fix:** the public `/api/traffic` endpoint currently accepts `signup` events from anyone. It should only accept `visit` and `share`, because signups are recorded server-side. This plan tightens that.
- **G. "This browser subscribed" moves to confirmation.** The pitch-hiding flag (`markSubscribedHere`) is set on the `/subscribed?ok=1` page, not when the form is submitted. Someone who mistypes their address and never confirms still sees the signup box on their next visit.
- **H. Production without `UNSUBSCRIBE_SECRET` fails closed:** `/api/subscribe` returns 503 and sends nothing. That's the same rule the daily cron already follows.

## Global Constraints

- **The emailed link never changes state.** Only a POST to `/api/subscribe/confirm` adds a subscriber.
- **Tokens:**
  - HMAC-SHA256 over `"curio:confirm:v1:" + payloadB64`, compared with `timingSafeEqual`.
  - Format `payloadB64.macB64`, both base64url.
  - The payload is JSON `{"e": <normalised email>, "s": <TrafficSource>, "t": <issued unix seconds>}`.
  - Valid for `CONFIRM_TTL_SECONDS = 7 * 24 * 60 * 60`. A token issued more than 300 seconds in the future is rejected (clock-skew allowance).
- **Secret:** `unsubscribeSecret()` from `lib/unsubscribeToken.ts`. It returns null in production when the variable is unset, which means 503 (subscribe) and an invalid link (confirm).
- **Never reveal subscription status.** `/api/subscribe` gives the same 200 `{ ok: true, pending: true }` for a new address, an existing subscriber and a cooled-down address.
- **No personal data in logs.** Log `err.name` only, never an address, token or Resend message.
- **Cooldown:** `curio:confirmcooldown:<normalised email>`, `SET NX EX 600`, released (`DEL`) when the send fails. No-op without Upstash.
- **Analytics never breaks the flow.** Every `recordTrafficEvent` call is in try/catch.
- **Copy:**
  - The email subject is exactly `Confirm your Curio subscription`.
  - No streak or "don't miss" language (the AGENTS.md product principle).
  - The UI uses `components/ui` primitives and design tokens only. No arbitrary Tailwind values (see `docs/design-system.md`).
- **New pages are noindex** and listed in `lib/seoRoutes.ts` `DISALLOWED_PATHS`: `/subscribe` and `/subscribed`.
- **Next.js:** read `node_modules/next/dist/docs/` for route handlers and for page `searchParams` (a Promise) before writing them. Mirror the unsubscribe page and route.
- **Tests:** `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` must all pass. Mock Redis with the `vi.hoisted` fake pattern (`lib/signInCooldown.test.ts`).
- **Commits** end with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **No push or deploy without the owner's go-ahead.** Never trigger production crons. Real-send verification goes only to an owner `+alias` address.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/confirmToken.ts` + test (new) | Sign and verify the 7-day confirm token. |
| `lib/confirmCooldown.ts` + test (new) | Per-address 10-minute send claim, plus release. |
| `lib/traffic.ts` + test | Adds the `request` kind (server-side only). The public parser accepts `visit` and `share` only. Summary gains `requests`. |
| `lib/email.ts` + `lib/email.test.ts` | `confirmUrl`, `buildConfirmMessage`, `sendConfirmEmail`. |
| `app/api/subscribe/route.ts` + test | Sends the confirmation instead of storing the address. |
| `app/api/subscribe/confirm/route.ts` + test (new) | POST: verify, add, count, 303. |
| `app/subscribe/confirm/page.tsx` (new) | The confirm page with a button. |
| `app/subscribed/page.tsx`, `components/MarkSubscribedHere.tsx` (new) | The result page; sets the "subscribed here" flag on success. |
| `components/EmailSignupInline.tsx` | "Check your inbox" copy; no longer marks subscribed on submit. |
| `lib/seoRoutes.ts` (+ test if it lists paths) | Disallow `/subscribe` and `/subscribed`. |
| `components/AdminDashboard.tsx`, `scripts/trafficReport.ts` | Show requests. |
| `handover.md`, `README.md`, `docs/launch-kit.md` | Docs. |

---

### Task 1: Confirm token and send cooldown

**Files:**
- Create: `lib/confirmToken.ts`, `lib/confirmToken.test.ts`, `lib/confirmCooldown.ts`, `lib/confirmCooldown.test.ts`

**Interfaces:**
- Consumes: `normaliseEmail` from `lib/unsubscribeToken.ts`; `isTrafficSource` and `TrafficSource` from `lib/traffic.ts`; `redis` from `lib/redis.ts`.
- Produces:
  - `CONFIRM_TTL_SECONDS`
  - `signConfirmToken(email: string, source: TrafficSource, secret: string, now?: Date): string`
  - `type ConfirmClaim = { email: string; source: TrafficSource }`
  - `verifyConfirmToken(token: string, secret: string, now?: Date): ConfirmClaim | null`
  - `claimConfirmSend(email: string): Promise<boolean>`
  - `releaseConfirmSend(email: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/confirmToken.test.ts
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CONFIRM_TTL_SECONDS, signConfirmToken, verifyConfirmToken } from "./confirmToken";
import { signUnsubscribeToken } from "./unsubscribeToken";

const SECRET = "test-secret";
const NOW = new Date("2026-10-03T12:00:00Z");
const later = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

describe("confirm tokens", () => {
  it("round-trips the normalised email and the source", () => {
    const token = signConfirmToken("  Sam@Example.com ", "search", SECRET, NOW);
    expect(verifyConfirmToken(token, SECRET, NOW)).toEqual({ email: "sam@example.com", source: "search" });
  });

  it("is valid for 7 days and not a second longer", () => {
    expect(CONFIRM_TTL_SECONDS).toBe(7 * 24 * 60 * 60);
    const token = signConfirmToken("a@example.com", "direct", SECRET, NOW);
    expect(verifyConfirmToken(token, SECRET, later(CONFIRM_TTL_SECONDS))).not.toBeNull();
    expect(verifyConfirmToken(token, SECRET, later(CONFIRM_TTL_SECONDS + 1))).toBeNull();
  });

  it("rejects a token issued more than 5 minutes in the future", () => {
    const token = signConfirmToken("a@example.com", "direct", SECRET, later(301));
    expect(verifyConfirmToken(token, SECRET, NOW)).toBeNull();
    const nearly = signConfirmToken("a@example.com", "direct", SECRET, later(299));
    expect(verifyConfirmToken(nearly, SECRET, NOW)).not.toBeNull();
  });

  it("rejects a different secret, a tampered payload and a tampered signature", () => {
    const token = signConfirmToken("a@example.com", "share", SECRET, NOW);
    expect(verifyConfirmToken(token, "other-secret", NOW)).toBeNull();

    const [payload, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ e: "victim@example.com", s: "share", t: 1790000000 })).toString("base64url");
    expect(verifyConfirmToken(`${forged}.${mac}`, SECRET, NOW)).toBeNull();

    // Flip a character in the middle of the signature (not the last one,
    // whose low bits can be base64url padding and decode identically).
    const mid = Math.floor(mac.length / 2);
    const flipped = mac.slice(0, mid) + (mac[mid] === "A" ? "B" : "A") + mac.slice(mid + 1);
    expect(verifyConfirmToken(`${payload}.${flipped}`, SECRET, NOW)).toBeNull();
  });

  it("never accepts an unsubscribe token, even for the same address and secret", () => {
    const unsub = signUnsubscribeToken("a@example.com", SECRET);
    expect(verifyConfirmToken(unsub, SECRET, NOW)).toBeNull();
  });

  it("rejects well-signed payloads with bad contents", () => {
    const sign = (obj: unknown) => {
      const p = Buffer.from(JSON.stringify(obj)).toString("base64url");
      const m = createHmac("sha256", SECRET).update("curio:confirm:v1:" + p).digest("base64url");
      return `${p}.${m}`;
    };
    const t = Math.floor(NOW.getTime() / 1000);
    expect(verifyConfirmToken(sign({ e: "no-at-sign", s: "direct", t }), SECRET, NOW)).toBeNull();
    expect(verifyConfirmToken(sign({ e: "Upper@Example.com", s: "direct", t }), SECRET, NOW)).toBeNull();
    expect(verifyConfirmToken(sign({ e: "a@example.com", s: "myspace", t }), SECRET, NOW)).toBeNull();
    expect(verifyConfirmToken(sign({ e: "a@example.com", s: "direct", t: "soon" }), SECRET, NOW)).toBeNull();
    expect(verifyConfirmToken(sign("just a string"), SECRET, NOW)).toBeNull();
  });

  it("rejects malformed shapes without throwing", () => {
    for (const bad of ["", ".", "abc", "a.b.c", "!!!.???"]) {
      expect(verifyConfirmToken(bad, SECRET, NOW)).toBeNull();
    }
  });
});
```

```ts
// lib/confirmCooldown.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fakeRedis } = vi.hoisted(() => {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  return {
    fakeRedis: {
      store,
      ttls,
      set: vi.fn(async (key: string, value: string, opts?: { nx?: boolean; ex?: number }) => {
        if (opts?.nx && store.has(key)) return null;
        store.set(key, value);
        if (opts?.ex) ttls.set(key, opts.ex);
        return "OK";
      }),
      del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    },
  };
});

vi.mock("./redis", () => ({ redis: fakeRedis, usingUpstash: true }));

const { claimConfirmSend, releaseConfirmSend } = await import("./confirmCooldown");

beforeEach(() => {
  fakeRedis.store.clear();
  fakeRedis.ttls.clear();
  vi.clearAllMocks();
});

describe("confirm-send cooldown", () => {
  it("allows the first send for an address and holds it for 10 minutes", async () => {
    expect(await claimConfirmSend("a@example.com")).toBe(true);
    expect(fakeRedis.ttls.get("curio:confirmcooldown:a@example.com")).toBe(600);
  });

  it("refuses a second send for the same address (case and spaces ignored)", async () => {
    await claimConfirmSend("a@example.com");
    expect(await claimConfirmSend("  A@Example.com ")).toBe(false);
  });

  it("does not affect other addresses", async () => {
    await claimConfirmSend("a@example.com");
    expect(await claimConfirmSend("b@example.com")).toBe(true);
  });

  it("release lets the address try again at once (used when the send fails)", async () => {
    await claimConfirmSend("a@example.com");
    await releaseConfirmSend("a@example.com");
    expect(await claimConfirmSend("a@example.com")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests and check they fail**

Run: `npx vitest run lib/confirmToken.test.ts lib/confirmCooldown.test.ts`
Expected: FAIL. `Failed to resolve import "./confirmToken"` and `"./confirmCooldown"`.

- [ ] **Step 3: Implement `lib/confirmToken.ts`**

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { normaliseEmail } from "./unsubscribeToken";
import { isTrafficSource, type TrafficSource } from "./traffic";

/** A distinct HMAC context from unsubscribe's, so neither kind of token can
 * ever pass as the other even though both use UNSUBSCRIBE_SECRET. Bump the
 * version to invalidate every outstanding confirm link at once. */
const CONTEXT = "curio:confirm:v1:";

/** How long a confirm link works. Nothing is stored for an unconfirmed
 * address — the expiry lives in the signed token itself. */
export const CONFIRM_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Tolerated clock skew for a token "issued in the future". */
const MAX_SKEW_SECONDS = 300;

export type ConfirmClaim = { email: string; source: TrafficSource };

function mac(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(CONTEXT + payload).digest();
}

const unixSeconds = (d: Date) => Math.floor(d.getTime() / 1000);

/** `base64url(JSON{e,s,t}).base64url(hmac)`. `s` is the arrival source the
 * signup came from (lib/traffic.ts), carried so the confirmed signup is
 * credited to it; `t` is when the link was issued. */
export function signConfirmToken(email: string, source: TrafficSource, secret: string, now: Date = new Date()): string {
  const payload = Buffer.from(
    JSON.stringify({ e: normaliseEmail(email), s: source, t: unixSeconds(now) })
  ).toString("base64url");
  return `${payload}.${mac(payload, secret).toString("base64url")}`;
}

/** The address and source a token was signed for, or null if it's forged,
 * tampered with, signed under another secret, expired, from the future, or
 * malformed in any way. Never throws. */
export function verifyConfirmToken(token: string, secret: string, now: Date = new Date()): ConfirmClaim | null {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, sig] = parts;

  const given = Buffer.from(sig, "base64url");
  const expected = mac(payload, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let data: unknown;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const { e, s, t } = data as Record<string, unknown>;
  if (typeof e !== "string" || !e.includes("@") || e !== normaliseEmail(e)) return null;
  if (!isTrafficSource(s)) return null;
  if (typeof t !== "number" || !Number.isFinite(t)) return null;

  const age = unixSeconds(now) - t;
  if (age > CONFIRM_TTL_SECONDS || age < -MAX_SKEW_SECONDS) return null;
  return { email: e, source: s };
}
```

- [ ] **Step 4: Implement `lib/confirmCooldown.ts`**

```ts
import { redis } from "./redis";
import { normaliseEmail } from "./unsubscribeToken";

/** One confirmation email per address per 10 minutes, so repeated form
 * submissions can't drain the Resend quota the digest and sign-in share.
 * Same NX-claim pattern as lib/signInCooldown.ts, longer window: a signup
 * has no urgency. Without Upstash it always allows. */
const COOLDOWN_SECONDS = 10 * 60;

const cooldownKey = (email: string) => `curio:confirmcooldown:${normaliseEmail(email)}`;

export async function claimConfirmSend(email: string): Promise<boolean> {
  if (!redis) return true;
  const claimed = await redis.set(cooldownKey(email), "1", { nx: true, ex: COOLDOWN_SECONDS });
  return claimed !== null;
}

/** Called when the send itself failed, so the person can retry at once
 * rather than silently getting nothing for 10 minutes. */
export async function releaseConfirmSend(email: string): Promise<void> {
  if (!redis) return;
  await redis.del(cooldownKey(email));
}
```

- [ ] **Step 5: Run the tests and check they pass**

Run: `npx vitest run lib/confirmToken.test.ts lib/confirmCooldown.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/confirmToken.ts lib/confirmToken.test.ts lib/confirmCooldown.ts lib/confirmCooldown.test.ts
git commit -m "feat: signed 7-day confirm token and per-address confirm-send cooldown"
```

---

### Task 2: Traffic `request` kind, tightened public parser, confirmation email

**Files:**
- Modify: `lib/traffic.ts`, `lib/traffic.test.ts`, `lib/email.ts`, `lib/email.test.ts`

**Interfaces:**
- Consumes (Task 1): `signConfirmToken`.
- Produces:
  - `TrafficEvent` gains `{ kind: "request"; source: TrafficSource }`.
  - `eventField` maps it to `request:<source>`.
  - `parseTrafficEvent` (the **public** gate) accepts only `visit` and `share`.
  - `TrafficRow` becomes `{ source; visits; requests; signups; rate }`, and `TrafficSummary.totals` becomes `{ visits; requests; signups }`.
  - `confirmUrl(email: string, source: TrafficSource, secret: string, now?: Date): string`
  - `buildConfirmMessage(email: string, url: string): { to: string; subject: string; html: string; text: string }`
  - `sendConfirmEmail(email: string, url: string): Promise<void>`, which throws on a Resend error.

- [ ] **Step 1: Update the traffic tests first.** In `lib/traffic.test.ts`:

  - Replace the "accepts the three event kinds" test with:

```ts
  it("accepts only the browser-sent kinds (visit, share) and maps each to one field", () => {
    const visit = parseTrafficEvent({ kind: "visit", source: "search" });
    const share = parseTrafficEvent({ kind: "share", what: "puzzle" });
    expect(visit && eventField(visit)).toBe("visit:search");
    expect(share && eventField(share)).toBe("share:puzzle");
  });

  it("refuses signup and request from the public endpoint (they're recorded server-side)", () => {
    expect(parseTrafficEvent({ kind: "signup", source: "share" })).toBeNull();
    expect(parseTrafficEvent({ kind: "request", source: "share" })).toBeNull();
  });

  it("maps the server-side kinds to their fields", () => {
    expect(eventField({ kind: "signup", source: "share" })).toBe("signup:share");
    expect(eventField({ kind: "request", source: "hn" })).toBe("request:hn");
  });
```

  - Change the `summarizeTraffic` tests so rows carry `requests`:

```ts
  it("sums days per source, computes a signup rate, ignores unknown fields, sorts by visits", () => {
    const summary = summarizeTraffic({
      "2026-10-01": { "visit:search": 5, "visit:direct": 2, "request:search": 2, "signup:search": 1, "share:story": 1, "junk:x": 9 },
      "2026-10-02": { "visit:search": 3, "signup:direct": 1, "share:puzzle": 2, "share:story": 1 },
    });
    expect(summary.rows).toEqual([
      { source: "search", visits: 8, requests: 2, signups: 1, rate: 1 / 8 },
      { source: "direct", visits: 2, requests: 0, signups: 1, rate: 1 / 2 },
    ]);
    expect(summary.totals).toEqual({ visits: 10, requests: 2, signups: 2 });
    expect(summary.shares).toEqual({ story: 2, puzzle: 2 });
  });

  it("gives a null rate when a source has signups but no counted visit", () => {
    const summary = summarizeTraffic({ "2026-10-01": { "signup:email": 1 } });
    expect(summary.rows).toEqual([{ source: "email", visits: 0, requests: 0, signups: 1, rate: null }]);
  });

  it("lists a source that only has requests", () => {
    const summary = summarizeTraffic({ "2026-10-01": { "request:reddit": 1 } });
    expect(summary.rows).toEqual([{ source: "reddit", visits: 0, requests: 1, signups: 0, rate: null }]);
  });

  it("is empty for no data", () => {
    expect(summarizeTraffic({})).toEqual({
      rows: [],
      totals: { visits: 0, requests: 0, signups: 0 },
      shares: { story: 0, puzzle: 0 },
    });
  });
```

- [ ] **Step 2: Add failing email tests.** Append to `lib/email.test.ts`, and add the imports it needs at the top: `confirmUrl` and `buildConfirmMessage` from `./email`, `verifyConfirmToken` from `./confirmToken`.

```ts
describe("confirmation email", () => {
  const SECRET = "test-secret";
  const NOW = new Date("2026-10-03T12:00:00Z");

  it("confirmUrl points at the confirm page with a token for that address and source, tagged as email", () => {
    const url = new URL(confirmUrl("Sam@Example.com", "share", SECRET, NOW));
    expect(url.pathname).toBe("/subscribe/confirm");
    expect(url.searchParams.get("utm_source")).toBe("email");
    expect(verifyConfirmToken(url.searchParams.get("token")!, SECRET, NOW)).toEqual({
      email: "sam@example.com",
      source: "share",
    });
  });

  it("buildConfirmMessage has the exact subject, the link in both parts, and the ignore-it line", () => {
    const link = "https://curioword.com/subscribe/confirm?token=abc&utm_source=email";
    const msg = buildConfirmMessage("sam@example.com", link);
    expect(msg.to).toBe("sam@example.com");
    expect(msg.subject).toBe("Confirm your Curio subscription");
    // Raw URL in the href, same convention as the digest's story link
    // (buildDigestHtml interpolates its utm-tagged URL unescaped).
    expect(msg.html).toContain(`href="${link}"`);
    expect(msg.text).toContain(link);
    expect(msg.text).toMatch(/didn.t ask for this/i);
    expect(msg.html + msg.text).not.toMatch(/streak|don.t miss/i);
  });
});
```

The confirm link is interpolated raw into the href, matching `buildDigestHtml`, which does the same with its utm-tagged story URL.

- [ ] **Step 3: Run the tests and check they fail**

Run: `npx vitest run lib/traffic.test.ts lib/email.test.ts`
Expected: FAIL. The parser still accepts `signup`, rows lack `requests`, and `confirmUrl` / `buildConfirmMessage` aren't exported.

- [ ] **Step 4: Update `lib/traffic.ts`**

```ts
export type TrafficEvent =
  | { kind: "visit"; source: TrafficSource }
  | { kind: "signup"; source: TrafficSource }
  | { kind: "request"; source: TrafficSource }
  | { kind: "share"; what: ShareKind };

/** The only gate between a PUBLIC request body and a Redis field name. It
 * accepts only what the browser sends (visit, share): signup and request
 * are recorded server-side by /api/subscribe and /api/subscribe/confirm, so
 * nobody can inflate them by POSTing to /api/traffic. */
export function parseTrafficEvent(body: unknown): TrafficEvent | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b.kind === "visit" && isTrafficSource(b.source)) return { kind: "visit", source: b.source };
  if (b.kind === "share" && (b.what === "story" || b.what === "puzzle")) {
    return { kind: "share", what: b.what };
  }
  return null;
}
```

`eventField` stays as it is: `` ev.kind === "share" ? `share:${ev.what}` : `${ev.kind}:${ev.source}` `` already covers `request`.

In `summarizeTraffic`:
- add a `requests` map;
- handle `else if (kind === "request" && isTrafficSource(name)) requests.set(...)`;
- include a source when it has visits, requests or signups;
- put `requests` in each row, between `visits` and `signups`;
- add `requests` to `totals`.

Update `TrafficRow` and `TrafficSummary` to match the interface above. Update the doc comment: `rate` is confirmed signups ÷ visits.

- [ ] **Step 5: Add to `lib/email.ts`.** Import `signConfirmToken` from `./confirmToken` and `type TrafficSource` from `./traffic`. Put this after `unsubscribeUrl`:

```ts
/** The link in a signup's confirmation email. It opens the confirm page,
 * which changes nothing until its button is pressed (scanners prefetch
 * links — see app/subscribe/confirm/page.tsx). Tagged utm_source=email so
 * the visit counts as email, not direct. */
export function confirmUrl(email: string, source: TrafficSource, secret: string, now: Date = new Date()): string {
  const url = new URL(absoluteUrl("/subscribe/confirm"));
  url.searchParams.set("token", signConfirmToken(email, source, secret, now));
  url.searchParams.set("utm_source", "email");
  return url.toString();
}

function buildConfirmHtml(url: string) {
  return buildShell(`
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.02em;color:#5b665f;margin:0 0 24px;">
        Curio
      </p>
      <h1 style="font-size:28px;line-height:1.25;margin:0 0 12px;font-weight:600;">
        Confirm your subscription
      </h1>
      <p style="font-size:16px;line-height:1.55;margin:0 0 28px;">
        One tap and Curio&rsquo;s word of the day starts arriving each morning. This link works for 7 days.
      </p>
      <a href="${url}" style="display:inline-block;background:#9c6b30;color:#f1ece0;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:6px;">
        Confirm subscription
      </a>
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8a9089;margin-top:48px;border-top:1px solid #d8cfbc;padding-top:16px;">
        If you didn&rsquo;t ask for this, ignore this email &mdash; you won&rsquo;t hear from Curio again.
      </p>`);
}

export function buildConfirmMessage(email: string, url: string) {
  return {
    to: email,
    subject: "Confirm your Curio subscription",
    html: buildConfirmHtml(url),
    text: `Confirm your Curio subscription\n\nOne tap and Curio's word of the day starts arriving each morning:\n${url}\n\nThis link works for 7 days. If you didn't ask for this, ignore this email — you won't hear from Curio again.`,
  };
}

/** Sends the double opt-in email. Same shape as sendSignInEmail: a dev
 * fallback that logs instead of sending, and a thrown error on a Resend
 * failure (the caller logs only the error's name). */
export async function sendConfirmEmail(email: string, url: string): Promise<void> {
  const msg = buildConfirmMessage(email, url);
  if (!resend) {
    console.log(`[curio:email:dev-fallback] would send "${msg.subject}" to ${email}: ${url}`);
    return;
  }
  const { error } = await resend.emails.send({ from: FROM_ADDRESS, ...msg });
  if (error) throw new Error(`Resend send failed: ${error.name}`);
}
```

- [ ] **Step 6: Fix other consumers of the changed types.** Run `npx tsc --noEmit`. Two consumers break and need small changes:
  - `scripts/trafficReport.ts` prints columns and must gain a `requests` column: header `source       visits  requests  signups  rate` with matching `padStart` widths, and the total line too.
  - `components/AdminDashboard.tsx` renders `traffic.rows` and must gain a "Requests" column between Visits and Signups. Copy the existing column markup (`w-16 text-right`), change the explanatory sentence to say signups are confirmed, and add requests to the "Total visits / signups" row: label `Total visits / requests / signups`.

  Replace the existing explanatory sentence with exactly:
  `Last 28 days, one visit per browser tab session, production only. Counting began with the traffic-sources deploy (2026-10). Requests are confirmation emails sent; signups are confirmed (since the double opt-in deploy).`

- [ ] **Step 7: Run the tests and check they pass**

Run: `npx vitest run lib/traffic.test.ts lib/email.test.ts app/api/traffic && npx tsc --noEmit`
Expected: PASS. Then run the full `npx vitest run`.

- [ ] **Step 8: Commit**

```bash
git add lib/traffic.ts lib/traffic.test.ts lib/email.ts lib/email.test.ts scripts/trafficReport.ts components/AdminDashboard.tsx
git commit -m "feat: confirmation email; request counter; public traffic endpoint accepts visit/share only"
```

---

### Task 3: Subscribe and confirm flow (routes, pages, signup copy, robots)

**Files:**
- Modify: `app/api/subscribe/route.ts`, `app/api/subscribe/route.test.ts`, `components/EmailSignupInline.tsx`, `lib/seoRoutes.ts` (and `lib/seoRoutes.test.ts` only if it pins the list)
- Create:
  - `app/api/subscribe/confirm/route.ts` and `route.test.ts`
  - `app/subscribe/confirm/page.tsx`
  - `app/subscribed/page.tsx`
  - `components/MarkSubscribedHere.tsx`

**Interfaces:**
- Consumes:
  - Task 1: `verifyConfirmToken`, `claimConfirmSend`, `releaseConfirmSend`.
  - Task 2: `confirmUrl`, `sendConfirmEmail`, `TrafficEvent` with `request`.
  - Existing: `unsubscribeSecret`, `normaliseEmail`, `maskEmail` (`lib/unsubscribeToken.ts`); `getSubscriberByEmail`, `upsertSubscriber` (`lib/db.ts`); `recordTrafficEvent` (`lib/trafficStats.ts`); `isTrafficSource` (`lib/traffic.ts`); `markSubscribedHere` (`lib/storage.ts`); `Button` (`components/ui/Button`).
- Produces:
  - `POST /api/subscribe` → 200 `{ ok: true, pending: true }`, 400 for an invalid email, 502 when the send fails, 503 when the secret is missing.
  - `POST /api/subscribe/confirm?token=` → 303 to `/subscribed?ok=1|0`.
  - Pages `/subscribe/confirm` and `/subscribed`.

- [ ] **Step 1: Read the docs.** Under `node_modules/next/dist/docs/`, read the route handler guide and the page `searchParams` reference. Confirm that `NextResponse.redirect(url, 303)` and `redirect()` from `next/navigation` in a server page are current. Mirror `app/unsubscribe/page.tsx` and `app/api/unsubscribe/route.ts`.

- [ ] **Step 2: Rewrite `app/api/subscribe/route.test.ts`** with these tests:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  getSubscriberByEmail: vi.fn(async () => null),
  upsertSubscriber: vi.fn(async () => undefined),
}));
vi.mock("@/lib/trafficStats", () => ({ recordTrafficEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/confirmCooldown", () => ({
  claimConfirmSend: vi.fn(async () => true),
  releaseConfirmSend: vi.fn(async () => undefined),
}));
vi.mock("@/lib/email", () => ({
  confirmUrl: vi.fn(() => "https://curioword.com/subscribe/confirm?token=t&utm_source=email"),
  sendConfirmEmail: vi.fn(async () => undefined),
}));

const { POST } = await import("./route");
const { getSubscriberByEmail, upsertSubscriber } = await import("@/lib/db");
const { recordTrafficEvent } = await import("@/lib/trafficStats");
const { claimConfirmSend, releaseConfirmSend } = await import("@/lib/confirmCooldown");
const { confirmUrl, sendConfirmEmail } = await import("@/lib/email");

const post = (body: unknown) =>
  new NextRequest("http://localhost/api/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/subscribe (double opt-in)", () => {
  it("emails a confirm link for a new address, stores nothing, counts a request", async () => {
    const res = await POST(post({ email: " Sam@Example.com ", source: "search" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, pending: true });
    expect(confirmUrl).toHaveBeenCalledWith("sam@example.com", "search", expect.any(String));
    expect(sendConfirmEmail).toHaveBeenCalledWith("sam@example.com", expect.stringContaining("/subscribe/confirm"));
    expect(upsertSubscriber).not.toHaveBeenCalled();
    expect(recordTrafficEvent).toHaveBeenCalledWith({ kind: "request", source: "search" });
  });

  it("files a missing or unknown source as direct", async () => {
    await POST(post({ email: "a@example.com", source: "myspace" }));
    expect(confirmUrl).toHaveBeenCalledWith("a@example.com", "direct", expect.any(String));
  });

  it("gives an existing subscriber the same reply but sends and counts nothing", async () => {
    vi.mocked(getSubscriberByEmail).mockResolvedValueOnce({ email: "a@example.com", hour: 9, createdAt: "2026-09-01T00:00:00Z" });
    const res = await POST(post({ email: "a@example.com" }));
    expect(await res.json()).toEqual({ ok: true, pending: true });
    expect(sendConfirmEmail).not.toHaveBeenCalled();
    expect(recordTrafficEvent).not.toHaveBeenCalled();
  });

  it("gives a cooled-down address the same reply but sends nothing", async () => {
    vi.mocked(claimConfirmSend).mockResolvedValueOnce(false);
    const res = await POST(post({ email: "a@example.com" }));
    expect(await res.json()).toEqual({ ok: true, pending: true });
    expect(sendConfirmEmail).not.toHaveBeenCalled();
  });

  it("returns 502 and releases the cooldown when the send fails", async () => {
    vi.mocked(sendConfirmEmail).mockRejectedValueOnce(new Error("Resend send failed: x"));
    const res = await POST(post({ email: "a@example.com" }));
    expect(res.status).toBe(502);
    expect(releaseConfirmSend).toHaveBeenCalledWith("a@example.com");
    expect(recordTrafficEvent).not.toHaveBeenCalled();
  });

  it("still succeeds when counting the request throws", async () => {
    vi.mocked(recordTrafficEvent).mockRejectedValueOnce(new Error("upstash down"));
    const res = await POST(post({ email: "a@example.com" }));
    expect(res.status).toBe(200);
  });

  it("rejects an invalid email with 400 and does nothing else", async () => {
    const res = await POST(post({ email: "nope" }));
    expect(res.status).toBe(400);
    expect(sendConfirmEmail).not.toHaveBeenCalled();
  });

  it("fails closed with 503 in production without UNSUBSCRIBE_SECRET", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UNSUBSCRIBE_SECRET", "");
    const res = await POST(post({ email: "a@example.com" }));
    expect(res.status).toBe(503);
    expect(sendConfirmEmail).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Write `app/api/subscribe/confirm/route.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  getSubscriberByEmail: vi.fn(async () => null),
  upsertSubscriber: vi.fn(async () => undefined),
}));
vi.mock("@/lib/trafficStats", () => ({ recordTrafficEvent: vi.fn(async () => undefined) }));

const { POST } = await import("./route");
const { getSubscriberByEmail, upsertSubscriber } = await import("@/lib/db");
const { recordTrafficEvent } = await import("@/lib/trafficStats");
const { signConfirmToken } = await import("@/lib/confirmToken");
const { unsubscribeSecret } = await import("@/lib/unsubscribeToken");

const confirm = (token: string) =>
  new NextRequest(`http://localhost/api/subscribe/confirm?token=${encodeURIComponent(token)}`, { method: "POST" });
const location = (res: Response) => new URL(res.headers.get("location")!);

beforeEach(() => vi.clearAllMocks());

describe("POST /api/subscribe/confirm", () => {
  it("adds a new subscriber, counts a signup against the token's source, 303s to ok=1", async () => {
    const res = await POST(confirm(signConfirmToken("a@example.com", "reddit", unsubscribeSecret()!)));
    expect(res.status).toBe(303);
    expect(location(res).pathname).toBe("/subscribed");
    expect(location(res).searchParams.get("ok")).toBe("1");
    expect(upsertSubscriber).toHaveBeenCalledWith("a@example.com");
    expect(recordTrafficEvent).toHaveBeenCalledWith({ kind: "signup", source: "reddit" });
  });

  it("is idempotent: an existing subscriber is left alone, not re-counted, still ok=1", async () => {
    vi.mocked(getSubscriberByEmail).mockResolvedValueOnce({ email: "a@example.com", hour: 9, createdAt: "2026-09-01T00:00:00Z" });
    const res = await POST(confirm(signConfirmToken("a@example.com", "direct", unsubscribeSecret()!)));
    expect(location(res).searchParams.get("ok")).toBe("1");
    expect(upsertSubscriber).not.toHaveBeenCalled();
    expect(recordTrafficEvent).not.toHaveBeenCalled();
  });

  it("rejects a bad or expired token: ok=0, nothing stored", async () => {
    const old = signConfirmToken("a@example.com", "direct", unsubscribeSecret()!, new Date("2020-01-01T00:00:00Z"));
    for (const t of ["garbage", old]) {
      const res = await POST(confirm(t));
      expect(location(res).searchParams.get("ok")).toBe("0");
    }
    expect(upsertSubscriber).not.toHaveBeenCalled();
  });

  it("reports ok=0 when storing fails", async () => {
    vi.mocked(upsertSubscriber).mockRejectedValueOnce(new Error("upstash down"));
    const res = await POST(confirm(signConfirmToken("a@example.com", "direct", unsubscribeSecret()!)));
    expect(location(res).searchParams.get("ok")).toBe("0");
  });

  it("still confirms when counting throws", async () => {
    vi.mocked(recordTrafficEvent).mockRejectedValueOnce(new Error("upstash down"));
    const res = await POST(confirm(signConfirmToken("a@example.com", "direct", unsubscribeSecret()!)));
    expect(location(res).searchParams.get("ok")).toBe("1");
  });
});
```

- [ ] **Step 4: Run them and check they fail**

Run: `npx vitest run app/api/subscribe`
Expected: FAIL. The subscribe route still upserts, and `./route` doesn't exist under `confirm/`.

- [ ] **Step 5: Rewrite `app/api/subscribe/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSubscriberByEmail } from "@/lib/db";
import { isTrafficSource } from "@/lib/traffic";
import { recordTrafficEvent } from "@/lib/trafficStats";
import { normaliseEmail, unsubscribeSecret } from "@/lib/unsubscribeToken";
import { claimConfirmSend, releaseConfirmSend } from "@/lib/confirmCooldown";
import { confirmUrl, sendConfirmEmail } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The same reply whether the address is new, already subscribed, or
 * cooling down: the response never reveals who's on the list. */
const PENDING = { ok: true, pending: true } as const;

/** Double opt-in: stores nothing. Emails a signed 7-day link to the
 * confirm page (lib/confirmToken.ts); the address joins the digest only
 * when that page's button is pressed (app/api/subscribe/confirm). Signed-in
 * users subscribe from /account directly — their address is already proven. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { email, source } = (body ?? {}) as { email?: string; source?: unknown };
  if (!email || !EMAIL_RE.test(email.trim())) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  // Fails closed, like the daily cron: without the secret no link can be
  // signed (unsubscribeSecret() is null in production when it's unset).
  const secret = unsubscribeSecret();
  if (!secret) {
    console.error("[curio:subscribe] UNSUBSCRIBE_SECRET is not set; signups paused");
    return NextResponse.json({ error: "Signups are paused right now. Please try again later." }, { status: 503 });
  }

  const address = normaliseEmail(email);
  const src = isTrafficSource(source) ? source : "direct";

  if (await getSubscriberByEmail(address)) return NextResponse.json(PENDING);
  if (!(await claimConfirmSend(address))) return NextResponse.json(PENDING);

  try {
    await sendConfirmEmail(address, confirmUrl(address, src, secret));
  } catch (err) {
    console.error("[curio:subscribe] confirm email failed:", err instanceof Error ? err.name : "unknown");
    await releaseConfirmSend(address).catch(() => {});
    return NextResponse.json(
      { error: "We couldn't send the confirmation email. Please try again in a few minutes." },
      { status: 502 }
    );
  }

  try {
    await recordTrafficEvent({ kind: "request", source: src });
  } catch (err) {
    console.error("traffic: request record failed", err instanceof Error ? err.name : "unknown");
  }
  return NextResponse.json(PENDING);
}
```

- [ ] **Step 6: Create `app/api/subscribe/confirm/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSubscriberByEmail, upsertSubscriber } from "@/lib/db";
import { verifyConfirmToken } from "@/lib/confirmToken";
import { recordTrafficEvent } from "@/lib/trafficStats";
import { unsubscribeSecret } from "@/lib/unsubscribeToken";

const result = (req: NextRequest, ok: boolean) =>
  NextResponse.redirect(new URL(`/subscribed?ok=${ok ? 1 : 0}`, req.url), 303);

/** The confirm page's button POSTs here (the emailed link itself only
 * opens that page — scanners prefetch GETs). Idempotent: confirming an
 * address that's already subscribed changes nothing and isn't re-counted,
 * so the original createdAt survives. */
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const secret = unsubscribeSecret();
  const claim = token && secret ? verifyConfirmToken(token, secret) : null;
  if (!claim) return result(req, false);

  try {
    if (await getSubscriberByEmail(claim.email)) return result(req, true);
    await upsertSubscriber(claim.email);
  } catch (err) {
    console.error("[curio:subscribe] confirm failed:", err instanceof Error ? err.name : "unknown");
    return result(req, false);
  }

  try {
    await recordTrafficEvent({ kind: "signup", source: claim.source });
  } catch (err) {
    console.error("traffic: signup record failed", err instanceof Error ? err.name : "unknown");
  }
  return result(req, true);
}
```

- [ ] **Step 7: Create `app/subscribe/confirm/page.tsx`**

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Button from "@/components/ui/Button";
import { verifyConfirmToken } from "@/lib/confirmToken";
import { maskEmail, unsubscribeSecret } from "@/lib/unsubscribeToken";

export const metadata: Metadata = {
  title: "Confirm your subscription — Curio",
  robots: { index: false, follow: false },
};

/** Where the confirmation email's link lands. Viewing it changes nothing
 * (mail scanners open every link); only the button's POST subscribes. */
export default async function ConfirmSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const secret = unsubscribeSecret();
  const claim = typeof token === "string" && secret ? verifyConfirmToken(token, secret) : null;
  if (!claim || typeof token !== "string") redirect("/subscribed?ok=0");

  return (
    <section className="mx-auto max-w-form px-6 py-24 text-center">
      <h1 className="font-serif text-3xl">Confirm your subscription</h1>
      <p className="mt-4 font-sans text-sm leading-relaxed text-ink-soft">
        Curio&apos;s word of the day will go to {maskEmail(claim.email)} each morning. Every email has a one-click unsubscribe.
      </p>
      <form method="post" action={`/api/subscribe/confirm?token=${encodeURIComponent(token)}`} className="mt-8">
        <Button type="submit">Confirm</Button>
      </form>
    </section>
  );
}
```

- [ ] **Step 8: Create `components/MarkSubscribedHere.tsx` and `app/subscribed/page.tsx`**

```tsx
// components/MarkSubscribedHere.tsx
"use client";

import { useEffect } from "react";
import { markSubscribedHere } from "@/lib/storage";

/** Sets this browser's "already gets the email" flag (it hides the signup
 * pitch) once a subscription is actually confirmed — not when the form is
 * submitted, so a mistyped address never hides the pitch. Renders nothing. */
export default function MarkSubscribedHere() {
  useEffect(() => {
    markSubscribedHere();
  }, []);
  return null;
}
```

```tsx
// app/subscribed/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import MarkSubscribedHere from "@/components/MarkSubscribedHere";

export const metadata: Metadata = {
  title: "Subscription — Curio",
  robots: { index: false, follow: false },
};

export default async function SubscribedPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const { ok } = await searchParams;
  const success = ok === "1";

  return (
    <section className="mx-auto max-w-form px-6 py-24 text-center">
      {success && <MarkSubscribedHere />}
      <h1 className="font-serif text-3xl">{success ? "You're in" : "That link didn't work"}</h1>
      <p className="mt-4 font-sans text-sm leading-relaxed text-ink-soft">
        {success
          ? "Tomorrow's word arrives in the morning. Every email has a one-click unsubscribe."
          : "It may have expired (links last 7 days) or been copied incompletely. You can sign up again from the homepage."}
      </p>
      <Link href="/" className="mt-8 inline-block font-sans text-sm text-ink-soft underline underline-offset-4 hover:text-ink">
        {success ? "Read today's word" : "Go to the homepage"}
      </Link>
    </section>
  );
}
```

Check `docs/design-system.md` for the established text-link style. If one exists (or a `components/ui` link primitive), use it instead of the classes above and say so in the report.

- [ ] **Step 9: `components/EmailSignupInline.tsx`**
  - Remove the `markSubscribedHere` import and call, and update the component's doc comment: it now records nothing locally, and `/subscribed` does that after confirmation.
  - Keep `track("signup_submitted")` and `onSubscribed?.()`. StoryFrontDoor uses the callback to keep the message visible.
  - Change the success message to:

```tsx
      <p role="status" className="font-sans text-sm text-ink-soft">Almost there. Check your inbox for a link to confirm.</p>
```

  - Read `components/StoryFrontDoor.tsx`. Its `flushSync` comment refers to `markSubscribedHere()` triggering a re-render. Update that comment so it stays true. `justJoined` pinning is still needed for the success message. Keep code changes there to the comment only.

- [ ] **Step 10: `lib/seoRoutes.ts`.** Add `"/subscribe"` and `"/subscribed"` to `DISALLOWED_PATHS`, next to `"/unsubscribe"`. If `lib/seoRoutes.test.ts` pins the exact list, update it.

- [ ] **Step 11: Verify.**
  - Run `npx vitest run app/api/subscribe` (PASS), then the full `npx vitest run`, `npx tsc --noEmit`, `npm run lint` and `npm run build`. All must be clean.
  - In the build output, `/subscribe/confirm` and `/subscribed` are dynamic (ƒ) and story pages are still ●.

- [ ] **Step 12: Commit**

```bash
git add app/api/subscribe app/subscribe app/subscribed components/MarkSubscribedHere.tsx components/EmailSignupInline.tsx components/StoryFrontDoor.tsx lib/seoRoutes.ts lib/seoRoutes.test.ts
git commit -m "feat: double opt-in — confirm email on signup, confirm page and POST, subscribed page"
```

---

### Task 4: Docs

**Files:** `handover.md`, `README.md`, `docs/launch-kit.md`

- [ ] **Step 1: `handover.md`**
  - **New section "Double opt-in (signup confirmation)",** near the unsubscribe docs. Cover:
    - the flow: form → email → page → POST → `/subscribed`;
    - the token format, the 7-day TTL and the shared secret with its own context;
    - why a button and not the link;
    - the existing-subscriber behaviour and the cooldown;
    - signed-in `/account` subscribes directly;
    - the 503 when the secret is missing;
    - `request` vs `signup` counters.
  - **"Measuring growth (traffic sources)":** `signup` now means confirmed; add `request:<source>` (a confirmation email was sent); `/api/traffic` accepts only `visit` and `share`. Remove or replace the old caveat "Signups count every successful subscribe, including repeats". It's no longer true: existing subscribers aren't re-counted.
  - **"Deferred / parked items":** mark double opt-in as done (date and plan path) rather than deleting the line.
  - **Session section "This session (2026-10-03, later): double opt-in",** with "What landed" and a Verification placeholder (real send to an owner `+alias`, confirm, and checking the subscriber appeared).
- [ ] **Step 2: `README.md`.** One line wherever subscribe or email is described: anonymous signups confirm by email.
- [ ] **Step 3: `docs/launch-kit.md`.** In "Before posting anything", item 1: double opt-in has shipped (once deployed). Keep the wording conditional ("ships first" → "shipped 2026-10-0X"); the controller fills in the date at deploy.
- [ ] **Step 4: Commit**

```bash
git add handover.md README.md docs/launch-kit.md
git commit -m "docs: double opt-in — handover, README, launch kit"
```

---

## After the plan (controller, not a task)

- Final whole-branch review, then a local merge to `master`. **Before any commit, check which branch the main checkout is on:** another session shares this folder (it made `demand-report` on 2026-10-03).
- **Local real-send check** (Resend key in `.env.local`; the dev secret signs; links point at `http://localhost:3000`):
  1. Subscribe from the homepage with an owner `+alias` address. **The owner chooses it; Claude never picks the inbox.**
  2. In Resend's email log, the confirmation went out. The owner sees it in Gmail.
  3. The owner opens the link: the confirm page shows the masked address.
  4. **Before pressing Confirm, ask the owner.** Local dev writes to production Upstash, so confirming adds that alias as a real production subscriber, who will get tomorrow's digest. Offer to confirm in production after the deploy instead.
  5. Submit the same address again within 10 minutes: no second email is sent.
- **Push only with the owner's go-ahead,** outside 08:45–11:00 UTC.
- **After the deploy, smoke-check production:**
  - `POST /api/subscribe` with an invalid email returns 400;
  - `POST /api/traffic` with a `signup` body returns 400;
  - `/subscribe/confirm?token=garbage` redirects to `/subscribed?ok=0`.
- Fill in the handover's Verification section and the launch-kit date.
