# Bluesky Link Cards (Pre-launch Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every code task uses superpowers:test-driven-development.

**Goal:** Make the daily Bluesky post read like the word's story rather than a link dump. The post is the teaser, then `word · Latin → … → English`, then `#etymology #wordoftheday`. The story link moves out of the text into a link card with the word's own image. A dry-run script lets the owner read the next 7 days' posts before anything goes out.

**Architecture:** `lib/bluesky.ts` keeps its two responsibilities, split more cleanly:
- **Pure builders**, tested without a network: `buildBlueskyPost(word)` for the post text, measured in graphemes as Bluesky does, and `buildStoryCard(word)` for the card's link, title, description and thumbnail URL.
- **`postDailyWordToBluesky`**, which does the network calls. It fetches the story's existing Open Graph image (`/story/<slug>/opengraph-image`, about 60 KB PNG), uploads it as a blob, and posts with an `app.bsky.embed.external` embed. If the thumbnail fails, it still posts, just without the image.

A pure `buildBlueskyPreview(from, days)` feeds a thin `npm run bluesky:preview` script. It reads the shared calendar formula and never locks, posts or touches Redis. Optionally (Task 4, owner's call), the cron gains a Bluesky-only re-post, `?repost=bluesky`, closing the email work's known limitation.

**Tech Stack:** Next.js 16.3.4, TypeScript, `@atproto/api` 0.20.44 (`AtpAgent`, `RichText`, `uploadBlob`, `AppBskyFeedPost.validateRecord`), `Intl.Segmenter`, Vitest, `tsx` for scripts.

**Spec:** Phase 3 of the owner's 2026-09-26 pre-launch brief, as recorded in `handover.md` ("Phase 3 (Bluesky) format chosen 2026-09-26: (a) …") and carried in the "Brief" section below with this session's findings.

## Brief

**Owner's decisions (2026-09-26):**
- Post format **(a)**: the teaser first, then `word · lineage arrows`, then `#etymology #wordoftheday`, with the link in an embed card rather than the text.
- The earlier session measured that this fits 300 graphemes for every word in the bank; the longest is 291, "wine".
- Before deploying, a dry-run script prints the next 7 days' posts for the owner's approval.

**Found this session (checked against the installed packages and live site, 2026-09-28):**
- **Fits in 300, confirmed:** re-measured with `Intl.Segmenter` over all 1,147 words, the format tops out at **291** (`wine`, with 8 languages). None goes over 300, lineage lengths run from 1 to 9 languages, and the longest teaser is 151.
- **The embed:** `app.bsky.embed.external` is `{ uri, title, description, thumb? }`. The `thumb` is a blob accepting `image/*` with `maxSize: 1000000` (`@atproto/api` lexicons).
- **The thumbnail image:** the live story Open Graph image (`https://curioword.com/story/fiasco/opengraph-image`) is `image/png`, 59,662 bytes, 1200×630.
- **Record validation:** `AppBskyFeedPost.validateRecord({...})` validates a post with an external embed. Tests use it, so a malformed record fails CI, not the public timeline.
- **The existing tests:** `lib/bluesky.test.ts` mocks `AtpAgent` and `RichText`, and `app/sharedDay.test.ts` asserts that the posted text contains the day's word. That still holds in the new format.

### Decisions for the owner (proposed defaults; say if you want otherwise)

1. **Card title and description.**
   - **Title:** `{word}: the origin of the word — Curio`, the story page's own title, shared through one function so they can't drift apart.
   - **Description:** the story page uses the teaser, but the teaser is already the post's first line, so repeating it in the card is redundant. **Proposed:** `One word's origin story, every morning. No feed, no backlog.`, the front-door line from Phase 2, which also tells a stranger what Curio is.
   - **Alternative:** use the teaser, matching what Bluesky would show for a pasted link.
2. **Card link.** It keeps today's UTM tags (`utm_source=bluesky&utm_medium=social&utm_campaign=daily-word`), so Analytics still attributes the visit.
3. **If the thumbnail fails, post anyway.** A failed image fetch or upload (timeout, over 1 MB, not an image) posts the card without an image and logs it. The daily post never fails because of the thumbnail.
4. **Task 4 (optional): a Bluesky-only re-post, `?repost=bluesky`.** Today a failed Bluesky post can only be retried with `?force=1&bluesky=1`, which also re-emails everyone.
   - **Proposed:** `?repost=bluesky` (valid `CRON_SECRET` only). It forces the Bluesky lock and posts once. It sends no email and leaves the email lock and the pending set alone.
   - **Why a new parameter:** the deploy verification step just gave the owner a command that relies on `?bluesky=1` alone returning **400** without posting, so reusing `bluesky=1` for this would turn that safe check into a public post.
   - **Drop Task 4 if you'd rather keep the cron as it is.**
5. **The preview reads the formula, not the locks.** Each future day's word is locked the first time it's viewed, so the preview uses the pure calendar formula (`getWordForDate`) and writes nothing to Redis. The words it shows are the ones that will lock, unless someone approves new words into `WORDS` or edits `LAUNCH_OPENERS` before then. The script prints that caveat.

**Out of scope:** threads, images beyond the card thumbnail, alt text for the card (external embeds have no alt field), scheduling posts at any time other than the existing 09:00 UTC run, and changes to email.

## Global Constraints

- **Length:** post text is at most **300 graphemes**, measured with `Intl.Segmenter("en", { granularity: "grapheme" })`, the same unit Bluesky counts. The word and the lineage line are never truncated; only the teaser may be, as a fallback no current word needs.
- **Exact text format** (blank lines between the parts):
  `{teaser}\n\n{word} · {lineage joined with " → "}\n\n#etymology #wordoftheday`
- **No URL** in the post text. The link lives only in the card.
- **Absolute URLs** come from `lib/siteUrl.ts` (`siteUrl()` / `absoluteUrl()`), never a literal domain. This retires `lib/bluesky.ts`'s inline `CURIO_SITE_URL ?? localhost` fallback.
- **The Bluesky call must never throw into the cron.** Failures log `[curio:bluesky] post failed:` and return `{ posted: false }`, as today.
- **The preview is read-only:** it never posts, never touches Redis, and never resolves locks.
- Archive, never backlog (`AGENTS.md`). The preview shows *upcoming* days only, for the owner, and it isn't a user-facing surface.
- Short "why" comments, matching the surrounding code. npm only; no new dependencies.
- **Test commands:**
  - `npx vitest run` (baseline **313**);
  - `npm run lint` (baseline: exactly 3 warnings — `lib/puzzle.test.ts:3` and `scripts/approveDraft.test.ts:36,211`);
  - `npx tsc --noEmit -p tsconfig.json` (the only allowed error is the pre-existing `app/layout.tsx` LayoutProps one);
  - `npm run build`.
- **Lint quirk:** ESLint has no `argsIgnorePattern`, so `_`-prefixed unused parameters still warn.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work in a platform worktree and merge to `master` locally. **Never push** without the owner's go-ahead; a push to `master` deploys.

## File Structure

- `lib/storyTitle.ts` (new): `storyPageTitle(word)`, the one title string shared by the story page's metadata and the Bluesky card.
- `app/story/[slug]/page.tsx` (modify): use `storyPageTitle`.
- `lib/bluesky.ts` (modify): `graphemeLength`, `buildBlueskyPost(word)` (new signature, no URL), `buildStoryCard(word)`, `CARD_DESCRIPTION`, `THUMB_MAX_BYTES`, `THUMB_TIMEOUT_MS`, and `postDailyWordToBluesky` (embed plus thumbnail). It uses `lib/siteUrl.ts`.
- `lib/bluesky.test.ts` (modify): the new builders, the whole-bank length check, record validation, and the thumbnail success and fallback paths.
- `lib/blueskyPreview.ts` (new) + `lib/blueskyPreview.test.ts`: `buildBlueskyPreview(from, days)` → rows.
- `scripts/previewBlueskyPosts.ts` (new) + `package.json` script `bluesky:preview`.
- *(Task 4, optional)* `app/api/cron/send-daily/route.ts` + its test: `?repost=bluesky`.
- `handover.md`, `README.md`: docs.

---

### Task 1: The post text and the card, as pure builders

**Files:**
- Create: `lib/storyTitle.ts`
- Modify: `app/story/[slug]/page.tsx` (the `const title = …` line in `generateMetadata`)
- Modify: `lib/bluesky.ts` (replace `buildBlueskyPost` and `buildStoryUrl`; keep `postDailyWordToBluesky` compiling by passing the new builders through, with its network behaviour unchanged until Task 2)
- Test: `lib/bluesky.test.ts`

**Interfaces:**
- Produces (used by Tasks 2 and 3):
  - `storyPageTitle(word: WordEntry): string` → `` `${word.word}: the origin of the word — Curio` ``
  - `graphemeLength(text: string): number`
  - `buildBlueskyPost(word: WordEntry): string`
  - `type StoryCard = { uri: string; title: string; description: string; thumbUrl: string }`
  - `buildStoryCard(word: WordEntry): StoryCard`
  - `CARD_DESCRIPTION = "One word's origin story, every morning. No feed, no backlog."`

- [ ] **Step 1: Write the failing tests.** In `lib/bluesky.test.ts`, replace the `buildBlueskyPost` describe block. Keep the file's `word(teaser)` helper and its `@atproto/api` mock. Change the import to `const { buildBlueskyPost, buildStoryCard, graphemeLength, CARD_DESCRIPTION, postDailyWordToBluesky } = await import("./bluesky");`, and add `import { WORDS } from "./words";` and `import { storyPageTitle } from "./storyTitle";` at the top. Then add:

```ts
describe("buildBlueskyPost", () => {
  it("is the teaser, then word · lineage, then the hashtags — and no link", () => {
    expect(buildBlueskyPost(word("A short teaser."))).toBe(
      "A short teaser.\n\nquarantine · Latin → Italian → English\n\n#etymology #wordoftheday"
    );
  });

  it("fits every word in the bank in 300 graphemes without truncating anything", () => {
    for (const w of WORDS) {
      const post = buildBlueskyPost(w);
      expect(graphemeLength(post)).toBeLessThanOrEqual(300);
      expect(post.startsWith(w.teaser)).toBe(true);
      expect(post).not.toContain("…");
    }
  });

  it("truncates only the teaser, by graphemes, if a teaser were ever too long", () => {
    const post = buildBlueskyPost(word("T".repeat(400)));
    expect(graphemeLength(post)).toBeLessThanOrEqual(300);
    expect(post).toContain("…");
    expect(post).toContain("quarantine · Latin → Italian → English");
    expect(post.endsWith("#etymology #wordoftheday")).toBe(true);
  });

  it("counts graphemes, not UTF-16 units", () => {
    expect(graphemeLength("é👍🏽")).toBe(2);
  });
});

describe("buildStoryCard", () => {
  beforeEach(() => {
    process.env.CURIO_SITE_URL = "https://example.com/";
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("links the UTM-tagged story page, titled like the page itself", () => {
    const card = buildStoryCard(word("A teaser."));
    expect(card.uri).toBe(URL);
    expect(card.title).toBe(storyPageTitle(word("A teaser.")));
    expect(card.title).toBe("quarantine: the origin of the word — Curio");
    expect(card.description).toBe(CARD_DESCRIPTION);
    expect(card.thumbUrl).toBe("https://example.com/story/quarantine/opengraph-image");
  });
});
```

(Move `const ORIGINAL_ENV = { ...process.env };` above this block if it's currently declared later in the file. `URL` is the file's existing constant, `https://example.com/story/quarantine?utm_source=bluesky&utm_medium=social&utm_campaign=daily-word`. Its trailing-slash-free origin is what `siteUrl()` produces from `https://example.com/`.)

In the existing `postDailyWordToBluesky` success test, replace `expect(postedText).toContain(URL);` with `expect(postedText).not.toContain("http");` and `expect(postedText).toContain("#etymology #wordoftheday");`.

- [ ] **Step 2: Run to check they fail.** `npx vitest run lib/bluesky.test.ts` → FAIL: `buildStoryCard`, `graphemeLength` and `CARD_DESCRIPTION` aren't exported, and the format differs.

- [ ] **Step 3: Implement.** Create `lib/storyTitle.ts`:

```ts
import type { WordEntry } from "./words";

/** The story page's <title>/og:title. Shared with the Bluesky link card
 * (lib/bluesky.ts) so the card and the page it opens can't drift apart. */
export function storyPageTitle(word: WordEntry): string {
  return `${word.word}: the origin of the word — Curio`;
}
```

In `app/story/[slug]/page.tsx`, import it and change `const title = \`${word.word}: the origin of the word — Curio\`;` to `const title = storyPageTitle(word);`.

In `lib/bluesky.ts`, replace everything above `postDailyWordToBluesky` with the following (keep the `@atproto/api` import):

```ts
import { AtpAgent, RichText } from "@atproto/api";
import type { WordEntry } from "./words";
import { absoluteUrl } from "./siteUrl";
import { storyPageTitle } from "./storyTitle";

const MAX_GRAPHEMES = 300;
const ELLIPSIS = "…";
const HASHTAGS = "#etymology #wordoftheday";

/** The card's description. Not the teaser: that's already the post's first
 * line. This tells someone who's never heard of Curio what it is. */
export const CARD_DESCRIPTION = "One word's origin story, every morning. No feed, no backlog.";

const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

/** Bluesky's 300 limit counts graphemes, so "é" or a skin-toned emoji is
 * one, however many UTF-16 units it takes. */
export function graphemeLength(text: string): number {
  let n = 0;
  for (const _ of segmenter.segment(text)) n++;
  return n;
}

function sliceGraphemes(text: string, count: number): string {
  let out = "";
  let n = 0;
  for (const { segment } of segmenter.segment(text)) {
    if (n++ >= count) break;
    out += segment;
  }
  return out;
}

/** Format (a), chosen 2026-09-26: the teaser, then `word · Latin → … →
 * English`, then the hashtags. No link: it lives in the card (see
 * buildStoryCard). Every word in the bank fits (longest: "wine", 291), so
 * truncating the teaser is only a guard for future content. The word and
 * lineage are never cut. */
export function buildBlueskyPost(word: WordEntry): string {
  const tail = `\n\n${word.word} · ${word.lineage.join(" → ")}\n\n${HASHTAGS}`;
  const budget = MAX_GRAPHEMES - graphemeLength(tail);

  let teaser = word.teaser;
  if (graphemeLength(teaser) > budget) {
    teaser = sliceGraphemes(teaser, Math.max(0, budget - 1)).trimEnd() + ELLIPSIS;
  }
  return `${teaser}${tail}`;
}

export type StoryCard = { uri: string; title: string; description: string; thumbUrl: string };

/** The link card: the story page (UTM-tagged, as the link in the text used
 * to be), its own title, and its Open Graph image for a thumbnail. */
export function buildStoryCard(word: WordEntry): StoryCard {
  const url = new URL(absoluteUrl(`/story/${word.slug}`));
  url.searchParams.set("utm_source", "bluesky");
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", "daily-word");
  return {
    uri: url.toString(),
    title: storyPageTitle(word),
    description: CARD_DESCRIPTION,
    thumbUrl: absoluteUrl(`/story/${word.slug}/opengraph-image`),
  };
}
```

(`graphemeLength`'s loop variable is unused. If lint flags `_`, write `for (const segment of segmenter.segment(text)) { void segment; n++; }` instead, or use `return [...segmenter.segment(text)].length;`. Pick whichever keeps lint at 3 warnings.)

In `postDailyWordToBluesky`, delete the `siteUrl`/`url` lines and change `const text = buildBlueskyPost(word, url);` to `const text = buildBlueskyPost(word);`. Leave the rest of its body as is; Task 2 adds the card.

- [ ] **Step 4: Run to check they pass.** `npx vitest run lib/bluesky.test.ts app/sharedDay.test.ts` → PASS. (sharedDay asserts that the posted text contains the day's word, which the new format keeps.) Then run `npx vitest run`, `npm run lint` and `npx tsc --noEmit -p tsconfig.json` against the baselines.

- [ ] **Step 5: Commit.**

```bash
git add lib/storyTitle.ts app/story/[slug]/page.tsx lib/bluesky.ts lib/bluesky.test.ts
git commit -m "feat: Bluesky post format (a) — teaser, word · lineage, hashtags; card builder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Post with the link card and its thumbnail

**Files:**
- Modify: `lib/bluesky.ts` (`postDailyWordToBluesky`)
- Test: `lib/bluesky.test.ts`

**Interfaces:**
- Consumes: `buildBlueskyPost`, `buildStoryCard` (Task 1).
- Produces: `postDailyWordToBluesky(word, date): Promise<{ posted: boolean }>`, the same signature and contract as today (never throws). Exports `THUMB_MAX_BYTES = 1_000_000` and `THUMB_TIMEOUT_MS = 10_000`.

- [ ] **Step 1: Write the failing tests.** In `lib/bluesky.test.ts`:
  - Add `mockUploadBlob` to the `vi.hoisted` mocks.
  - Add `uploadBlob: mockUploadBlob` to the mocked `AtpAgent` object.
  - Make the `@atproto/api` mock factory async so it can keep the real `AppBskyFeedPost` for validation:

    ```ts
    vi.mock("@atproto/api", async (importOriginal) => ({
      AppBskyFeedPost: (await importOriginal<typeof import("@atproto/api")>()).AppBskyFeedPost,
      AtpAgent: /* existing */,
      RichText: /* existing */,
    }));
    ```

  - Import `AppBskyFeedPost` from `@atproto/api` in the test.
  - In `beforeEach`, stub the global `fetch` for the thumbnail:

    ```ts
    const png = new Uint8Array([137, 80, 78, 71]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(png, { status: 200, headers: { "content-type": "image/png" } })));
    mockUploadBlob.mockResolvedValue({ data: { blob: { ref: "bafy-thumb" } } });
    ```

  - In `afterEach`, `vi.unstubAllGlobals()`.

  Add:

```ts
it("posts the text with an external link card carrying the uploaded thumbnail — a valid post record", async () => {
  const result = await postDailyWordToBluesky(word("A teaser."), new Date("2026-01-01T00:00:00Z"));
  expect(result).toEqual({ posted: true });

  expect(vi.mocked(fetch)).toHaveBeenCalledWith(
    "https://example.com/story/quarantine/opengraph-image",
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  );
  expect(mockUploadBlob).toHaveBeenCalledWith(expect.any(Uint8Array), { encoding: "image/png" });

  const record = mockPost.mock.calls[0][0];
  expect(record.embed).toEqual({
    $type: "app.bsky.embed.external",
    external: {
      uri: URL,
      title: "quarantine: the origin of the word — Curio",
      description: CARD_DESCRIPTION,
      thumb: { ref: "bafy-thumb" },
    },
  });
  const { thumb: _thumb, ...externalWithoutThumb } = record.embed.external;
  void _thumb;
  expect(
    AppBskyFeedPost.validateRecord({
      $type: "app.bsky.feed.post",
      text: record.text,
      createdAt: record.createdAt,
      embed: { $type: "app.bsky.embed.external", external: externalWithoutThumb },
    }).success
  ).toBe(true);
});

it.each([
  ["the image fetch fails", () => vi.mocked(fetch).mockRejectedValueOnce(new Error("timeout"))],
  ["the image is not an image", () => vi.mocked(fetch).mockResolvedValueOnce(new Response("nope", { headers: { "content-type": "text/html" } }))],
  ["the image is too big", () => vi.mocked(fetch).mockResolvedValueOnce(new Response(new Uint8Array(1_000_001), { headers: { "content-type": "image/png" } }))],
  ["the upload fails", () => mockUploadBlob.mockRejectedValueOnce(new Error("blob rejected"))],
])("still posts the card, without a thumbnail, when %s", async (_label, arrange) => {
  void _label;
  arrange();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const result = await postDailyWordToBluesky(word("A teaser."), new Date("2026-01-01T00:00:00Z"));
  warn.mockRestore();

  expect(result).toEqual({ posted: true });
  const external = mockPost.mock.calls[0][0].embed.external;
  expect(external.uri).toBe(URL);
  expect(external).not.toHaveProperty("thumb");
});
```

(The thumb is stripped before `validateRecord` because the mock's `{ ref: "bafy-thumb" }` isn't a real `BlobRef`. The card's shape without it is what's being validated. If lint flags the `_thumb`/`_label` destructures even with `void`, restructure to avoid the unused bindings, and keep lint at 3.)

- [ ] **Step 2: Run to check they fail.** `npx vitest run lib/bluesky.test.ts` → FAIL: no `embed` on the posted record.

- [ ] **Step 3: Implement.** In `lib/bluesky.ts`, add these after `buildStoryCard`:

```ts
/** Bluesky's limit for an external embed's thumb blob (lexicon maxSize). */
export const THUMB_MAX_BYTES = 1_000_000;
/** The cron's send budget is shared with email; a slow image shouldn't
 * hold the post up for long. */
export const THUMB_TIMEOUT_MS = 10_000;

/** The story's own Open Graph image, uploaded as the card's thumbnail.
 * Returns undefined on any problem: the card still posts, just without an
 * image. The daily post must never fail over its picture. */
async function uploadThumb(agent: AtpAgent, thumbUrl: string) {
  try {
    const res = await fetch(thumbUrl, { signal: AbortSignal.timeout(THUMB_TIMEOUT_MS) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) throw new Error(`thumbnail ${res.status} ${type}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > THUMB_MAX_BYTES) throw new Error(`thumbnail is ${bytes.byteLength} bytes`);
    const { data } = await agent.uploadBlob(bytes, { encoding: type });
    return data.blob;
  } catch (err) {
    console.warn("[curio:bluesky] posting without a thumbnail:", err);
    return undefined;
  }
}
```

In `postDailyWordToBluesky`:
- After `const text = buildBlueskyPost(word);`, add `const card = buildStoryCard(word);`.
- In the unconfigured branch, log both: `` console.log(`[curio:bluesky:dev-fallback] would post: ${text}\n[card] ${card.title} — ${card.uri}`); ``.
- Replace the `agent.post` call with:

```ts
    const thumb = await uploadThumb(agent, card.thumbUrl);
    await agent.post({
      text: richText.text,
      facets: richText.facets,
      // The link lives in the card, not the text: a card reads as the
      // word's story rather than a bare URL, and gets the story's image.
      embed: {
        $type: "app.bsky.embed.external",
        external: {
          uri: card.uri,
          title: card.title,
          description: card.description,
          ...(thumb ? { thumb } : {}),
        },
      },
      createdAt: date.toISOString(),
    });
```

Update `RichText`'s comment: `detectFacets` now turns the hashtags into real tag facets (there's no URL in the text any more). Update the function's doc comment to mention the card.

- [ ] **Step 4: Run to check they pass.** `npx vitest run lib/bluesky.test.ts app/sharedDay.test.ts` → PASS. `app/sharedDay.test.ts` mocks `AtpAgent` without `uploadBlob` and doesn't stub `fetch`, so the thumbnail path would make a **real network request** to `localhost:3000` from the test. **Required:**
- in that file, `vi.stubGlobal("fetch", …)` returning a small `image/png` `Response` in `beforeEach`, and `vi.unstubAllGlobals()` in `afterEach`;
- add `uploadBlob: vi.fn(async () => ({ data: { blob: { ref: "thumb" } } }))` to its mocked agent.

No test may reach the network, and the output stays pristine. Run the full suite, lint and tsc against the baselines.

- [ ] **Step 5: Commit.**

```bash
git add lib/bluesky.ts lib/bluesky.test.ts app/sharedDay.test.ts
git commit -m "feat: Bluesky link card with the story's OG image as thumbnail

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The dry-run preview of the next days' posts

**Files:**
- Create: `lib/blueskyPreview.ts`, `lib/blueskyPreview.test.ts`, `scripts/previewBlueskyPosts.ts`
- Modify: `package.json` (`"bluesky:preview": "tsx scripts/previewBlueskyPosts.ts"`)

**Interfaces:**
- Consumes: `buildBlueskyPost`, `buildStoryCard`, `graphemeLength` (Task 1); `getWordForDate(date: Date): WordEntry` and `dayKey`/`dayStart`/`DAY_MS` from `lib/words.ts`/`lib/day.ts`.
- Produces: `type PreviewRow = { day: string; word: string; text: string; graphemes: number; card: StoryCard }` and `buildBlueskyPreview(from: Date, days: number): PreviewRow[]`.

- [ ] **Step 1: Write the failing test** `lib/blueskyPreview.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildBlueskyPreview } from "./blueskyPreview";
import { getWordForDate } from "./words";
import { buildBlueskyPost } from "./bluesky";

describe("buildBlueskyPreview", () => {
  it("lists the next N UTC days, each with that day's calendar word and its exact post", () => {
    const rows = buildBlueskyPreview(new Date("2026-09-29T15:00:00Z"), 7);
    expect(rows.map((r) => r.day)).toEqual([
      "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05",
    ]);
    for (const r of rows) {
      const w = getWordForDate(new Date(`${r.day}T00:00:00Z`));
      expect(r.word).toBe(w.word);
      expect(r.text).toBe(buildBlueskyPost(w));
      expect(r.graphemes).toBeLessThanOrEqual(300);
      expect(r.card.uri).toContain(`/story/${w.slug}`);
    }
  });
});
```

- [ ] **Step 2: Run to check it fails.** `npx vitest run lib/blueskyPreview.test.ts` → FAIL, because the module is missing.

- [ ] **Step 3: Implement** `lib/blueskyPreview.ts`:

```ts
import { getWordForDate } from "./words";
import { DAY_MS, dayKey, dayStart } from "./day";
import { buildBlueskyPost, buildStoryCard, graphemeLength, type StoryCard } from "./bluesky";

export type PreviewRow = { day: string; word: string; text: string; graphemes: number; card: StoryCard };

/** What the cron will post on each of the next `days` UTC days, for the
 * owner to read before it goes out. Uses the calendar formula, not
 * resolveWordForDate: resolving would lock future days' words in Redis
 * just by previewing them. */
export function buildBlueskyPreview(from: Date, days: number): PreviewRow[] {
  const start = dayStart(dayKey(from)).getTime();
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start + i * DAY_MS);
    const word = getWordForDate(date);
    const text = buildBlueskyPost(word);
    return { day: dayKey(date), word: word.word, text, graphemes: graphemeLength(text), card: buildStoryCard(word) };
  });
}
```

(Confirm `DAY_MS`, `dayKey` and `dayStart` are exported from `lib/day.ts`; they are as of 2026-09-26.)

Create `scripts/previewBlueskyPosts.ts`:

```ts
// Prints the Bluesky posts the daily cron will make over the next N days,
// so the owner can read them before they go out. Read-only: no network, no
// Redis, no posting. Usage: npm run bluesky:preview -- [days=7] [from=YYYY-MM-DD]
import { buildBlueskyPreview } from "../lib/blueskyPreview";

const days = Number(process.argv[2] ?? 7);
const from = process.argv[3] ? new Date(`${process.argv[3]}T00:00:00Z`) : new Date();
if (!Number.isInteger(days) || days < 1 || Number.isNaN(from.getTime())) {
  console.error("Usage: npm run bluesky:preview -- [days=7] [from=YYYY-MM-DD]");
  process.exit(1);
}

for (const row of buildBlueskyPreview(from, days)) {
  console.log(`── ${row.day} · ${row.word} · ${row.graphemes}/300 graphemes`);
  console.log(row.text);
  console.log(`[card] ${row.card.title}`);
  console.log(`       ${row.card.description}`);
  console.log(`       ${row.card.uri}`);
  console.log("");
}
console.log(
  "Words come from the calendar formula. A day's word locks the first time it's shown, so these are what will post unless WORDS or LAUNCH_OPENERS change before then."
);
```

Add `"bluesky:preview": "tsx scripts/previewBlueskyPosts.ts"` to `package.json` `scripts`, after `content:approve`. Run `CURIO_SITE_URL=https://curioword.com npm run bluesky:preview` once and paste its full output into the report. The owner reviews it at Task 6.

- [ ] **Step 4: Run to check it passes.** `npx vitest run lib/blueskyPreview.test.ts` → PASS. Then the full suite, lint and tsc.

- [ ] **Step 5: Commit.**

```bash
git add lib/blueskyPreview.ts lib/blueskyPreview.test.ts scripts/previewBlueskyPosts.ts package.json
git commit -m "feat: npm run bluesky:preview — the next days' posts, read-only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4 (optional — owner's Decision 4): Bluesky-only re-post, `?repost=bluesky`

**Files:**
- Modify: `app/api/cron/send-daily/route.ts`, `app/api/cron/send-daily/route.test.ts`

**Interfaces:**
- Consumes: `claimRun("bluesky", day, { force: true })`, `postDailyWordToBluesky` (existing).
- Produces: `GET /api/cron/send-daily?repost=bluesky`, which requires a valid `CRON_SECRET` and responds `{ word, attempted: 0, sent: 0, failed: 0, bluesky, alreadyRan: { email: false, bluesky: false } }`.

- [ ] **Step 1: Write the failing tests** in `app/api/cron/send-daily/route.test.ts`, using the file's existing helpers (`cronRequest`, `cronRequestTo`, the fake Redis, and the `VERCEL_ENV=production` stub):

```ts
it("?repost=bluesky posts to Bluesky only — no email, locks and pending set untouched", async () => {
  await GET(cronRequest()); // this morning's run: email + Bluesky
  vi.clearAllMocks();

  const body = await (await GET(cronRequestTo("?repost=bluesky"))).json();

  expect(postDailyWordToBluesky).toHaveBeenCalledTimes(1);
  expect(sendDailyDigests).not.toHaveBeenCalled();
  expect(body).toMatchObject({ attempted: 0, sent: 0, failed: 0, bluesky: true, alreadyRan: { email: false, bluesky: false } });
  // A later plain run is still a no-op on both channels.
  const again = await (await GET(cronRequest())).json();
  expect(again.alreadyRan).toEqual({ email: true, bluesky: true });
});

it.each(["?repost=bluesky&force=1", "?repost=bluesky&resend=failed", "?repost=bluesky&bluesky=1", "?repost=email"])(
  "rejects %s with 400 and does nothing",
  async (query) => {
    const res = await GET(cronRequestTo(query));
    expect(res.status).toBe(400);
    expect(postDailyWordToBluesky).not.toHaveBeenCalled();
    expect(sendDailyDigests).not.toHaveBeenCalled();
  }
);

it("?repost=bluesky without the secret is refused", async () => {
  expect((await GET(cronRequestTo("?repost=bluesky", ""))).status).toBe(401);
  expect(postDailyWordToBluesky).not.toHaveBeenCalled();
});

it("?bluesky=1 on its own is still a 400 that posts nothing (the deploy check relies on it)", async () => {
  expect((await GET(cronRequestTo("?bluesky=1"))).status).toBe(400);
  expect(postDailyWordToBluesky).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to check they fail.** `npx vitest run app/api/cron/send-daily/route.test.ts` → FAIL.

- [ ] **Step 3: Implement.** In the route's parameter handling:
  - Read `const repost = params.get("repost");`.
  - Include `repost !== null` in the "overrides require CRON_SECRET" 401 check.
  - Return 400 when `repost !== null` and either `repost !== "bluesky"` or it's combined with `force`, `resend` or `bluesky`.

  Then, after the `UNSUBSCRIBE_SECRET` fail-closed check and `resolveTodayWord`, and **before** reading subscribers or claiming any email lock, add:

```ts
  // Bluesky-only re-post: for a day whose post failed or went out wrong.
  // Forces only the Bluesky lock; email, its lock and the pending set are
  // left alone, so this can never re-send a digest.
  if (repost === "bluesky") {
    await claimRun("bluesky", day, { force: true });
    const { posted } = await postDailyWordToBluesky(word, now);
    console.log(`[curio:digest] repost-bluesky ${day}: bluesky ${posted ? "posted" : "failed"}`);
    return NextResponse.json({
      word: word.slug, attempted: 0, sent: 0, failed: 0, bluesky: posted,
      alreadyRan: { email: false, bluesky: false },
    });
  }
```

(`day`, `now` and `word` must already be computed at that point. Move their declarations above this block if needed, without changing the order of anything that claims locks.) Update the route's header comment to list `?repost=bluesky`.

- [ ] **Step 4: Run to check they pass.** Route tests, then the full suite, lint and tsc.

- [ ] **Step 5: Commit.**

```bash
git add app/api/cron/send-daily
git commit -m "feat: ?repost=bluesky — re-post to Bluesky without re-sending email

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Docs

**Files:** `handover.md`, `README.md`

- [ ] **Step 1: `handover.md`.**
  - **Decisions:** add that Phase 3 shipped in format (a), with the link in a card whose title is shared via `lib/storyTitle.ts` and whose description is `CARD_DESCRIPTION`.
  - **`lib/bluesky.ts` architecture bullet:**
    - builders: `buildBlueskyPost(word)` (graphemes, no URL) and `buildStoryCard`;
    - `postDailyWordToBluesky` with the card and a thumbnail from the story's OG image, which falls back to no thumbnail;
    - it now uses `lib/siteUrl.ts`, so remove the "only `lib/bluesky.ts` still inlines the fallback" notes and the matching deferred item;
    - remove the stale "`buildBlueskyPost` doesn't bound `word + url`" parked item, since there's no URL in the text any more.
  - **New bullet:** `lib/blueskyPreview.ts` and `npm run bluesky:preview -- [days] [from]`: read-only, uses the formula, and explain why.
  - **If Task 4 shipped:** in "Re-sending the digest by hand (production)", replace the "Known limitation" paragraph with the `?repost=bluesky` command:

    ```bash
    curl -sS -H "Authorization: Bearer $CURIO_CRON_SECRET" "https://curioword.com/api/cron/send-daily?repost=bluesky"
    ```

    Note that it posts publicly every time it's run (it forces the lock), so run it once. Remove the matching deferred minor.
  - Add a "This session (2026-09-28): Bluesky link cards (Phase 3)" section: what landed, the measured 291 maximum, the owner's approval of the preview, and test counts. Its `### Verification` subsection holds the single line `Pending — filled in after the preview approval and the first real post.`
  - Update the "Last updated" line and the handover's opening pointer to Phase 3 (the pre-launch brief is now complete apart from its verification).
- [ ] **Step 2: `README.md`.** In "What's implemented", add a Bluesky bullet: the daily post, format (a), the link card, and `npm run bluesky:preview`.
- [ ] **Step 3: Commit.**

```bash
git add handover.md README.md
git commit -m "docs: Bluesky link cards — handover and README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6 (controller): Review, owner approval of the preview, verification, deploy

- [ ] **Step 1:** Run the whole-branch review (superpowers:requesting-code-review), then one fix wave if needed.
- [ ] **Step 2:** Clean-install gates in the worktree:
  - `rm -rf node_modules .next && npm ci`;
  - `npm test`, `npm run lint` (3 warnings) and `npm run build`;
  - `/story/[slug]` must still be `●` with 1,147 paths.
- [ ] **Step 3:** Merge to `master` locally, remove the worktree, and re-run the tests from the main checkout.
- [ ] **Step 4: Preview approval.** Run `CURIO_SITE_URL=https://curioword.com npm run bluesky:preview -- 7` and show the owner the full output. **Nothing deploys until the owner approves the 7 posts.**
- [ ] **Step 5: Live dev check,** without posting publicly. Run the local cron with `BLUESKY_APP_PASSWORD` unset and Upstash commented out, as in the 2026-09-28 email test. The dev-fallback log should show the new text plus the `[card]` line. Also fetch `http://localhost:3000/story/<today>/opengraph-image` to confirm the thumbnail source returns `image/png` under 1 MB.
- [ ] **Step 6: Deploy, only on the owner's go-ahead.** Push outside 08:45–09:15 UTC. Smoke checks, none of which posts:
  - the story OG image returns 200 `image/png`;
  - `?bluesky=1` without the secret → 401;
  - if Task 4 shipped, `?repost=email` → 401 without the secret.
- [ ] **Step 7:** The next morning after 09:00 UTC, look at the real post on `@curiodaily.bsky.social`:
  - the text reads as format (a);
  - the hashtags are clickable;
  - the card shows the story title, the description and the word's image, and opens the story with UTM tags.

  Record the result in the handover's Verification subsection.
