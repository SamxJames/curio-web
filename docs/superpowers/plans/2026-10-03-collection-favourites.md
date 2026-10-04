# Collection = Favourites, History = Archive: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** give each idea one home.
- **Collection** (`/collection`, in the nav for everyone) shows **only the words you've favourited**. The language band and chips are drawn from those words.
- **History** (`/history`, not in the nav) is the archive: "My days" when signed in, plus "All words". Its Favorites tab and the History tab inside Collection both go.

**Architecture:**
- `/collection` stops requiring sign-in. It becomes a static page whose client component reads favourites from the existing localStorage store (`useFavorites`). That store is already synced to the account when signed in, via `AccountFavoritesSync`.
- The page fetches the favourites' word data from a new cacheable `GET /api/words?slugs=…`. It doesn't import `lib/words.ts` into the client bundle, because that file holds all 1,147 entries.
- `computeLanguageStats` is generalised to take any list of words with a `lineage`.
- The header nav becomes Today · Puzzle · Collection · Account/Sign in for everyone.
- History is linked from Today and from Collection.
- An old `/collection?tab=history` link redirects to `/history`.

**Tech Stack:** Next.js 16.3.4 App Router (route handlers, `next.config.ts` redirects), React 19, vitest.

**Spec:** the owner asked on 2026-10-03: "is the difference between collection and history clear? I think collection should be favourites only". They then approved the proposal: "yes to both". The proposal was:
- Collection is favourites only, with the language band drawn from favourites.
- It's in the nav for everyone, including signed out (favourites are device-local without an account).
- History is the archive (My days and All words), linked from Today and from Collection.
- The History tab inside Collection and the Favorites tab on `/history` are both removed.

## Global Constraints

- **One home per thing.** Favourites appear only on `/collection`. Day-by-day lists appear only on `/history`. Hearts stay on rows wherever words are listed, because favouriting from the archive is how things get into Collection.
- **"Archive, never backlog"** (AGENTS.md). No "seen X of Y" counts. Counting favourites is fine, since the person chose them.
- **Design system** (`docs/design-system.md`). Use `components/ui` primitives and tokens only, with no new arbitrary Tailwind values. Removing UI is fine. New UI reuses existing classes from the same files.
- **Favourite order:** the store's Set keeps insertion order, oldest first. Collection shows **newest first**.
- **`GET /api/words?slugs=a,b,c`:**
  - It returns `{ words: CollectionWord[] }` in the requested order.
  - Unknown slugs are dropped. Duplicates are de-duplicated.
  - It allows at most 500 slugs and returns 400 above that.
  - A missing or empty `slugs` returns `{ words: [] }`.
  - Headers: `Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800`.
  - It's public data: story content only, nothing personal.
- **The `CollectionWord` type** is exactly `{ slug, word, respelling, partOfSpeech, teaser, related, lineage }`, all taken from `WordEntry`.
- **`/collection` must prerender as static** (○) in `npm run build`. Story pages stay ●. `/history` stays dynamic.
- **Tests:** `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` must all pass.
- **Commits** end with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **No push or deploy without the owner's go-ahead.** Another Claude session shares the main checkout: work in a worktree, and check the branch before merging.

---

## File Structure

| File | Change |
|---|---|
| `lib/collection.ts` + test | `computeLanguageStats(words: { lineage: string[] }[])`. Adds `type CollectionWord` and `toCollectionWord(w: WordEntry)`. |
| `app/api/words/route.ts` + test (new) | `GET ?slugs=` returns the favourites' word data. |
| `components/CollectionScreen.tsx` | Rewritten around favourites: no tabs, no dates, a heart to remove, an empty state, a History link. |
| `app/collection/page.tsx` | No auth. Static. |
| `next.config.ts` | Redirects `/collection?tab=history` to `/history`. |
| `components/HistoryList.tsx` | Removes the Favorites tab. Hides the tab bar when only one tab is left. |
| `components/Header.tsx` | Collection for everyone. No History nav item. |
| `components/TodayHero.tsx` | Adds a quiet "Past words →" link to `/history`. |
| `handover.md`, `README.md` | Docs. |

---

### Task 1: Data layer (`computeLanguageStats`, `CollectionWord`, `/api/words`)

**Files:** `lib/collection.ts`, `lib/collection.test.ts`, `app/api/words/route.ts` (new), `app/api/words/route.test.ts` (new)

**Interfaces it produces:**
- `computeLanguageStats(words: { lineage: string[] }[]): LanguageStat[]`. Behaviour is unchanged: English is excluded, and ordering is by count descending, then name.
- `type CollectionWord = Pick<WordEntry, "slug" | "word" | "respelling" | "partOfSpeech" | "teaser" | "related" | "lineage">`
- `toCollectionWord(w: WordEntry): CollectionWord`
- `GET /api/words?slugs=`

- [ ] **Step 1: Tests first.**
  - In `lib/collection.test.ts`, change the `computeLanguageStats` tests to pass word objects directly, e.g. `computeLanguageStats([word("a", [...]), word("b", [...])])` rather than `day(...)` wrappers. Keep every existing expectation: exclusion, ordering and the opacity range.
  - Add a `toCollectionWord` test: it keeps exactly the seven fields and drops `origin`, `journey` and `clues`.
  - Create `app/api/words/route.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { WORDS } from "@/lib/words";

const get = (qs: string) => GET(new NextRequest(`http://localhost/api/words${qs}`));
const [a, b] = [WORDS[0].slug, WORDS[1].slug];

describe("GET /api/words", () => {
  it("returns the requested words, in request order, with only the collection fields", async () => {
    const res = await get(`?slugs=${b},${a}`);
    expect(res.status).toBe(200);
    const { words } = await res.json();
    expect(words.map((w: { slug: string }) => w.slug)).toEqual([b, a]);
    expect(Object.keys(words[0]).sort()).toEqual(
      ["lineage", "partOfSpeech", "related", "respelling", "slug", "teaser", "word"]
    );
  });

  it("drops unknown slugs and duplicates", async () => {
    const { words } = await (await get(`?slugs=${a},nope-not-a-word,${a}`)).json();
    expect(words.map((w: { slug: string }) => w.slug)).toEqual([a]);
  });

  it("returns an empty list for a missing or empty slugs param", async () => {
    expect((await (await get("")).json()).words).toEqual([]);
    expect((await (await get("?slugs=")).json()).words).toEqual([]);
  });

  it("rejects more than 500 slugs", async () => {
    const many = Array.from({ length: 501 }, (_, i) => `s${i}`).join(",");
    expect((await get(`?slugs=${many}`)).status).toBe(400);
  });

  it("is publicly cacheable", async () => {
    const res = await get(`?slugs=${a}`);
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=86400, stale-while-revalidate=604800");
  });
});
```

- [ ] **Step 2: Run them and check they fail.** Run `npx vitest run lib/collection.test.ts app/api/words`.

- [ ] **Step 3: Implement.**
  - **`lib/collection.ts`:**
    - Change the signature to `computeLanguageStats(words: { lineage: string[] }[])`, iterating `word.lineage`.
    - Update the doc comment.
    - Add:

```ts
/** The fields Collection shows for a favourited word — everything a row,
 * the language band and the closing note need, and nothing else (no
 * origin/journey/clues), so the favourites payload stays small. */
export type CollectionWord = Pick<
  WordEntry,
  "slug" | "word" | "respelling" | "partOfSpeech" | "teaser" | "related" | "lineage"
>;

export function toCollectionWord(w: WordEntry): CollectionWord {
  const { slug, word, respelling, partOfSpeech, teaser, related, lineage } = w;
  return { slug, word, respelling, partOfSpeech, teaser, related, lineage };
}
```

    Use `import type { WordEntry } from "./words"`. Keep the existing `HistoryDay` import if `groupByMonth` still needs it.
  - **`app/api/words/route.ts`:**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getWordBySlug } from "@/lib/words";
import { toCollectionWord, type CollectionWord } from "@/lib/collection";

const MAX_SLUGS = 500;
const CACHE = "public, s-maxage=86400, stale-while-revalidate=604800";

/** Story data for a list of slugs — Collection's favourites live in the
 * browser (lib/storage.ts), so the page asks for just those words rather
 * than shipping all 1,147 entries to the client. Public content only. */
export function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("slugs") ?? "";
  const slugs = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
  if (slugs.length > MAX_SLUGS) {
    return NextResponse.json({ error: "Too many slugs." }, { status: 400 });
  }
  const words: CollectionWord[] = slugs
    .map((s) => getWordBySlug(s))
    .filter((w): w is NonNullable<typeof w> => !!w)
    .map(toCollectionWord);
  return NextResponse.json({ words }, { headers: { "Cache-Control": CACHE } });
}
```

  - Update the other `computeLanguageStats` caller: `components/CollectionScreen.tsx` currently passes `entries`. Change it to `entries.map((e) => e.word)` **for now**, so this task compiles on its own. Task 2 rewrites the component.

- [ ] **Step 4: Check.**
  - The tests pass.
  - `npx tsc --noEmit` passes.
  - Read `node_modules/next/dist/docs/` on route handlers and confirm a GET handler that reads `req` is dynamic and that the `Cache-Control` header is honoured.

- [ ] **Step 5: Commit.**

```bash
git add lib/collection.ts lib/collection.test.ts app/api/words components/CollectionScreen.tsx
git commit -m "feat: /api/words for favourites; language stats take plain words"
```

---

### Task 2: Collection shows favourites only

**Files:** `components/CollectionScreen.tsx`, `app/collection/page.tsx`, `next.config.ts`

**Interfaces it uses:** `useFavorites`, `toggleFavorite` (`lib/storage.ts`); `CollectionWord`, `computeLanguageStats`, `pluralize`, `spellNumber`, `capitalize`, `WIDE_DOT` (`lib/collection.ts`); `GET /api/words`; `IconButton`, `Button`, `Eyebrow`, `ToggleGroup` (`components/ui`).

- [ ] **Step 1: `app/collection/page.tsx`** becomes:

```tsx
import CollectionScreen from "@/components/CollectionScreen";

export const metadata = { title: "Your collection — Curio" };

/** Favourites live in the browser (synced to the account when signed in),
 * so this page needs no session and prerenders as static. */
export default function CollectionPage() {
  return <CollectionScreen />;
}
```

- [ ] **Step 2: `next.config.ts`.** Add a redirect so old links to the removed tab still work:

```ts
const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/collection",
        has: [{ type: "query", key: "tab", value: "history" }],
        destination: "/history",
        permanent: false,
      },
    ];
  },
};
```

Read `node_modules/next/dist/docs/` on `redirects` with `has` first. Confirm the destination drops the query or needs `?` handling, and that this form is still current.

- [ ] **Step 3: Rewrite `components/CollectionScreen.tsx`.** It takes **no props**.

  **Data:**
  - `const favorites = useFavorites()`.
  - `const slugs = useMemo(() => [...favorites].reverse(), [favorites])`, newest first.
  - Fetch `/api/words?slugs=${slugs.map(encodeURIComponent).join(",")}` in an effect when `slugs` changes. Skip the fetch when `slugs` is empty.
  - Keep the result as `CollectionWord[]`, re-ordered to match `slugs`. When a slug is unfavourited, filter it out locally straight away, without refetching. Refetch only when a slug appears that isn't already loaded.
  - Track `status: "loading" | "ready" | "error"`.
  - `useFavorites()` returns an empty Set during server render and hydration. Render the loading state until the client store has been read; see `useClientOnlyValue` in `lib/storage.ts` for the pattern. Don't flash the empty state for someone who has favourites.

  **Layout:** keep the existing outer container, the h1 "Your collection", and the `CollectionBody` and `WordRow` visual language. Then make these changes:
  - **Subline:** `${n} ${pluralize(n, "word")}${WIDE_DOT}${langs} ${pluralize(langs, "language")}`. Drop "since <month>".
  - **Tab bar:** remove it, and delete `HistoryTabBody`.
  - **Language band and chips:** keep them exactly as they are, computed with `computeLanguageStats(words)`.
    - Keep "tap to filter", the `filterLine` and `clear`.
    - `bandNote` keeps its two variants. The dense one becomes "Widths are how many of your favourites passed through each language."
  - **Rows:** `WordRow` takes `word: CollectionWord` (no `entry` or date).
    - Remove the date column and the `Star` (every row is a favourite).
    - Add a remove control at the right: `IconButton` with a filled `Heart` (`size={16} strokeWidth={1.75} className="fill-accent text-accent"`), `label="Remove from collection"`, `bordered={false}`. Its `onClick` stops propagation and calls `toggleFavorite(word.slug)`.
    - Mirror `components/HistoryList.tsx`'s heart button markup.
    - Rows keep their `role="link"` click-through to the story.
    - Key rows by `word.slug`.
  - **Grouping:** month grouping no longer applies (favourites have no date). Always render one ungrouped list. Remove `groupByMonth`, `formatShortDate` and `monthLabel` imports if they're now unused.
  - **Closing note:** keep it ("A little more about {word}: {related}"), using the most recently favourited word (`words[0]`), with the same sparse, unfiltered condition.
  - **Empty state** (no favourites, `status === "ready"`):
    - `<p className="mt-7 font-serif text-base text-ink-soft italic">Nothing here yet. Tap the heart on any story to keep it here.</p>`
    - Below it, the History link (next bullet).
  - **Loading:** render the heading and nothing else. No spinner, no layout jump of more than a line.
  - **Error:** `<p className="mt-7 font-sans text-sm text-ink-soft">Couldn't load your collection. Try again in a moment.</p>`
  - **History link**, at the bottom in every state:
    - `<p className="mt-8 font-sans text-sm text-ink-soft"><Link href="/history" className="transition-colors hover:text-ink">Past words &rarr;</Link></p>`
    - This is the same pattern as HistoryList's "Browse all words A–Z" link.
  - Keep `track("collection_view")`.

- [ ] **Step 4: Check.**
  - `npx tsc --noEmit` and `npm run lint` pass.
  - `npm run build` passes, and **`/collection` must show as ○ (static)**.
  - The full `npx vitest run` passes.

- [ ] **Step 5: Commit.**

```bash
git add components/CollectionScreen.tsx app/collection/page.tsx next.config.ts
git commit -m "feat: Collection shows favourites only, for everyone; old history tab redirects"
```

---

### Task 3: History is the archive; nav and links

**Files:** `components/HistoryList.tsx`, `components/Header.tsx`, `components/TodayHero.tsx`

- [ ] **Step 1: `HistoryList.tsx`.**
  - Remove the `"favorites"` filter, its tab and the favorites branch in `visible`. `type Filter = "mine" | "all"`.
  - Tabs:
    - Signed in: "My days" and "All words".
    - Signed out: only "All words". **Don't render `SegmentedTabs` at all** when there's a single tab.
  - The empty-state copy loses its favorites branch.
  - Hearts on rows stay.
  - Update the comments that mention Favorites. The "Favorites always reads from the shared archive's dates" comment goes.
- [ ] **Step 2: `Header.tsx`.**
  - Every state shows **Collection** (`/collection`) where History or Collection showed before, so the `signed-in:hidden` / `signed-in:inline` dual render for that slot is no longer needed. Remove it and the `historyActive` variable.
  - Keep the Account / Sign in slot logic exactly as it is.
  - Update the arrival-hero comment that lists the nav links.
  - Check the header at 375px wide (signed out: Today · Puzzle · Collection · Sign in · theme) once merged. The controller does this in the browser.
- [ ] **Step 3: `TodayHero.tsx`.** After the two buttons, add a quiet link:
  - `<p className="mt-6 font-sans text-sm"><Link href="/history" className="text-ink-soft transition-colors hover:text-ink">Past words &rarr;</Link></p>`
  - Check `docs/design-system.md` for an established text-link treatment first, and use that if there is one.
- [ ] **Step 4: Check.**
  - `grep -rn "tab=history\|Favorites tab" components app lib` shows nothing stale.
  - `npx vitest run`, `npx tsc --noEmit`, `npm run lint` and `npm run build` all pass.
- [ ] **Step 5: Commit.**

```bash
git add components/HistoryList.tsx components/Header.tsx components/TodayHero.tsx
git commit -m "feat: History is the archive (My days / All words); Collection in the nav for everyone"
```

---

### Task 4: Docs

- [ ] **`handover.md`:**
  - **New section, "Collection vs History (2026-10-03)":** what each page is now and why (the owner said the difference was unclear). Cover the `/api/words` contract, the static `/collection`, the favourites order, the `?tab=history` redirect and the nav change.
  - **Older sections** that describe the Collection tab, History tab, "My days / All words / Favorites", or `/collection` requiring sign-in: mark them "superseded 2026-10-03", and don't delete history.
  - **`recordUserSeen`** no longer runs on `/collection`, which is now static. Note this, because it affects the admin retention metric slightly. Visits to Today and History still record it.
  - **A dated session section** with a Verification placeholder.
- [ ] **`README.md`:** the routes or pages list, if there is one.
- [ ] **Commit:** `docs: Collection = favourites, History = archive`.

---

## After the plan (controller)

- Final review, then merge into `master`. **Check which branch the main checkout is on first.**
- Browser check on the local dev server:
  - Signed out with no favourites, Collection shows the empty state and the "Past words" link.
  - Favouriting a word on a story page puts it in Collection, newest first, with the language band from favourites. Removing it with the heart takes it out at once.
  - `/collection?tab=history` lands on `/history`.
  - `/history` signed out shows no tab bar.
  - The header at 375px doesn't overflow.
- Push only with the owner's go-ahead.
