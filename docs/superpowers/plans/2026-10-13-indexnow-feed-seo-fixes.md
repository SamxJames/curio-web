# IndexNow, RSS feed and SEO fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get Curio's pages found and clicked more with no ongoing input from the owner: IndexNow pings from the daily cron (Bing, DuckDuckGo, Copilot, ChatGPT search), a `/feed.xml` of the last 30 days, and the top three on-page fixes from the 2026-10-13 audit.

**Architecture:** Pure builders in `lib/` (meta description, feed XML, IndexNow URL list) with thin route files in `app/`, matching `lib/seoRoutes.ts` → `app/sitemap.ts`. IndexNow runs from `/api/cron/send-daily` inside `after()`, so it starts only after the digest/Bluesky response is decided and can never change it; it claims its own Redis day lock and never throws.

**Tech Stack:** Next.js 16.3.4 (App Router, no Cache Components, so `export const revalidate` still works on route handlers), React 19, TypeScript, Vitest, `@upstash/redis`. **No new dependencies.**

**Spec:** this plan carries its own design. It argues from the Phase 1 audit (2026-10-13, owner-approved): Search Console impressions fell from about 1,300 to 300 a day as a normal post-launch re-rank. Sampled "lost" pages are still indexed and self-canonical. About 367 story URLs are "Discovered/unknown", `/words` is "Crawled – currently not indexed", most pages haven't been recrawled since 09-26, and pages at positions 8–12 get about 0% click-through.

## Global Constraints

- **Archive, never backlog** (`AGENTS.md`): no unseen counts, "you missed", streaks or completion copy anywhere, including feed copy.
- **Disclose honestly** wherever copy describes the stories: they are rewritten by a language model from Wiktionary data (CC BY-SA).
- **No new npm dependencies.** No new arbitrary Tailwind values, and no hand-rolled `<button>`/`<input>` (`docs/design-system.md`).
- **Local runs must not write to Redis.** Local dev shares production's Upstash. IndexNow is a no-op unless `VERCEL_ENV === "production"`. Verify the feed with the Upstash env vars absent (the worktree has no `.env.local`).
- **Never log secrets, tokens, raw fetch errors or Upstash error messages.** Log `err.name` and HTTP status only. The IndexNow key is public by design (it's served as a file), but it's still never logged.
- Redis keys use an existing prefix: `curio:digest:indexnow:<day>` (day lock) and `curio:digest:indexnow:submitted` (set of sitemap URLs already sent).
- `npm run lint`, `npx vitest run` and `npm run build` are clean after every task. One commit per task. **No `git push`, no merge** until the owner approves.
- Short *why* comments, matching the existing bar (see `lib/seoRoutes.ts`, `lib/digestRuns.ts`).
- Don't touch `lib/words.ts`'s locking layer or word content.

## File Structure

**New:**
- `lib/feed.ts` + `lib/feed.test.ts`: `buildFeedXml(days, now)`, pure RSS 2.0.
- `app/feed.xml/route.ts`: the last 30 shared days via `resolveHistory`, ISR hourly.
- `lib/indexNow.ts` + `lib/indexNow.test.ts`: `INDEXNOW_KEY`, `dailyIndexNowUrls(slug)`, `submitDailyIndexNow(slug, day, deps?)`.
- `public/3f5e065a4027a9dbca71664664e0b4f1.txt`: the key file (contents = the key, no newline).

**Modified:**
- `lib/storyTitle.ts` (+ test): `storyMetaDescription(word)`.
- `app/story/[slug]/page.tsx`: uses it for `description` (OG/Twitter keep the teaser).
- `app/play/page.tsx`, `app/history/page.tsx`, `app/attribution/page.tsx`, `app/words/page.tsx`: canonical and real descriptions.
- `components/Footer.tsx`: "Languages" link.
- `lib/seoRoutes.ts` (+ test): truthful `lastModified` on stories, language pages, `/words` and `/languages`; robots lists the feed as a second sitemap.
- `app/layout.tsx`: `<link rel="alternate" type="application/rss+xml">`.
- `lib/traffic.ts` (+ test): `rss` joins the tagged `utm_source` values.
- `app/api/cron/send-daily/route.ts` (+ test): `after(() => submitDailyIndexNow(...))`.

---

### Task 1: Meta descriptions that name the word, plus hub metadata and a Languages footer link

**Files:**
- Modify: `lib/storyTitle.ts`, `lib/storyTitle.test.ts`, `app/story/[slug]/page.tsx:20-45`, `app/play/page.tsx:4`, `app/history/page.tsx:7`, `app/attribution/page.tsx:1`, `app/words/page.tsx:4-8`, `components/Footer.tsx`

**Interfaces:**
- Produces: `storyMetaDescription(word: WordEntry): string` from `lib/storyTitle.ts`.

- [ ] **Step 1: Failing test** (append to `lib/storyTitle.test.ts`, reusing its `word()` helper; extend the import):

```ts
describe("storyMetaDescription", () => {
  it("leads with the word and 'etymology' so the snippet matches how people search", () => {
    const w = { ...word("jungle", ["Hindustani", "English"]), teaser: "A tangle of trees once meant dry, open land." };
    expect(storyMetaDescription(w)).toBe("Etymology of jungle: A tangle of trees once meant dry, open land.");
  });
  it("stays within ~170 characters for every word in the bank", () => {
    for (const w of WORDS) expect(storyMetaDescription(w).length).toBeLessThanOrEqual(175);
  });
});
```
(Import `WORDS` from `./words`. If the second assertion fails for real data, report the longest value. Don't truncate a teaser mid-sentence.)

- [ ] **Step 2:** `npx vitest run lib/storyTitle.test.ts`: FAIL (not exported).
- [ ] **Step 3: Implement** in `lib/storyTitle.ts`:

```ts
/** The story page's <meta name="description">. The teaser alone ("This unit of
 * loudness is quietly a fraction of something bigger.") never names the word,
 * and pages sitting at positions 8–12 were getting ~0% click-through. Leading
 * with "Etymology of <word>:" matches how people actually search (the demand
 * report's queries: "<word> etymology", "<word> origin"). OG/Twitter keep the
 * bare teaser: on a social card the word is already in the image. */
export function storyMetaDescription(word: WordEntry): string {
  return `Etymology of ${word.word}: ${word.teaser}`;
}
```
In `app/story/[slug]/page.tsx`, set the top-level `description` to `storyMetaDescription(word)`, and keep `word.teaser` for `openGraph.description` and `twitter.description`. Update the existing comment so it stays accurate.

- [ ] **Step 4: Hub metadata.** Replace each metadata export:
  - `app/play/page.tsx`: `{ title: "Daily puzzle — Curio", description: "A daily word puzzle: guess the word from up to three clues about where it came from. Free, no login, the same puzzle for everyone.", alternates: { canonical: "/play" } }`
  - `app/history/page.tsx`: `{ title: "History — Curio", description: "Every word Curio has featured so far, most recent first, each with its origin story.", alternates: { canonical: "/history" } }`
  - `app/attribution/page.tsx`: `{ title: "Attribution — Curio", description: "Where Curio's word origins come from: Wiktionary's etymology data (CC BY-SA), rewritten into short stories by a language model.", alternates: { canonical: "/attribution" } }`
  - `app/words/page.tsx` description only: `"Every English word Curio has an origin story for, A to Z: where each one came from and the languages it passed through."`

- [ ] **Step 5: Footer.** In `components/Footer.tsx`, add after the "All words" link:
```tsx
<Link href="/languages" className="hover:text-ink-soft">
  Languages
</Link>
```
Leave the `flex-wrap` comment true: it already allows more than three items.

- [ ] **Step 6:** `npx vitest run && npm run lint`: PASS.
- [ ] **Step 7: Commit** `feat(seo): meta descriptions name the word; canonicals on hub pages; footer Languages link`

---

### Task 2: Truthful `lastmod` in the sitemap

**Files:** Modify `lib/seoRoutes.ts`, `lib/seoRoutes.test.ts`

**Interfaces:**
- Produces: `SitemapEntry.lastModified?: string` (an ISO date, `YYYY-MM-DD`), and the exported `PAGES_UPDATED: { stories: string; languages: string; indexes: string }`.

Why this overturns the old "no lastModified" rule: that rule rejected a *build timestamp* as untrue. These dates are hand-set to the day each page type's HTML last changed materially (links, descriptions or content). They're true claims about the page, and Google uses lastmod to choose what to recrawl. **Bump them whenever a page type's template changes** (a new section, new links, metadata). Don't bump them for redeploys.

- [ ] **Step 1: Failing tests.** Replace `expect(entries.some((e) => "lastModified" in e)).toBe(false);` with assertions that:
  - every `/story/*` entry has `lastModified === PAGES_UPDATED.stories`;
  - every `/language/*` entry has `PAGES_UPDATED.languages`, and `/languages` and `/words` have `PAGES_UPDATED.indexes`;
  - `/`, `/play`, `/history` and `/attribution` have **no** `lastModified` (they change daily or haven't changed, and the sitemap is built once per deploy);
  - each `PAGES_UPDATED` value matches `/^\d{4}-\d{2}-\d{2}$/` and isn't in the future relative to `new Date()`.
  Update the `/languages` and language-page `toContainEqual` expectations to include `lastModified`.
- [ ] **Step 2:** run them: FAIL.
- [ ] **Step 3: Implement.** In `lib/seoRoutes.ts`:
```ts
/** The day each page type's HTML last changed in a way a crawler should
 * re-read (links, metadata, content), set by hand. Not a build time: a
 * redeploy that changes nothing must not claim a change. Bump the relevant
 * date in the same commit as the template change. Home, /play and /history
 * change daily and the sitemap is built once per deploy, so they carry none. */
export const PAGES_UPDATED = {
  // 2026-10-13: "Etymology of <word>:" descriptions and a Languages footer link.
  stories: "2026-10-13",
  // 2026-10-13: Languages footer link (pages first published 2026-10-12).
  languages: "2026-10-13",
  // /words and /languages: new description, footer link.
  indexes: "2026-10-13",
} as const;
```
Add `lastModified?: string` to `SitemapEntry`, set it on stories, language pages, `/languages` and `/words`, and replace the old doc comment with one that explains the new rule. `MetadataRoute.Sitemap` accepts a string `lastModified`.
- [ ] **Step 4:** `npx vitest run lib/seoRoutes.test.ts && npm run lint`: PASS.
- [ ] **Step 5: Commit** `feat(seo): hand-set lastmod per page type in the sitemap`

---

### Task 3: `/feed.xml`, an RSS 2.0 feed of the last 30 days

**Files:**
- Create: `lib/feed.ts`, `lib/feed.test.ts`, `app/feed.xml/route.ts`
- Modify: `app/layout.tsx` (head link), `lib/seoRoutes.ts` + test (robots lists the feed), `lib/traffic.ts` + `lib/traffic.test.ts` (`rss` source)

**Interfaces:**
- Consumes: `HistoryDay` and `resolveHistory(today)` from `lib/words.ts`; `absoluteUrl`/`siteUrl` from `lib/siteUrl.ts`.
- Produces: `FEED_DAYS = 30`, `FEED_PATH = "/feed.xml"`, `buildFeedXml(days: HistoryDay[], now: Date): string`.

**Design:**
- **Pull archive only.** Items are the shared calendar's last 30 days (today first), each dated the day it was the word. There is no unread state and no counts.
- Item `link` = story URL + `?utm_source=rss`, so feed clicks show up as `rss` in `/admin`. `guid` (isPermaLink) = the bare story URL.
- Item `description` = escaped HTML: `<p>{teaser}</p><p>{origin}</p>`, plus a "Read the full story on Curio" link.
- **Channel description discloses the source:** "One word and the story of where it came from, every day. Stories are rewritten by a language model from Wiktionary's etymology data (CC BY-SA 4.0)."
- Includes `<atom:link rel="self">` (required by the W3C validator), `language`, `lastBuildDate`, `ttl` 60 and `copyright`.
- **The route** is `export const revalidate = 3600`: ISR, rebuilt at most hourly, with one Redis MGET per rebuild. Locally, with no Upstash vars, `resolveHistory` is pure, so verifying it writes nothing.

- [ ] **Step 1: Failing tests** `lib/feed.test.ts` (set `process.env.CURIO_SITE_URL = "https://curio.example"` in `beforeEach`, restore in `afterEach`). Build `HistoryDay` fixtures from real `WORDS[0..2]` with dates `2026-10-13`, `2026-10-12`, `2026-10-11`. Assert:
  - the output starts with `<?xml version="1.0" encoding="UTF-8"?>` and contains `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">`;
  - `<atom:link href="https://curio.example/feed.xml" rel="self" type="application/rss+xml"/>`;
  - one `<item>` per day, in input order, with `<pubDate>` equal to `new Date("2026-10-13T00:00:00Z").toUTCString()`;
  - `<link>https://curio.example/story/<slug>?utm_source=rss</link>` and `<guid isPermaLink="true">https://curio.example/story/<slug></guid>`;
  - escaping: a fixture word with teaser `Fish & chips <b>"quoted"</b>` produces no raw `<b>` and no bare `&` inside `<description>` (match `&amp;`), and `buildFeedXml` output parses: assert the count of `<item>` equals the count of `</item>`;
  - the channel description contains "language model" and "Wiktionary";
  - copy guard: the lowercased output contains none of `missed`, `unread`, `streak`, `catch up`.
- [ ] **Step 2:** `npx vitest run lib/feed.test.ts`: FAIL.
- [ ] **Step 3: Implement `lib/feed.ts`:**
```ts
import type { HistoryDay } from "./words";
import { absoluteUrl } from "./siteUrl";

export const FEED_DAYS = 30;
export const FEED_PATH = "/feed.xml";

const FEED_DESCRIPTION =
  "One word and the story of where it came from, every day. Stories are rewritten by a language model from Wiktionary's etymology data (CC BY-SA 4.0).";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** RSS 2.0 for the shared calendar's most recent days. Pull archive only:
 * every item is a day that has already happened, dated the day it was the
 * word, newest first. Nothing here knows or says what a reader has seen. */
export function buildFeedXml(days: HistoryDay[], now: Date): string {
  const items = days.map(({ date, word }) => {
    const url = absoluteUrl(`/story/${word.slug}`);
    const html = `<p>${escapeXml(word.teaser)}</p><p>${escapeXml(word.origin)}</p><p><a href="${url}?utm_source=rss">Read the full story on Curio</a></p>`;
    return [
      "<item>",
      `<title>${escapeXml(word.word)}</title>`,
      `<link>${url}?utm_source=rss</link>`,
      `<guid isPermaLink="true">${url}</guid>`,
      `<pubDate>${new Date(`${date}T00:00:00Z`).toUTCString()}</pubDate>`,
      `<description>${escapeXml(html)}</description>`,
      "</item>",
    ].join("");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    "<title>Curio: one word, one story, every day</title>",
    `<link>${absoluteUrl("/")}</link>`,
    `<description>${escapeXml(FEED_DESCRIPTION)}</description>`,
    "<language>en</language>",
    `<copyright>${escapeXml("Word origins adapted from Wiktionary, CC BY-SA 4.0. See " + absoluteUrl("/attribution"))}</copyright>`,
    `<lastBuildDate>${now.toUTCString()}</lastBuildDate>`,
    "<ttl>60</ttl>",
    `<atom:link href="${absoluteUrl(FEED_PATH)}" rel="self" type="application/rss+xml"/>`,
    ...items,
    "</channel>",
    "</rss>",
  ].join("\n");
}
```
Note: `absoluteUrl("/")` yields `https://curio.example/`.
- [ ] **Step 4: `app/feed.xml/route.ts`:**
```ts
import { buildFeedXml, FEED_DAYS } from "@/lib/feed";
import { resolveHistory } from "@/lib/words";

// Rebuilt at most hourly (ISR), so the new day's word appears within an
// hour of 00:00 UTC for one Redis MGET per rebuild, not per reader.
export const revalidate = 3600;

export async function GET() {
  const now = new Date();
  const days = (await resolveHistory(now)).slice(0, FEED_DAYS);
  return new Response(buildFeedXml(days, now), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
```
- [ ] **Step 5: Layout link.** In `app/layout.tsx`'s `<head>`, after `<SessionHintInit />`:
```tsx
{/* In <head> directly, not metadata.alternates: pages that set their own
    alternates.canonical would replace the layout's alternates object and
    drop the feed link. */}
<link rel="alternate" type="application/rss+xml" title="Curio" href={absoluteUrl(FEED_PATH)} />
```
(Import `absoluteUrl` alongside `siteUrl`, and `FEED_PATH` from `@/lib/feed`.)
- [ ] **Step 6: Robots.** Change `RobotsConfig.sitemap` to `string[]` and return `[absoluteUrl("/sitemap.xml"), absoluteUrl(FEED_PATH)]`. Google and Bing both accept an RSS 2.0 feed as a sitemap, and a short recent-items feed is Google's recommended companion to the full sitemap for recrawl freshness. Update `lib/seoRoutes.test.ts`'s robots expectation.
- [ ] **Step 7: Traffic source.** Add `"rss"` to `TRAFFIC_SOURCES` (after `"share"`) and to `TAGGED` in `lib/traffic.ts`. Add `expect(classifySource("?utm_source=rss", "", HOST)).toBe("rss");` to `lib/traffic.test.ts`. Grep for any test or exhaustive switch that enumerates the sources (`lib/trafficStats*`, `lib/adminStats*`, `components/AdminDashboard.tsx` read-only check) and update it.
- [ ] **Step 8:** `npx vitest run && npm run lint`: PASS.
- [ ] **Step 9: Commit** `feat: /feed.xml with the last 30 days; feed link in <head>; feed listed in robots; rss traffic source`

---

### Task 4: IndexNow from the daily cron

**Files:**
- Create: `lib/indexNow.ts`, `lib/indexNow.test.ts`, `public/3f5e065a4027a9dbca71664664e0b4f1.txt`
- Modify: `app/api/cron/send-daily/route.ts`, `app/api/cron/send-daily/route.test.ts`

**Interfaces:**
- Consumes: `buildSitemapEntries()` from `lib/seoRoutes.ts`; `redis` from `lib/redis.ts`; `absoluteUrl`/`siteUrl`.
- Produces: `INDEXNOW_KEY`, `INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"`, `dailyIndexNowUrls(todaySlug: string): string[]`, and
  `submitDailyIndexNow(todaySlug: string, day: string, deps?: { fetcher?: typeof fetch }): Promise<IndexNowOutcome>` where `type IndexNowOutcome = "skipped" | "already-ran" | "submitted" | "failed"`. **It never rejects.**

**Behaviour:**
1. Not production (`process.env.VERCEL_ENV !== "production"`), no `redis`, or `siteUrl()` isn't `https://`: log `[curio:indexnow] skipped (<reason>)` and return `"skipped"`. No network, no Redis.
2. Claim `curio:digest:indexnow:<day>` with `SET NX EX 259200` (3 days). If not claimed, return `"already-ran"`.
3. URLs = today's changing pages (`/`, `/play`, `/story/<today>`) plus every sitemap URL **not yet** in `curio:digest:indexnow:submitted`, found with one `SMISMEMBER`. The first production run sends the whole sitemap once (about 1,214 URLs). After that, each deploy's new language pages or words go out the next morning. De-duplicate, and cap at 10,000 (the protocol limit).
4. POST JSON `{ host, key, keyLocation, urlList }` to the endpoint with `AbortSignal.timeout(10_000)`.
5. On HTTP 200 or 202: `SADD` the newly sent sitemap URLs to the submitted set (no TTL: it's a permanent ledger), log `[curio:indexnow] <day>: submitted <n> URLs (HTTP <status>)`, and return `"submitted"`.
6. Any other status, or a throw anywhere after the claim: log only the status or `err.name`, release the day lock (`DEL`, best effort) so a plain manual re-run of the cron retries, and return `"failed"`. Never log the key, the URL list or a raw error.
7. The whole body sits in `try/catch`, so nothing escapes.

- [ ] **Step 1: Key file.** Create `public/3f5e065a4027a9dbca71664664e0b4f1.txt` containing exactly `3f5e065a4027a9dbca71664664e0b4f1` (no trailing newline: `printf`, not `echo`).
- [ ] **Step 2: Failing tests** `lib/indexNow.test.ts`. Mock `./redis` with an in-memory fake (`set` with nx, `del`, `sadd`, `smismember`), following `app/api/cron/send-daily/route.test.ts`'s `vi.hoisted` pattern. Stub `VERCEL_ENV` with `vi.stubEnv` and set `CURIO_SITE_URL = "https://curio.example"`. Pass a `vi.fn()` fetcher. Cases:
  - not production → `"skipped"`, fetcher never called, no Redis calls;
  - production, `CURIO_SITE_URL` = `http://localhost:3000` → `"skipped"`;
  - first run → one POST to `INDEXNOW_ENDPOINT`; the body's `host` is `curio.example`, `key` is `INDEXNOW_KEY`, `keyLocation` is `https://curio.example/<key>.txt`; `urlList` contains today's story, `/`, `/play` and every sitemap URL, with no duplicates; returns `"submitted"`; the submitted set now holds every sitemap URL;
  - second call, same day → `"already-ran"`, no fetch;
  - next day, sitemap already submitted → `urlList` is exactly `/`, `/play` and the new day's story (3 URLs);
  - HTTP 429 → `"failed"`, day lock released (a retry the same day POSTs again), submitted set unchanged;
  - fetcher throws `new TypeError("fetch failed: token=abc")` → `"failed"`; `console.error`/`console.log` were never called with a string containing `abc`, the key or `https://curio.example/story`; lock released;
  - `smismember` rejects → `"failed"`, never throws.
- [ ] **Step 3:** run: FAIL.
- [ ] **Step 4: Implement `lib/indexNow.ts`:**
```ts
import { redis } from "./redis";
import { absoluteUrl, siteUrl } from "./siteUrl";
import { buildSitemapEntries } from "./seoRoutes";

/** IndexNow (Bing, Yandex, Seznam, Naver; Bing's index also feeds
 * DuckDuckGo, Copilot and ChatGPT search). Google does not use IndexNow.
 * The key is public by design: it's served at /<key>.txt to prove we own
 * the host. Rotating it means a new public/ file and a new constant. */
export const INDEXNOW_KEY = "3f5e065a4027a9dbca71664664e0b4f1";
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS = 10_000;
const LOCK_TTL_SECONDS = 3 * 24 * 60 * 60;
const SUBMITTED_KEY = "curio:digest:indexnow:submitted";
const lockKey = (day: string) => `curio:digest:indexnow:${day}`;

export type IndexNowOutcome = "skipped" | "already-ran" | "submitted" | "failed";

/** The pages whose HTML changes every day. */
export function dailyIndexNowUrls(todaySlug: string): string[] {
  return [absoluteUrl("/"), absoluteUrl("/play"), absoluteUrl(`/story/${todaySlug}`)];
}

/** Called from the 09:00 cron inside after(). Never throws, so it can't
 * touch the digest or Bluesky. Once per UTC day (its own lock); a failed
 * submission releases the lock so a plain re-run of the cron retries. */
export async function submitDailyIndexNow(
  todaySlug: string,
  day: string,
  deps: { fetcher?: typeof fetch } = {}
): Promise<IndexNowOutcome> {
  const fetcher = deps.fetcher ?? fetch;
  if (process.env.VERCEL_ENV !== "production") return skip("not production");
  if (!redis) return skip("no Redis");
  if (!siteUrl().startsWith("https://")) return skip("site URL is not https");

  let claimed = false;
  try {
    claimed = (await redis.set(lockKey(day), new Date().toISOString(), { nx: true, ex: LOCK_TTL_SECONDS })) === "OK";
    if (!claimed) return "already-ran";

    const sitemapUrls = buildSitemapEntries().map((e) => e.url);
    const seen = await redis.smismember(SUBMITTED_KEY, sitemapUrls);
    const unsent = sitemapUrls.filter((_, i) => !seen[i]);
    const urlList = [...new Set([...dailyIndexNowUrls(todaySlug), ...unsent])].slice(0, MAX_URLS);

    const response = await fetcher(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: new URL(siteUrl()).host,
        key: INDEXNOW_KEY,
        keyLocation: absoluteUrl(`/${INDEXNOW_KEY}.txt`),
        urlList,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status !== 200 && response.status !== 202) {
      console.error(`[curio:indexnow] ${day}: HTTP ${response.status}; lock released for a retry`);
      await release(day);
      return "failed";
    }
    const sentFromSitemap = unsent.filter((u) => urlList.includes(u));
    if (sentFromSitemap.length > 0) await redis.sadd(SUBMITTED_KEY, ...(sentFromSitemap as [string, ...string[]]));
    console.log(`[curio:indexnow] ${day}: submitted ${urlList.length} URLs (HTTP ${response.status})`);
    return "submitted";
  } catch (err) {
    // err.name only: a raw fetch or Upstash error can carry URLs or tokens.
    console.error(`[curio:indexnow] ${day}: ${err instanceof Error ? err.name : "error"}; lock released for a retry`);
    if (claimed) await release(day);
    return "failed";
  }
}

function skip(reason: string): IndexNowOutcome {
  console.log(`[curio:indexnow] skipped (${reason})`);
  return "skipped";
}

async function release(day: string): Promise<void> {
  await redis?.del(lockKey(day)).catch(() => {});
}
```
Note: if `sadd` throws after a 200, the catch releases the lock and returns `"failed"`, and the next run re-sends those URLs. That's harmless.
- [ ] **Step 5:** `npx vitest run lib/indexNow.test.ts`: PASS.
- [ ] **Step 6: Wire into the cron.** In `app/api/cron/send-daily/route.ts`, import `after` from `next/server` and `submitDailyIndexNow` from `@/lib/indexNow`. Directly after `const word = await resolveTodayWord(now);`, and before the `repost === "bluesky"` branch, add:
```ts
  // Search-engine ping (Bing & co.) for today's pages. after(): it runs once
  // the response is decided and can't delay, fail or alter the digest or the
  // Bluesky post. It has its own day lock, and resend/repost runs skip it.
  if (!resendFailed && repost === null) after(() => submitDailyIndexNow(word.slug, day));
```
Add a line to the route's doc comment that the run also pings IndexNow (see `lib/indexNow.ts`).
- [ ] **Step 7: Route tests.** In `route.test.ts`, add the mocks:
```ts
vi.mock("@/lib/indexNow", () => ({ submitDailyIndexNow: vi.fn(async () => "submitted") }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn((cb: () => unknown) => { void cb(); }),
}));
```
New cases:
  - a scheduled run calls `submitDailyIndexNow("custard", <today's dayKey>)` once, and its response JSON is unchanged;
  - `?resend=failed` and `?repost=bluesky` don't call it;
  - when `submitDailyIndexNow` resolves `"failed"`, the response still has `sent: 2, bluesky: true`.
  The whole existing suite must still pass unchanged.
- [ ] **Step 8:** `npx vitest run && npm run lint && npm run build` (build with `CURIO_SITE_URL=https://curioword.com` and **no Upstash vars**): all green. Confirm `public/<key>.txt` is in `.next` output by serving it locally (Task 5).
- [ ] **Step 9: Commit** `feat: IndexNow ping from the daily cron (fail-soft, once per UTC day, production only)`

---

### Task 5: Verification against real behaviour (controller, not a subagent)

- [ ] `npm run build` then `npm run start` in the worktree with `CURIO_SITE_URL=https://curioword.com` and no `.env.local` (so Redis is null and nothing can be written).
- [ ] `/feed.xml`: 200, `application/rss+xml`, 30 items, today's word first. Validate with the W3C Feed Validator's direct-input form (`https://validator.w3.org/feed/check.cgi`, POST `rawdata`).
- [ ] `/3f5e065a4027a9dbca71664664e0b4f1.txt` returns exactly the key.
- [ ] `/robots.txt` lists both sitemaps. `/sitemap.xml` has `<lastmod>` on stories, language pages, `/words` and `/languages` only.
- [ ] A story page's `<meta name="description">` starts "Etymology of". `og:description` is still the teaser. `<link rel="alternate" type="application/rss+xml">` is on home, a story and `/play`. `/play`, `/history` and `/attribution` have canonicals.
- [ ] The footer at 375px in the browser pane: four items wrap cleanly and the attribution link stays visible.
- [ ] `/api/cron/send-daily` is **not** called locally (it would send email). IndexNow's production path is covered by unit tests, and checked live after deploy.
- [ ] Stop the server and `rm -rf .next`.

### Task 6: Docs (controller)

- [ ] `docs/handover/architecture.md`: IndexNow (key, keys, lock, ledger, how to rotate), the feed.
- [ ] `docs/handover/decisions.md`: "2026-10-13: hand-set lastmod per page type" (supersedes the no-lastmod comment), with the reasoning.
- [ ] `docs/handover/operations.md`: how to force a retry (a plain re-run of the 09:00 cron after a failed ping; `DEL curio:digest:indexnow:<day>` is never needed), and checking the result in Vercel logs (`[curio:indexnow]`).
- [ ] `handover.md` Current state / Open threads (replace, don't append) and a `docs/handover/history.md` entry happen at session end.
