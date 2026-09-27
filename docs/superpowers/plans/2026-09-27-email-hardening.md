# Pre-Launch Email Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every code task uses superpowers:test-driven-development.

**Goal:** Make the 09:00 UTC digest safe to send to a few dozen family-and-friends subscribers. It should respect Resend's rate limit, never send twice in a day by accident, and carry signed, one-click unsubscribe links that link scanners can't trigger.

**Architecture:** Digests are built one message per subscriber (its own `to`, signed unsubscribe link and `List-Unsubscribe` headers). A new pure module, `lib/digestSend.ts`, sends them through Resend's batch endpoint in sequential chunks of 100, retrying 429/5xx with `retry-after`-aware backoff and an idempotency key per chunk. A new `lib/digestRuns.ts` holds per-UTC-day locks for the email run and the Bluesky post (Redis `SET NX EX`, in memory without Upstash), plus the day's failed recipients so they alone can be re-sent. Unsubscribe tokens become `base64url(email).base64url(hmac)` (`lib/unsubscribeToken.ts`). `GET /api/unsubscribe` only redirects to a confirm page, and only `POST` unsubscribes, whether from the page's form or RFC 8058 one-click.

**Tech Stack:** Next.js 16.3.4 App Router (route handlers, route segment config), React 19, TypeScript, Resend SDK 6.27.0 (`resend.batch.send`), `@upstash/redis`, `node:crypto`, Vitest (node environment).

**Spec:** The owner's "Pre-launch email hardening" prompt of 2026-09-27, carried in the "Brief" section below. The "What I found / flags" section lists where the code or docs differ from the prompt, with a proposed ruling for each one.

## Brief (owner's decisions, from the prompt)

**Context.** Curio is live at https://curioword.com, in pre-launch. Family-and-friends invites go out after this work and Phase 3 (Bluesky link cards). A 2026-09-26 review found two problems to fix first. Both touch the daily send, which runs in production at 09:00 UTC, so treat production with care.

**Fix 1: a digest fan-out that respects Resend's limits**
1. Send digests through Resend's batch endpoint, in chunks of at most the documented maximum (100). Send the chunks one after another, not in parallel.
2. On a 429 or 5xx, retry the chunk with backoff. Honour `retry-after` when it's present. Cap retries at about 3. Emails that still fail after the cap count as `failed`.
3. Every email has one recipient: its own `to`, its own unsubscribe link and its own `List-Unsubscribe` headers. Never put several subscribers in one `to`, `cc` or `bcc`.
4. Keep the dev fallback: with no `RESEND_API_KEY`, log what would be sent and send nothing.
5. Keep the cron response shape `{ word, attempted, sent, failed, bluesky }`. Log the failure count and the error messages. Don't log lists of subscriber addresses.
6. Keep the invariants pinned by `app/sharedDay.test.ts` and `route.test.ts`: one `now`, one shared word, and email and Bluesky agree. Update those tests to use the new send function. Don't delete coverage.
7. Set a `maxDuration` on the cron route that suits the Vercel Hobby plan.
8. Idempotency. Add a per-UTC-day Redis lock (`curio:digest:run:<dayKey>`), claimed atomically with `SET NX` and a TTL of a few days. A second run that day is a no-op that returns `alreadyRan: true`. `?force=1` overrides it, but only alongside a valid `CRON_SECRET`. Apply the same guard to the Bluesky post. Say what happens after a partial failure and how the lock behaves in local dev without Upstash.
- Tests: chunking at 0, 1, 100, 101 and 250 subscribers; a 429 followed by success; retries exhausted and counted as failed; the dev fallback; a second run being a no-op; the override working only with the secret.

**Fix 2: signed, scanner-safe, one-click unsubscribe**
1. HMAC-SHA256 tokens: `base64url(normalisedEmail) + "." + base64url(hmac)`, verified with `crypto.timingSafeEqual`. Add a new `UNSUBSCRIBE_SECRET` env var, documented in `.env.example` with a generation command, like `AUTH_SECRET`. If it's unset in production, the digest fails closed: it sends nothing, logs loudly and returns an error. A fixed dev-only secret is fine in dev.
2. Tokens don't expire.
3. GET never changes anything. `GET /api/unsubscribe?token=…` goes to a confirm page, `/unsubscribe?token=…`, which shows the address masked (e.g. `s***@gmail.com`) and one "Unsubscribe" button that POSTs. It uses `components/ui/Button`, design tokens only and no new arbitrary Tailwind values.
4. `POST /api/unsubscribe` handles both the confirm-page form and RFC 8058 one-click (body `List-Unsubscribe=One-Click`, token in the query string). A valid token calls `removeSubscriber`, then returns 200 for one-click or redirects to `/unsubscribed?ok=1` for the form. An invalid or tampered token changes nothing and goes to `/unsubscribed?ok=0`. Repeating it is safe: an address that's already gone counts as success.
5. Every digest carries `List-Unsubscribe: <{CURIO_SITE_URL}/api/unsubscribe?token=…>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, built from `CURIO_SITE_URL`, never a hard-coded domain.
6. Legacy unsigned tokens are rejected. Say in the plan if you disagree.
7. The confirm page is `noindex`, and it and the API route are disallowed in `robots.ts`. Check `lib/seoRoutes.ts` and its test.
8. The account page's email toggle (`app/account/page.tsx`) still works, unchanged.
9. Delete the "Not cryptographically secure" comment, and the README's open item about the base64 token.
- Tests: sign/verify round trip; tampered payload; tampered signature; wrong secret; legacy token rejected; GET never calls `removeSubscriber`; one-click POST; form POST; headers present on every email in the batch payload.

**Process.** Plan first, with no code until the owner approves. Then subagent-driven development with TDD for each task, `requesting-code-review` over the whole branch, and `verification-before-completion`. Work in a worktree and merge to `master` locally. **No push, no deploy** until the owner says so; a push to `master` auto-deploys.

**Verification.** A clean `rm -rf node_modules .next && npm ci`, then `npm test`, `npm run lint` (only the 3 existing warnings) and `npm run build`. Then a real send, run locally, never through the production cron: a real `RESEND_API_KEY` and `UNSUBSCRIBE_SECRET` in `.env.local` (ask the owner for the key and a test address), Upstash vars unset so the local JSON store holds only that address, and `BLUESKY_APP_PASSWORD` unset. Check that "Show original" has both headers, the confirm page masks the address, the button removes it from the local store, and opening the GET link on its own removes nothing. Clean up dev servers, `.next` and the worktree afterwards.

**Deploy (owner approval only).** `UNSUBSCRIBE_SECRET` must be in Vercel Production before the deploy; either the owner adds it, or Claude generates one and runs `vercel env add` after the owner confirms. Deploy outside 08:45–09:15 UTC. The morning after, check the cron response and the Resend logs: `attempted === sent` and no 429s.

**Docs.** Add a "This session" section to `handover.md` and update its "Deferred / parked items". Fix the README lines this work touches (the cron runs once a day, not hourly; the unsubscribe note). Add `UNSUBSCRIBE_SECRET` to `.env.example`.

**Out of scope.** Double opt-in on `/api/subscribe`, sign-in rate limiting, Resend plan or quota changes, and growth work.

### Amendments at approval (2026-09-27)

The owner approved the plan with these changes. They override anything below that disagrees.

1. **`?force=1` re-sends email only.** Re-posting to Bluesky needs an explicit `&bluesky=1` alongside it. Without `bluesky=1`, a forced run treats Bluesky like a normal run: it posts only if today's post hasn't happened yet, so it never double-posts. `bluesky=1` without `force=1`, or together with `resend=failed`, is a 400.
2. **The failed-address set has a ~7-day TTL** (the run locks keep 3 days). `?resend=failed` removes each address from the set **as soon as its chunk succeeds** (`SREM` per chunk, not a replace at the end), so a second `resend=failed`, even after one that died partway, never double-sends. Scheduled and forced runs still replace the set with their own failures when they finish.
3. **`alreadyRan` is per channel:** `alreadyRan: { email: boolean, bluesky: boolean }`, always present. Each flag is true only when that channel was skipped because today's lock was already held. A `resend=failed` run reports `{ email: false, bluesky: false }`, because it bypasses the email lock and doesn't attempt Bluesky by design.
4. **`handover.md` gets the exact production commands** for `?resend=failed` and `?force=1` (and `&bluesky=1`), plus where the production `CRON_SECRET` comes from. It's stored in Vercel as a *sensitive* variable, so it can't be read back from the dashboard or `vercel env pull`. Task 9 rotates it once, to a value the owner keeps in their password manager.
5. **A new test:** a valid one-click token for an address that's already been removed returns 200. It runs against the real `lib/db.ts` local-JSON store, not a mock.
- **What the 7-day TTL covers (clarified while amending):** `?resend=failed` re-sends *today's* word to *today's* failures, so it's only meaningful on the same UTC day. After 00:00 UTC, the next scheduled send reaches those people with the new word. Re-sending a missed past day would push a backlog, which `AGENTS.md` rules out. So the 7-day set is there to be inspected (`SMEMBERS curio:digest:failed:<day>` in the Upstash console), not for resending across days.
- Rulings 1, 3, 4, 5, 7, 8, 9 and 10 in the flags section are approved as written.
- The real send uses a **restricted, sending-only Resend key**, which the owner pastes into `.env.local` themselves. Ask for the test address at Task 8.

## What I found, and flags for the owner

Checked against the installed packages and the live Vercel project, not from memory:

- **Resend SDK 6.27.0, `resend.batch.send(emails, options)`** (`node_modules/resend/dist/index.d.mts:1852`). Each item is `CreateEmailOptions` minus `attachments` (`:660`), so **each email carries its own `headers`**. `parseEmailToApiOptions` maps `headers` per item (`index.mjs:196-216`). Options are `batchValidation?: 'strict' | 'permissive'` and `idempotencyKey?: string` (`:662-667`).
- **Maximum batch size:** 100. The SDK types don't encode this; it comes from Resend's batch API docs ("up to 100 batch emails at once"). The docs also say batch idempotency keys are unique per request and expire after 24 hours.
- **How errors come back:** the SDK never throws for HTTP errors. It returns `{ data: null, error: { message, statusCode, name }, headers }`, where `headers` holds the *response* headers, lower-cased (`index.mjs:1294-1348`). So `retry-after` is readable at `result.headers["retry-after"]`. A network failure comes back as `{ name: "application_error", statusCode: null }`. With `batchValidation: "permissive"`, a 200 response carries `errors: { index, message }[]` for the individual emails that were rejected (`d.mts:668-686`). With the default `strict`, one bad address fails all 100.
- **Rate limit:** Resend's rate-limit page currently says **10 requests/second per team** and that every response carries `retry-after` / `ratelimit-*`. The owner should still check the account's real limit under Resend → Settings → Usage. Sequential batches of 100 make it close to moot: 250 subscribers is 3 requests.
- **`maxDuration`:** Next 16 route segment config is `export const maxDuration = <seconds>` in `route.ts` (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`). The Vercel project `etymology-app` has **`fluid: true`** and `functionDefaultTimeout: 300` (checked via `vercel api /v9/projects/<id>`). Under Fluid compute, Hobby's default and maximum are both 300s. So `maxDuration = 300`: it's the ceiling, and pinning it in code means a dashboard change can't quietly shorten the send. The sender also stops *starting* retries or new chunks after a 240s budget, so it always has time to record failures and respond.

**Flags: places where the prompt, the code and the handover disagree, or where I've had to pick.** Each has a proposed ruling; tell me if you want a different one.

1. **Redis key prefixes.** The handover says new keys should use one of three existing prefixes (`curio:subscriber:`/`curio:hour:`, `curio:user:`, `curio:auth:`). The prompt's `curio:digest:run:<dayKey>` is a new prefix, and `curio:wordoftheday:` already broke that rule. **Proposed:** use a new `curio:digest:` prefix for `curio:digest:run:<day>`, `curio:digest:bluesky:<day>` and `curio:digest:failed:<day>`, and update the handover's prefix rule to list it and `curio:wordoftheday:`.
2. **What `force` covers, and re-sending after a partial failure.** *Amended at approval (see Amendments 1–3): `force=1` is email-only, Bluesky needs `&bluesky=1`, the failed set's TTL is 7 days with per-chunk removal on resend, and `alreadyRan` is per channel. The text below is the original proposal.* Proposed semantics:
   - The email run and the Bluesky post each have **their own** day lock, claimed before sending. A normal run skips whichever channel already ran today. If both did, it returns `alreadyRan: true` with zero counts. (If Bluesky ran but email didn't, e.g. because the first run was refused for a missing secret, a re-run sends only the email.)
   - **After a partial failure the lock stays.** Releasing it would let the next run re-send to everyone who already got the email. Instead, the run stores that day's failed addresses in Redis (`curio:digest:failed:<day>`, TTL 3 days, never logged).
   - **`?resend=failed`** (valid `CRON_SECRET` only) sends only to those addresses that are **still subscribed**, never posts to Bluesky, and replaces the stored set with whatever fails again. This is how you re-send to just the people who failed.
   - **`?force=1`** (valid `CRON_SECRET` only) is a deliberate full re-run: it re-sends to **everyone and re-posts to Bluesky**. It uses a fresh idempotency key, so Resend doesn't treat it as a duplicate and drop it.
   - The Vercel dashboard's **Run** button can't add query parameters. From now on it's a harmless no-op on a day that has already run.
3. **Lock in local dev without Upstash.** The locks and the failed set live in the dev server process's memory. A second run against the same `next dev` is a no-op, and a restart forgets it. I chose memory over a `.data/*.json` file because a file would outlive the server and trip up the next day's local testing. `force` still needs a `CRON_SECRET`, so a local forced run needs one in `.env.local` (there already is one, deliberately different from Production's).
4. **Fail-closed order.** The `UNSUBSCRIBE_SECRET` check runs *before* any lock is claimed, and it refuses the Bluesky post too. The cron returns 500, nothing is sent or posted, and nothing is locked. Once the secret is set, a plain dashboard **Run** sends the day's digest and post normally. (Sending Bluesky alone would have been defensible too, but "refuse everything" is simpler to reason about and easier to spot in the logs.)
5. **One-click with an invalid token.** The prompt says invalid tokens "go to `/unsubscribed?ok=0`". One-click POSTs come from a mailbox provider's server, not a browser, so a redirect means nothing there. **Proposed:** an invalid one-click POST returns **400** and changes nothing, while an invalid *form* POST (a browser) redirects to `/unsubscribed?ok=0` as specified.
6. **Response shape.** *Amended at approval: `alreadyRan` is `{ email, bluesky }` (Amendment 3).* Every response keeps `{ word, attempted, sent, failed, bluesky }` and **adds `alreadyRan: boolean`**, so the field is always present rather than only on no-ops. The word is resolved before the locks (resolving is read-mostly and already locked per day), so the no-op response still names the word.
7. **The dev fallback's counts.** Today, a dev-fallback "send" counts as `sent` (the promise resolves). **Proposed:** keep that, so local responses look like production ones. The dev log now prints the subject and a **count**, not each address. The old per-address log line goes, in line with "no lists of subscriber addresses".
8. **Legacy tokens: I agree with rejecting them.** A consequence to know: every digest already sent, including this morning's (2026-09-27), carries an old `base64(email)` link. From deploy onward those links land on the `ok=0` page, which already says to reply to a digest. With two subscribers (you and your spouse), that's fine.
9. **Where the link points.** The digest's body link and the `List-Unsubscribe` header both use `/api/unsubscribe?token=…`, as the prompt specifies. A GET on it (a person clicking, a scanner, or an older client using the header without `-Post`) lands on the confirm page. The confirm page's form POSTs to the same URL, token in the **query string**. The form posts no fields, so no hand-rolled hidden `<input>` is needed, and POST reads the token from one place for both callers.
10. **`robots.txt` prefix matching.** Adding `/unsubscribe` to `DISALLOWED_PATHS` also matches `/unsubscribed` by prefix, which is already disallowed, so nothing changes there. `/api/unsubscribe` is covered by the existing `/api/` entry. Note that robots-disallow plus `noindex` means Google never fetches the page and so never sees the `noindex`. Both were asked for, and both are harmless.
11. **The small `lib/siteUrl.ts` cleanup.** `lib/email.ts` still keeps its own `CURIO_SITE_URL ?? localhost` constant (a deferred item from 2026-09-20). Since this plan rewrites the unsubscribe URL anyway, **proposed:** switch `lib/email.ts` to `absoluteUrl()`/`siteUrl()` from `lib/siteUrl.ts`. They read the env at call time (which the new batch-payload test needs) and strip a trailing slash. `lib/bluesky.ts` stays as it is.
12. **The account page's toggle** calls `upsertSubscriber`/`removeSubscriber` directly and doesn't touch tokens, so it isn't affected. It's confirmed by `git diff master -- app/account/page.tsx` being empty and by the existing `lib/db.test.ts`. A live signed-in check needs Upstash (shared production data) and you signing in yourself. It's offered in Task 8, not required.
13. **The production `CRON_SECRET` can't be read back** (found at approval). `vercel api /v10/projects/<id>/env` lists every production variable, `CRON_SECRET` included, as `type: sensitive`. Vercel never reveals sensitive values, in the dashboard or via `vercel env pull`. So the only way to have it on hand for manual `resend`/`force` calls is to rotate it once to a value the owner stores. Vercel Cron picks up the new value automatically on the next deploy. That's folded into Task 9.
14. **The prompt's "`README`'s cron cadence".** The README says "wired to run hourly via `vercel.json`" and "`vercel.json` already configures the hourly cron". Both are wrong (`vercel.json` is `0 9 * * *`) and both get fixed. It also says `/api/subscribe` captures `{email, hour}`, which isn't something this work touches, so I've left it.

## Global Constraints

- Archive, never backlog (`AGENTS.md`). This work adds no user-facing counts.
- Design tokens only (`docs/design-system.md`): no new arbitrary Tailwind values, and no hand-rolled `<button>`/`<input>` outside `components/ui/`.
- Every digest email is single-recipient: `to` is one address string, and there is never `cc` or `bcc`.
- Never log subscriber addresses in the send path, dev fallback included. Error messages pass through `redactAddresses()` before they're logged.
- Unsubscribe URLs and headers are built from `CURIO_SITE_URL` via `lib/siteUrl.ts`. Never a literal domain.
- New Redis keys use the `curio:digest:` prefix (see Flag 1).
- Short "why" comments, matching the surrounding code. npm only; no new dependencies.
- Test commands: `npx vitest run` (baseline **205 passing, 22 files**), `npm run lint` (baseline: 3 warnings, at `lib/puzzle.test.ts:3` and `scripts/approveDraft.test.ts:36,211`), `npm run build`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work happens in a platform worktree (`.claude/worktrees/<name>/`). **Never push.** A push to `master` deploys production.

## File Structure

- `lib/unsubscribeToken.ts` (new): `normaliseEmail`, `unsubscribeSecret()`, `signUnsubscribeToken`, `verifyUnsubscribeToken`, `maskEmail`. Pure, `node:crypto` only, with no Resend import, so the unsubscribe route and page don't load the email client.
- `app/api/unsubscribe/route.ts` (rewrite): GET redirects to the confirm page; POST handles the form and one-click.
- `app/unsubscribe/page.tsx` (new): the confirm page, `noindex`.
- `lib/seoRoutes.ts` (+ test): add `/unsubscribe` to `DISALLOWED_PATHS`.
- `lib/digestSend.ts` (new): `BATCH_SIZE`, `MAX_RETRIES`, `chunk`, `retryDelayMs`, `redactAddresses`, `sendInBatches`. Knows nothing about Resend's client or about words.
- `lib/email.ts` (modify): `unsubscribeUrl`, `buildDigestMessage` (with headers), `sendDailyDigests` (batch plus dev fallback). The old `unsubscribeToken`/`decodeUnsubscribeToken`/`sendDailyDigest` are deleted. Uses `lib/siteUrl.ts`.
- `lib/digestRuns.ts` (new): `claimRun`, `recordFailures`, `getFailures`, plus the in-memory fallback.
- `app/api/cron/send-daily/route.ts` (modify): the fail-closed check, locks, `force`/`resend`, `maxDuration`, logging.
- Tests: `lib/unsubscribeToken.test.ts`, `app/api/unsubscribe/route.test.ts`, `app/unsubscribe/page.test.tsx`, `lib/digestSend.test.ts`, `lib/email.test.ts` (extend), `lib/email.batch.test.ts`, `lib/digestRuns.test.ts`, `app/api/cron/send-daily/route.test.ts` (rewrite, no coverage lost), `app/sharedDay.test.ts` (update).
- Docs: `.env.example`, `README.md`, `handover.md`.

Task order keeps `master`-mergeable states: tokens → unsubscribe endpoints (the old decode function stays until Task 4) → batch sender → email builder and cron switch-over (deletes the legacy token code) → locks → cron idempotency → docs → controller verification.

---

### Task 0 (controller): Worktree and plan commit

- [ ] **Step 1:** Create the worktree with the platform tool (`EnterWorktree`, name `email-hardening`). Copy this plan into it at the same path, since it was written in the main checkout.
- [ ] **Step 2:** `npm ci` in the worktree, then `npx vitest run` → expect 205 passing.
- [ ] **Step 3:** Commit the plan.

```bash
git add docs/superpowers/plans/2026-09-27-email-hardening.md
git commit -m "docs: plan for pre-launch email hardening

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Then delete the untracked copy from the main checkout, so the fast-forward merge in Task 8 doesn't conflict with it.

---

### Task 1: Signed unsubscribe tokens

**Files:**
- Create: `lib/unsubscribeToken.ts`
- Test: `lib/unsubscribeToken.test.ts`
- Modify: `.env.example` (add `UNSUBSCRIBE_SECRET`)

**Interfaces:**
- Produces (used by Tasks 2 and 4):
  - `normaliseEmail(email: string): string`
  - `unsubscribeSecret(): string | null`: returns `UNSUBSCRIBE_SECRET` if it's non-empty; otherwise `null` when `NODE_ENV === "production"`, or the fixed dev secret in any other environment.
  - `signUnsubscribeToken(email: string, secret: string): string`
  - `verifyUnsubscribeToken(token: string, secret: string): string | null`: returns the normalised email, or `null`.
  - `maskEmail(email: string): string`

- [ ] **Step 1: Write the failing tests** in `lib/unsubscribeToken.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  maskEmail,
  signUnsubscribeToken,
  unsubscribeSecret,
  verifyUnsubscribeToken,
} from "./unsubscribeToken";

const SECRET = "test-secret-a";

describe("unsubscribe tokens", () => {
  it("round-trips, normalising the address", () => {
    const token = signUnsubscribeToken("  Sam@Example.com ", SECRET);
    expect(verifyUnsubscribeToken(token, SECRET)).toBe("sam@example.com");
  });

  it("is base64url(email) + '.' + base64url(32-byte HMAC-SHA256)", () => {
    const [payload, sig] = signUnsubscribeToken("a@b.co", SECRET).split(".");
    expect(Buffer.from(payload, "base64url").toString("utf-8")).toBe("a@b.co");
    expect(Buffer.from(sig, "base64url")).toHaveLength(32);
  });

  it("rejects a tampered payload (someone else's address with a valid signature)", () => {
    const [, sig] = signUnsubscribeToken("attacker@example.com", SECRET).split(".");
    const forged = `${Buffer.from("victim@example.com").toString("base64url")}.${sig}`;
    expect(verifyUnsubscribeToken(forged, SECRET)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const [payload, sig] = signUnsubscribeToken("sam@example.com", SECRET).split(".");
    const bytes = Buffer.from(sig, "base64url");
    bytes[0] ^= 1;
    expect(verifyUnsubscribeToken(`${payload}.${bytes.toString("base64url")}`, SECRET)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signUnsubscribeToken("sam@example.com", "test-secret-b");
    expect(verifyUnsubscribeToken(token, SECRET)).toBeNull();
  });

  it("rejects the legacy unsigned base64url(email) token", () => {
    const legacy = Buffer.from("sam@example.com").toString("base64url");
    expect(verifyUnsubscribeToken(legacy, SECRET)).toBeNull();
  });

  it.each(["", ".", "abc.", ".abc", "a.b.c"])("rejects malformed token %j", (token) => {
    expect(verifyUnsubscribeToken(token, SECRET)).toBeNull();
  });

  it("rejects a signed payload that isn't an email address", () => {
    const [, sig] = signUnsubscribeToken("not-an-email", SECRET).split(".");
    expect(verifyUnsubscribeToken(`${Buffer.from("not-an-email").toString("base64url")}.${sig}`, SECRET)).toBeNull();
  });
});

describe("maskEmail", () => {
  it("keeps the first character and the domain", () => {
    expect(maskEmail("sam@gmail.com")).toBe("s***@gmail.com");
    expect(maskEmail("x@example.org")).toBe("x***@example.org");
  });
});

describe("unsubscribeSecret", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses UNSUBSCRIBE_SECRET when it's set", () => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", "from-env");
    expect(unsubscribeSecret()).toBe("from-env");
  });

  it("is null in production when unset, so callers fail closed", () => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(unsubscribeSecret()).toBeNull();
  });

  it("falls back to a fixed dev-only secret outside production", () => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(unsubscribeSecret()).toEqual(expect.any(String));
    expect(unsubscribeSecret()).not.toBe("");
  });
});
```

- [ ] **Step 2: Run it to check it fails.** `npx vitest run lib/unsubscribeToken.test.ts` → FAIL, because the module can't be resolved.

- [ ] **Step 3: Implement** `lib/unsubscribeToken.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

/** Dev/test only. Production never falls back to it: unsubscribeSecret()
 * returns null there, and the cron refuses to send. */
const DEV_SECRET = "curio-dev-only-unsubscribe-secret";

/** Keeps this HMAC distinct from any other thing ever signed with the
 * same secret. Bump the version to invalidate every link at once. */
const CONTEXT = "curio:unsubscribe:v1:";

/** Same normalisation lib/db.ts applies to subscriber keys. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function unsubscribeSecret(): string | null {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (secret) return secret;
  return process.env.NODE_ENV === "production" ? null : DEV_SECRET;
}

function mac(email: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(CONTEXT + email).digest();
}

/** `base64url(email).base64url(hmac)`. No expiry on purpose: a link in a
 * months-old digest should still work. */
export function signUnsubscribeToken(email: string, secret: string): string {
  const normalised = normaliseEmail(email);
  const payload = Buffer.from(normalised).toString("base64url");
  return `${payload}.${mac(normalised, secret).toString("base64url")}`;
}

/** The address a token was signed for, or null for anything forged,
 * tampered with, signed under another secret, or in the old unsigned
 * base64(email) format (it has no "." part, so it fails the shape check). */
export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const email = Buffer.from(parts[0], "base64url").toString("utf-8");
  if (!email.includes("@") || email !== normaliseEmail(email)) return null;

  const given = Buffer.from(parts[1], "base64url");
  const expected = mac(email, secret);
  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? email : null;
}

/** "s***@gmail.com" — enough for someone to recognise their own address
 * on the confirm page without spelling it out to whoever holds the link. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}
```

- [ ] **Step 4: Run it to check it passes.** `npx vitest run lib/unsubscribeToken.test.ts` → PASS.

- [ ] **Step 5: Document the env var.** In `.env.example`, after the `AUTH_SECRET=` block, add:

```
# Signs the unsubscribe link and List-Unsubscribe header in every digest
# (lib/unsubscribeToken.ts). Required in production: if it's unset there,
# the daily cron refuses to send. Changing it breaks every unsubscribe link
# in already-sent emails. Generate with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
UNSUBSCRIBE_SECRET=
```

- [ ] **Step 6: Commit.**

```bash
git add lib/unsubscribeToken.ts lib/unsubscribeToken.test.ts .env.example
git commit -m "feat: HMAC-signed unsubscribe tokens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Scanner-safe unsubscribe: GET confirms, POST unsubscribes

**Files:**
- Rewrite: `app/api/unsubscribe/route.ts`
- Create: `app/unsubscribe/page.tsx`
- Modify: `lib/seoRoutes.ts` (`DISALLOWED_PATHS`), `lib/seoRoutes.test.ts`
- Test: `app/api/unsubscribe/route.test.ts`, `app/unsubscribe/page.test.tsx` (both new)

**Interfaces:**
- Consumes: `unsubscribeSecret`, `verifyUnsubscribeToken`, `maskEmail`, `signUnsubscribeToken` (tests only) from Task 1; `removeSubscriber(email)` from `lib/db.ts`.
- Produces: the URL contract Task 4 builds links against. `GET|POST /api/unsubscribe?token=<token>`; the confirm page at `/unsubscribe?token=<token>`.

- [ ] **Step 1: Write the failing route tests** in `app/api/unsubscribe/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({ removeSubscriber: vi.fn(async () => undefined) }));

const { GET, POST } = await import("./route");
const { removeSubscriber } = await import("@/lib/db");
const { signUnsubscribeToken, unsubscribeSecret } = await import("@/lib/unsubscribeToken");

const token = () => signUnsubscribeToken("sam@example.com", unsubscribeSecret()!);
const url = (t: string) => `http://localhost/api/unsubscribe?token=${encodeURIComponent(t)}`;

function oneClick(t: string) {
  return new NextRequest(url(t), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
  });
}

function formPost(t: string) {
  // The confirm page's <form> has no fields: the token rides in its action URL.
  return new NextRequest(url(t), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "",
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/unsubscribe", () => {
  it("never unsubscribes: it sends a valid link to the confirm page", async () => {
    const t = token();
    const res = GET(new NextRequest(url(t)));
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/unsubscribe");
    expect(location.searchParams.get("token")).toBe(t);
    expect(removeSubscriber).not.toHaveBeenCalled();
  });

  it("never unsubscribes on a forged or legacy token either", async () => {
    GET(new NextRequest(url(Buffer.from("sam@example.com").toString("base64url"))));
    expect(removeSubscriber).not.toHaveBeenCalled();
  });

  it("sends a missing token straight to the failure page", async () => {
    const res = GET(new NextRequest("http://localhost/api/unsubscribe"));
    expect(res.headers.get("location")).toBe("http://localhost/unsubscribed?ok=0");
  });
});

describe("POST /api/unsubscribe", () => {
  it("RFC 8058 one-click: a valid token unsubscribes and returns 200", async () => {
    const res = await POST(oneClick(token()));
    expect(res.status).toBe(200);
    expect(removeSubscriber).toHaveBeenCalledWith("sam@example.com");
  });

  it("one-click with a tampered token changes nothing and returns 400", async () => {
    const res = await POST(oneClick(token().slice(0, -2) + "xx"));
    expect(res.status).toBe(400);
    expect(removeSubscriber).not.toHaveBeenCalled();
  });

  it("confirm-page form: a valid token unsubscribes and redirects (303) to ok=1", async () => {
    const res = await POST(formPost(token()));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/unsubscribed?ok=1");
    expect(removeSubscriber).toHaveBeenCalledWith("sam@example.com");
  });

  it("confirm-page form: a tampered token changes nothing and redirects to ok=0", async () => {
    const res = await POST(formPost(token().slice(0, -2) + "xx"));
    expect(res.headers.get("location")).toBe("http://localhost/unsubscribed?ok=0");
    expect(removeSubscriber).not.toHaveBeenCalled();
  });

  it("is idempotent: an address that's already gone still counts as success", async () => {
    await POST(oneClick(token()));
    const res = await POST(oneClick(token()));
    expect(res.status).toBe(200);
  });

  it("rejects every token when the secret is missing in production", async () => {
    const t = token();
    vi.stubEnv("UNSUBSCRIBE_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    try {
      const res = await POST(oneClick(t));
      expect(res.status).toBe(400);
      expect(removeSubscriber).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
```

- [ ] **Step 1b: Write the failing already-removed test (Amendment 5)** in `app/api/unsubscribe/route.db.test.ts`. It's a separate file because it uses the **real** `lib/db.ts` rather than the mock, going through the local-JSON fallback (tests set no Upstash vars) exactly as `lib/db.test.ts` does:

```ts
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { getSubscriberByEmail, removeSubscriber, upsertSubscriber } from "@/lib/db";
import { signUnsubscribeToken, unsubscribeSecret } from "@/lib/unsubscribeToken";

const EMAIL = "already-removed@example.com";

const oneClick = (token: string) =>
  new NextRequest(`http://localhost/api/unsubscribe?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
  });

describe("POST /api/unsubscribe against the real subscriber store", () => {
  it("returns 200 for a valid one-click token whose address is already gone", async () => {
    await upsertSubscriber(EMAIL);
    await removeSubscriber(EMAIL);
    expect(await getSubscriberByEmail(EMAIL)).toBeNull();

    const res = await POST(oneClick(signUnsubscribeToken(EMAIL, unsubscribeSecret()!)));

    expect(res.status).toBe(200);
    expect(await getSubscriberByEmail(EMAIL)).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing page test** in `app/unsubscribe/page.test.tsx`. `app/sharedDay.test.ts` already calls a Server Component directly; this does the same and renders the result with `react-dom/server`, so there's no DOM environment to set up.

```tsx
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/db", () => ({ removeSubscriber: vi.fn() }));

const { default: UnsubscribePage, metadata } = await import("./page");
const { removeSubscriber } = await import("@/lib/db");
const { signUnsubscribeToken, unsubscribeSecret } = await import("@/lib/unsubscribeToken");

const render = async (token?: string) =>
  renderToStaticMarkup(await UnsubscribePage({ searchParams: Promise.resolve({ token }) }));

describe("/unsubscribe confirm page", () => {
  it("shows the address masked, with one button that POSTs the token", async () => {
    const token = signUnsubscribeToken("sam@gmail.com", unsubscribeSecret()!);
    const html = await render(token);

    expect(html).toContain("s***@gmail.com");
    expect(html).not.toContain("sam@gmail.com");
    expect(html).toContain('method="post"');
    expect(html).toContain(`action="/api/unsubscribe?token=${encodeURIComponent(token)}"`);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain("Unsubscribe</button>");
  });

  it("doesn't unsubscribe just by being viewed", async () => {
    await render(signUnsubscribeToken("sam@gmail.com", unsubscribeSecret()!));
    expect(removeSubscriber).not.toHaveBeenCalled();
  });

  it.each([undefined, "garbage", Buffer.from("sam@gmail.com").toString("base64url")])(
    "redirects an invalid token (%j) to the failure page",
    async (token) => {
      await expect(render(token)).rejects.toMatchObject({
        digest: expect.stringContaining("/unsubscribed?ok=0"),
      });
    }
  );

  it("is noindex", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
```

(`redirect()` from `next/navigation` throws an error whose `digest` contains the target URL. If the executing subagent finds a different shape in the installed Next, match on what `node_modules/next/dist/client/components/redirect.js` actually produces and note it in the report.)

- [ ] **Step 3: Extend `lib/seoRoutes.test.ts`.** Add inside `describe("buildRobots", …)`:

```ts
  it("disallows the unsubscribe confirm page and its API route", () => {
    const { disallow } = buildRobots().rules;
    expect(disallow).toContain("/unsubscribe");
    expect(disallow).toContain("/api/");
  });
```

- [ ] **Step 4: Run them to check they fail.** `npx vitest run app/api/unsubscribe app/unsubscribe lib/seoRoutes.test.ts` → FAIL: POST isn't exported (in both route test files), the page module is missing, and `/unsubscribe` isn't disallowed yet.

- [ ] **Step 5: Implement the route** by replacing all of `app/api/unsubscribe/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { removeSubscriber } from "@/lib/db";
import { unsubscribeSecret, verifyUnsubscribeToken } from "@/lib/unsubscribeToken";

function verifiedEmail(token: string | null): string | null {
  const secret = unsubscribeSecret();
  if (!token || !secret) return null;
  return verifyUnsubscribeToken(token, secret);
}

/** Never unsubscribes. Link scanners (Outlook Safe Links, corporate mail
 * gateways) prefetch every GET link in an email, so a GET that mutated
 * would unsubscribe people who never clicked. It only forwards to the
 * confirm page, whose button POSTs back here. */
export function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/unsubscribed?ok=0", req.url));
  const confirm = new URL("/unsubscribe", req.url);
  confirm.searchParams.set("token", token);
  return NextResponse.redirect(confirm);
}

/** Two callers, one token location (the query string):
 * - RFC 8058 one-click, POSTed by a mailbox provider's own unsubscribe
 *   button from the List-Unsubscribe header, body `List-Unsubscribe=One-Click`.
 *   No browser is involved, so it gets a status code, not a redirect.
 * - The /unsubscribe confirm page's form, which gets a 303 to /unsubscribed.
 * Removing an address that's already gone is a no-op, so repeats succeed. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const oneClick = form?.get("List-Unsubscribe") === "One-Click";
  const email = verifiedEmail(req.nextUrl.searchParams.get("token"));

  let ok = false;
  if (email) {
    try {
      await removeSubscriber(email);
      ok = true;
    } catch (err) {
      console.error("[curio:unsubscribe] removeSubscriber failed:", err);
    }
  }

  if (oneClick) {
    return ok
      ? new NextResponse(null, { status: 200 })
      : NextResponse.json({ error: email ? "Unsubscribe failed" : "Invalid token" }, { status: email ? 500 : 400 });
  }
  return NextResponse.redirect(new URL(`/unsubscribed?ok=${ok ? 1 : 0}`, req.url), 303);
}
```

- [ ] **Step 6: Implement the page**, `app/unsubscribe/page.tsx`. Its layout copies `app/unsubscribed/page.tsx` (same container, heading and body classes), so it adds no new tokens or values:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Button from "@/components/ui/Button";
import { maskEmail, unsubscribeSecret, verifyUnsubscribeToken } from "@/lib/unsubscribeToken";

export const metadata: Metadata = {
  title: "Unsubscribe — Curio",
  robots: { index: false, follow: false },
};

/** The confirm step between an emailed unsubscribe link and the actual
 * unsubscribe: viewing this page changes nothing (scanners prefetch links);
 * only the button's POST does. */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const secret = unsubscribeSecret();
  const email = typeof token === "string" && secret ? verifyUnsubscribeToken(token, secret) : null;
  if (!email || typeof token !== "string") redirect("/unsubscribed?ok=0");

  return (
    <section className="mx-auto max-w-form px-6 py-24 text-center">
      <h1 className="font-serif text-3xl">Unsubscribe from Curio?</h1>
      <p className="mt-4 font-sans text-sm leading-relaxed text-ink-soft">
        The daily email to {maskEmail(email)} will stop. You can still visit Curio any time.
      </p>
      <form method="post" action={`/api/unsubscribe?token=${encodeURIComponent(token)}`} className="mt-8">
        <Button type="submit">Unsubscribe</Button>
      </form>
    </section>
  );
}
```

- [ ] **Step 7: Disallow the page.** In `lib/seoRoutes.ts`, add `"/unsubscribe",` to `DISALLOWED_PATHS` directly above `"/unsubscribed",`. Leave `PUBLIC_ROUTES` untouched.

- [ ] **Step 8: Run them to check they pass.** `npx vitest run app/api/unsubscribe app/unsubscribe lib/seoRoutes.test.ts` → PASS. Then run `npx vitest run` → expect everything to pass. (`lib/email.ts`'s old `decodeUnsubscribeToken` is now unused, but it's deleted in Task 4, not here.)

- [ ] **Step 9: Commit.**

```bash
git add app/api/unsubscribe app/unsubscribe lib/seoRoutes.ts lib/seoRoutes.test.ts
git commit -m "feat: unsubscribe via confirm page and RFC 8058 one-click, never on GET

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Sequential, rate-limit-aware batch sender

**Files:**
- Create: `lib/digestSend.ts`
- Test: `lib/digestSend.test.ts`

**Interfaces:**
- Produces (used by Task 4):

```ts
export const BATCH_SIZE = 100;
export const MAX_RETRIES = 3;
export type BatchError = { message: string; statusCode: number | null; name: string };
export type BatchResult =
  | { data: { data: { id: string }[]; errors?: { index: number; message: string }[] }; error: null; headers: Record<string, string> | null }
  | { data: null; error: BatchError; headers: Record<string, string> | null };
export type SendBatch<T> = (chunk: T[], idempotencyKey: string) => Promise<BatchResult>;
export type SendOutcome = { attempted: number; sent: number; failed: number; errors: string[]; failedRecipients: string[] };
export function chunk<T>(items: T[], size?: number): T[][];
export function redactAddresses(message: string): string;
export function retryDelayMs(headers: Record<string, string> | null, attempt: number, now: number): number | null;
export function sendInBatches<T extends { to: string }>(messages: T[], opts: {
  sendBatch: SendBatch<T>; keyPrefix: string;
  sleep?: (ms: number) => Promise<void>; now?: () => number; deadline?: number;
  onSent?: (recipients: string[]) => Promise<void>;
}): Promise<SendOutcome>;
```

`onSent` (Amendment 2) is awaited after each chunk that Resend accepted, with that chunk's accepted recipients (per-email rejections excluded). Task 6 uses it to `SREM` addresses from the failed set as they succeed. If `onSent` throws, the error is logged (redacted) and sending continues; the emails were already sent, so they still count as `sent`.

`sendInBatches` never throws. Idempotency keys are `${keyPrefix}-${chunkIndex}`, and a chunk's retries reuse its key. That way a retry after a 5xx that Resend had actually processed returns the cached result and doesn't send twice.

- [ ] **Step 1: Write the failing tests** in `lib/digestSend.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  BATCH_SIZE,
  MAX_RETRIES,
  chunk,
  redactAddresses,
  retryDelayMs,
  sendInBatches,
  type BatchResult,
  type SendBatch,
} from "./digestSend";

type Msg = { to: string };
const messages = (n: number): Msg[] => Array.from({ length: n }, (_, i) => ({ to: `r${i}@example.com` }));

const ok = (c: Msg[], errors: { index: number; message: string }[] = []): BatchResult => ({
  data: { data: c.map((_, i) => ({ id: `id-${i}` })), errors },
  error: null,
  headers: {},
});
const fail = (name: string, statusCode: number | null, headers: Record<string, string> = {}): BatchResult => ({
  data: null,
  error: { name, statusCode, message: `${name} happened` },
  headers,
});

const noSleep = () => vi.fn(async (_ms: number) => {});

describe("chunk", () => {
  it("never exceeds the batch maximum of 100", () => {
    expect(BATCH_SIZE).toBe(100);
  });
});

describe("sendInBatches: chunking", () => {
  it.each([
    [0, []],
    [1, [1]],
    [100, [100]],
    [101, [100, 1]],
    [250, [100, 100, 50]],
  ])("%i subscribers → batches of %j, sent one at a time, in order", async (n, sizes) => {
    let inFlight = 0;
    let maxInFlight = 0;
    const sendBatch: SendBatch<Msg> = vi.fn(async (c) => {
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return ok(c);
    });
    const all = messages(n);

    const out = await sendInBatches(all, { sendBatch, keyPrefix: "run", sleep: noSleep() });

    const calls = vi.mocked(sendBatch).mock.calls;
    expect(calls.map(([c]) => c.length)).toEqual(sizes);
    expect(calls.flatMap(([c]) => c)).toEqual(all);
    expect(calls.map(([, key]) => key)).toEqual(sizes.map((_, i) => `run-${i}`));
    expect(maxInFlight).toBeLessThanOrEqual(1);
    expect(out).toEqual({ attempted: n, sent: n, failed: 0, errors: [], failedRecipients: [] });
  });

  it("splits with chunk() the same way", () => {
    expect(chunk(messages(250)).map((c) => c.length)).toEqual([100, 100, 50]);
    expect(chunk([])).toEqual([]);
  });
});

describe("sendInBatches: retries", () => {
  it("retries a 429 after the retry-after delay, then succeeds, reusing the idempotency key", async () => {
    const sendBatch = vi
      .fn<SendBatch<Msg>>()
      .mockResolvedValueOnce(fail("rate_limit_exceeded", 429, { "retry-after": "2" }))
      .mockImplementation(async (c) => ok(c));
    const sleep = noSleep();

    const out = await sendInBatches(messages(3), { sendBatch, keyPrefix: "run", sleep });

    expect(sleep).toHaveBeenCalledWith(2000);
    expect(sendBatch.mock.calls.map(([, key]) => key)).toEqual(["run-0", "run-0"]);
    expect(out).toMatchObject({ attempted: 3, sent: 3, failed: 0 });
  });

  it("backs off exponentially (1s, 2s, 4s) without retry-after, and retries 5xx", async () => {
    const sendBatch = vi
      .fn<SendBatch<Msg>>()
      .mockResolvedValueOnce(fail("internal_server_error", 500))
      .mockResolvedValueOnce(fail("application_error", 502))
      .mockResolvedValueOnce(fail("application_error", null)) // network failure
      .mockImplementation(async (c) => ok(c));
    const sleep = noSleep();

    const out = await sendInBatches(messages(1), { sendBatch, keyPrefix: "run", sleep });

    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000]);
    expect(out.sent).toBe(1);
  });

  it("gives up after MAX_RETRIES and counts the whole chunk failed, then carries on with the next chunk", async () => {
    let call = 0;
    const sendBatch = vi.fn<SendBatch<Msg>>(async (c) =>
      c.length === 100 ? (call++, fail("rate_limit_exceeded", 429)) : ok(c)
    );

    const out = await sendInBatches(messages(101), { sendBatch, keyPrefix: "run", sleep: noSleep() });

    expect(MAX_RETRIES).toBe(3);
    expect(call).toBe(MAX_RETRIES + 1);
    expect(out.sent).toBe(1);
    expect(out.failed).toBe(100);
    expect(out.failedRecipients).toEqual(messages(100).map((m) => m.to));
    expect(out.errors).toEqual(["rate_limit_exceeded: rate_limit_exceeded happened"]);
  });

  it.each([
    ["validation_error", 422],
    ["daily_quota_exceeded", 429],
    ["monthly_quota_exceeded", 429],
    ["invalid_api_key", 403],
  ])("doesn't retry %s (%i)", async (name, status) => {
    const sendBatch = vi.fn<SendBatch<Msg>>(async () => fail(name, status));
    const out = await sendInBatches(messages(2), { sendBatch, keyPrefix: "run", sleep: noSleep() });
    expect(sendBatch).toHaveBeenCalledTimes(1);
    expect(out.failed).toBe(2);
  });

  it("treats a thrown error like a network failure and retries it", async () => {
    const sendBatch = vi
      .fn<SendBatch<Msg>>()
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockImplementation(async (c) => ok(c));
    const out = await sendInBatches(messages(1), { sendBatch, keyPrefix: "run", sleep: noSleep() });
    expect(out.sent).toBe(1);
  });

  it("gives up rather than retrying early when retry-after is longer than the cap", async () => {
    const sendBatch = vi.fn<SendBatch<Msg>>(async () => fail("rate_limit_exceeded", 429, { "retry-after": "120" }));
    const sleep = noSleep();
    const out = await sendInBatches(messages(1), { sendBatch, keyPrefix: "run", sleep });
    expect(sleep).not.toHaveBeenCalled();
    expect(out.failed).toBe(1);
  });

  it("won't wait past the deadline, and won't start a chunk after it", async () => {
    let t = 0;
    const sendBatch = vi.fn<SendBatch<Msg>>(async () => {
      t += 1_000;
      return fail("rate_limit_exceeded", 429, { "retry-after": "5" });
    });
    const out = await sendInBatches(messages(150), {
      sendBatch,
      keyPrefix: "run",
      sleep: noSleep(),
      now: () => t,
      deadline: 3_000,
    });
    expect(sendBatch).toHaveBeenCalledTimes(1); // retry-after 5s would pass the deadline
    expect(out.failed).toBe(150); // and chunk 2 never starts
  });
});

describe("sendInBatches: per-email rejections (permissive batch validation)", () => {
  it("counts only the rejected emails as failed and never logs their addresses", async () => {
    const sendBatch = vi.fn<SendBatch<Msg>>(async (c) =>
      ok(c, [{ index: 1, message: "Invalid `to` field: r1@example.com" }])
    );
    const out = await sendInBatches(messages(3), { sendBatch, keyPrefix: "run", sleep: noSleep() });
    expect(out).toMatchObject({ attempted: 3, sent: 2, failed: 1, failedRecipients: ["r1@example.com"] });
    expect(out.errors.join(" ")).not.toContain("@");
  });
});

describe("sendInBatches: onSent (Amendment 2)", () => {
  it("reports each accepted chunk's recipients as soon as it succeeds, excluding rejected and failed ones", async () => {
    const order: string[] = [];
    const sendBatch = vi.fn<SendBatch<Msg>>(async (c) => {
      order.push(`send:${c.length}`);
      if (c.length === 50) return fail("validation_error", 422);
      return ok(c, [{ index: 0, message: "bad" }]);
    });
    const onSent = vi.fn(async (r: string[]) => {
      order.push(`onSent:${r.length}`);
    });

    await sendInBatches(messages(250), { sendBatch, keyPrefix: "run", sleep: noSleep(), onSent });

    expect(order).toEqual(["send:100", "onSent:99", "send:100", "onSent:99", "send:50"]);
    expect(onSent.mock.calls[0][0]).toEqual(messages(100).slice(1).map((m) => m.to));
  });

  it("keeps going, and still counts the chunk sent, if onSent throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await sendInBatches(messages(101), {
      sendBatch: async (c) => ok(c),
      keyPrefix: "run",
      sleep: noSleep(),
      onSent: async () => {
        throw new Error("redis down for x@example.com");
      },
    });
    const logged = error.mock.calls.flat().map(String).join(" ");
    error.mockRestore();
    expect(out.sent).toBe(101);
    expect(logged).not.toContain("@example.com");
  });
});

describe("retryDelayMs", () => {
  it("honours retry-after seconds", () => expect(retryDelayMs({ "retry-after": "3" }, 0, 0)).toBe(3000));
  it("honours an HTTP-date retry-after", () =>
    expect(retryDelayMs({ "retry-after": new Date(10_000).toUTCString() }, 0, 4_000)).toBe(6000));
  it("falls back to 1s, 2s, 4s", () => expect([0, 1, 2].map((a) => retryDelayMs(null, a, 0))).toEqual([1000, 2000, 4000]));
  it("returns null past the 30s cap", () => expect(retryDelayMs({ "retry-after": "31" }, 0, 0)).toBeNull());
});

describe("redactAddresses", () => {
  it("replaces anything address-shaped", () => {
    expect(redactAddresses("bad: a.b+c@x.co, <d@e.org>")).toBe("bad: [address], <[address]>");
  });
});
```

- [ ] **Step 2: Run it to check it fails.** `npx vitest run lib/digestSend.test.ts` → FAIL, because the module is missing.

- [ ] **Step 3: Implement** `lib/digestSend.ts`:

```ts
/** Resend's documented maximum emails per batch request. */
export const BATCH_SIZE = 100;
/** Retries after the first attempt, so at most 4 requests per chunk. */
export const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;
/** A retry-after longer than this isn't worth holding the cron open for:
 * the chunk counts as failed and `?resend=failed` picks it up later. */
const MAX_DELAY_MS = 30_000;

export type BatchError = { message: string; statusCode: number | null; name: string };
export type BatchResult =
  | {
      data: { data: { id: string }[]; errors?: { index: number; message: string }[] };
      error: null;
      headers: Record<string, string> | null;
    }
  | { data: null; error: BatchError; headers: Record<string, string> | null };
export type SendBatch<T> = (chunk: T[], idempotencyKey: string) => Promise<BatchResult>;
export type SendOutcome = {
  attempted: number;
  sent: number;
  failed: number;
  errors: string[];
  /** For lib/digestRuns.ts's failed set only. Never log this. */
  failedRecipients: string[];
};

export function chunk<T>(items: T[], size: number = BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Resend's per-email validation messages can quote the address. */
export function redactAddresses(message: string): string {
  return message.replace(/[^\s@<>"',;:()]+@[^\s@<>"',;:()]+/g, "[address]");
}

// Quota errors come back as 429 too, but no amount of waiting fixes them.
const NEVER_RETRY = new Set(["daily_quota_exceeded", "monthly_quota_exceeded"]);
const ALWAYS_RETRY = new Set(["rate_limit_exceeded", "application_error", "internal_server_error"]);

function isRetryable(error: BatchError): boolean {
  if (NEVER_RETRY.has(error.name)) return false;
  if (ALWAYS_RETRY.has(error.name)) return true;
  return error.statusCode === null || error.statusCode === 429 || error.statusCode >= 500;
}

/** `retry-after` (seconds or an HTTP date) when Resend sends one, else
 * 1s/2s/4s. Null means "longer than we're willing to wait". */
export function retryDelayMs(
  headers: Record<string, string> | null,
  attempt: number,
  now: number
): number | null {
  const header = headers?.["retry-after"];
  let ms = BASE_DELAY_MS * 2 ** attempt;
  if (header) {
    const seconds = Number(header);
    const at = Date.parse(header);
    if (Number.isFinite(seconds)) ms = Math.max(0, seconds * 1000);
    else if (!Number.isNaN(at)) ms = Math.max(0, at - now);
  }
  return ms > MAX_DELAY_MS ? null : ms;
}

/** Sends every message in sequential chunks of BATCH_SIZE, one request at a
 * time, so a morning's send stays inside Resend's per-team rate limit. A
 * 429/5xx/network failure retries the same chunk with the same idempotency
 * key, so a retry of a request Resend actually processed can't double-send.
 * Never throws: everything that couldn't be sent is counted in `failed`. */
export async function sendInBatches<T extends { to: string }>(
  messages: T[],
  opts: {
    sendBatch: SendBatch<T>;
    /** Unique per run: Resend dedupes on it for 24 hours. */
    keyPrefix: string;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    /** Epoch ms. No retry wait or new chunk may start past it. */
    deadline?: number;
    /** Awaited after each accepted chunk with its accepted recipients, so a
     * resend can forget them before the next chunk: a run that dies partway
     * leaves only the not-yet-sent addresses behind. */
    onSent?: (recipients: string[]) => Promise<void>;
  }
): Promise<SendOutcome> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const deadline = opts.deadline ?? Number.POSITIVE_INFINITY;
  const out: SendOutcome = { attempted: messages.length, sent: 0, failed: 0, errors: [], failedRecipients: [] };

  const failAll = (c: T[], message: string) => {
    out.failed += c.length;
    out.failedRecipients.push(...c.map((m) => m.to));
    out.errors.push(redactAddresses(message));
  };

  for (const [index, c] of chunk(messages).entries()) {
    if (now() >= deadline) {
      failAll(c, "deadline reached before this batch started");
      continue;
    }
    const key = `${opts.keyPrefix}-${index}`;

    for (let attempt = 0; ; attempt++) {
      let result: BatchResult;
      try {
        result = await opts.sendBatch(c, key);
      } catch (err) {
        result = {
          data: null,
          error: { name: "application_error", statusCode: null, message: err instanceof Error ? err.message : String(err) },
          headers: null,
        };
      }

      if (!result.error) {
        const rejected = result.data.errors ?? [];
        const rejectedIndexes = new Set<number>();
        for (const { index: i, message } of rejected) {
          const m = c[i];
          if (m) {
            rejectedIndexes.add(i);
            out.failed++;
            out.failedRecipients.push(m.to);
          }
          out.errors.push(redactAddresses(message));
        }
        const accepted = c.filter((_, i) => !rejectedIndexes.has(i)).map((m) => m.to);
        out.sent += accepted.length;
        if (opts.onSent && accepted.length > 0) {
          try {
            await opts.onSent(accepted);
          } catch (err) {
            console.error("[curio:digest] onSent failed:", redactAddresses(err instanceof Error ? err.message : String(err)));
          }
        }
        break;
      }

      const summary = `${result.error.name}: ${result.error.message}`;
      if (!isRetryable(result.error) || attempt >= MAX_RETRIES) {
        failAll(c, summary);
        break;
      }
      const wait = retryDelayMs(result.headers, attempt, now());
      if (wait === null || now() + wait >= deadline) {
        failAll(c, `${summary} (no time left to retry)`);
        break;
      }
      await sleep(wait);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run it to check it passes.** `npx vitest run lib/digestSend.test.ts` → PASS.
- [ ] **Step 5: Commit.**

```bash
git add lib/digestSend.ts lib/digestSend.test.ts
git commit -m "feat: sequential Resend batch sender with retry-after-aware backoff

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Single-recipient digests with List-Unsubscribe, sent in batches

**Files:**
- Modify: `lib/email.ts`, `app/api/cron/send-daily/route.ts`, `app/api/cron/send-daily/route.test.ts`, `app/sharedDay.test.ts`
- Test: `lib/email.test.ts` (extend), `lib/email.batch.test.ts` (new)

**Interfaces:**
- Consumes: `signUnsubscribeToken`, `unsubscribeSecret` (Task 1); `sendInBatches`, `SendOutcome` (Task 3); `absoluteUrl`, `siteUrl` from `lib/siteUrl.ts`.
- Produces (used by Task 6):
  - `unsubscribeUrl(email: string, secret: string): string`
  - `type DigestMessage = { from: string; to: string; subject: string; html: string; text: string; headers: Record<string, string> }`
  - `buildDigestMessage(email: string, word: WordEntry, date: Date, secret: string): DigestMessage`
  - `sendDailyDigests(emails: string[], word: WordEntry, date: Date, opts: { secret: string; runKey: string; deadline?: number; onSent?: (recipients: string[]) => Promise<void> }): Promise<SendOutcome>`
- Removes: `unsubscribeToken`, `decodeUnsubscribeToken` and `sendDailyDigest` from `lib/email.ts`.

- [ ] **Step 1: Write the failing builder tests.** Append to `lib/email.test.ts` and extend its imports to `import { buildDigestMessage, buildDigestSubject, digestStoryUrl, unsubscribeUrl } from "./email";` plus `import { afterEach, beforeEach, vi } from "vitest";` and `import { verifyUnsubscribeToken } from "./unsubscribeToken";`:

```ts
const word = {
  slug: "custard", word: "custard", respelling: "KUS-terd", partOfSpeech: "noun",
  teaser: "A pie filling that started as a crust.", origin: "From crustade.",
  journey: "", related: "", lineage: ["Old French", "English"],
};

describe("unsubscribe links and headers", () => {
  beforeEach(() => vi.stubEnv("CURIO_SITE_URL", "https://curio.example/"));
  afterEach(() => vi.unstubAllEnvs());

  it("builds the link from CURIO_SITE_URL with a signed token", () => {
    const url = new URL(unsubscribeUrl("Sam@Example.com", "s3cret"));
    expect(url.origin + url.pathname).toBe("https://curio.example/api/unsubscribe");
    expect(verifyUnsubscribeToken(url.searchParams.get("token")!, "s3cret")).toBe("sam@example.com");
  });

  it("gives each digest one recipient, its own link, and both List-Unsubscribe headers", () => {
    const msg = buildDigestMessage("sam@example.com", word as never, new Date("2026-09-27T09:00:00Z"), "s3cret");
    const link = unsubscribeUrl("sam@example.com", "s3cret");

    expect(msg.to).toBe("sam@example.com");
    expect(msg).not.toHaveProperty("cc");
    expect(msg).not.toHaveProperty("bcc");
    expect(msg.headers).toEqual({
      "List-Unsubscribe": `<${link}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(msg.html).toContain(link);
    expect(msg.text).toContain(`Unsubscribe: ${link}`);
    expect(msg.subject).toBe(word.teaser);
  });
});
```

(If `lib/words.ts` exports a `WordEntry` fixture helper, use it instead of `as never`; otherwise type the fixture as `WordEntry` via `import type { WordEntry } from "./words"`.)

- [ ] **Step 2: Write the failing batch-payload and dev-fallback tests** in the new file `lib/email.batch.test.ts`. It's a separate file because `lib/email.ts` reads `RESEND_API_KEY` at import:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WordEntry } from "./words";

const { batchSend } = vi.hoisted(() => ({
  batchSend: vi.fn(async (chunk: unknown[]) => ({
    data: { data: chunk.map((_, i) => ({ id: `id-${i}` })), errors: [] },
    error: null,
    headers: {},
  })),
}));
vi.mock("resend", () => ({
  Resend: class {
    batch = { send: batchSend };
    emails = { send: vi.fn() };
  },
}));
vi.stubEnv("RESEND_API_KEY", "re_test_key");
vi.stubEnv("CURIO_SITE_URL", "https://curio.example");

const { sendDailyDigests } = await import("./email");
const { verifyUnsubscribeToken } = await import("./unsubscribeToken");

const word = {
  slug: "custard", word: "custard", respelling: "KUS-terd", partOfSpeech: "noun",
  teaser: "A pie filling that started as a crust.", origin: "From crustade.",
  journey: "", related: "", lineage: ["Old French", "English"],
} as WordEntry;
const emails = Array.from({ length: 101 }, (_, i) => `r${i}@example.com`);

beforeEach(() => batchSend.mockClear());

describe("sendDailyDigests (Resend configured)", () => {
  it("sends every email through the batch endpoint, one recipient each, with its own List-Unsubscribe headers", async () => {
    const onSent = vi.fn(async (_recipients: string[]) => {});
    const out = await sendDailyDigests(emails, word, new Date("2026-09-27T09:00:00Z"), {
      secret: "s3cret",
      runKey: "curio-digest-2026-09-27-scheduled",
      onSent,
    });
    expect(onSent.mock.calls.map(([r]) => r.length)).toEqual([100, 1]);

    expect(batchSend.mock.calls.map(([c]) => c.length)).toEqual([100, 1]);
    const sent = batchSend.mock.calls.flatMap(([c]) => c) as {
      to: unknown; cc?: unknown; bcc?: unknown; headers: Record<string, string>;
    }[];
    expect(sent.map((m) => m.to)).toEqual(emails);
    for (const m of sent) {
      expect(typeof m.to).toBe("string");
      expect(m.cc).toBeUndefined();
      expect(m.bcc).toBeUndefined();
      expect(m.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
      const url = new URL(m.headers["List-Unsubscribe"].slice(1, -1));
      expect(url.origin).toBe("https://curio.example");
      expect(verifyUnsubscribeToken(url.searchParams.get("token")!, "s3cret")).toBe(m.to);
    }
    expect(batchSend.mock.calls.map(([, o]) => o)).toEqual([
      { batchValidation: "permissive", idempotencyKey: "curio-digest-2026-09-27-scheduled-0" },
      { batchValidation: "permissive", idempotencyKey: "curio-digest-2026-09-27-scheduled-1" },
    ]);
    expect(out).toMatchObject({ attempted: 101, sent: 101, failed: 0 });
  });
});
```

Add the dev-fallback test to `lib/email.test.ts`. No `RESEND_API_KEY` is set there, so the fallback path runs:

```ts
describe("sendDailyDigests dev fallback (no RESEND_API_KEY)", () => {
  it("logs a subject and a count, sends nothing, and never logs addresses", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const out = await sendDailyDigests(["a@example.com", "b@example.com"], word as never, new Date(), {
      secret: "s3cret",
      runKey: "k",
    });
    const logged = log.mock.calls.flat().join(" ");
    log.mockRestore();

    expect(out).toEqual({ attempted: 2, sent: 2, failed: 0, errors: [], failedRecipients: [] });
    expect(logged).toContain("2 subscriber");
    expect(logged).not.toContain("@example.com");
  });
});
```

(Add `sendDailyDigests` to that file's import.)

- [ ] **Step 3: Run them to check they fail.** `npx vitest run lib/email` → FAIL, because the new exports don't exist.

- [ ] **Step 4: Implement it in `lib/email.ts`:**
  - Delete the `SITE_URL` constant, the "Not cryptographically secure" comment, `unsubscribeToken`, `decodeUnsubscribeToken` and `sendDailyDigest`.
  - Add imports: `import { absoluteUrl, siteUrl } from "./siteUrl";`, `import { signUnsubscribeToken } from "./unsubscribeToken";`, `import { sendInBatches, type SendOutcome } from "./digestSend";`.
  - In `digestStoryUrl`, change `new URL(\`/story/${slug}\`, SITE_URL)` to `new URL(\`/story/${slug}\`, siteUrl())`.
  - Add, in place of the deleted `sendDailyDigest`:

```ts
/** Signed, so the link can only unsubscribe the address it was sent to. The
 * same URL is the List-Unsubscribe target: a GET lands on a confirm page,
 * and only a POST (the page's button, or a mailbox's one-click) unsubscribes. */
export function unsubscribeUrl(email: string, secret: string): string {
  const url = new URL(absoluteUrl("/api/unsubscribe"));
  url.searchParams.set("token", signUnsubscribeToken(email, secret));
  return url.toString();
}

export type DigestMessage = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
};

/** One subscriber's digest. Always exactly one recipient: the unsubscribe
 * link and headers are specific to them, so a shared to/cc/bcc would let
 * one person unsubscribe another. */
export function buildDigestMessage(email: string, word: WordEntry, date: Date, secret: string): DigestMessage {
  const dateStr = formatDay(dayKey(date));
  const storyUrl = digestStoryUrl(word.slug);
  const unsubscribe = unsubscribeUrl(email, secret);
  return {
    from: FROM_ADDRESS,
    to: email,
    // The word stays prominent in the body (the <h1>, and the text version's
    // first line); only the subject carries the teaser, so curiosity about it
    // survives long enough to get the email opened.
    subject: buildDigestSubject(word.teaser),
    html: buildDigestHtml(word, dateStr, unsubscribe),
    // HTML-only email is itself a spam signal most filters weigh directly.
    text: `${word.word} (${word.respelling}, ${word.partOfSpeech})\n\n${word.origin}\n\nRead the full story: ${storyUrl}\n\nUnsubscribe: ${unsubscribe}`,
    // RFC 2369 + RFC 8058: mailbox providers show their own unsubscribe
    // button from these and weigh them for inbox placement.
    headers: {
      "List-Unsubscribe": `<${unsubscribe}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

/** The morning digest for every subscriber, through Resend's batch endpoint
 * (see lib/digestSend.ts for chunking, retries and idempotency). `runKey`
 * must be unique per run, because Resend dedupes on it for 24 hours. */
export async function sendDailyDigests(
  emails: string[],
  word: WordEntry,
  date: Date,
  opts: { secret: string; runKey: string; deadline?: number; onSent?: (recipients: string[]) => Promise<void> }
): Promise<SendOutcome> {
  const messages = emails.map((email) => buildDigestMessage(email, word, date, opts.secret));

  if (!resend) {
    // Local/dev fallback: no RESEND_API_KEY configured, so log instead of
    // sending. A count, never the addresses.
    if (messages.length > 0) {
      console.log(`[curio:email:dev-fallback] would send "${messages[0].subject}" to ${messages.length} subscriber(s)`);
    }
    if (messages.length > 0) await opts.onSent?.(messages.map((m) => m.to));
    return { attempted: messages.length, sent: messages.length, failed: 0, errors: [], failedRecipients: [] };
  }

  const client = resend;
  return sendInBatches(messages, {
    keyPrefix: opts.runKey,
    deadline: opts.deadline,
    onSent: opts.onSent,
    // Permissive: one malformed address shouldn't sink the other 99 in its chunk.
    sendBatch: (chunk, idempotencyKey) =>
      client.batch.send(chunk, { batchValidation: "permissive", idempotencyKey }),
  });
}
```

  - `sendSignInEmail` stays unchanged.

- [ ] **Step 5: Switch the cron over and fail closed.** In `app/api/cron/send-daily/route.ts`, replace the `sendDailyDigest` import with `import { sendDailyDigests } from "@/lib/email";` and add `import { unsubscribeSecret } from "@/lib/unsubscribeToken";` and `import { dayKey } from "@/lib/day";`. After the `CRON_SECRET` checks, replace the body with:

```ts
  // Unverifiable unsubscribe links must never go out. Checked before anything
  // is sent or posted, so once the secret is set a plain re-run just works.
  const unsubscribe = unsubscribeSecret();
  if (!unsubscribe) {
    console.error("[curio:digest] UNSUBSCRIBE_SECRET is not set in production — refusing to send today's digest or post to Bluesky");
    return NextResponse.json({ error: "UNSUBSCRIBE_SECRET is not configured" }, { status: 500 });
  }

  const now = new Date();
  const word = await resolveTodayWord(now);
  const subscribers = await getAllSubscribers();

  const [emailResult, blueskyResult] = await Promise.allSettled([
    sendDailyDigests(subscribers, word, now, { secret: unsubscribe, runKey: `curio-digest-${dayKey(now)}-scheduled` }),
    postDailyWordToBluesky(word, now),
  ]);

  const email =
    emailResult.status === "fulfilled"
      ? emailResult.value
      : { attempted: subscribers.length, sent: 0, failed: subscribers.length, errors: [String(emailResult.reason)], failedRecipients: subscribers };
  if (email.failed > 0) {
    console.error(`[curio:digest] ${email.failed} of ${email.attempted} digests failed:`, email.errors);
  }
  const bluesky = blueskyResult.status === "fulfilled" ? blueskyResult.value.posted : false;

  return NextResponse.json({ word: word.slug, attempted: email.attempted, sent: email.sent, failed: email.failed, bluesky });
```

- [ ] **Step 6: Update the two cron test files so they use `sendDailyDigests`, keeping every invariant.**

  `app/api/cron/send-daily/route.test.ts`: change the email mock to
  ```ts
  vi.mock("@/lib/email", () => ({
    sendDailyDigests: vi.fn(async (emails: string[]) => ({
      attempted: emails.length, sent: emails.length, failed: 0, errors: [], failedRecipients: [],
    })),
  }));
  ```
  Change the import to `const { sendDailyDigests } = await import("@/lib/email");`. Rewrite the first two tests' assertions:
  ```ts
    // test 1
    expect(sendDailyDigests).toHaveBeenCalledTimes(1);
    const [recipients, digestWord] = vi.mocked(sendDailyDigests).mock.calls[0];
    expect(recipients).toEqual(["anon@example.com", "account-holder@example.com"]);
    expect(digestWord).toBe(sharedWord);
    expect(vi.mocked(postDailyWordToBluesky).mock.calls[0][0]).toBe(sharedWord);
    expect(body).toEqual({ word: "custard", attempted: 2, sent: 2, failed: 0, bluesky: true });

    // test 2
    const now = vi.mocked(resolveTodayWord).mock.calls[0][0];
    expect(vi.mocked(sendDailyDigests).mock.calls[0][2]).toBe(now);
    expect(vi.mocked(postDailyWordToBluesky).mock.calls[0][1]).toBe(now);
  ```
  In test 3, change `sendDailyDigest` to `sendDailyDigests`. Add:
  ```ts
  it("fails closed in production without UNSUBSCRIBE_SECRET: nothing sent, nothing posted", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UNSUBSCRIBE_SECRET", "");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await GET(cronRequest());
      expect(res.status).toBe(500);
      expect(sendDailyDigests).not.toHaveBeenCalled();
      expect(postDailyWordToBluesky).not.toHaveBeenCalled();
      expect(error.mock.calls.flat().join(" ")).toContain("UNSUBSCRIBE_SECRET");
    } finally {
      error.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it("logs the failure count and messages, never addresses", async () => {
    vi.mocked(sendDailyDigests).mockResolvedValueOnce({
      attempted: 2, sent: 1, failed: 1,
      errors: ["rate_limit_exceeded: Too many requests"],
      failedRecipients: ["account-holder@example.com"],
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const body = await (await GET(cronRequest())).json();
    const logged = error.mock.calls.flat().map(String).join(" ");
    error.mockRestore();

    expect(body).toMatchObject({ attempted: 2, sent: 1, failed: 1 });
    expect(logged).toContain("1 of 2");
    expect(logged).toContain("rate_limit_exceeded");
    expect(logged).not.toContain("@example.com");
  });

  it("counts every subscriber failed if the whole send rejects", async () => {
    vi.mocked(sendDailyDigests).mockRejectedValueOnce(new Error("boom"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const body = await (await GET(cronRequest())).json();
    error.mockRestore();
    expect(body).toMatchObject({ attempted: 2, sent: 0, failed: 2 });
  });
  ```
  (Setting `NODE_ENV=production` also keeps the existing `CRON_SECRET` check active: the test sets `CRON_SECRET`, so the request still authenticates.)

  `app/sharedDay.test.ts`: change the email mock to the same `sendDailyDigests` factory as above, update the import, and in `everySurfaceAt` replace the `digests` line with:
  ```ts
  const digests = vi
    .mocked(sendDailyDigests)
    .mock.calls.flatMap(([emails, w]) => emails.map(() => w.slug));
  ```
  The existing assertions (`expect(s.digests).toEqual([expected.slug, expected.slug])` and the 00:00 UTC boundary test) stay unchanged.

- [ ] **Step 7: Run everything.** `npx vitest run` → all pass. `npx tsc --noEmit` → no errors. If `client.batch.send`'s return type doesn't assign to `BatchResult`, fix the local type in `lib/digestSend.ts` to match the SDK's `CreateBatchResponse<{ batchValidation: "permissive" }>` shape; don't cast at the call site. `grep -rn "decodeUnsubscribeToken\|sendDailyDigest\b\|Not cryptographically" app lib` → no hits.

- [ ] **Step 8: Commit.**

```bash
git add lib/email.ts lib/email.test.ts lib/email.batch.test.ts app/api/cron/send-daily app/sharedDay.test.ts
git commit -m "feat: batch-sent single-recipient digests with signed List-Unsubscribe headers

Fails closed without UNSUBSCRIBE_SECRET in production.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Per-day run locks and the failed-recipient set

**Files:**
- Create: `lib/digestRuns.ts`
- Test: `lib/digestRuns.test.ts`

**Interfaces:**
- Produces (used by Task 6):
  - `type Channel = "email" | "bluesky"`
  - `claimRun(channel: Channel, day: string, opts?: { force?: boolean }): Promise<boolean>`: true means go ahead. Without `force` it's an atomic `SET NX EX`; `force` overwrites the key and always returns true.
  - `recordFailures(day: string, emails: string[]): Promise<void>`: replaces the day's set (used by scheduled and forced runs when they finish).
  - `removeFailures(day: string, emails: string[]): Promise<void>`: `SREM`s addresses as a resend's chunks succeed (Amendment 2). It leaves the TTL alone.
  - `getFailures(day: string): Promise<string[]>`
  - `resetDigestRunsMemory(): void` (tests only)
  - Keys: `curio:digest:run:<day>` and `curio:digest:bluesky:<day>` (TTL 3 days); `curio:digest:failed:<day>` (TTL **7 days**, Amendment 2).

- [ ] **Step 1: Write the failing tests** in `lib/digestRuns.test.ts`. They cover both backends:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  const ttls = new Map<string, number>();
  return {
    fake: {
      store,
      ttls,
      enabled: true,
      set: vi.fn(async (k: string, v: string, o?: { nx?: boolean; ex?: number }) => {
        if (o?.nx && store.has(k)) return null;
        store.set(k, v);
        if (o?.ex) ttls.set(k, o.ex);
        return "OK";
      }),
      del: vi.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
      sadd: vi.fn(async (k: string, ...members: string[]) => {
        const s = (store.get(k) as Set<string>) ?? new Set<string>();
        members.forEach((m) => s.add(m));
        store.set(k, s);
        return members.length;
      }),
      srem: vi.fn(async (k: string, ...members: string[]) => {
        const s = store.get(k) as Set<string> | undefined;
        let n = 0;
        members.forEach((m) => (n += s?.delete(m) ? 1 : 0));
        return n;
      }),
      smembers: vi.fn(async (k: string) => [...((store.get(k) as Set<string>) ?? [])]),
      expire: vi.fn(async (k: string, s: number) => (ttls.set(k, s), 1)),
    },
  };
});

vi.mock("./redis", () => ({
  get redis() {
    return fake.enabled ? fake : null;
  },
  usingUpstash: true,
}));

const { claimRun, getFailures, recordFailures, removeFailures, resetDigestRunsMemory } = await import("./digestRuns");

const THREE_DAYS = 3 * 24 * 60 * 60;
const SEVEN_DAYS = 7 * 24 * 60 * 60;

describe.each([
  ["Upstash", true],
  ["no Upstash (in-memory dev fallback)", false],
])("digest runs, %s", (_label, enabled) => {
  beforeEach(() => {
    fake.enabled = enabled;
    fake.store.clear();
    fake.ttls.clear();
    resetDigestRunsMemory();
  });

  it("claims a day once; a second claim that day is refused", async () => {
    expect(await claimRun("email", "2026-09-27")).toBe(true);
    expect(await claimRun("email", "2026-09-27")).toBe(false);
  });

  it("keeps email and Bluesky, and different days, independent", async () => {
    expect(await claimRun("email", "2026-09-27")).toBe(true);
    expect(await claimRun("bluesky", "2026-09-27")).toBe(true);
    expect(await claimRun("email", "2026-09-28")).toBe(true);
  });

  it("force re-claims a day that already ran", async () => {
    await claimRun("email", "2026-09-27");
    expect(await claimRun("email", "2026-09-27", { force: true })).toBe(true);
    expect(await claimRun("email", "2026-09-27")).toBe(false);
  });

  it("records a day's failures, replacing the previous set, and clears it when empty", async () => {
    await recordFailures("2026-09-27", ["a@example.com", "b@example.com"]);
    expect((await getFailures("2026-09-27")).sort()).toEqual(["a@example.com", "b@example.com"]);
    await recordFailures("2026-09-27", ["b@example.com"]);
    expect(await getFailures("2026-09-27")).toEqual(["b@example.com"]);
    await recordFailures("2026-09-27", []);
    expect(await getFailures("2026-09-27")).toEqual([]);
    expect(await getFailures("2026-09-28")).toEqual([]);
  });

  it("removes addresses one chunk at a time as a resend succeeds, so a second resend skips them", async () => {
    await recordFailures("2026-09-27", ["a@example.com", "b@example.com", "c@example.com"]);
    await removeFailures("2026-09-27", ["a@example.com"]);
    await removeFailures("2026-09-27", ["c@example.com", "not-there@example.com"]);
    expect(await getFailures("2026-09-27")).toEqual(["b@example.com"]);
    await removeFailures("2026-09-27", []);
    expect(await getFailures("2026-09-27")).toEqual(["b@example.com"]);
  });
});

describe("digest runs, Upstash keys", () => {
  beforeEach(() => {
    fake.enabled = true;
    fake.store.clear();
    fake.ttls.clear();
  });

  it("uses SET NX with a 3-day TTL for locks and a 7-day TTL for failures, under curio:digest:", async () => {
    await claimRun("email", "2026-09-27");
    await claimRun("bluesky", "2026-09-27");
    await recordFailures("2026-09-27", ["a@example.com"]);
    expect(fake.set).toHaveBeenCalledWith("curio:digest:run:2026-09-27", expect.any(String), { nx: true, ex: THREE_DAYS });
    expect(fake.ttls.get("curio:digest:bluesky:2026-09-27")).toBe(THREE_DAYS);
    expect(fake.ttls.get("curio:digest:failed:2026-09-27")).toBe(SEVEN_DAYS);
  });
});
```

- [ ] **Step 2: Run it to check it fails.** `npx vitest run lib/digestRuns.test.ts` → FAIL, because the module is missing.

- [ ] **Step 3: Implement** `lib/digestRuns.ts`:

```ts
import { redis } from "./redis";

/** Long enough to outlive any same-day re-run or next-morning debugging,
 * short enough that the keys clean themselves up. */
const RUN_TTL_SECONDS = 3 * 24 * 60 * 60;
/** Failures keep longer: a week's grace to notice and `?resend=failed`. */
const FAILURES_TTL_SECONDS = 7 * 24 * 60 * 60;

export type Channel = "email" | "bluesky";

const runKey = (channel: Channel, day: string) =>
  channel === "email" ? `curio:digest:run:${day}` : `curio:digest:bluesky:${day}`;
const failuresKey = (day: string) => `curio:digest:failed:${day}`;

// Without Upstash (local dev) these live in the dev server's memory: a
// second run against the same `next dev` is still a no-op, and a restart
// forgets. Production always has Upstash.
const memoryRuns = new Set<string>();
const memoryFailures = new Map<string, string[]>();

export function resetDigestRunsMemory(): void {
  memoryRuns.clear();
  memoryFailures.clear();
}

/** Claims today's run for one channel. Claimed *before* sending, so a
 * concurrent or repeated run (a manual "Run" in Vercel's Cron Jobs page)
 * can't double-send; the claim stays even after a partial failure, and
 * the failures are re-sent via getFailures/removeFailures instead. */
export async function claimRun(channel: Channel, day: string, opts: { force?: boolean } = {}): Promise<boolean> {
  const key = runKey(channel, day);
  const value = new Date().toISOString();
  if (!redis) {
    if (!opts.force && memoryRuns.has(key)) return false;
    memoryRuns.add(key);
    return true;
  }
  if (opts.force) {
    await redis.set(key, value, { ex: RUN_TTL_SECONDS });
    return true;
  }
  return (await redis.set(key, value, { nx: true, ex: RUN_TTL_SECONDS })) === "OK";
}

/** Replaces the day's set of addresses whose digest failed after retries.
 * Stored, never logged. */
export async function recordFailures(day: string, emails: string[]): Promise<void> {
  const key = failuresKey(day);
  if (!redis) {
    memoryFailures.set(key, [...emails]);
    return;
  }
  await redis.del(key);
  if (emails.length > 0) {
    await redis.sadd(key, emails[0], ...emails.slice(1));
    await redis.expire(key, FAILURES_TTL_SECONDS);
  }
}

/** Forgets addresses as a `?resend=failed` run's chunks succeed, so a
 * second resend (even after one that died partway) never double-sends. */
export async function removeFailures(day: string, emails: string[]): Promise<void> {
  if (emails.length === 0) return;
  const key = failuresKey(day);
  if (!redis) {
    const gone = new Set(emails);
    memoryFailures.set(key, (memoryFailures.get(key) ?? []).filter((e) => !gone.has(e)));
    return;
  }
  await redis.srem(key, emails[0], ...emails.slice(1));
}

export async function getFailures(day: string): Promise<string[]> {
  if (!redis) return [...(memoryFailures.get(failuresKey(day)) ?? [])];
  return redis.smembers<string[]>(failuresKey(day));
}
```

- [ ] **Step 4: Run it to check it passes.** `npx vitest run lib/digestRuns.test.ts` → PASS.
- [ ] **Step 5: Commit.**

```bash
git add lib/digestRuns.ts lib/digestRuns.test.ts
git commit -m "feat: per-day digest and Bluesky run locks, and a 7-day failed-recipient set

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: An idempotent cron with deliberate overrides and maxDuration

(Written after approval; Amendments 1–3 are built in.)

**Files:**
- Modify: `app/api/cron/send-daily/route.ts`, `app/api/cron/send-daily/route.test.ts`, `app/sharedDay.test.ts`

**Interfaces:**
- Consumes: `claimRun`, `recordFailures`, `removeFailures`, `getFailures` (Task 5); `sendDailyDigests` with `onSent` (Task 4); `dayKey` (`lib/day.ts`).
- Produces: `export const maxDuration = 300` and `GET /api/cron/send-daily`, which answers `{ word, attempted, sent, failed, bluesky, alreadyRan: { email, bluesky } }`, or 401/400/500 `{ error }`. Query forms, all requiring a valid `CRON_SECRET`:
  - none (scheduled);
  - `?force=1`: email only, bypassing the email lock. Bluesky still goes through its normal lock.
  - `?force=1&bluesky=1`: both locks bypassed.
  - `?resend=failed`: recorded failures who are still subscribed, never Bluesky.
  - Anything else with `bluesky=1`, or `force` together with `resend`, is a 400.

Per-channel `alreadyRan`: `email` is true only when a scheduled or forced run found today's email lock held (a forced run never does). `bluesky` is true only when a run that would have posted found today's Bluesky lock held. A `resend=failed` run always reports `{ email: false, bluesky: false }`.

- [ ] **Step 1: Write the failing tests.** In `app/api/cron/send-daily/route.test.ts`:
  - Add a Map-backed fake of `@/lib/redis`. It's the same object as Task 5's `fake` (`set` with `nx`/`ex`, `del`, `sadd`, `srem`, `smembers`, `expire`), created in `vi.hoisted` and always enabled. Clear its store in `beforeEach`.
  - Import `getAllSubscribers` from the mocked `@/lib/db`, and `const { maxDuration } = await import("./route");`.
  - Make the email mock report successes through `onSent`, like the real sender:
    ```ts
    vi.mock("@/lib/email", () => ({
      sendDailyDigests: vi.fn(
        async (emails: string[], _w: unknown, _d: Date, opts: { onSent?: (r: string[]) => Promise<void> }) => {
          if (emails.length > 0) await opts.onSent?.(emails);
          return { attempted: emails.length, sent: emails.length, failed: 0, errors: [], failedRecipients: [] };
        }
      ),
    }));
    ```
  - Change the first test's expected body to `{ word: "custard", attempted: 2, sent: 2, failed: 0, bluesky: true, alreadyRan: { email: false, bluesky: false } }`.
  - Add these tests:

```ts
function cronRequestTo(query: string, auth = "Bearer test-secret") {
  return new NextRequest(`http://localhost/api/cron/send-daily${query}`, {
    headers: auth ? { authorization: auth } : {},
  });
}

async function failBothThisMorning() {
  vi.mocked(sendDailyDigests).mockResolvedValueOnce({
    attempted: 2, sent: 0, failed: 2, errors: ["rate_limit_exceeded: x"],
    failedRecipients: ["anon@example.com", "account-holder@example.com"],
  });
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await GET(cronRequest());
  error.mockRestore();
}

it("pins maxDuration to the Hobby plan's ceiling", () => {
  expect(maxDuration).toBe(300);
});

it("a second run the same UTC day is a no-op on both channels", async () => {
  await GET(cronRequest());
  const body = await (await GET(cronRequest())).json();

  expect(sendDailyDigests).toHaveBeenCalledTimes(1);
  expect(postDailyWordToBluesky).toHaveBeenCalledTimes(1);
  expect(body).toEqual({
    word: "custard", attempted: 0, sent: 0, failed: 0, bluesky: false,
    alreadyRan: { email: true, bluesky: true },
  });
});

it("?force=1 re-sends email only — no second Bluesky post — under a fresh idempotency key", async () => {
  await GET(cronRequest());
  const body = await (await GET(cronRequestTo("?force=1"))).json();

  expect(sendDailyDigests).toHaveBeenCalledTimes(2);
  expect(postDailyWordToBluesky).toHaveBeenCalledTimes(1);
  const [first, second] = vi.mocked(sendDailyDigests).mock.calls.map((c) => c[3].runKey);
  expect(second).not.toBe(first);
  expect(body).toMatchObject({ attempted: 2, sent: 2, bluesky: false, alreadyRan: { email: false, bluesky: true } });
});

it("?force=1&bluesky=1 re-sends and re-posts", async () => {
  await GET(cronRequest());
  const body = await (await GET(cronRequestTo("?force=1&bluesky=1"))).json();

  expect(sendDailyDigests).toHaveBeenCalledTimes(2);
  expect(postDailyWordToBluesky).toHaveBeenCalledTimes(2);
  expect(body).toMatchObject({ sent: 2, bluesky: true, alreadyRan: { email: false, bluesky: false } });
});

it("?force=1 still makes today's first Bluesky post if there hasn't been one", async () => {
  const body = await (await GET(cronRequestTo("?force=1"))).json();
  expect(postDailyWordToBluesky).toHaveBeenCalledTimes(1);
  expect(body).toMatchObject({ bluesky: true, alreadyRan: { email: false, bluesky: false } });
});

it.each(["?bluesky=1", "?resend=failed&bluesky=1", "?force=1&resend=failed"])(
  "rejects the malformed override %s with 400 and sends nothing",
  async (query) => {
    const res = await GET(cronRequestTo(query));
    expect(res.status).toBe(400);
    expect(sendDailyDigests).not.toHaveBeenCalled();
    expect(postDailyWordToBluesky).not.toHaveBeenCalled();
  }
);

it("?force=1 without the right secret is refused and sends nothing", async () => {
  await GET(cronRequest());
  vi.clearAllMocks();
  expect((await GET(cronRequestTo("?force=1", ""))).status).toBe(401);
  expect((await GET(cronRequestTo("?force=1&bluesky=1", "Bearer wrong"))).status).toBe(401);
  expect(sendDailyDigests).not.toHaveBeenCalled();
  expect(postDailyWordToBluesky).not.toHaveBeenCalled();
});

it("?force=1 and ?resend=failed are refused when no CRON_SECRET is configured at all (local dev)", async () => {
  vi.stubEnv("CRON_SECRET", "");
  try {
    expect((await GET(cronRequestTo("?force=1", ""))).status).toBe(401);
    expect((await GET(cronRequestTo("?resend=failed", ""))).status).toBe(401);
    expect(sendDailyDigests).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
  }
});

it("?resend=failed sends only to recorded failures who are still subscribed, and never posts", async () => {
  await failBothThisMorning();
  vi.mocked(getAllSubscribers).mockResolvedValueOnce(["account-holder@example.com"]); // anon unsubscribed since

  const body = await (await GET(cronRequestTo("?resend=failed"))).json();

  expect(vi.mocked(sendDailyDigests).mock.calls[1][0]).toEqual(["account-holder@example.com"]);
  expect(postDailyWordToBluesky).toHaveBeenCalledTimes(1); // this morning's only
  expect(body).toMatchObject({ attempted: 1, sent: 1, failed: 0, bluesky: false, alreadyRan: { email: false, bluesky: false } });
});

it("a second ?resend=failed never double-sends: successes leave the set as they happen", async () => {
  await failBothThisMorning();
  await GET(cronRequestTo("?resend=failed"));
  await GET(cronRequestTo("?resend=failed"));

  expect(vi.mocked(sendDailyDigests).mock.calls[1][0].sort()).toEqual(["account-holder@example.com", "anon@example.com"]);
  expect(vi.mocked(sendDailyDigests).mock.calls[2][0]).toEqual([]);
});

it("a ?resend=failed that dies partway leaves only the unsent addresses for the next one", async () => {
  await failBothThisMorning();
  vi.mocked(sendDailyDigests).mockImplementationOnce(async (emails, _w, _d, opts) => {
    await opts.onSent?.([emails[0]]); // first chunk went out…
    throw new Error("function killed"); // …then the run died
  });
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await GET(cronRequestTo("?resend=failed"));
  error.mockRestore();
  const firstResend = vi.mocked(sendDailyDigests).mock.calls[1][0];

  await GET(cronRequestTo("?resend=failed"));

  expect(vi.mocked(sendDailyDigests).mock.calls[2][0]).toEqual([firstResend[1]]);
});

it("the fail-closed refusal claims no lock, so the next run after the fix sends normally", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("UNSUBSCRIBE_SECRET", "");
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await GET(cronRequest());
  error.mockRestore();
  vi.stubEnv("UNSUBSCRIBE_SECRET", "now-set");
  try {
    const body = await (await GET(cronRequest())).json();
    expect(body).toMatchObject({ attempted: 2, sent: 2, bluesky: true, alreadyRan: { email: false, bluesky: false } });
  } finally {
    vi.unstubAllEnvs();
  }
});
```

  In `app/sharedDay.test.ts`, add `del`, `sadd`, `srem`, `smembers` and `expire` to `fakeRedis` (Task 5's implementations, over its existing `store`), and add `ex` to `set`'s option type. Its email mock gets the same `onSent`-calling factory as above. Its existing `fakeRedis.store.clear()` in `beforeEach` already resets the locks between surfaces.

- [ ] **Step 2: Run it to check it fails.** `npx vitest run app/api/cron app/sharedDay.test.ts` → FAIL: there's no `maxDuration`, no `alreadyRan`, and the second run still sends.

- [ ] **Step 3: Implement.** Replace `app/api/cron/send-daily/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAllSubscribers } from "@/lib/db";
import { sendDailyDigests } from "@/lib/email";
import { postDailyWordToBluesky } from "@/lib/bluesky";
import { resolveTodayWord } from "@/lib/words";
import { unsubscribeSecret } from "@/lib/unsubscribeToken";
import { claimRun, getFailures, recordFailures, removeFailures } from "@/lib/digestRuns";
import { dayKey } from "@/lib/day";

/** Vercel Hobby with Fluid compute allows up to 300s (the project default
 * is also 300; pinned here so a dashboard change can't cut a retrying send
 * short). The sender itself stops starting retries at SEND_BUDGET_MS, so
 * there's always time left to record failures and respond. */
export const maxDuration = 300;
const SEND_BUDGET_MS = 240_000;

/** Configured in vercel.json to run once a day at 0 9 * * * (9am UTC) — the
 * Vercel Hobby plan caps cron at once/day, so there is no per-hour bucket
 * to honor here even though Subscriber still carries an `hour` field
 * (vestigial — see lib/db.ts). Every subscriber — anonymous or an account
 * holder — gets the one shared word, the same word the site shows everyone
 * today and the same run posts to Bluesky, all resolved from one `now`.
 *
 * Idempotent per UTC day: email and Bluesky each claim a day lock before
 * sending, so a repeat (e.g. Vercel's manual "Run") is a no-op. Deliberate
 * overrides, all requiring CRON_SECRET (commands in handover.md):
 * - `?resend=failed` — only today's recorded failures who are still
 *   subscribed; each leaves the set as its chunk succeeds. Never posts.
 * - `?force=1` — every subscriber again. Bluesky still only posts if it
 *   hasn't today...
 * - `?force=1&bluesky=1` — ...unless this is added. */
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

  const params = req.nextUrl.searchParams;
  const force = params.get("force") === "1";
  const resendFailed = params.get("resend") === "failed";
  const repostBluesky = params.get("bluesky") === "1";
  if ((force || resendFailed || repostBluesky) && !secret) {
    return NextResponse.json({ error: "Overrides require CRON_SECRET" }, { status: 401 });
  }
  if ((force && resendFailed) || (repostBluesky && !force)) {
    return NextResponse.json(
      { error: "Use force=1 (optionally with bluesky=1) or resend=failed" },
      { status: 400 }
    );
  }

  // Unverifiable unsubscribe links must never go out. Checked before any
  // lock is claimed, so once the secret is set a plain re-run just works.
  const unsubscribe = unsubscribeSecret();
  if (!unsubscribe) {
    console.error("[curio:digest] UNSUBSCRIBE_SECRET is not set in production — refusing to send today's digest or post to Bluesky");
    return NextResponse.json({ error: "UNSUBSCRIBE_SECRET is not configured" }, { status: 500 });
  }

  const started = Date.now();
  const now = new Date();
  const day = dayKey(now);
  const word = await resolveTodayWord(now);
  // Read before claiming anything: a failed read must not leave a lock
  // behind with nothing sent.
  const subscribers = await getAllSubscribers();
  const recipients = resendFailed
    ? (await getFailures(day)).filter((email) => subscribers.includes(email))
    : subscribers;

  const mode = resendFailed ? "resend-failed" : force ? "force" : "scheduled";
  const sendEmail = resendFailed || (await claimRun("email", day, { force }));
  const postBluesky = !resendFailed && (await claimRun("bluesky", day, { force: repostBluesky }));
  const alreadyRan = { email: !resendFailed && !sendEmail, bluesky: !resendFailed && !postBluesky };

  if (!sendEmail && !postBluesky) {
    console.log(`[curio:digest] ${day} already ran; nothing to do`);
    return NextResponse.json({ word: word.slug, attempted: 0, sent: 0, failed: 0, bluesky: false, alreadyRan });
  }

  // "scheduled" is stable within the day; overrides get a unique key, or
  // Resend would dedupe a deliberate re-send against the morning's run.
  const runKey = `curio-digest-${day}-${mode === "scheduled" ? "scheduled" : `${mode}-${started}`}`;
  const [emailResult, blueskyResult] = await Promise.allSettled([
    sendEmail
      ? sendDailyDigests(recipients, word, now, {
          secret: unsubscribe,
          runKey,
          deadline: started + SEND_BUDGET_MS,
          // A resend forgets each address as its chunk succeeds, so a second
          // resend (even after this one dies) can't double-send.
          onSent: resendFailed ? (sent) => removeFailures(day, sent) : undefined,
        })
      : Promise.resolve({ attempted: 0, sent: 0, failed: 0, errors: [], failedRecipients: [] }),
    postBluesky ? postDailyWordToBluesky(word, now) : Promise.resolve({ posted: false }),
  ]);

  const email =
    emailResult.status === "fulfilled"
      ? emailResult.value
      : { attempted: recipients.length, sent: 0, failed: recipients.length, errors: [String(emailResult.reason)], failedRecipients: recipients };
  // Scheduled and forced runs replace the set with their own failures. A
  // resend only ever removes from it (above): its failures are already in it.
  if (sendEmail && !resendFailed) await recordFailures(day, email.failedRecipients);
  if (email.failed > 0) {
    console.error(`[curio:digest] ${mode} ${day}: ${email.failed} of ${email.attempted} digests failed:`, email.errors);
  }
  const bluesky = blueskyResult.status === "fulfilled" ? blueskyResult.value.posted : false;
  console.log(
    `[curio:digest] ${mode} ${day}: sent ${email.sent} of ${email.attempted}; bluesky ${postBluesky ? (bluesky ? "posted" : "failed") : "skipped"}`
  );

  return NextResponse.json({
    word: word.slug,
    attempted: email.attempted,
    sent: email.sent,
    failed: email.failed,
    bluesky,
    alreadyRan,
  });
}
```

A dying resend's `emailResult` rejection counts every recipient as failed in the *response*, but the set only loses addresses that `onSent` confirmed, so the next resend sends exactly the rest. That's what the "dies partway" test pins. Task 4's "logs the failure count" test still matches (`"1 of 2"`, and no `@example.com` in the logs).

- [ ] **Step 4: Run everything.** `npx vitest run` → all pass. The count is the 205 baseline plus the new tests; the final report states the exact number.
- [ ] **Step 5: Commit.**

```bash
git add app/api/cron/send-daily app/sharedDay.test.ts
git commit -m "feat: idempotent daily cron — per-channel locks, force/bluesky/resend-failed overrides, maxDuration

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Docs

**Files:** `README.md`, `handover.md` (`.env.example` was done in Task 1)

- [ ] **Step 1: README.**
  - In "What's implemented" → "Email digest", replace the sentence starting `` `/api/cron/send-daily` (wired to run hourly `` through `…every email includes.` with: "`/api/cron/send-daily` runs once a day at 09:00 UTC (`vercel.json`; the Hobby plan allows one run a day) and sends every subscriber the day's shared word through Resend's batch endpoint. It's idempotent per UTC day (`?resend=failed`, `?force=1` and `?force=1&bluesky=1`, all with `CRON_SECRET`, for deliberate re-sends; see `handover.md`). Every digest carries a signed unsubscribe link plus `List-Unsubscribe` / one-click headers; opening the link shows a confirm page, and only its button (or a mail app's one-click) unsubscribes."
  - In "Deploying", change "`vercel.json` already configures the hourly cron" to "`vercel.json` already configures the daily cron". In step 2's variable list add `UNSUBSCRIBE_SECRET` (required: without it the daily send refuses to run).
  - In "Open items", delete the bullet "The unsubscribe link uses a base64 token (not signed/HMAC'd) — fine for a v1, worth hardening before wider traffic."
- [ ] **Step 2: `handover.md`.**
  - Update the "Last updated" line.
  - Add `UNSUBSCRIBE_SECRET` to the required-vars block, with its generation command. Add a paragraph like the `CRON_SECRET` one: the digest fails closed without it in production, and changing it breaks every unsubscribe link already sent.
  - In the "Architecture map" `lib/userData.ts` bullet, update the prefix rule to include `curio:wordoftheday:` and `curio:digest:` (Flag 1). Add bullets for `lib/unsubscribeToken.ts`, `lib/digestSend.ts` and `lib/digestRuns.ts`. Update the `lib/email.ts` bullet (it now uses `lib/siteUrl.ts`) and the `lib/siteUrl.ts` bullet (only `lib/bluesky.ts` still inlines the fallback).
  - In "Domain cutover", rewrite the gotcha: Vercel's manual **Run** is now a no-op on a day that has already run, and it can't add query parameters. Then add a subsection **"Re-sending the digest by hand (production)"** (Amendment 4) containing exactly:
    - **Where the secret comes from.** The production `CRON_SECRET` is a *sensitive* Vercel variable: neither the dashboard nor `vercel env pull` can show it. The current value is the one set in the 2026-09-27 rotation (Task 9) and is kept in the owner's password manager as "Curio CRON_SECRET (production)". `.env.local`'s `CRON_SECRET` is a different, local-only value. If the stored one is ever lost, rotate it with `vercel env add CRON_SECRET production --sensitive --force` and redeploy; Vercel Cron picks up the new value automatically.
    - **Loading it into a Git Bash shell without it landing in shell history:**
      ```bash
      read -rs CURIO_CRON_SECRET && export CURIO_CRON_SECRET   # paste, then Enter
      ```
    - **Commands** (same UTC day as the send; each prints the JSON response):
      ```bash
      # Only today's failed recipients who are still subscribed. Never posts to Bluesky. Safe to repeat.
      curl -sS -H "Authorization: Bearer $CURIO_CRON_SECRET" "https://curioword.com/api/cron/send-daily?resend=failed"

      # Every subscriber again. Bluesky posts only if it hasn't already today.
      curl -sS -H "Authorization: Bearer $CURIO_CRON_SECRET" "https://curioword.com/api/cron/send-daily?force=1"

      # Every subscriber again AND a second Bluesky post.
      curl -sS -H "Authorization: Bearer $CURIO_CRON_SECRET" "https://curioword.com/api/cron/send-daily?force=1&bluesky=1"
      ```
    - **Reading the response:** `attempted`/`sent`/`failed` are this run's email counts, `bluesky` is whether this run posted, and `alreadyRan: { email, bluesky }` says which channels were skipped because today's lock was already held. `failed > 0` → run `?resend=failed`. Today's failed addresses are in Upstash at `curio:digest:failed:<YYYY-MM-DD>` (7-day TTL, inspection only; see Amendments).
  - Add "## This session (2026-09-27): email hardening". Cover the plan path; what landed per task; the flag rulings; the partial-failure/re-send story; the dev-lock behaviour; the one-click-400 choice; that old emails' unsubscribe links now go to `ok=0`; the local real-send results; test and lint counts; and anything the final review caught.
  - "Deferred / parked items": add double opt-in on `/api/subscribe` (planned before public promotion); the unverified inbox-placement effect of the headers, to judge after a few weeks of sends alongside tightening DMARC; and the Resend account's real rate limit, if the owner hasn't confirmed it.
- [ ] **Step 3: Commit.**

```bash
git add README.md handover.md
git commit -m "docs: email hardening — handover session notes, README cron and unsubscribe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8 (controller, not a subagent): Review, clean verification, real local send

- [ ] **Step 1: Whole-branch review.** Run superpowers:requesting-code-review over `master..HEAD`. Fix every Critical/Important finding in a fix wave, one commit each, and re-review the fixes.
- [ ] **Step 2: Clean-install gates** (in the worktree): `rm -rf node_modules .next && npm ci`, then `npm test`, `npm run lint` (exactly the 3 baseline warnings) and `npm run build`. In the build's route table, confirm `/story/[slug]` is still `●` with 1,147 paths; `/unsubscribe` and `/api/unsubscribe` are `ƒ`; and `/unsubscribed`'s marker is unchanged. Confirm `git diff master -- app/account/page.tsx` is empty.
- [ ] **Step 3: Merge locally.** Remove `.next` from the worktree, fast-forward `master` to the branch in the main checkout, then remove the worktree (the handover's gotcha: a leftover worktree corrupts lint and test counts). Re-run `npx vitest run` from the main checkout to confirm the counts match.
- [ ] **Step 4: Real local send.** This never touches the production cron, Upstash or Bluesky.
  1. **Ask the owner for the test address.** The owner pastes a **restricted, sending-only** Resend key into `.env.local` as `RESEND_API_KEY` themselves; Claude never sees or asks for it. Do sub-step 2's backup *before* they edit, so the restore puts back the original key.
  2. Back up `.env.local` to `.env.local.bak-email-hardening` and `.data/subscribers.json` to `.data/subscribers.json.bak-email-hardening` (it currently holds 0 entries).
  3. In `.env.local`, comment out `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` and `BLUESKY_APP_PASSWORD`. Set `UNSUBSCRIBE_SECRET` to a freshly generated local value (not the future production one) and `CURIO_SITE_URL=http://localhost:3000`. Keep the local `CRON_SECRET`.
  4. `preview_start curio-dev`. Subscribe the test address with `curl -X POST localhost:3000/api/subscribe` (the local JSON store), then confirm `.data/subscribers.json` holds exactly that one address.
  5. Run the cron: `curl -H "Authorization: Bearer <local CRON_SECRET, read from .env.local, not echoed>" localhost:3000/api/cron/send-daily`. Expect `attempted: 1, sent: 1, failed: 0, alreadyRan: { email: false, bluesky: false }`, and a server log of `[curio:bluesky:dev-fallback]`. Run it again and expect `alreadyRan: { email: true, bluesky: true }` with no second email. (A sending-only key can't read Resend's logs, which is fine: the email arriving is the check.)
  6. The owner opens the email → "Show original", and confirms `List-Unsubscribe: <http://localhost:3000/api/unsubscribe?token=…>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. (Gmail's own unsubscribe button can't reach localhost, which is expected. One-click is exercised in sub-step 9 instead.)
  7. Open the email's link in the browser pane (`/api/unsubscribe?token=…`). It should land on `/unsubscribe`, showing the masked address. **Check `.data/subscribers.json` still contains the address.** Screenshot.
  8. Click **Unsubscribe**. It should land on `/unsubscribed?ok=1`, and `.data/subscribers.json` should no longer contain the address. Also check that a tampered token (flip the last character) goes to `ok=0`.
  9. Re-subscribe. Then `curl -i -X POST -H "Content-Type: application/x-www-form-urlencoded" -d "List-Unsubscribe=One-Click" "localhost:3000/api/unsubscribe?token=<token from the header>"` → `200`, and the address should be gone again.
  10. Remind the owner the restricted key can be revoked in Resend now. Restore `.env.local` and `.data/subscribers.json` from the backups and delete the backups. Stop the server (`preview_stop`), `rm -rf .next`, and check no stray `node` dev server is left.
- [ ] **Step 5: Optional signed-in check** (only if the owner wants it). With the real `.env.local` restored, the owner signs in in the browser pane (never Claude). Toggle Subscribe/Unsubscribe on `/account`. Note that this writes to shared production Upstash.
- [ ] **Step 6:** superpowers:verification-before-completion, then report to the owner. Include exact test/lint/build output, the screenshots, what was and wasn't verified live, and a reminder: **not pushed, not deployed**.

---

### Task 9 (controller, only after the owner explicitly approves): Deploy

- [ ] **Step 1: `UNSUBSCRIBE_SECRET` in Vercel Production, before any push.** Either the owner adds it in the dashboard as a *sensitive* variable, or, after the owner confirms in chat, generate one with `node -e "…randomBytes(32)…"` and pipe it into `vercel env add UNSUBSCRIBE_SECRET production --sensitive` without echoing it. Verify with `vercel env ls production` (the name is listed; the value isn't printed).
- [ ] **Step 1b: Rotate `CRON_SECRET` to a value the owner keeps (Flag 13, Amendment 4).** The owner generates a value (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`) in their own terminal and saves it in their password manager as "Curio CRON_SECRET (production)". Then either the owner replaces it in the dashboard, or Claude runs `vercel env add CRON_SECRET production --sensitive --force` (CLI 54 overwrites in place) with the owner pasting the value at the prompt. It takes effect with the Step 2 deploy; Vercel Cron sends the new value automatically. Until then the old value stays live, so nothing breaks in between.
- [ ] **Step 2: Timing.** Check the current UTC time and don't push between **08:45 and 09:15 UTC**. The push to `master` is the deploy.
- [ ] **Step 3: Post-deploy smoke checks** (none of them sends email):
  - `curl -sI "https://curioword.com/api/unsubscribe?token=bad"` → a redirect to `/unsubscribe?token=bad`, which then redirects to `/unsubscribed?ok=0`.
  - `https://curioword.com/robots.txt` lists `Disallow: /unsubscribe`.
  - `curl -s -X POST -d "List-Unsubscribe=One-Click" "https://curioword.com/api/unsubscribe?token=bad"` → 400.
  - Confirm the rotated secret works *without sending anything*: `curl -s -H "Authorization: Bearer $CURIO_CRON_SECRET" "https://curioword.com/api/cron/send-daily?bluesky=1"` → **400** (a malformed override is rejected *after* auth, so 400 proves the secret authenticated, where 401 would mean it didn't). Nothing is claimed or sent.
  - Don't trigger the cron.
- [ ] **Step 4: The next morning** (after 09:00 UTC): the Vercel function log for `/api/cron/send-daily` shows `sent N of N` and no `failed` line; the Resend logs show N delivered and no 429s. Record the result in `handover.md`'s session section and commit (push only if the owner says so).
