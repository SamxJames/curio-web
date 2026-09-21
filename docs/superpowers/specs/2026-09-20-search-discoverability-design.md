# Search Discoverability — Design Spec

**Date:** 2026-09-20
**Plan:** `docs/superpowers/plans/2026-09-20-search-discoverability.md`

## Problem

Curio has 1,147 word-story pages at `/story/<slug>`. Effectively none of them
are discoverable by a search engine:

- There is no `sitemap.xml` and no `robots.txt`.
- **Nothing links to most of them.** `/history` is the only index, and it is
  built from `resolveUniqueWordsMostRecent()`, which is bounded by days
  elapsed since `START_DATE` (2026-01-01). Measured on 2026-09-20: that is
  **263 words maximum**, of which `HistoryList` renders **60** before a
  client-side "Show more" button. So ~884 of 1,147 words have never been
  linked from anywhere at all, and a crawler sees 60.
- Story pages carry no canonical URL and no structured data, and their
  `<meta name="description">` dumps the raw `origin` field.

## Measurements taken before planning (do not re-derive)

All figures are from the real repo at commit `02d20bc`, not estimates.

### Rendering (`next build`, baseline)

Every route in the app is `ƒ` (dynamic), including `/attribution`, which
contains no auth call whatsoever. `generateStaticParams` on `/story/[slug]`
is therefore dead weight — Next.js evaluates it and still serves the route
dynamically.

The cause is **`app/layout.tsx`'s `await auth()`** (added 2026-09-18 to feed
`SessionProvider` a server-resolved session). `auth()` reads cookies, which
opts the root layout — and therefore every route that shares it — into
dynamic rendering. `app/story/[slug]/page.tsx`'s own `auth()` call is a
second, independent cause.

Verified empirically by removing both and rebuilding:

| Route | Baseline | Both `auth()` calls removed |
|---|---|---|
| `/story/[slug]` | `ƒ` | `●` SSG, 1,147 paths prerendered |
| `/attribution` | `ƒ` | `○` static |
| `/login` | `ƒ` | `○` static |
| `/_not-found` | `ƒ` | `○` static |
| `/` | `ƒ` | `ƒ` (correct — it has its own `auth()` and must stay dynamic) |

**Fixing only the story page would have changed nothing.** The root layout
must stop calling `auth()` too.

### Why static rendering is worth doing here

Dynamic rendering does *not* hide a page from Google — Googlebot indexes
server-rendered HTML fine. The honest case for this work is cost and crawl
budget, and it is concrete: `app/story/[slug]/page.tsx` calls
`resolveHistory()`, which constructs 263 dates and issues a **263-key Redis
`mget` on every anonymous story-page view**, purely to print one date line
above the headword. A crawler walking 1,147 pages would issue 1,147 of them.

### Internal-link density (`related` prose)

`WordEntry.related` is a **prose sentence**, not structured data. There is no
list of related slugs anywhere in the data model. Naive matching of other
headwords inside that prose, measured across all 1,147 entries:

- 221 entries (19.3%) mention another headword; **926 pages would remain dead
  ends**.
- 255 total outbound links; distribution `{0: 926, 1: 190, 2: 28, 3: 3}`.
- False positives are common, because the match is on incidental English
  words rather than etymological relation: `salary → phrase`, `clue → sail`.

Prose matching is therefore rejected as the linking mechanism.

### Lineage buckets (the chosen linking mechanism)

`WordEntry.lineage` is structured (an array of language names, always ending
`"English"`). Measured over 1,147 entries:

- 167 distinct source languages. Largest: Middle English 560, Latin 553,
  Old French 309, Proto-Indo-European 246, Old English 239.
- 52 words have no non-English lineage entry.
- **65 words have no same-source-language peer at all.**

So a same-language block covers 1,082/1,147; the remaining 65 need a
fallback. Alphabetical prev/next over the full sorted word list forms a
single cycle through all 1,147 words, which guarantees every page has at
least two outbound links and that the whole set is reachable from any entry
point.

### Content facts

- 1,147 entries, all slugs unique, all 26 first letters represented.
- `teaser` length: min 40, median 81, **max 151** — every teaser already fits
  a meta description without truncation.
- Longest headword: 12 characters.

## Decisions

1. **Root layout drops `auth()`**; `SessionProvider` resolves the session
   client-side. To avoid regressing the nav flicker that the 2026-09-18
   server-session change fixed, add an optimistic localStorage "was signed
   in" hint to `lib/storage.ts`, read through `useSyncExternalStore` exactly
   like the existing `useHasOnboarded`. Approved by the user on 2026-09-20.
2. **Story page becomes purely static.** The session-dependent work (the
   personalised date, `recordUserSeen`) moves to a route handler
   (`GET /api/story/[slug]/date`) called by a small client component. The
   shared-calendar date moves there too, so the static HTML never depends on
   Redis or on build-time state that would go stale as the rotation advances.
3. **Internal linking is deterministic**, from `lineage` plus alphabetical
   neighbours — not from prose matching. Approved by the user on 2026-09-20.
4. **`/words` lists all 1,147 words**, not just the ~263 featured so far.
   Approved by the user on 2026-09-20, with the noted caveat that it makes
   the future rotation browsable.
5. **JSON-LD is `DefinedTerm`**, not `Article`. Curio has no author, no
   publication date, and no article body for these pages; `Article` would
   require inventing at least one of them. `DefinedTerm` + `inDefinedTermSet`
   is true as written.

## Non-goals

- No change to the email digest, the Bluesky post, the puzzle, or accounts.
- No new word content, and no edits to existing word content.
- `components/AdminDashboard.tsx` stays out of scope, as always.
- No `cacheComponents` / PPR migration. It is the "proper" Next 16 answer to
  a static shell with a streamed session, but it is an app-wide migration
  touching every uncached read in `/`, `/history`, `/play`, `/collection` and
  `/admin` — disproportionate to, and much riskier than, this task.
- `lib/words.ts`'s `resolve*` locking layer is not touched.
