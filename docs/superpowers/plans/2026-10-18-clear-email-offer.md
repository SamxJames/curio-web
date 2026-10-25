# Clear Email Offer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the email offer say what you get, show it to returning and signed-in visitors (one-tap for signed-in), and count signups per placement.

**Architecture:** One client component `SignupOffer` decides form / one-tap / nothing per viewer and wraps the existing `EmailSignupInline`. A new authed route `/api/subscribe/me` handles signed-in status and one-tap subscribe. Placement counters reuse the `curio:traffic:<day>` hash with new `request-at:` / `signup-at:` fields; the placement rides in the confirm token as an optional field.

**Tech Stack:** Next.js 16 App Router (read `AGENTS.md`; check `node_modules/next/dist/docs/` before using any Next API you're unsure of), React 19, TypeScript, Tailwind v4, Vitest, Upstash Redis, Auth.js v5.

**Spec:** `docs/superpowers/specs/2026-10-18-clear-email-offer-design.md`

## Global Constraints
- Worktree: `C:\Users\Sam\Documents\Claude\Projects\Curio\curio-web\.claude\worktrees\clear-offer`, branch `feat/clear-email-offer`. Run every command from there. Never push.
- Archive, never backlog: no counts, no urgency, no "don't miss", no streaks.
- UI uses only `components/ui/` primitives (Button, TextField, ...) and design tokens; no new arbitrary Tailwind values (`text-[Npx]` etc.) outside `components/AdminDashboard.tsx`. Read `docs/design-system.md` before UI work.
- Client components may only `import type` from `lib/words.ts`.
- Copy, verbatim: button "Get tomorrow's word" (submitting: "Sending…"); promise line "One short email each morning. Free; stop anytime." + link "See a sample →" to `/sample-email` (new tab); one-tap button "Email me the daily word" (pending: "Subscribing…"); one-tap success "Done. Tomorrow's word arrives in your inbox. Manage it in Account." with "Account" linking `/account`. No em dashes in new copy.
- Placements: `arrival`, `today`, `story`, `play`, `account`.
- Traffic writes are fail-soft (a failed count never fails the request) and production-only (already enforced inside `recordTrafficEvent`).
- Logs never echo error messages or bodies: log `err.name` only, as existing routes do.
- Local dev uses production Upstash: don't run anything that subscribes a real address outside tests.
- Test command: `npx vitest run <path>`; full: `npx vitest run`, `npm run lint`, `npm run build`.

---

### Task 1: Placement counters in traffic summary, report and admin

**Files:**
- Modify: `lib/traffic.ts` (types, `eventField`, `summarizeTraffic`)
- Modify: `lib/traffic.test.ts`
- Modify: `scripts/trafficReport.ts` (print table after share taps)
- Modify: `components/AdminDashboard.tsx` (table after the totals StatRows)

**Interfaces:**
- Produces: `export const SIGNUP_PLACEMENTS = ["arrival", "today", "story", "play", "account"] as const; export type SignupPlacement = (typeof SIGNUP_PLACEMENTS)[number]; export function isSignupPlacement(x: unknown): x is SignupPlacement;`
- `TrafficEvent` gains `| { kind: "request-at"; placement: SignupPlacement } | { kind: "signup-at"; placement: SignupPlacement }`. `eventField` returns `request-at:<p>` / `signup-at:<p>`.
- `TrafficSummary` gains `placements: { placement: SignupPlacement; requests: number; signups: number }[]` (only placements with any count, in `SIGNUP_PLACEMENTS` order).
- `parseTrafficEvent` must still reject these kinds (server-recorded only).

- [ ] **Step 1: Write failing tests** in `lib/traffic.test.ts`:

```ts
describe("signup placements", () => {
  it("isSignupPlacement accepts only known placements", () => {
    expect(isSignupPlacement("story")).toBe(true);
    expect(isSignupPlacement("homepage")).toBe(false);
    expect(isSignupPlacement(3)).toBe(false);
  });
  it("eventField names placement fields", () => {
    expect(eventField({ kind: "request-at", placement: "today" })).toBe("request-at:today");
    expect(eventField({ kind: "signup-at", placement: "account" })).toBe("signup-at:account");
  });
  it("parseTrafficEvent rejects placement kinds from the browser", () => {
    expect(parseTrafficEvent({ kind: "signup-at", placement: "story" })).toBeNull();
    expect(parseTrafficEvent({ kind: "request-at", placement: "story" })).toBeNull();
  });
  it("summarizeTraffic folds placements across days, in placement order, skipping empty ones", () => {
    const s = summarizeTraffic({
      "2026-10-18": { "request-at:story": 2, "signup-at:story": 1, "signup-at:arrival": 1, "visit:direct": 5 },
      "2026-10-19": { "request-at:story": 1, "request-at:bogus": 9 },
    });
    expect(s.placements).toEqual([
      { placement: "arrival", requests: 0, signups: 1 },
      { placement: "story", requests: 3, signups: 1 },
    ]);
    expect(s.totals.visits).toBe(5);
  });
});
```
(Add `isSignupPlacement` to the test file's import from `./traffic`.)

- [ ] **Step 2: Run** `npx vitest run lib/traffic.test.ts`. Expected: FAIL (`isSignupPlacement` not exported).

- [ ] **Step 3: Implement** in `lib/traffic.ts`: add the constants/guard after `isTrafficSource`; extend `TrafficEvent`; change `eventField` to:

```ts
export function eventField(ev: TrafficEvent): string {
  if (ev.kind === "share") return `share:${ev.what}`;
  if (ev.kind === "request-at" || ev.kind === "signup-at") return `${ev.kind}:${ev.placement}`;
  return `${ev.kind}:${ev.source}`;
}
```
In `summarizeTraffic`, add two maps `placeRequests`/`placeSignups`, and in the loop: `else if (kind === "request-at" && isSignupPlacement(name)) ...` / `"signup-at"`. Build `placements = SIGNUP_PLACEMENTS.filter(p => placeRequests.has(p) || placeSignups.has(p)).map(p => ({ placement: p, requests: placeRequests.get(p) ?? 0, signups: placeSignups.get(p) ?? 0 }))` and return it. Add `placements` to the `TrafficSummary` type.

- [ ] **Step 4: Run** `npx vitest run lib/traffic.test.ts`. Expected: PASS. Fix any other test constructing a `TrafficSummary` literal (`grep -rn "shares:" --include=*.test.ts* .` outside `.claude`) by adding `placements: []`.

- [ ] **Step 5: Report and admin.** In `scripts/trafficReport.ts`, after the share-taps line:

```ts
  if (s.placements.length > 0) {
    console.log("\nby placement   requests  signups");
    for (const p of s.placements) {
      console.log(`  ${p.placement.padEnd(12)} ${String(p.requests).padStart(8)}  ${String(p.signups).padStart(7)}`);
    }
  }
```
In `components/AdminDashboard.tsx`, after the totals `<div className="mt-4">…</div>` inside the same Section, render (only when `traffic.placements.length > 0`) a table styled exactly like the source table above it, with header "Placement / Requests / Signups" and one row per placement. Requests here are "signup requests" (confirmation emails sent); one-tap signups count as signups with no request.

- [ ] **Step 6: Run** `npx vitest run lib components/AdminDashboard* app/admin` and `npx tsc --noEmit -p .`. Expected: PASS / no errors.

- [ ] **Step 7: Commit** `git add lib/traffic.ts lib/traffic.test.ts scripts/trafficReport.ts components/AdminDashboard.tsx` then `git commit -m "feat(traffic): count signup requests and signups per placement"`.

---

### Task 2: Placement through signed-out signup and the confirm link

**Files:**
- Modify: `lib/confirmToken.ts`, `lib/confirmToken.test.ts`
- Modify: `lib/email.ts` (`confirmUrl` gains optional placement), its tests if they assert args
- Modify: `app/api/subscribe/route.ts`, `app/api/subscribe/route.test.ts`
- Modify: `app/api/subscribe/confirm/route.ts` and its test (find with `ls app/api/subscribe/confirm`)

**Interfaces:**
- Consumes: `SignupPlacement`, `isSignupPlacement` (Task 1).
- Produces: `signConfirmToken(email, source, secret, now?, placement?)` — placement is the **5th** param so existing call sites/tests stay valid. `ConfirmClaim = { email; source; placement?: SignupPlacement }`. `confirmUrl(email, source, secret, now?, placement?)`. `POST /api/subscribe` body accepts `placement`.

- [ ] **Step 1: Failing tests.** In `lib/confirmToken.test.ts`:

```ts
it("carries an optional placement", () => {
  const t = signConfirmToken("a@b.com", "search", SECRET, NOW, "story");
  expect(verifyConfirmToken(t, SECRET, NOW)).toEqual({ email: "a@b.com", source: "search", placement: "story" });
});
it("old tokens without a placement still verify, with no placement key", () => {
  const t = signConfirmToken("a@b.com", "search", SECRET, NOW);
  expect(verifyConfirmToken(t, SECRET, NOW)).toEqual({ email: "a@b.com", source: "search" });
});
it("drops an unknown placement instead of rejecting the token", () => {
  const payload = Buffer.from(JSON.stringify({ e: "a@b.com", s: "search", t: Math.floor(NOW.getTime() / 1000), p: "nope" })).toString("base64url");
  const sig = createHmac("sha256", SECRET).update("curio:confirm:v1:" + payload).digest("base64url");
  expect(verifyConfirmToken(`${payload}.${sig}`, SECRET, NOW)).toEqual({ email: "a@b.com", source: "search" });
});
```
(Reuse the file's existing `SECRET`/`NOW` constants or define them; import `createHmac` from `node:crypto`.)

In `app/api/subscribe/route.test.ts`:

```ts
it("records the placement and signs it into the confirm link", async () => {
  vi.stubEnv("UNSUBSCRIBE_SECRET", "x".repeat(32));
  await POST(post({ email: "a@b.com", source: "search", placement: "today" }));
  expect(confirmUrl).toHaveBeenCalledWith("a@b.com", "search", expect.any(String), expect.any(Date), "today");
  expect(recordTrafficEvent).toHaveBeenCalledWith({ kind: "request-at", placement: "today" });
});
it("ignores an unknown placement", async () => {
  vi.stubEnv("UNSUBSCRIBE_SECRET", "x".repeat(32));
  await POST(post({ email: "a@b.com", source: "search", placement: "popup" }));
  expect(confirmUrl).toHaveBeenCalledWith("a@b.com", "search", expect.any(String), expect.any(Date), undefined);
  expect(recordTrafficEvent).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "request-at" }));
});
```
(Check how the existing tests set the secret — mirror that instead of `stubEnv` if different. Update the existing `confirmUrl` assertion to the 5-arg form.)

In the confirm route test: a claim with `placement: "story"` records both `{kind:"signup",source}` and `{kind:"signup-at",placement:"story"}`; a claim without placement records only the first.

- [ ] **Step 2: Run** those three test files. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `confirmToken.ts`: payload `{ e, s, t, ...(placement ? { p: placement } : {}) }`; in verify read `p` and return `isSignupPlacement(p) ? { email: e, source: s, placement: p } : { email: e, source: s }`. Update the doc comment (`p` optional, absent on links sent before 2026-10-18).
  - `email.ts`: `confirmUrl(email, source, secret, now = new Date(), placement?: SignupPlacement)` passes `placement` to `signConfirmToken(..., now, placement)`.
  - `subscribe/route.ts`: read `placement` from the body; `const place = isSignupPlacement(placement) ? placement : undefined;` call `confirmUrl(address, src, secret, new Date(), place)`; after the existing `request` record, in its own try/catch: `if (place) await recordTrafficEvent({ kind: "request-at", placement: place });`.
  - `confirm/route.ts`: after the signup record, in its own try/catch, `if (claim.placement) await recordTrafficEvent({ kind: "signup-at", placement: claim.placement });`.

- [ ] **Step 4: Run** the three files plus `npx vitest run lib/email`. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -am "feat(subscribe): carry the signup placement through the confirm link"` (stage only the files above).

---

### Task 3: `/api/subscribe/me` (status + one-tap) and `/account` counting

**Files:**
- Create: `app/api/subscribe/me/route.ts`, `app/api/subscribe/me/route.test.ts`
- Modify: `app/account/page.tsx` (subscribe action)

**Interfaces:**
- Consumes: `auth` from `@/lib/auth` (session has `user.email`), `getSubscriberByEmail`, `upsertSubscriber` from `@/lib/db`, `normaliseEmail` from `@/lib/unsubscribeToken`, `recordTrafficEvent`, `isTrafficSource`, `isSignupPlacement`.
- Produces: `GET /api/subscribe/me` → 200 `{ subscribed: boolean }` | 401 `{ error }` | 500 `{ error }`, header `Cache-Control: no-store`. `POST /api/subscribe/me` body `{ placement?, source? }` → 200 `{ ok: true }` | 401 | 500.

- [ ] **Step 1: Failing tests** (`route.test.ts`), mocking like `app/api/subscribe/route.test.ts` plus `vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session.current) }))` with `const session: { current: unknown } = { current: null };`:

```ts
describe("GET /api/subscribe/me", () => {
  it("401 when signed out", async () => {
    session.current = null;
    expect((await GET()).status).toBe(401);
  });
  it("reports subscribed for the session's address", async () => {
    session.current = { user: { email: "Sam@Example.com" } };
    vi.mocked(getSubscriberByEmail).mockResolvedValueOnce({ email: "sam@example.com" } as never);
    const res = await GET();
    expect(await res.json()).toEqual({ subscribed: true });
    expect(getSubscriberByEmail).toHaveBeenCalledWith("sam@example.com");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("500 JSON on a Redis error", async () => {
    session.current = { user: { email: "a@b.com" } };
    vi.mocked(getSubscriberByEmail).mockRejectedValueOnce(new Error("boom"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toHaveProperty("error");
  });
});

describe("POST /api/subscribe/me (one tap)", () => {
  it("401 when signed out and stores nothing", async () => {
    session.current = null;
    expect((await POST(post({ placement: "story" }))).status).toBe(401);
    expect(upsertSubscriber).not.toHaveBeenCalled();
  });
  it("subscribes the session's address, never one from the body, and counts it", async () => {
    session.current = { user: { email: "a@b.com" } };
    const res = await POST(post({ placement: "story", source: "search", email: "victim@x.com" }));
    expect(await res.json()).toEqual({ ok: true });
    expect(upsertSubscriber).toHaveBeenCalledWith("a@b.com");
    expect(recordTrafficEvent).toHaveBeenCalledWith({ kind: "signup", source: "search" });
    expect(recordTrafficEvent).toHaveBeenCalledWith({ kind: "signup-at", placement: "story" });
  });
  it("already subscribed: ok, not re-stored or re-counted", async () => {
    session.current = { user: { email: "a@b.com" } };
    vi.mocked(getSubscriberByEmail).mockResolvedValueOnce({ email: "a@b.com" } as never);
    expect((await POST(post({ placement: "story" }))).status).toBe(200);
    expect(upsertSubscriber).not.toHaveBeenCalled();
    expect(recordTrafficEvent).not.toHaveBeenCalled();
  });
  it("bad source becomes direct; bad placement isn't counted", async () => {
    session.current = { user: { email: "a@b.com" } };
    await POST(post({ placement: "popup", source: "nope" }));
    expect(recordTrafficEvent).toHaveBeenCalledWith({ kind: "signup", source: "direct" });
    expect(recordTrafficEvent).toHaveBeenCalledTimes(1);
  });
  it("a failed count doesn't fail the subscribe", async () => {
    session.current = { user: { email: "a@b.com" } };
    vi.mocked(recordTrafficEvent).mockRejectedValue(new Error("x"));
    expect((await POST(post({ placement: "story" }))).status).toBe(200);
  });
  it("500 JSON when the subscribe write fails", async () => {
    session.current = { user: { email: "a@b.com" } };
    vi.mocked(upsertSubscriber).mockRejectedValueOnce(new Error("boom"));
    expect((await POST(post({}))).status).toBe(500);
  });
  it("tolerates an empty/invalid body", async () => {
    session.current = { user: { email: "a@b.com" } };
    const req = new NextRequest("http://localhost/api/subscribe/me", { method: "POST", body: "not json" });
    expect((await POST(req)).status).toBe(200);
  });
});
```
(`beforeEach`: `vi.resetAllMocks()` then re-set default resolved values `getSubscriberByEmail → null`, `upsertSubscriber → undefined`, `recordTrafficEvent → undefined`, so `mockRejectedValue` doesn't leak.)

- [ ] **Step 2: Run** `npx vitest run app/api/subscribe/me`. Expected: FAIL (no route).

- [ ] **Step 3: Implement** `route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSubscriberByEmail, upsertSubscriber } from "@/lib/db";
import { isSignupPlacement, isTrafficSource } from "@/lib/traffic";
import { recordTrafficEvent } from "@/lib/trafficStats";
import { normaliseEmail } from "@/lib/unsubscribeToken";

const NO_STORE = { "Cache-Control": "no-store" };
const SIGNED_OUT = () => NextResponse.json({ error: "Sign in first." }, { status: 401, headers: NO_STORE });
const FAILED = () =>
  NextResponse.json({ error: "Something went wrong on our side. Please try again in a few minutes." }, { status: 500, headers: NO_STORE });

async function sessionEmail(): Promise<string | null> {
  const email = (await auth())?.user?.email;
  return email ? normaliseEmail(email) : null;
}

/** Whether the signed-in reader already gets the digest, so SignupOffer
 * knows whether to show the one-tap button. */
export async function GET() {
  const email = await sessionEmail();
  if (!email) return SIGNED_OUT();
  try {
    return NextResponse.json({ subscribed: !!(await getSubscriberByEmail(email)) }, { headers: NO_STORE });
  } catch (err) {
    console.error("[curio:subscribe] me lookup failed:", err instanceof Error ? err.name : "unknown");
    return FAILED();
  }
}

/** One-tap subscribe for a signed-in reader (approved 2026-10-18): their
 * magic-link sign-in already proved the address, so no confirmation email.
 * Only ever the session's own address; the body carries attribution only. */
export async function POST(req: NextRequest) {
  const email = await sessionEmail();
  if (!email) return SIGNED_OUT();
  const body = (await req.json().catch(() => ({}))) as { placement?: unknown; source?: unknown } | null;
  const source = isTrafficSource(body?.source) ? body.source : "direct";
  const placement = isSignupPlacement(body?.placement) ? body.placement : undefined;

  try {
    if (await getSubscriberByEmail(email)) return NextResponse.json({ ok: true }, { headers: NO_STORE });
    await upsertSubscriber(email);
  } catch (err) {
    console.error("[curio:subscribe] one-tap failed:", err instanceof Error ? err.name : "unknown");
    return FAILED();
  }

  try {
    await recordTrafficEvent({ kind: "signup", source });
    if (placement) await recordTrafficEvent({ kind: "signup-at", placement });
  } catch (err) {
    console.error("traffic: one-tap record failed", err instanceof Error ? err.name : "unknown");
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
```
Check `upsertSubscriber`'s signature in `lib/db.ts:32` (it may take extra optional args; pass only the email as `/account` does).

- [ ] **Step 4: Run** `npx vitest run app/api/subscribe/me`. Expected: PASS.

- [ ] **Step 5: `/account`.** In `app/account/page.tsx`'s `subscribe` action: `if (!email) return; if (await getSubscriberByEmail(email)) { revalidatePath("/account"); return; } await upsertSubscriber(email); try { await recordTrafficEvent({ kind: "signup-at", placement: "account" }); } catch {}` then `revalidatePath`. Import `recordTrafficEvent` from `@/lib/trafficStats`.

- [ ] **Step 6: Run** `npx vitest run app` and `npx tsc --noEmit -p .`. Expected: PASS.

- [ ] **Step 7: Commit** `git add app/api/subscribe/me app/account/page.tsx` then `git commit -m "feat(subscribe): one-tap subscribe for signed-in readers"`.

---

### Task 4: `/sample-email`

**Files:**
- Modify: `lib/email.ts` (export `buildDigestHtml`)
- Create: `app/sample-email/route.ts`, `app/sample-email/route.test.ts`

**Interfaces:**
- Consumes: `buildDigestHtml(word, dateStr, unsubscribeUrl)` and `formatDay` (find where `buildDigestMessage` gets it), `dayKey` from `@/lib/day`, `resolveTodayWord` from `@/lib/words` (server only; NEVER `getWordForDate`).
- Produces: `GET /sample-email` → 200 `text/html; charset=utf-8`, `X-Robots-Tag: noindex`.

- [ ] **Step 1: Failing test** (mock `@/lib/words` with `resolveTodayWord: vi.fn(async () => WORD)` where `WORD` is a minimal `WordEntry` literal cast `as never` containing `word: "tulip", slug: "tulip", teaser: "T", origin: "O", respelling: "r", partOfSpeech: "noun"`, plus any fields `buildDigestHtml` reads — read it first):

```ts
it("serves today's digest as noindex HTML with no real unsubscribe link", async () => {
  const res = await GET();
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
  expect(res.headers.get("x-robots-tag")).toBe("noindex");
  const html = await res.text();
  expect(html).toContain("tulip");
  expect(html).not.toContain("/unsubscribe");
});
```

- [ ] **Step 2: Run** `npx vitest run app/sample-email`. Expected: FAIL.

- [ ] **Step 3: Implement.** `export` `buildDigestHtml` (add to its doc comment: also served by `/sample-email`). Route:

```ts
import { buildDigestHtml, formatDay } from "@/lib/email"; // or wherever formatDay lives
import { dayKey } from "@/lib/day";
import { resolveTodayWord } from "@/lib/words";

export const dynamic = "force-dynamic";

/** "See a sample" from the signup offer: today's digest exactly as
 * subscribers get it, unsubscribe link disabled. Kept out of search. */
export async function GET() {
  const word = await resolveTodayWord();
  const html = buildDigestHtml(word, formatDay(dayKey(new Date())), "#");
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex", "Cache-Control": "public, max-age=300" },
  });
}
```
Check `node_modules/next/dist/docs/` for route segment config (`dynamic`) in this Next version before relying on it; if it's changed, use the documented equivalent. If `formatDay` is not exported from `lib/email.ts`, import it from its source module.

- [ ] **Step 4: Run** `npx vitest run app/sample-email lib/email`. Expected: PASS.

- [ ] **Step 5: Commit** `git add lib/email.ts app/sample-email` then `git commit -m "feat: /sample-email shows today's digest"`.

---

### Task 5: `SignupOffer` and wiring into the four placements

**Files:**
- Create: `lib/signupOffer.ts` (pure decision), `lib/signupOffer.test.ts`
- Create: `components/SignupOffer.tsx`, `components/SignupOffer.test.tsx`
- Modify: `components/EmailSignupInline.tsx` (placement prop, copy)
- Modify: `components/ArrivalHero.tsx`, `components/TodayHero.tsx`, `components/StoryFrontDoor.tsx`, `components/PuzzleGame.tsx`

**Interfaces:**
- Consumes: `POST /api/subscribe` body `{ email, source, placement }` (Task 2), `GET/POST /api/subscribe/me` (Task 3), `SignupPlacement` (Task 1), `useHasSubscribedHere`, `markSubscribedHere`, `useHasArrivedFromEmailThisSession` from `@/lib/storage`, `getArrivalSource` from `@/lib/trafficClient`, `useSession` from `next-auth/react`.
- Produces: `offerMode(input: { session: "loading" | "authenticated" | "unauthenticated"; subscribedHere: boolean; arrivedFromEmail: boolean; me: "unknown" | "subscribed" | "not-subscribed" | "error" }): "none" | "form" | "one-tap"`. `<SignupOffer placement={SignupPlacement} pitch?={ReactNode} className?={string} ariaLabel?={string} />`: renders a `<div>` (or `<section aria-label>` when `ariaLabel` is set) with `className`, containing `pitch` then the action; renders nothing at all when there is nothing to offer. `<EmailSignupInline placement={SignupPlacement} onSubscribed? />`.

- [ ] **Step 1: Failing tests** `lib/signupOffer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { offerMode } from "./signupOffer";

const base = { session: "unauthenticated", subscribedHere: false, arrivedFromEmail: false, me: "unknown" } as const;

describe("offerMode", () => {
  it("signed out, unknown to this browser: the form", () => expect(offerMode(base)).toBe("form"));
  it("subscribed here or arrived from the digest: nothing", () => {
    expect(offerMode({ ...base, subscribedHere: true })).toBe("none");
    expect(offerMode({ ...base, arrivedFromEmail: true })).toBe("none");
  });
  it("session loading: nothing, so nothing flashes", () => expect(offerMode({ ...base, session: "loading" })).toBe("none"));
  it("signed in: one tap only once we know they're not subscribed", () => {
    const s = { ...base, session: "authenticated" } as const;
    expect(offerMode({ ...s, me: "unknown" })).toBe("none");
    expect(offerMode({ ...s, me: "subscribed" })).toBe("none");
    expect(offerMode({ ...s, me: "error" })).toBe("none");
    expect(offerMode({ ...s, me: "not-subscribed" })).toBe("one-tap");
    expect(offerMode({ ...s, me: "not-subscribed", subscribedHere: true })).toBe("none");
  });
});
```
`components/SignupOffer.test.tsx` (renderToStaticMarkup, like `components/EtymologyLineage.test.tsx`), testing `EmailSignupInline`'s idle markup:

```tsx
it("form says what you get and links the sample", () => {
  const html = renderToStaticMarkup(<EmailSignupInline placement="story" />);
  expect(html).toContain("Get tomorrow&#x27;s word");
  expect(html).toContain("One short email each morning. Free; stop anytime.");
  expect(html).toContain('href="/sample-email"');
  expect(html).not.toContain(">Join<");
});
```
(Check how React 19 escapes the apostrophe in `renderToStaticMarkup` output and match it.)

- [ ] **Step 2: Run** both. Expected: FAIL.

- [ ] **Step 3: Implement `lib/signupOffer.ts`:**

```ts
export type OfferInput = {
  session: "loading" | "authenticated" | "unauthenticated";
  subscribedHere: boolean;
  arrivedFromEmail: boolean;
  me: "unknown" | "subscribed" | "not-subscribed" | "error";
};

/** What the email offer shows (spec 2026-10-18-clear-email-offer-design.md).
 * Never pitches the email to someone this browser knows already gets it,
 * and never flashes while the session or subscription status is unknown. */
export function offerMode(i: OfferInput): "none" | "form" | "one-tap" {
  if (i.subscribedHere || i.arrivedFromEmail || i.session === "loading") return "none";
  if (i.session === "unauthenticated") return "form";
  return i.me === "not-subscribed" ? "one-tap" : "none";
}
```

- [ ] **Step 4: `EmailSignupInline`:** add required prop `placement: SignupPlacement` (import type from `@/lib/traffic`), send it in the POST body, button text `"Get tomorrow's word"` / `"Sending…"`, and below the form (above the error) render a shared `<SignupPromise />` (export it from `components/SignupOffer.tsx` or a small sibling file; whichever avoids a circular import, e.g. `components/SignupPromise.tsx`):

```tsx
export default function SignupPromise() {
  return (
    <p className="mt-2 font-sans text-xs text-ink-faint">
      One short email each morning. Free; stop anytime.{" "}
      <a href="/sample-email" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-ink-soft">
        See a sample &rarr;
      </a>
    </p>
  );
}
```
Update its doc comment (placements, signed-in readers get SignupOffer's one-tap instead).

- [ ] **Step 5: `components/SignupOffer.tsx`** ("use client"). Props as in Interfaces. Inputs: `useSession().status`, `useHasSubscribedHere()`, `useHasArrivedFromEmailThisSession()`, and `me` state fetched with `GET /api/subscribe/me` in an effect only when status is `"authenticated"` (`res.ok ? (data.subscribed ? "subscribed" : "not-subscribed") : "error"`; network error → `"error"`). `mode = offerMode(...)`.
  - `pinned` state: set by either success, so the result message stays rendered even after `mode` flips to `"none"` (e.g. the subscribed-here flag changes). This replaces StoryFrontDoor's `justJoined`; set it with `flushSync` from `react-dom` for the same reason StoryFrontDoor does today (read its comment).
  - `mode === "none" && !pinned` → `return null` (no wrapper, no border, no pitch).
  - `"form"` → `<EmailSignupInline placement={placement} onSubscribed={() => flushSync(() => setPinned(true))} />`.
  - `"one-tap"` → `<Button>` "Email me the daily word" (disabled + "Subscribing…" while pending) then `<SignupPromise />`. On click: `POST /api/subscribe/me` with `{ placement, source: getArrivalSource() }`. On ok: pin, `markSubscribedHere()`, `track("signup_submitted")` (`@/lib/analytics`, same event as the form), and show `<p role="status" className="font-sans text-sm text-ink-soft">Done. Tomorrow&apos;s word arrives in your inbox. Manage it in <Link href="/account" className="underline underline-offset-2">Account</Link>.</p>` in place of the button. On failure: `<p role="alert" className="mt-2 font-sans text-sm text-danger">` with the response's `error` or "Something went wrong."
  - Wrapper: `ariaLabel ? <section aria-label={ariaLabel} className={className}> : <div className={className}>`, containing `pitch` and then the action in `<div className={pitch ? "mt-4" : undefined}>`.

- [ ] **Step 6: Wire placements.**
  - `ArrivalHero.tsx`: `<EmailSignupInline />` → `<SignupOffer placement="arrival" />`.
  - `StoryFrontDoor.tsx`: keep the `markArrivedFromEmailThisSession` effect. Replace the rest with `<SignupOffer placement="story" ariaLabel="About Curio" className="mt-12 border-t border-line pt-8" pitch={<p className="font-sans text-sm leading-relaxed text-ink-soft">This is Curio: one word&apos;s origin story, every morning. No feed, no backlog.</p>} />`. Remove the now-unused state, imports and the `signed-in:hidden` class (offerMode returns none while loading, and useSession starts as loading, so nothing flashes). Update the doc comment: signed-in readers who aren't subscribed now get the one-tap button.
  - `PuzzleGame.tsx`: replace the `sessionStatus !== "authenticated" && (<div …>…</div>)` block with `<SignupOffer placement="play" className="mt-10 border-t border-line pt-6" pitch={<p className="font-sans text-sm text-ink-soft">One word, one story, every day: get tomorrow&apos;s in your inbox.</p>} />` (the old em dash goes, per the copy rule). Remove now-unused imports; keep `useSession` if still used elsewhere in the file.
  - `TodayHero.tsx`: after the "Past words" paragraph, `<SignupOffer placement="today" className="mt-12 w-full max-w-form border-t border-line pt-6" pitch={<p className="font-sans text-sm text-ink-soft">Get tomorrow&apos;s word by email.</p>} />`. TodayHero is only rendered from the client `HomeContent`; confirm with `grep -rn "TodayHero" app components`. `max-w-form` is an existing container token (used in `app/account/page.tsx`).

- [ ] **Step 7: Run** `npx vitest run lib/signupOffer.test.ts components` and `npx tsc --noEmit -p .` and `npm run lint`. Expected: PASS, 0 errors. Update any component tests that asserted "Join".

- [ ] **Step 8: Commit** `git add lib/signupOffer.ts lib/signupOffer.test.ts components` then `git commit -m "feat: clear email offer everywhere, one tap for signed-in readers, returning homepage offer"`.

---

### Task 6 (controller, not a subagent): verify and document
- [ ] `npx vitest run`, `npm run lint`, `npm run build` from the worktree root.
- [ ] Browser (dev server from the worktree; `.env.local` copied from the main checkout): signed out, check `/` first visit (arrival), `/` again after clicking through (today), a story page, `/play` after finishing, and `/sample-email`. Check at 375px and with Tab focus. Signed in (Sam signs in in the browser pane): the one-tap appears only if Sam isn't subscribed. Don't tap it in local dev unless Sam agrees, because local dev writes to production Redis.
- [ ] Docs: `docs/handover/architecture.md` (SignupOffer, `/api/subscribe/me`, `/sample-email`), `docs/handover/growth.md` (placement counters, how to read them), `docs/handover/decisions.md` (2026-10-18 one-tap for signed-in readers, and why), `handover.md` current state.
