# Threads + Instagram Carousels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every code task uses superpowers:test-driven-development.

**Goal:** Once a day, post the shared word to Threads as a text post with a link card, and to Instagram as a 4–6 slide carousel. Everything is built from each word's existing reviewed content, with no new facts generated. Nothing posts until the owner has reviewed the slides and supplied the access tokens.

**Architecture:**

The design follows the Bluesky pattern:

- **Text and slides.** Pure builders in `lib/socialPost.ts` produce the Threads text, the Instagram caption and the carousel's slide model.
- **Slide images.** A public route renders each slide to JPEG: `next/og` `ImageResponse` draws it, then `sharp` converts it, because Instagram accepts JPEG only.
- **Posting.** `lib/threads.ts` and `lib/instagram.ts` handle Meta's container, then wait, then publish sequence. Neither throws, and each falls back to logging when it has no token.
- **Tokens.** `lib/metaTokens.ts` keeps Meta's 60-day tokens alive by refreshing them into Redis, in production only.
- **Schedule.** A separate daily cron, `/api/cron/social`, runs at 10:00 UTC. It has per-channel day locks, the same as email and Bluesky, plus a `?repost=threads|instagram` override.
- **Preview.** `npm run social:preview` prints the next days' posts and their slide URLs.

**Tech Stack:**
- Next.js 16.3.4 (route handlers, `next/og` `ImageResponse`)
- `sharp` 0.35.4, already installed as Next's optional dependency; this plan makes it explicit
- Threads Graph API (`https://graph.threads.net/v1.0`)
- Instagram API with Instagram Login (`https://graph.instagram.com/v25.0`)
- `@upstash/redis`, Vitest, `tsx`

**Spec:** The owner asked on 2026-09-29: "Let's start with 1 and 2", meaning "more channels: Threads, Instagram" and "journey carousels". The context and constraints are carried in the Brief below.

## Brief

### What the owner asked for
Faceless marketing, with Claude doing the repurposing and drafting. Start with:
1. **Post the daily word on more channels** (Threads, Instagram).
2. **"Word journey" carousels** for Instagram. Everything reuses existing, reviewed content, and the owner approves before anything goes out.

### Ground rules the owner agreed to (2026-09-29)
- **No invented facts.** Every word in a post or slide comes from the stored, reviewed `WordEntry` fields.
- **No fake engagement:** no bots, sockpuppets, or auto-replies, likes or follows.
- **The owner creates the accounts.** Claude never creates accounts or handles credentials; the owner adds tokens themselves.
- **The owner approves each new channel** before it posts, like the Bluesky preview.

### Checked facts (2026-09-29)

**Instagram** (content publishing docs):
- Only professional accounts can publish. With Instagram Login, the scopes are `instagram_business_basic` and `instagram_business_content_publish`.
- "JPEG is the only image format supported."
- Carousels: up to 10 items, and the other images are cropped to the first image's aspect ratio.
- Media must be at a public URL at publish time ("We cURL media").
- Limit: 100 API-published posts per 24 hours, and a carousel counts as one.
- Container `status_code`: `EXPIRED`, `ERROR`, `FINISHED`, `IN_PROGRESS`, `PUBLISHED`. Meta suggests polling "once per minute, for no more than 5 minutes".
- Endpoints (v25.0):
  - `POST https://graph.instagram.com/v25.0/<IG_ID>/media` with `image_url` and `is_carousel_item=true` for each child;
  - the same endpoint with `media_type=CAROUSEL`, `children` and `caption` for the carousel;
  - `POST …/<IG_ID>/media_publish` with `creation_id`.
- Refresh: `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=…`. A token must be at least 24 hours old and unexpired; it's then valid for 60 days.

**Threads** (posts docs):
- Create a container with `POST https://graph.threads.net/v1.0/<THREADS_USER_ID>/threads`, passing `media_type=TEXT`, `text` and `link_attachment=<URL>`. The link attachment shows as a preview card.
- Publish with `POST …/threads_publish` and `creation_id`.
- "Text posts are limited to 500 characters." Emoji count as UTF-8 bytes.
- Meta recommends waiting about 30 seconds before publishing.
- Limit: 250 posts per 24 hours. Scopes: `threads_basic`, `threads_content_publish`.
- Refresh: `GET https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=…`, with the same 24-hour and 60-day rules.

**Vercel Hobby cron:** 100 jobs per project, each at most once a day, firing anywhere within the scheduled hour (±59 min).

**Fonts:** `next/og` bundles only Geist, but it fetches Google Fonts for missing glyphs. The live `ketchup` share image renders 膎汁 correctly. 163 of the 1,147 `origin` texts contain non-Latin script (Greek 116, Arabic 17, Devanagari 11, Han 9, …). No teaser does.

**Content shape:** the `origin` field splits into 1 sentence for 705 words, 2 for 414, 3 for 24, 4 for 2 and 5 for 2. The median sentence is 110 characters, and the longest is 354.

**Existing assets:**
- `app/story/[slug]/opengraph-image.tsx` shows how to use `ImageResponse` (default font, `lib/ogTheme.ts` colours).
- `lib/digestRuns.ts` has the day locks, which use Redis only when `VERCEL_ENV === "production"`.
- `lib/blueskyPost.ts` has the pure-builder pattern and `graphemeLength`.
- `lib/siteUrl.ts` has `absoluteUrl`.

### Decisions for the owner (proposed defaults — say if you want otherwise)

1. **Channels:** Threads, as a text post with a link card, and Instagram, as a carousel. X (paid API) and Mastodon are out of scope for now.
2. **Timing:** a separate daily cron, `0 10 * * *`. Because of Hobby's ±59 min window, posts land between 10:00 and 10:59 UTC, after the 09:xx email and Bluesky post. Keeping it separate means a slow Instagram upload can never delay email.
3. **Threads text:** the Bluesky format with one tag, `{teaser}\n\n{word} · {lineage}\n\n#etymology`. My understanding is that Threads treats one hashtag per post as its topic tag, so a second adds nothing. This is **unverified**: Meta's topic-tag docs page returned 404 on 2026-09-29. Task 9 checks how the tag renders on the first real post; if it's wrong, adjusting it is a one-line change. The link goes in `link_attachment`, and Threads builds the card from the story page's own Open Graph tags and image. It's tagged `utm_source=threads`.
4. **Carousel (4–6 slides, 1080×1350 portrait JPEG), built only from stored fields:**
   1. **Hook:** the teaser, large, plus "Swipe →".
   2. **Word:** the word, respelling · part of speech, and the lineage chain (`Hokkien → Malay → English`).
   3. **Story (1–3 slides):** the `origin` text, one sentence per slide. Beyond 3 sentences, the rest joins the third story slide. Font size steps down for long sentences.
   4. **Outro:** "One word's origin story, every morning." / "curioword.com" / "No feed, no backlog."

   Claude-written slide copy (a v2, through the content pipeline with your review) is out of scope here.
5. **Instagram caption:**

   ```
   {teaser}

   {word} · {lineage}

   The full story is at curioword.com (link in bio).

   #etymology #wordoftheday #words #language #wordnerd
   ```

   Instagram captions can't carry clickable links, so you set the profile's bio link to `https://curioword.com`.
6. **`sharp`:** add it as an explicit dependency, at the version already installed (0.35.4, which Next pulls in optionally). It converts the slide PNG to the JPEG Instagram requires.
7. **The tokens are the on switch.** This deploys with no Meta tokens set, so both channels only log what they would post. You review the real slides live at `https://curioword.com/social/carousel/<slug>/<n>`, then add the tokens, and only then does anything post.
8. **AI labels.** Meta's "AI info" rules are aimed at photorealistic AI images and video. Typographic text cards don't trigger them. If you want to be open about it anyway, add a bio line like "Stories written with AI help, checked by a human".

### What the owner sets up (Claude never does these)

1. **Instagram:** create or choose a **professional** Instagram account for Curio (Creator or Business), and set its bio link to `https://curioword.com`.
2. **Threads:** create a Threads profile. Threads profiles are made from an Instagram account.
3. **Meta app:** at developers.facebook.com, create an app with two use cases: **Access the Threads API** and **Instagram API with Instagram Login**. Add the Curio Instagram and Threads accounts as testers, then accept the invites in each app. The app can stay in development mode for posting to your own tester accounts. If Meta asks for App Review before `*_content_publish` works, stop and tell Claude; that's a blocker to plan around.
4. **Tokens:** generate a **long-lived** token for each channel with the right scopes (Threads: `threads_basic`, `threads_content_publish`; Instagram: `instagram_business_basic`, `instagram_business_content_publish`). Note each account's user ID.
5. **Vercel:** add the tokens and IDs to Production as sensitive variables. Claude can run `vercel env add` with you pasting each value at the prompt:
   - `THREADS_USER_ID`
   - `THREADS_ACCESS_TOKEN`
   - `INSTAGRAM_USER_ID`
   - `INSTAGRAM_ACCESS_TOKEN`

**Out of scope:** video or Reels, X, Mastodon, AI-generated slide copy, scheduling other than the daily run, replying or engaging, and analytics dashboards.

## Global Constraints

- **Content:** every sentence posted or drawn comes verbatim from `WordEntry` (`teaser`, `word`, `respelling`, `partOfSpeech`, `lineage`, `origin`), or from the fixed Curio copy strings named in this plan. Nothing is generated.
- **Never throw into the cron:** a channel failure logs `[curio:threads] post failed:` or `[curio:instagram] post failed:` and returns `{ posted: false }`.
- **No real network in tests:** stub `fetch` everywhere. Test output stays pristine.
- **URLs:** absolute URLs come from `lib/siteUrl.ts`. In production (`VERCEL_ENV === "production"`), refuse to post if `siteUrl()` starts with `http://localhost`. Meta must fetch real public URLs, and the card must not link to localhost.
- **Redis:** keys use `curio:digest:` (day locks, via `lib/digestRuns.ts`) and a new `curio:social:` prefix (tokens), in production only. List the new prefix in the handover.
- **Secrets:** tokens are never logged. Log messages carry only the day, the channel and a status.
- **Design system:** `docs/design-system.md` covers the app's UI. The slides are server-rendered images like the Open Graph images, so they use `lib/ogTheme.ts` colours and inline Satori styles, and the Tailwind token rules don't apply.
- **Principle:** archive, never backlog (`AGENTS.md`). No post says "you missed", counts unseen words or mentions streaks.
- **Test commands:**
  - `npx vitest run` (baseline **330**);
  - `npm run lint` (baseline exactly 3 warnings; `_`-prefixed unused bindings still warn);
  - `npx tsc --noEmit -p tsconfig.json` (the only allowed error is the pre-existing `app/layout.tsx` LayoutProps);
  - `npm run build`.
- **Style:** short "why" comments. The only new dependency is `sharp` (Decision 6).
- **Commits:** every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Git workflow:** work in a platform worktree created from **local** `master` (`git worktree add … -b <name> master`, then `EnterWorktree` with `path`), and merge locally. **Never push** without the owner's go-ahead, because a push deploys.

## File Structure

- `lib/socialPost.ts` (new, pure): `socialStoryUrl`, `buildThreadsPost`, `buildInstagramCaption`, `type Slide`, `buildCarouselSlides`, `splitSentences`, `INSTAGRAM_HASHTAGS`, `CAROUSEL_SIZE`.
- `lib/carouselImage.tsx` (new): `renderSlidePng(slide, word)` returns PNG bytes via `ImageResponse`.
- `app/social/carousel/[slug]/[slide]/route.ts` (new): `GET` returns the slide as `image/jpeg` via `sharp`.
- `lib/seoRoutes.ts` (+ test): disallow `/social/`.
- `lib/metaTokens.ts` (new): `getMetaToken(channel)` handles refreshing into Redis in production.
- `lib/threads.ts` (new): `postDailyWordToThreads(word)`.
- `lib/instagram.ts` (new): `postDailyCarouselToInstagram(word)`.
- `lib/cronAuth.ts` (new): `authorizeCron(req)`, the CRON_SECRET check extracted from `send-daily`.
- `lib/digestRuns.ts` (modify): `Channel` gains `"threads" | "instagram"`.
- `app/api/cron/social/route.ts` (new) + `vercel.json` (second cron).
- `app/api/cron/send-daily/route.ts` (modify): uses `authorizeCron`, with no behaviour change.
- `lib/socialPreview.ts` (new) + `scripts/previewSocialPosts.ts` (new) + `package.json` `social:preview`.
- `.env.example`, `handover.md`, `README.md`: docs.

---

### Task 1: Pure builders — Threads text, Instagram caption, carousel slides

**Files:**
- Create: `lib/socialPost.ts`
- Test: `lib/socialPost.test.ts`

**Interfaces:**
- Consumes: `absoluteUrl` (`lib/siteUrl.ts`), `graphemeLength` (`lib/blueskyPost.ts`), `type WordEntry` (`lib/words.ts`).
- Produces (used by Tasks 2, 4, 5 and 7):

```ts
export type SocialChannel = "threads" | "instagram";
export const CAROUSEL_SIZE = { width: 1080, height: 1350 } as const;
export const INSTAGRAM_HASHTAGS = "#etymology #wordoftheday #words #language #wordnerd";
export function socialStoryUrl(word: WordEntry, channel: SocialChannel): string;
export function buildThreadsPost(word: WordEntry): string;
export function buildInstagramCaption(word: WordEntry): string;
export function splitSentences(text: string): string[];
export type Slide =
  | { kind: "hook"; text: string }
  | { kind: "word"; word: string; respelling: string; partOfSpeech: string; lineage: string }
  | { kind: "story"; text: string; index: number; total: number }
  | { kind: "outro" };
export function buildCarouselSlides(word: WordEntry): Slide[];
```

- [ ] **Step 1: Write the failing tests** in `lib/socialPost.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WORDS, type WordEntry } from "./words";
import {
  buildCarouselSlides,
  buildInstagramCaption,
  buildThreadsPost,
  INSTAGRAM_HASHTAGS,
  socialStoryUrl,
  splitSentences,
} from "./socialPost";

const ketchup = WORDS.find((w) => w.slug === "ketchup") as WordEntry;

beforeEach(() => vi.stubEnv("CURIO_SITE_URL", "https://curioword.com"));
afterEach(() => vi.unstubAllEnvs());

describe("socialStoryUrl", () => {
  it("tags the story link with the channel", () => {
    const url = new URL(socialStoryUrl(ketchup, "threads"));
    expect(url.origin + url.pathname).toBe("https://curioword.com/story/ketchup");
    expect(url.searchParams.get("utm_source")).toBe("threads");
    expect(url.searchParams.get("utm_medium")).toBe("social");
    expect(url.searchParams.get("utm_campaign")).toBe("daily-word");
  });
});

describe("buildThreadsPost", () => {
  it("is the teaser, word · lineage, and one topic tag — no URL", () => {
    expect(buildThreadsPost(ketchup)).toBe(
      `${ketchup.teaser}\n\nketchup · ${ketchup.lineage.join(" → ")}\n\n#etymology`
    );
  });

  it("fits Threads' 500 limit, counted in UTF-8 bytes, for every word in the bank", () => {
    for (const w of WORDS) {
      const text = buildThreadsPost(w);
      expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(500);
      expect(text).not.toMatch(/https?:/);
    }
  });
});

describe("buildInstagramCaption", () => {
  it("has the teaser, the lineage line, the link-in-bio line and the hashtags", () => {
    expect(buildInstagramCaption(ketchup)).toBe(
      `${ketchup.teaser}\n\nketchup · ${ketchup.lineage.join(" → ")}\n\n` +
        `The full story is at curioword.com (link in bio).\n\n${INSTAGRAM_HASHTAGS}`
    );
  });

  it("stays within Instagram's 2,200 characters and 30 hashtags for every word", () => {
    for (const w of WORDS) {
      const caption = buildInstagramCaption(w);
      expect([...caption].length).toBeLessThanOrEqual(2200);
      expect((caption.match(/#/g) ?? []).length).toBeLessThanOrEqual(30);
    }
  });
});

describe("splitSentences", () => {
  it("splits on sentence ends followed by a space, keeping the punctuation", () => {
    expect(splitSentences("One. Two! Three? Four")).toEqual(["One.", "Two!", "Three?", "Four"]);
  });

  it("keeps text without sentence breaks whole", () => {
    expect(splitSentences("Hokkien 膎汁 (kê-chiap), fish sauce")).toEqual(["Hokkien 膎汁 (kê-chiap), fish sauce"]);
  });
});

describe("buildCarouselSlides", () => {
  it("is hook, word, one story slide per origin sentence, then the outro", () => {
    const slides = buildCarouselSlides(ketchup);
    const sentences = splitSentences(ketchup.origin);
    expect(slides[0]).toEqual({ kind: "hook", text: ketchup.teaser });
    expect(slides[1]).toEqual({
      kind: "word",
      word: "ketchup",
      respelling: ketchup.respelling,
      partOfSpeech: ketchup.partOfSpeech,
      lineage: ketchup.lineage.join(" → "),
    });
    expect(slides.slice(2, -1).map((s) => (s.kind === "story" ? s.text : ""))).toEqual(sentences);
    expect(slides.at(-1)).toEqual({ kind: "outro" });
  });

  it("uses only stored text: the story slides rejoin to exactly the origin", () => {
    for (const w of WORDS) {
      const story = buildCarouselSlides(w).filter((s) => s.kind === "story");
      expect(story.map((s) => (s.kind === "story" ? s.text : "")).join(" ")).toBe(
        splitSentences(w.origin).join(" ")
      );
    }
  });

  it("gives every word 4–6 slides (Instagram allows 2–10), numbering the story slides", () => {
    for (const w of WORDS) {
      const slides = buildCarouselSlides(w);
      expect(slides.length).toBeGreaterThanOrEqual(4);
      expect(slides.length).toBeLessThanOrEqual(6);
      const story = slides.filter((s) => s.kind === "story");
      story.forEach((s, i) => {
        if (s.kind === "story") expect({ index: s.index, total: s.total }).toEqual({ index: i + 1, total: story.length });
      });
    }
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail.** `npx vitest run lib/socialPost.test.ts` fails because the module is missing.

- [ ] **Step 3: Implement** `lib/socialPost.ts`:

```ts
import type { WordEntry } from "./words";
import { absoluteUrl } from "./siteUrl";

// Pure builders for the Threads post, the Instagram caption and the
// carousel's slides. Every sentence comes from the stored, reviewed
// WordEntry fields or from the fixed Curio lines below — nothing is
// generated, so a post can't say anything the story page doesn't.

export type SocialChannel = "threads" | "instagram";

/** Instagram portrait (4:5) — the tallest ratio it keeps uncropped. */
export const CAROUSEL_SIZE = { width: 1080, height: 1350 } as const;
export const INSTAGRAM_HASHTAGS = "#etymology #wordoftheday #words #language #wordnerd";
const MAX_STORY_SLIDES = 3;

export function socialStoryUrl(word: WordEntry, channel: SocialChannel): string {
  const url = new URL(absoluteUrl(`/story/${word.slug}`));
  url.searchParams.set("utm_source", channel);
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", "daily-word");
  return url.toString();
}

function lineageLine(word: WordEntry): string {
  return `${word.word} · ${word.lineage.join(" → ")}`;
}

/** The Bluesky format with one tag: Threads treats a post's single
 * hashtag as its topic, so a second adds nothing. The link travels in the
 * post's link_attachment (see lib/threads.ts), not the text. */
export function buildThreadsPost(word: WordEntry): string {
  return `${word.teaser}\n\n${lineageLine(word)}\n\n#etymology`;
}

/** Instagram captions can't hold a clickable link, so the story is
 * "link in bio" — the profile's bio link is set to curioword.com. */
export function buildInstagramCaption(word: WordEntry): string {
  return (
    `${word.teaser}\n\n${lineageLine(word)}\n\n` +
    `The full story is at curioword.com (link in bio).\n\n${INSTAGRAM_HASHTAGS}`
  );
}

/** Sentence ends followed by whitespace. Enough for this bank: measured
 * 2026-09-29, one origin in 1,147 has an abbreviation-style "x. " and it
 * splits harmlessly. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type Slide =
  | { kind: "hook"; text: string }
  | { kind: "word"; word: string; respelling: string; partOfSpeech: string; lineage: string }
  | { kind: "story"; text: string; index: number; total: number }
  | { kind: "outro" };

/** Hook (teaser) → the word and its lineage → the origin, a sentence a
 * slide (beyond three, the rest share the third) → Curio outro. */
export function buildCarouselSlides(word: WordEntry): Slide[] {
  const sentences = splitSentences(word.origin);
  const parts =
    sentences.length <= MAX_STORY_SLIDES
      ? sentences
      : [...sentences.slice(0, MAX_STORY_SLIDES - 1), sentences.slice(MAX_STORY_SLIDES - 1).join(" ")];
  return [
    { kind: "hook", text: word.teaser },
    {
      kind: "word",
      word: word.word,
      respelling: word.respelling,
      partOfSpeech: word.partOfSpeech,
      lineage: word.lineage.join(" → "),
    },
    ...parts.map((text, i) => ({ kind: "story" as const, text, index: i + 1, total: parts.length })),
    { kind: "outro" },
  ];
}
```

(If an `origin` is empty, `parts` is empty and the carousel has 3 slides. The 4–6 test would catch that. Every word in the bank has an `origin`, and `lib/words.test.ts` asserts it's non-empty. If that assertion doesn't exist, report it rather than adding a fallback.)

- [ ] **Step 4: Run the tests and confirm they pass.** Run `npx vitest run lib/socialPost.test.ts`, then the full suite, lint and tsc.

- [ ] **Step 5: Commit.**

```bash
git add lib/socialPost.ts lib/socialPost.test.ts
git commit -m "feat: Threads text, Instagram caption and carousel slides from stored content

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The carousel slide images (JPEG, public route)

**Files:**
- Modify: `package.json` / `package-lock.json` (`npm install sharp@0.35.4 --save-exact=false`, so the dependency reads `"sharp": "^0.35.4"`)
- Create: `lib/carouselImage.tsx`, `app/social/carousel/[slug]/[slide]/route.ts`
- Modify: `lib/seoRoutes.ts` (`DISALLOWED_PATHS` gains `"/social/"`), `lib/seoRoutes.test.ts`
- Test: `app/social/carousel/[slug]/[slide]/route.test.ts`

**Interfaces:**
- Consumes: `buildCarouselSlides`, `CAROUSEL_SIZE`, `Slide` (Task 1); `getWordBySlug` (`lib/words.ts`); `ogTheme` (`lib/ogTheme.ts`).
- Produces:
  - `GET /social/carousel/<slug>/<n>` → `200 image/jpeg`, 1080×1350. `n` is 1-based. It returns 404 for an unknown slug or an out-of-range or non-integer `n`.
  - `renderSlidePng(slide: Slide): Promise<Uint8Array>`.

- [ ] **Step 1: Check the docs before coding.** Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/image-response.md` (its "Route Handlers" section) and the route-handler docs under `node_modules/next/dist/docs/01-app/`, for the Next 16 signature of dynamic `params` in route handlers (`{ params: Promise<{ slug: string; slide: string }> }`).

- [ ] **Step 2: Write the failing tests.** Create `app/social/carousel/[slug]/[slide]/route.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { GET } from "./route";

const call = (slug: string, slide: string) =>
  GET(new Request(`http://localhost/social/carousel/${slug}/${slide}`), {
    params: Promise.resolve({ slug, slide }),
  });

describe("GET /social/carousel/[slug]/[slide]", () => {
  it("renders a 1080×1350 JPEG for each of a word's slides", async () => {
    for (const n of ["1", "2", "3"]) {
      const res = await call("fiasco", n);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/jpeg");
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff])); // JPEG magic
      const meta = await sharp(bytes).metadata();
      expect({ w: meta.width, h: meta.height, f: meta.format }).toEqual({ w: 1080, h: 1350, f: "jpeg" });
    }
  }, 30_000);

  it.each([
    ["nope-not-a-word", "1"],
    ["fiasco", "0"],
    ["fiasco", "99"],
    ["fiasco", "1.5"],
    ["fiasco", "abc"],
  ])("404s for %s / %s", async (slug, slide) => {
    expect((await call(slug, slide)).status).toBe(404);
  });
});
```

(`fiasco`'s origin is a single sentence, so it has 4 slides. That's why the test uses slides 1–3 plus the out-of-range 99. If `ImageResponse` can't run under Vitest's node environment, don't mock it away: report BLOCKED with the error. The controller will rule on it.)

In `lib/seoRoutes.test.ts`'s `buildRobots` block, add:

```ts
  it("disallows the social image routes", () => {
    expect(buildRobots().rules.disallow).toContain("/social/");
  });
```

- [ ] **Step 3: Run the tests and confirm they fail.** Run `npx vitest run "app/social" lib/seoRoutes.test.ts`.

- [ ] **Step 4: Implement.** Run `npm install sharp@0.35.4`, which must leave `"sharp": "^0.35.4"` in `dependencies`. Then create `lib/carouselImage.tsx`:

```tsx
import { ImageResponse } from "next/og";
import { ogTheme } from "./ogTheme";
import { CAROUSEL_SIZE, type Slide } from "./socialPost";

/** Long sentences step down so the longest origin sentence (354 chars in
 * the bank on 2026-09-29) still fits a 1080-wide slide. */
function storyFontSize(text: string): number {
  if (text.length <= 140) return 60;
  if (text.length <= 240) return 50;
  return 42;
}

const frame = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column" as const,
  justifyContent: "center",
  padding: "96px",
  background: ogTheme.paper,
  color: ogTheme.ink,
};

const label = { display: "flex", fontSize: 30, color: ogTheme.inkSoft, letterSpacing: 2 };

function SlideBody({ slide }: { slide: Slide }) {
  switch (slide.kind) {
    case "hook":
      return (
        <div style={frame}>
          <div style={label}>CURIO</div>
          <div style={{ display: "flex", fontSize: 72, lineHeight: 1.2, marginTop: 40 }}>{slide.text}</div>
          <div style={{ ...label, marginTop: 80 }}>Swipe →</div>
        </div>
      );
    case "word":
      return (
        <div style={frame}>
          <div style={{ display: "flex", fontSize: 150, fontWeight: 600, lineHeight: 1 }}>{slide.word}</div>
          <div style={{ display: "flex", fontSize: 38, color: ogTheme.inkFaint, marginTop: 28 }}>
            {slide.respelling} · {slide.partOfSpeech}
          </div>
          <div style={{ display: "flex", fontSize: 44, lineHeight: 1.4, marginTop: 72 }}>{slide.lineage}</div>
        </div>
      );
    case "story":
      return (
        <div style={frame}>
          <div style={label}>{`${slide.index} / ${slide.total}`}</div>
          <div style={{ display: "flex", fontSize: storyFontSize(slide.text), lineHeight: 1.4, marginTop: 40 }}>
            {slide.text}
          </div>
        </div>
      );
    case "outro":
      return (
        <div style={frame}>
          <div style={{ display: "flex", fontSize: 64, lineHeight: 1.25 }}>One word&apos;s origin story, every morning.</div>
          <div style={{ display: "flex", fontSize: 56, fontWeight: 600, marginTop: 56 }}>curioword.com</div>
          <div style={{ display: "flex", fontSize: 38, color: ogTheme.inkSoft, marginTop: 28 }}>No feed, no backlog.</div>
        </div>
      );
  }
}

/** PNG from next/og. Missing glyphs (Greek, Arabic, Han…) come from
 * Google Fonts via ImageResponse's own dynamic font loading, the same as
 * the story Open Graph images. */
export async function renderSlidePng(slide: Slide): Promise<Uint8Array> {
  const res = new ImageResponse(<SlideBody slide={slide} />, { ...CAROUSEL_SIZE });
  return new Uint8Array(await res.arrayBuffer());
}
```

Create `app/social/carousel/[slug]/[slide]/route.ts`:

```ts
import sharp from "sharp";
import { getWordBySlug } from "@/lib/words";
import { buildCarouselSlides } from "@/lib/socialPost";
import { renderSlidePng } from "@/lib/carouselImage";

/** One carousel slide as JPEG. Instagram publishes JPEG only and fetches
 * each slide from a public URL at post time, so these must be reachable
 * and deterministic. Disallowed in robots.txt: they're images for Meta's
 * fetcher, not pages. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; slide: string }> }
) {
  const { slug, slide } = await params;
  const word = getWordBySlug(slug);
  const n = Number(slide);
  const slides = word ? buildCarouselSlides(word) : [];
  if (!word || !Number.isInteger(n) || n < 1 || n > slides.length) {
    return new Response("Not found", { status: 404 });
  }

  const png = await renderSlidePng(slides[n - 1]);
  const jpeg = await sharp(png).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpeg), {
    headers: {
      "content-type": "image/jpeg",
      // A word's slides only change on deploy; let the CDN hold them a day.
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
```

(`_req` is unused. If lint warns, use `export async function GET(req: Request, …)` with `void req;`, or omit the first parameter's name as the lint rules allow. Keep lint at 3 warnings.)

In `lib/seoRoutes.ts`, add `"/social/",` to `DISALLOWED_PATHS`.

- [ ] **Step 5: Run the tests and confirm they pass.** Then look at the slides: run `npm run dev`, open `http://localhost:3000/social/carousel/ketchup/1` through `…/5` and `…/silhouette/1`, and screenshot or save them. Check that the Han characters in `ketchup`'s story slide render, and that nothing overflows. Note the results in the report. Stop the dev server and `rm -rf .next`. Then run the full suite, lint, tsc and `npm run build` (check that the route shows as `ƒ`).

- [ ] **Step 6: Commit.**

```bash
git add package.json package-lock.json lib/carouselImage.tsx app/social lib/seoRoutes.ts lib/seoRoutes.test.ts
git commit -m "feat: carousel slides as JPEG at /social/carousel/<slug>/<n>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Meta tokens that refresh themselves

**Files:**
- Create: `lib/metaTokens.ts`
- Test: `lib/metaTokens.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `redis` (`lib/redis.ts`).
- Produces:
  - `type MetaChannel = "threads" | "instagram"`;
  - `getMetaToken(channel: MetaChannel, now?: Date): Promise<string | null>`;
  - `REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000`.
- Env vars used: `THREADS_ACCESS_TOKEN`, `INSTAGRAM_ACCESS_TOKEN` (the seeds). The Redis key is `curio:social:token:<channel>`, holding JSON `{ token: string, refreshedAt: string }` with no TTL.

**Behaviour:**

- **Outside production** (`VERCEL_ENV !== "production"`): return the env token, or null. No Redis, no refresh. Local dev must never read or rotate production's tokens.
- **In production:**
  - Read the stored record. If there isn't one, seed it from the env token with `refreshedAt: "1970-01-01T00:00:00.000Z"`, meaning the age is unknown, so it's due for refresh.
  - If there's no env token either, return null.
  - If the record is older than `REFRESH_AFTER_MS`, call the channel's refresh endpoint:
    - Threads: `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=…`
    - Instagram: `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=…`
  - Use a 10s timeout. On success, store `{ token: new, refreshedAt: now }` and return the new token.
  - On failure (for example, a token less than 24 hours old, or a network error), log `[curio:<channel>] token refresh failed:` with the HTTP status or error name only, never the token, and return the current token.
- **The env token wins if it changed:** if the env token is set and differs from the one the record was seeded or refreshed from, re-seed from env. That lets the owner replace a revoked token by updating Vercel. So the record also stores `seed: <env token at seed time>`, and a different current env value means re-seed.

- [ ] **Step 1: Write the failing tests** `lib/metaTokens.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  return {
    fake: {
      store,
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      set: vi.fn(async (k: string, v: unknown) => (store.set(k, v), "OK")),
    },
  };
});
vi.mock("./redis", () => ({ redis: fake, usingUpstash: true }));

const { getMetaToken, REFRESH_AFTER_MS } = await import("./metaTokens");
const NOW = new Date("2026-10-01T10:00:00Z");
const refreshed = (token: string) =>
  new Response(JSON.stringify({ access_token: token, token_type: "bearer", expires_in: 5184000 }), { status: 200 });

beforeEach(() => {
  fake.store.clear();
  vi.clearAllMocks();
  vi.stubEnv("THREADS_ACCESS_TOKEN", "seed-threads");
  vi.stubEnv("INSTAGRAM_ACCESS_TOKEN", "seed-ig");
  vi.stubGlobal("fetch", vi.fn(async () => refreshed("fresh")));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getMetaToken outside production", () => {
  it("returns the env token and never touches Redis or the network", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(await getMetaToken("threads", NOW)).toBe("seed-threads");
    expect(fake.get).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is null when unconfigured", async () => {
    vi.stubEnv("THREADS_ACCESS_TOKEN", "");
    expect(await getMetaToken("threads", NOW)).toBeNull();
  });
});

describe("getMetaToken in production", () => {
  beforeEach(() => vi.stubEnv("VERCEL_ENV", "production"));

  it("seeds from env, refreshes straight away (age unknown), and stores the new token", async () => {
    expect(await getMetaToken("threads", NOW)).toBe("fresh");
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      "https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=seed-threads"
    );
    expect(fake.store.get("curio:social:token:threads")).toEqual({
      token: "fresh",
      refreshedAt: NOW.toISOString(),
      seed: "seed-threads",
    });
  });

  it("uses the stored token without refreshing while it's younger than a week", async () => {
    fake.store.set("curio:social:token:instagram", {
      token: "stored",
      refreshedAt: new Date(NOW.getTime() - REFRESH_AFTER_MS + 60_000).toISOString(),
      seed: "seed-ig",
    });
    expect(await getMetaToken("instagram", NOW)).toBe("stored");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refreshes Instagram via ig_refresh_token once a week old", async () => {
    fake.store.set("curio:social:token:instagram", {
      token: "stored",
      refreshedAt: new Date(NOW.getTime() - REFRESH_AFTER_MS - 1).toISOString(),
      seed: "seed-ig",
    });
    expect(await getMetaToken("instagram", NOW)).toBe("fresh");
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      "https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=stored"
    );
  });

  it("keeps the current token if the refresh fails, logging no token", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("{}", { status: 400 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await getMetaToken("threads", NOW)).toBe("seed-threads");
    const logged = warn.mock.calls.flat().map(String).join(" ");
    warn.mockRestore();
    expect(logged).toContain("[curio:threads] token refresh failed");
    expect(logged).not.toContain("seed-threads");
  });

  it("re-seeds when the owner replaces the env token in Vercel", async () => {
    fake.store.set("curio:social:token:threads", {
      token: "old-refreshed",
      refreshedAt: NOW.toISOString(),
      seed: "old-seed",
    });
    expect(await getMetaToken("threads", NOW)).toBe("fresh");
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("access_token=seed-threads");
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail.** `npx vitest run lib/metaTokens.test.ts`.

- [ ] **Step 3: Implement** `lib/metaTokens.ts`:

```ts
import { redis } from "./redis";

export type MetaChannel = "threads" | "instagram";

/** Meta's long-lived tokens last 60 days from their last refresh and can
 * be refreshed once they're 24h old. Refreshing weekly on the daily run
 * keeps them alive with weeks to spare. */
export const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 10_000;

type Stored = { token: string; refreshedAt: string; seed: string };

const ENV: Record<MetaChannel, string> = { threads: "THREADS_ACCESS_TOKEN", instagram: "INSTAGRAM_ACCESS_TOKEN" };
const REFRESH: Record<MetaChannel, (token: string) => string> = {
  threads: (t) => `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(t)}`,
  instagram: (t) => `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(t)}`,
};
const key = (channel: MetaChannel) => `curio:social:token:${channel}`;

/** The token to post with. Production keeps a refreshed copy in Redis
 * (the env value is only the seed); everywhere else just uses env, so a
 * local run can never read or rotate production's token. */
export async function getMetaToken(channel: MetaChannel, now: Date = new Date()): Promise<string | null> {
  const envToken = process.env[ENV[channel]] || null;
  if (process.env.VERCEL_ENV !== "production" || !redis) return envToken;

  let stored = await redis.get<Stored>(key(channel));
  if (envToken && (!stored || stored.seed !== envToken)) {
    // First run, or the owner replaced the token in Vercel: start from it.
    stored = { token: envToken, refreshedAt: new Date(0).toISOString(), seed: envToken };
  }
  if (!stored) return null;

  if (now.getTime() - Date.parse(stored.refreshedAt) < REFRESH_AFTER_MS) return stored.token;

  try {
    const res = await fetch(REFRESH[channel](stored.token), { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { access_token } = (await res.json()) as { access_token?: string };
    if (!access_token) throw new Error("no access_token in response");
    const next: Stored = { token: access_token, refreshedAt: now.toISOString(), seed: stored.seed };
    await redis.set(key(channel), next);
    return next.token;
  } catch (err) {
    // Never log the token itself.
    console.warn(`[curio:${channel}] token refresh failed:`, err instanceof Error ? err.message : "unknown error");
    await redis.set(key(channel), stored);
    return stored.token;
  }
}
```

(The failed-refresh path saves `stored` so that a first-run seed persists. Its `refreshedAt` stays old, so tomorrow's run tries again. That's intended: a token less than 24 hours old refreshes successfully the next day.)

In `.env.example`, after the Bluesky block, add:

```
# Threads + Instagram daily posts (app/api/cron/social). Leave unset to
# log the posts instead of publishing — the tokens are the on switch.
# Created by the owner in a Meta developer app (Threads API + Instagram
# API with Instagram Login); long-lived tokens, refreshed automatically
# into Redis in production (lib/metaTokens.ts). Never commit real values.
THREADS_USER_ID=
THREADS_ACCESS_TOKEN=
INSTAGRAM_USER_ID=
INSTAGRAM_ACCESS_TOKEN=
```

- [ ] **Step 4: Run the tests and confirm they pass,** then the full suite, lint and tsc.

- [ ] **Step 5: Commit.**

```bash
git add lib/metaTokens.ts lib/metaTokens.test.ts .env.example
git commit -m "feat: Meta tokens refreshed weekly into Redis (production only)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Post to Threads

**Files:**
- Create: `lib/threads.ts`
- Test: `lib/threads.test.ts`

**Interfaces:**
- Consumes: `buildThreadsPost`, `socialStoryUrl` (Task 1); `getMetaToken` (Task 3); `siteUrl` (`lib/siteUrl.ts`).
- Produces: `postDailyWordToThreads(word: WordEntry, opts?: { sleep?: (ms: number) => Promise<void> }): Promise<{ posted: boolean }>`. It never throws.

**Flow:**
1. Read `THREADS_USER_ID` and `await getMetaToken("threads")`. If either is missing, log `[curio:threads:dev-fallback] would post: <text>\n[link] <url>` and return `{ posted: false }`.
2. **Production localhost guard.** If `VERCEL_ENV === "production"` and `siteUrl()` starts with `http://localhost`, log `console.error("[curio:threads] CURIO_SITE_URL is not set in production — not posting")` and return `{ posted: false }`.
3. **Create the container.** `POST https://graph.threads.net/v1.0/<id>/threads`, with a form body of `media_type=TEXT`, `text`, `link_attachment=<socialStoryUrl(word, "threads")>` and `access_token`. It returns `{ id }`.
4. **Wait for processing.** Up to 6 times: `sleep(5000)`, then `GET https://graph.threads.net/v1.0/<container>?fields=status&access_token=…`. Stop on `FINISHED`. Throw on `ERROR` or `EXPIRED`. If it's still not `FINISHED` after 6 tries (about 30 seconds, per Meta's recommendation), try to publish anyway.
5. **Publish.** `POST https://graph.threads.net/v1.0/<id>/threads_publish`, with `creation_id=<container>` and `access_token`.
6. Every `fetch` gets `signal: AbortSignal.timeout(15_000)`. Any non-2xx or throw is caught: log `[curio:threads] post failed:` with the error message, which must never include the token, and return `{ posted: false }`.

- [ ] **Step 1: Write the failing tests** `lib/threads.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WORDS, type WordEntry } from "./words";

vi.mock("./metaTokens", () => ({ getMetaToken: vi.fn(async () => "tok-123") }));
const { postDailyWordToThreads } = await import("./threads");
const { getMetaToken } = await import("./metaTokens");

const word = WORDS.find((w) => w.slug === "ketchup") as WordEntry;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const noSleep = vi.fn(async () => {});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("THREADS_USER_ID", "u1");
  vi.stubEnv("CURIO_SITE_URL", "https://curioword.com");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(json({ id: "c1" }))
      .mockResolvedValueOnce(json({ status: "FINISHED" }))
      .mockResolvedValueOnce(json({ id: "post1" }))
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("postDailyWordToThreads", () => {
  it("creates a TEXT container with the link as link_attachment, waits for FINISHED, then publishes", async () => {
    expect(await postDailyWordToThreads(word, { sleep: noSleep })).toEqual({ posted: true });

    const [createUrl, createInit] = vi.mocked(fetch).mock.calls[0];
    expect(createUrl).toBe("https://graph.threads.net/v1.0/u1/threads");
    const body = new URLSearchParams(String(createInit?.body));
    expect(body.get("media_type")).toBe("TEXT");
    expect(body.get("text")).toContain("#etymology");
    expect(body.get("link_attachment")).toContain("/story/ketchup?utm_source=threads");

    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain("/v1.0/c1?fields=status");
    const [publishUrl, publishInit] = vi.mocked(fetch).mock.calls[2];
    expect(publishUrl).toBe("https://graph.threads.net/v1.0/u1/threads_publish");
    expect(new URLSearchParams(String(publishInit?.body)).get("creation_id")).toBe("c1");
  });

  it("logs instead of posting when there's no token or user id", async () => {
    vi.mocked(getMetaToken).mockResolvedValueOnce(null);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await postDailyWordToThreads(word, { sleep: noSleep })).toEqual({ posted: false });
    expect(log.mock.calls.flat().join(" ")).toContain("[curio:threads:dev-fallback]");
    log.mockRestore();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses to post a localhost link in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("CURIO_SITE_URL", "");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await postDailyWordToThreads(word, { sleep: noSleep })).toEqual({ posted: false });
    error.mockRestore();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["the create call fails", () => vi.mocked(fetch).mockReset().mockResolvedValueOnce(json({ error: { message: "bad" } }, 400))],
    ["the container errors", () =>
      vi.mocked(fetch).mockReset().mockResolvedValueOnce(json({ id: "c1" })).mockResolvedValueOnce(json({ status: "ERROR" }))],
    ["the network throws", () => vi.mocked(fetch).mockReset().mockRejectedValueOnce(new Error("socket hang up"))],
  ])("never throws, and logs without the token, when %s", async (_label, arrange) => {
    void _label;
    arrange();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await postDailyWordToThreads(word, { sleep: noSleep })).toEqual({ posted: false });
    const logged = error.mock.calls.flat().map(String).join(" ");
    error.mockRestore();
    expect(logged).toContain("[curio:threads] post failed");
    expect(logged).not.toContain("tok-123");
  });
});
```

(If lint flags `_label` even with `void`, restructure the `it.each` so there's no unused binding.)

- [ ] **Step 2: Run the tests and confirm they fail.** `npx vitest run lib/threads.test.ts`.

- [ ] **Step 3: Implement** `lib/threads.ts`:

```ts
import type { WordEntry } from "./words";
import { buildThreadsPost, socialStoryUrl } from "./socialPost";
import { getMetaToken } from "./metaTokens";
import { siteUrl } from "./siteUrl";

const API = "https://graph.threads.net/v1.0";
const TIMEOUT_MS = 15_000;
const POLL_EVERY_MS = 5_000;
const POLL_TRIES = 6; // ≈30s — Meta's recommended wait before publishing

async function call(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = (body.error as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body;
}

const form = (fields: Record<string, string>) => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(fields).toString(),
});

/** Today's word as a Threads text post, the story as its link card.
 * Never throws: the social cron runs unattended. Unconfigured → logs. */
export async function postDailyWordToThreads(
  word: WordEntry,
  opts: { sleep?: (ms: number) => Promise<void> } = {}
): Promise<{ posted: boolean }> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const text = buildThreadsPost(word);
  const link = socialStoryUrl(word, "threads");
  const userId = process.env.THREADS_USER_ID;
  const token = await getMetaToken("threads");

  if (!userId || !token) {
    console.log(`[curio:threads:dev-fallback] would post: ${text}\n[link] ${link}`);
    return { posted: false };
  }
  if (process.env.VERCEL_ENV === "production" && siteUrl().startsWith("http://localhost")) {
    console.error("[curio:threads] CURIO_SITE_URL is not set in production — not posting");
    return { posted: false };
  }

  try {
    const { id: container } = await call(
      `${API}/${userId}/threads`,
      form({ media_type: "TEXT", text, link_attachment: link, access_token: token })
    );
    for (let i = 0; i < POLL_TRIES; i++) {
      await sleep(POLL_EVERY_MS);
      const { status } = await call(`${API}/${container}?fields=status&access_token=${encodeURIComponent(token)}`);
      if (status === "FINISHED") break;
      if (status === "ERROR" || status === "EXPIRED") throw new Error(`container ${String(status)}`);
    }
    await call(`${API}/${userId}/threads_publish`, form({ creation_id: String(container), access_token: token }));
    return { posted: true };
  } catch (err) {
    console.error("[curio:threads] post failed:", err instanceof Error ? err.message : "unknown error");
    return { posted: false };
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass,** then the full suite, lint and tsc.

- [ ] **Step 5: Commit.**

```bash
git add lib/threads.ts lib/threads.test.ts
git commit -m "feat: post the daily word to Threads with a link card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Post the carousel to Instagram

**Files:**
- Create: `lib/instagram.ts`
- Test: `lib/instagram.test.ts`

**Interfaces:**
- Consumes: `buildCarouselSlides`, `buildInstagramCaption` (Task 1); `getMetaToken` (Task 3); `absoluteUrl`, `siteUrl` (`lib/siteUrl.ts`). Slide URLs are `absoluteUrl(\`/social/carousel/${word.slug}/${n}\`)` (Task 2's route).
- Produces: `postDailyCarouselToInstagram(word: WordEntry, opts?: { sleep?: (ms: number) => Promise<void> }): Promise<{ posted: boolean }>`. It never throws.

**Flow:**
1. Read `INSTAGRAM_USER_ID` and `await getMetaToken("instagram")`. If either is missing, log `[curio:instagram:dev-fallback] would post a <n>-slide carousel: <slide URLs, one per line>\n[caption] <caption>` and return `{ posted: false }`.
2. Apply the same production localhost guard as Threads, with the message `[curio:instagram] CURIO_SITE_URL is not set in production — not posting`.
3. **Child containers.** For each slide URL, one at a time and in order: `POST https://graph.instagram.com/v25.0/<id>/media` with `image_url`, `is_carousel_item=true` and `access_token`. Each returns `{ id }`.
4. **Carousel container.** `POST …/<id>/media` with `media_type=CAROUSEL`, `children=<ids joined by ",">`, `caption` and `access_token`. It returns `{ id }`.
5. **Wait for processing.** Up to 12 times: `sleep(5000)`, then `GET https://graph.instagram.com/v25.0/<carousel>?fields=status_code&access_token=…`. Stop on `FINISHED`. Throw on `ERROR` or `EXPIRED`. After 12 tries (60s) without `FINISHED`, throw `container not ready`. This deliberately stays inside the cron's budget rather than following Meta's five-minute guidance: images are fetched at child-creation time, so the carousel is normally ready within seconds.
6. **Publish.** `POST …/<id>/media_publish` with `creation_id=<carousel>` and `access_token`.
7. Use a 15s timeout on every fetch. Handle errors exactly as Threads does: `[curio:instagram] post failed:` with the message only, never the token.

- [ ] **Step 1: Write the failing tests** `lib/instagram.test.ts`. Mirror `lib/threads.test.ts`, with `vi.mock("./metaTokens", …)` returning `"tok-ig"`, `INSTAGRAM_USER_ID=ig1`, and `word = ketchup`. Ketchup's origin is 2 sentences, so its carousel has 5 slides. The happy-path stub is: five `json({ id: "child<n>" })` responses, then `json({ id: "car1" })`, then `json({ status_code: "FINISHED" })`, then `json({ id: "media1" })`. Assert:
   - Calls 0–4 go to `https://graph.instagram.com/v25.0/ig1/media`, with `image_url` = `https://curioword.com/social/carousel/ketchup/<n>` for n = 1..5, in order, and `is_carousel_item=true`.
   - Call 5 has `media_type=CAROUSEL`, `children=child1,child2,child3,child4,child5`, and `caption` equal to `buildInstagramCaption(ketchup)`.
   - Call 6 contains `/v25.0/car1?fields=status_code`.
   - Call 7 goes to `…/ig1/media_publish` with `creation_id=car1`.
   - The result is `{ posted: true }`.

   Also include:
   - the dev fallback, with no fetch and the log listing 5 slide URLs;
   - the production localhost guard;
   - an `it.each` of failures, each returning `{ posted: false }` and logging `[curio:instagram] post failed` without `tok-ig`:
     - a child create failing (400 on the first call);
     - the carousel status `ERROR`;
     - 12 polls of `IN_PROGRESS`, which gives `container not ready`, with exactly 12 status calls and no publish call;
     - a network throw.

- [ ] **Step 2: Run the tests and confirm they fail.** `npx vitest run lib/instagram.test.ts`.

- [ ] **Step 3: Implement** `lib/instagram.ts`:

```ts
import type { WordEntry } from "./words";
import { buildCarouselSlides, buildInstagramCaption } from "./socialPost";
import { getMetaToken } from "./metaTokens";
import { absoluteUrl, siteUrl } from "./siteUrl";

const API = "https://graph.instagram.com/v25.0";
const TIMEOUT_MS = 15_000;
const POLL_EVERY_MS = 5_000;
/** 60s, not Meta's suggested 5 minutes: images are fetched when each
 * child container is created, so the carousel is normally ready within
 * seconds, and the cron has a 300s ceiling. */
const POLL_TRIES = 12;

async function call(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = (body.error as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body;
}

const form = (fields: Record<string, string>) => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(fields).toString(),
});

/** Today's word as an Instagram carousel (slides from
 * /social/carousel/<slug>/<n>, JPEG). Never throws; unconfigured → logs. */
export async function postDailyCarouselToInstagram(
  word: WordEntry,
  opts: { sleep?: (ms: number) => Promise<void> } = {}
): Promise<{ posted: boolean }> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const slideUrls = buildCarouselSlides(word).map((_, i) => absoluteUrl(`/social/carousel/${word.slug}/${i + 1}`));
  const caption = buildInstagramCaption(word);
  const userId = process.env.INSTAGRAM_USER_ID;
  const token = await getMetaToken("instagram");

  if (!userId || !token) {
    console.log(
      `[curio:instagram:dev-fallback] would post a ${slideUrls.length}-slide carousel:\n${slideUrls.join("\n")}\n[caption] ${caption}`
    );
    return { posted: false };
  }
  if (process.env.VERCEL_ENV === "production" && siteUrl().startsWith("http://localhost")) {
    console.error("[curio:instagram] CURIO_SITE_URL is not set in production — not posting");
    return { posted: false };
  }

  try {
    const children: string[] = [];
    for (const image_url of slideUrls) {
      const { id } = await call(
        `${API}/${userId}/media`,
        form({ image_url, is_carousel_item: "true", access_token: token })
      );
      children.push(String(id));
    }
    const { id: carousel } = await call(
      `${API}/${userId}/media`,
      form({ media_type: "CAROUSEL", children: children.join(","), caption, access_token: token })
    );

    let ready = false;
    for (let i = 0; i < POLL_TRIES && !ready; i++) {
      await sleep(POLL_EVERY_MS);
      const { status_code } = await call(`${API}/${carousel}?fields=status_code&access_token=${encodeURIComponent(token)}`);
      if (status_code === "ERROR" || status_code === "EXPIRED") throw new Error(`container ${String(status_code)}`);
      ready = status_code === "FINISHED";
    }
    if (!ready) throw new Error("container not ready");

    await call(`${API}/${userId}/media_publish`, form({ creation_id: String(carousel), access_token: token }));
    return { posted: true };
  } catch (err) {
    console.error("[curio:instagram] post failed:", err instanceof Error ? err.message : "unknown error");
    return { posted: false };
  }
}
```

(The `(_, i)` in `.map` may warn under this lint config. If it does, use `Array.from({ length: n }, …)` with a named index, or `slides.map((slide, i) => { void slide; … })`, so lint stays at 3.)

- [ ] **Step 4: Run the tests and confirm they pass,** then the full suite, lint and tsc.

- [ ] **Step 5: Commit.**

```bash
git add lib/instagram.ts lib/instagram.test.ts
git commit -m "feat: post the daily carousel to Instagram

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The social cron (`/api/cron/social`) and the shared cron auth

**Files:**
- Create: `lib/cronAuth.ts`, `lib/cronAuth.test.ts`, `app/api/cron/social/route.ts`, `app/api/cron/social/route.test.ts`
- Modify:
  - `app/api/cron/send-daily/route.ts`: replace its inline CRON_SECRET block with `authorizeCron`. No behaviour change; its existing tests must pass untouched.
  - `lib/digestRuns.ts`: `export type Channel = "email" | "bluesky" | "threads" | "instagram";`, with `runKey` giving `curio:digest:threads:<day>` and `curio:digest:instagram:<day>`. The email and Bluesky keys stay unchanged, plus one test in `lib/digestRuns.test.ts`.
  - `vercel.json`: add the second cron.

**Interfaces:**
- Produces:
  - `authorizeCron(req: NextRequest): { secret: string | undefined; denied: NextResponse | null }`. `denied` is the 401 response when production has no `CRON_SECRET`, or when the bearer doesn't match. Otherwise it's null.
  - `GET /api/cron/social` responds `{ word, threads: boolean, instagram: boolean, alreadyRan: { threads: boolean, instagram: boolean } }`.
  - `?repost=threads|instagram` (valid `CRON_SECRET` only) forces that one channel's lock and posts it alone. Any other `repost` value, or any `repost` without a secret configured, is 400/401.
  - `export const maxDuration = 300`.

- [ ] **Step 1: Write the failing tests.**

`lib/cronAuth.test.ts` has four cases:
- with a secret and the right bearer, the result is `denied: null`;
- with a wrong bearer, the result is 401;
- with no secret in production, the result is 401;
- with no secret outside production, the result is `denied: null`, `secret: undefined`.

`app/api/cron/social/route.test.ts` uses the same scaffolding as `app/api/cron/send-daily/route.test.ts`:
- a Map-backed fake of `@/lib/redis` via `vi.hoisted`, with `set` (nx/ex) and `del`;
- `vi.stubEnv("VERCEL_ENV", "production")`;
- `CRON_SECRET=test-secret`;
- `resolveTodayWord` mocked to one shared object;
- `postDailyWordToThreads` and `postDailyCarouselToInstagram` mocked to `{ posted: true }`;
- a `console.log` spy for pristine output.

Tests:

```ts
it("posts today's shared word to both channels, from one instant", async () => {
  const body = await (await GET(cronRequest())).json();
  expect(vi.mocked(postDailyWordToThreads).mock.calls[0][0]).toBe(sharedWord);
  expect(vi.mocked(postDailyCarouselToInstagram).mock.calls[0][0]).toBe(sharedWord);
  expect(body).toEqual({ word: "custard", threads: true, instagram: true, alreadyRan: { threads: false, instagram: false } });
});

it("a second run the same UTC day posts nothing", async () => {
  await GET(cronRequest());
  const body = await (await GET(cronRequest())).json();
  expect(postDailyWordToThreads).toHaveBeenCalledTimes(1);
  expect(postDailyCarouselToInstagram).toHaveBeenCalledTimes(1);
  expect(body.alreadyRan).toEqual({ threads: true, instagram: true });
});

it("?repost=instagram re-posts Instagram only", async () => {
  await GET(cronRequest());
  const body = await (await GET(cronRequestTo("?repost=instagram"))).json();
  expect(postDailyCarouselToInstagram).toHaveBeenCalledTimes(2);
  expect(postDailyWordToThreads).toHaveBeenCalledTimes(1);
  expect(body).toMatchObject({ instagram: true, threads: false });
});

it.each(["?repost=email", "?repost=", "?repost=bluesky", "?repost=threads&repost=instagram"])(
  "rejects %s with 400 and posts nothing",
  async (q) => {
    expect((await GET(cronRequestTo(q))).status).toBe(400);
    expect(postDailyWordToThreads).not.toHaveBeenCalled();
    expect(postDailyCarouselToInstagram).not.toHaveBeenCalled();
  }
);

it("rejects a missing or wrong secret", async () => {
  expect((await GET(cronRequestTo("", ""))).status).toBe(401);
  expect((await GET(cronRequestTo("?repost=threads", "Bearer wrong"))).status).toBe(401);
  expect(postDailyWordToThreads).not.toHaveBeenCalled();
});

it("a failing channel doesn't stop the other, and the day's lock stays claimed", async () => {
  vi.mocked(postDailyWordToThreads).mockResolvedValueOnce({ posted: false });
  const body = await (await GET(cronRequest())).json();
  expect(body).toMatchObject({ threads: false, instagram: true });
});

it("pins maxDuration to 300", () => expect(maxDuration).toBe(300));
```

(For `?repost=threads&repost=instagram`, read `params.getAll("repost")`; more than one value is a 400. Define `cronRequest()` and `cronRequestTo(query, auth = "Bearer test-secret")` as in the send-daily tests.)

In `lib/digestRuns.test.ts`, add a test that `claimRun("threads", day)` and `claimRun("instagram", day)` are independent of each other and of `"email"`/`"bluesky"`, and that the keys are `curio:digest:threads:<day>` and `curio:digest:instagram:<day>` (Upstash backend, `VERCEL_ENV=production`).

- [ ] **Step 2: Run the tests and confirm they fail.**

- [ ] **Step 3: Implement.** Create `lib/cronAuth.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";

/** Every cron route's gate. Production without CRON_SECRET fails closed:
 * an open cron would email every subscriber and post publicly. */
export function authorizeCron(req: NextRequest): { secret: string | undefined; denied: NextResponse | null } {
  const secret = process.env.CRON_SECRET || undefined;
  if (!secret && process.env.NODE_ENV === "production") {
    return { secret, denied: NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 401 }) };
  }
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return { secret, denied: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { secret, denied: null };
}
```

In `app/api/cron/send-daily/route.ts`, replace the opening CRON_SECRET block with:

```ts
  const { secret, denied } = authorizeCron(req);
  if (denied) return denied;
```

Keep `secret` for the existing "overrides require CRON_SECRET" checks. The send-daily tests must pass unmodified.

In `lib/digestRuns.ts`, widen `Channel` and rewrite `runKey` as a lookup:

```ts
export type Channel = "email" | "bluesky" | "threads" | "instagram";

const RUN_KEY_PREFIX: Record<Channel, string> = {
  email: "curio:digest:run:",
  bluesky: "curio:digest:bluesky:",
  threads: "curio:digest:threads:",
  instagram: "curio:digest:instagram:",
};
const runKey = (channel: Channel, day: string) => `${RUN_KEY_PREFIX[channel]}${day}`;
```

Create `app/api/cron/social/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cronAuth";
import { resolveTodayWord } from "@/lib/words";
import { dayKey } from "@/lib/day";
import { claimRun, releaseRun, type Channel } from "@/lib/digestRuns";
import { postDailyWordToThreads } from "@/lib/threads";
import { postDailyCarouselToInstagram } from "@/lib/instagram";

/** Threads waits ~30s before publishing and Instagram up to 60s for its
 * carousel; 300s is the Hobby ceiling. */
export const maxDuration = 300;

type SocialChannel = Extract<Channel, "threads" | "instagram">;
const CHANNELS: SocialChannel[] = ["threads", "instagram"];

/** Configured in vercel.json at 0 10 * * * — Hobby fires it any time in
 * 10:00–10:59 UTC, after the 09:xx digest and Bluesky post, and separate
 * from them so a slow Instagram upload can never hold up email. Posts the
 * same shared word as every other surface. Idempotent per UTC day per
 * channel; `?repost=threads|instagram` (CRON_SECRET only) forces one
 * channel's lock and posts it alone — see handover.md. */
export async function GET(req: NextRequest) {
  const { secret, denied } = authorizeCron(req);
  if (denied) return denied;

  const reposts = req.nextUrl.searchParams.getAll("repost");
  if (reposts.length > 0 && !secret) {
    return NextResponse.json({ error: "repost requires CRON_SECRET" }, { status: 401 });
  }
  if (reposts.length > 1 || (reposts.length === 1 && !CHANNELS.includes(reposts[0] as SocialChannel))) {
    return NextResponse.json({ error: "Use repost=threads or repost=instagram" }, { status: 400 });
  }
  const repost = reposts[0] as SocialChannel | undefined;

  const now = new Date();
  const day = dayKey(now);
  const word = await resolveTodayWord(now);

  const claimed: SocialChannel[] = [];
  const run: Record<SocialChannel, boolean> = { threads: false, instagram: false };
  try {
    for (const channel of CHANNELS) {
      if (repost && channel !== repost) continue;
      run[channel] = await claimRun(channel, day, { force: channel === repost });
      if (run[channel]) claimed.push(channel);
    }
  } catch (err) {
    // Don't strand the day as "already ran" with nothing posted.
    for (const channel of claimed) await releaseRun(channel, day).catch(() => {});
    throw err;
  }

  const [threads, instagram] = await Promise.all([
    run.threads ? postDailyWordToThreads(word) : Promise.resolve({ posted: false }),
    run.instagram ? postDailyCarouselToInstagram(word) : Promise.resolve({ posted: false }),
  ]);

  const alreadyRan = {
    threads: !repost && !run.threads,
    instagram: !repost && !run.instagram,
  };
  const status = (ran: boolean, posted: boolean) => (!ran ? "skipped" : posted ? "posted" : "failed");
  console.log(
    `[curio:social] ${repost ? `repost-${repost}` : "scheduled"} ${day}: threads ${status(run.threads, threads.posted)}; instagram ${status(run.instagram, instagram.posted)}`
  );

  return NextResponse.json({ word: word.slug, threads: threads.posted, instagram: instagram.posted, alreadyRan });
}
```

(`releaseRun` already exists in `lib/digestRuns.ts`, from the email work. Confirm its signature before using it.)

`vercel.json` becomes:

```json
{
  "crons": [
    { "path": "/api/cron/send-daily", "schedule": "0 9 * * *" },
    { "path": "/api/cron/social", "schedule": "0 10 * * *" }
  ]
}
```

- [ ] **Step 4: Run the tests and confirm they pass,** including the untouched send-daily and sharedDay suites. Then the full suite, lint and tsc.

- [ ] **Step 5: Commit.**

```bash
git add lib/cronAuth.ts lib/cronAuth.test.ts lib/digestRuns.ts lib/digestRuns.test.ts app/api/cron vercel.json
git commit -m "feat: daily social cron for Threads and Instagram, with shared cron auth

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `npm run social:preview`

**Files:**
- Create: `lib/socialPreview.ts`, `lib/socialPreview.test.ts`, `scripts/previewSocialPosts.ts`
- Modify: `package.json` (`"social:preview": "tsx scripts/previewSocialPosts.ts"`)

**Interfaces:**
- Consumes: `getWordForDate` (`lib/words.ts`), `DAY_MS`/`dayKey`/`dayStart` (`lib/day.ts`), Task 1's builders, and `absoluteUrl`.
- Produces: `type SocialPreviewRow = { day: string; word: string; threads: string; threadsLink: string; caption: string; slides: { n: number; kind: Slide["kind"]; url: string }[] }` and `buildSocialPreview(from: Date, days: number): SocialPreviewRow[]`.

**Constraint:** the preview must never import `@atproto/api`, `lib/threads.ts`, `lib/instagram.ts`, `lib/metaTokens.ts`, `next/og` or `sharp`. It's read-only, with no network and no Redis. It imports only `lib/socialPost.ts`, `lib/words.ts`, `lib/day.ts` and `lib/siteUrl.ts`. See `lib/blueskyPost.ts`'s header for why: tsx can't load `@atproto/api`'s ESM-only dependencies.

- [ ] **Step 1: Write the failing test.** It mirrors `lib/blueskyPreview.test.ts`. From `2026-10-01T15:00:00Z` over 3 days:
  - the days are `2026-10-01` to `2026-10-03`;
  - each row's `word` is `getWordForDate` of that day;
  - `threads` equals `buildThreadsPost(w)`;
  - `threadsLink` contains `utm_source=threads`;
  - `caption` equals `buildInstagramCaption(w)`;
  - `slides.length` equals `buildCarouselSlides(w).length`, with URLs ending `/social/carousel/<slug>/<n>`.

- [ ] **Step 2: Run the test and confirm it fails.**

- [ ] **Step 3: Implement.** `lib/socialPreview.ts` should look like `lib/blueskyPreview.ts`. `scripts/previewSocialPosts.ts` prints, for each day:

```
── 2026-10-01 · jeans
[threads] <text>
          link: <threadsLink>
[instagram] <caption>
          slides: 1 hook   <url>
                  2 word   <url>
                  …
```

and ends with the same formula caveat as `bluesky:preview`. Usage is `npm run social:preview -- [days=7] [from=YYYY-MM-DD]`. Run it once with `CURIO_SITE_URL=https://curioword.com` and paste the full output into the report.

- [ ] **Step 4: Run the test and confirm it passes,** then the full suite, lint and tsc. Confirm the script runs with no Upstash vars set, with no errors.

- [ ] **Step 5: Commit.**

```bash
git add lib/socialPreview.ts lib/socialPreview.test.ts scripts/previewSocialPosts.ts package.json
git commit -m "feat: npm run social:preview — next days' Threads posts and Instagram carousels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Docs

**Files:** `handover.md`, `README.md`

- [ ] **Step 1: Update `handover.md`.**
  - **Decisions:** add Threads and Instagram as live channels. Record that the tokens are the on switch, and that the 10:00 UTC social cron runs separately from the 09:00 digest.
  - **Architecture map:** add bullets for `lib/socialPost.ts`, `lib/carouselImage.tsx` and the `/social/carousel/<slug>/<n>` route (JPEG via `sharp`, because Instagram accepts JPEG only; robots disallow). Also add `lib/metaTokens.ts` (weekly refresh into `curio:social:token:<channel>`, production only; re-seeds when the Vercel env token changes), `lib/threads.ts`, `lib/instagram.ts`, `lib/cronAuth.ts`, `app/api/cron/social` and `npm run social:preview`.
  - **Redis prefixes:** add `curio:social:`.
  - **Env vars:** add the four new ones.
  - **"Re-sending … (production)" subsection:** add the social repost commands:

    ```bash
    curl -sS -H "Authorization: Bearer $CURIO_CRON_SECRET" "https://curioword.com/api/cron/social?repost=threads"
    curl -sS -H "Authorization: Bearer $CURIO_CRON_SECRET" "https://curioword.com/api/cron/social?repost=instagram"
    ```

    Note the same caveats as Bluesky: today's UTC word only, and delete a wrong post in the app first.
  - **Owner setup:** add a section copied from this plan's "What the owner sets up".
  - **"This session (2026-09-29)" section:** cover what landed, the checked facts, and the test counts. Its `### Verification` holds exactly `Pending — filled in after the live slide review, token setup and the first real posts.`
- [ ] **Step 2: Update `README.md`.** Add a Threads + Instagram bullet under "What's implemented".
- [ ] **Step 3: Commit.**

```bash
git add handover.md README.md
git commit -m "docs: Threads + Instagram — handover and README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9 (controller): Review, deploy with posting off, owner setup, first posts

- [ ] **Step 1: Review.** Run the whole-branch review (superpowers:requesting-code-review, most capable model), then one fix wave.
- [ ] **Step 2: Clean install.**
  - Run `rm -rf node_modules .next && npm ci`, then `npm test`, `npm run lint` (3 warnings) and `npm run build`.
  - In the build output, `/story/[slug]` must still be `●` with 1,147 paths, and `/social/carousel/[slug]/[slide]` and `/api/cron/social` must be `ƒ`.
- [ ] **Step 3: Merge.** Merge to `master` locally, remove the worktree, then re-run the tests from the main checkout.
- [ ] **Step 4: Owner review, before deploy.**
  - Show the owner `npm run social:preview -- 7` (with `CURIO_SITE_URL=https://curioword.com`).
  - Show them the slides rendered locally: dev server, `localhost:3000/social/carousel/<slug>/<n>` for the next 7 days' words. Screenshot each word's slides, and include a non-Latin story such as `ketchup`.
  - Deploy only on the owner's go-ahead, outside 08:45–10:59 UTC, which is now both crons' windows.
- [ ] **Step 5: After deploy, posting is still off (no tokens).**
  - Check that `https://curioword.com/social/carousel/<today>/1` returns `image/jpeg`.
  - Check that `robots.txt` lists `/social/`.
  - Check that `GET /api/cron/social` without the secret returns 401.
  - The next 10:xx run logs dev-fallback lines only.
- [ ] **Step 6: Owner setup.** The owner does steps 1–5 of "What the owner sets up", and adds the tokens to Vercel Production as sensitive variables. Claude can run `vercel env add <NAME> production --sensitive` with the owner pasting each value.
  - The new env values need a redeploy to take effect. Trigger it with `vercel deploy --prod` from the main checkout, on the owner's go-ahead, outside the cron windows.
- [ ] **Step 7: First real posts, on the owner's go-ahead.** Either wait for the next 10:xx run, or have the owner run `?repost=threads` and `?repost=instagram` once each, with their `CRON_SECRET`, before 00:00 UTC. Then check:
  - **Threads:** the text reads as planned, `#etymology` is the topic tag, and the link card shows the story's image.
  - **Instagram:** the carousel shows every slide in order, the caption is right, and the non-Latin glyphs render.
- [ ] **Step 8: Record.** Put the results in the handover's Verification subsection, and update memory.
