# Language pages ("Words from {language}"): design

Date: 2026-10-12 · Status: approved in chat by Sam · Implementation prompt: `2026-10-12-implementation-prompt.md` (same folder)

## Why

Search Console (28 days to 2026-10-09): ~593 story pages get impressions but only 5 clicks, and daily impressions fell
from ~1,300 to ~300. Each story page is one small page about one word. Language pages group those words into bigger,
more linkable pages that answer searches like "words from Arabic" or "English words with Old Norse origins", and give
Google a path between the story pages. Option B (topic themes such as "food words") was rejected for now: the word bank
has no topic tags, and tagging 1,147 words is its own content project.

## Product rules

- **Archive, never backlog** (`AGENTS.md`). A page may show a public total ("35 words"). It must never show anything
  per-reader: no seen/unseen marks, no "you've read 12 of 35", no favourites line.
- Only pages with real, reviewed content. A language with no approved sheet gets no page.

## 1. Which pages exist

A language gets a page when **both** are true:

1. it has an **approved** language sheet (`lib/languages/data.ts`), and
2. **3 or more** words have it anywhere in their `lineage` (the word passed through it), counted after folding aliases
   into the sheet's canonical name (`SHEET_NAMES` in `lib/languages/sheetIndex.ts`). "English" never counts. A word is
   counted once per language even if the name appears twice in its lineage.

Today that is 57 pages. Lombard (2 words) has a sheet but no page; Proto-West Germanic (140 words) gets a page once its
sheet is approved. The set is derived at build time, so each approved sheet batch adds pages without code changes.

New module `lib/languages/pages.ts` (server-only: it imports `WORDS` and the sheets) owns this:

- `languagePages(): LanguagePage[]`, where `LanguagePage = { name, slug, sheet, words: WordEntry[] }`, words sorted A to Z
  (`localeCompare(…, "en")`), pages in the order of the `/languages` index (word count descending, then name).
- `findLanguagePage(slug)`.
- `languageHref(name): string | null` returns `/language/{slug}` for a lineage name (canonical or alias) that has a
  page, otherwise null.
- Thresholds as named constants (`MIN_WORDS = 3`).
- Slugs come from the existing `languageSlug()` in `lib/languages/facts.ts`. Add a test that slugs are unique across pages.

## 2. Routes, titles, metadata

| Route | Rendering |
|---|---|
| `/language/[slug]` | Static, from `generateStaticParams()`; `dynamicParams = false` so unknown slugs 404 |
| `/languages` | Static index |

Follow the story route's patterns (`app/story/[slug]/page.tsx`). Read the relevant guide in `node_modules/next/dist/docs/`
first (see `AGENTS.md`: this Next.js version differs from training data).

- Title: `Words from {Name}: English words with {Name} origins | Curio`. For reconstructed proto-languages the same
  pattern is fine ("English words with Proto-Indo-European origins").
- Description: `{n} English words that passed through {Name}, each with its origin story. ` + the first sentence of
  `sheet.origin`, trimmed to about 155 characters at a word boundary.
- `alternates.canonical`: `/language/{slug}` and `/languages`.
- `/languages` title: `Words by language: where English words come from | Curio`.

## 3. The language page

Top to bottom, inside the usual `max-w-page` layout:

1. **H1** "Words from {Name}", with a one-line subhead: "{n} words in Curio passed through {Name} on their way into
   English."
2. **About panel**: the existing panel content (classification and status, where/map, when/timeline, speakers, family
   path, origin with the Wikipedia link), rendered on the page. Changes to the panel:
   - The favourites line ("N of your favourites passed through…") must not render here. Collection keeps it.
   - The family path's "next languages" use the lineages of **this page's words** instead of favourites.
   - **Client JS budget:** this page must not ship `lib/languages/data.ts` or `lib/words.ts` to the browser. Compute the
     panel model on the server and pass plain data to a presentational client view, splitting `LanguagePanelView` out
     of `components/LanguagePanel.tsx` if needed. Collection's dynamic-import behaviour must stay as it is. Check the
     production build output to confirm.
   - The panel's own `h2` showing the language name repeats the H1; drop or visually adapt it on this page so there is
     one clear heading order (H1, then section headings).
3. **Family links**: "{Name} grew out of {Parent}" and "Languages that grew out of {Name}: A, B, C". Each name links
   only if it has a page; names without a page are plain text, and a line with nothing to say is omitted. Parent comes
   from `sheet.parent`; children are approved sheets whose `parent` is this language.
4. **Word list**, A to Z: each item is the word (link to `/story/{slug}`) plus its `teaser`. Plain server-rendered
   markup, no pagination, no client component, the same reasoning as `/words`. Large pages (Middle English, 560) are fine
   as static HTML.
5. **JSON-LD**: a `DefinedTermSet` (`name`: "Words from {Name}", `url`, `hasDefinedTerm` listing each word as a
   `DefinedTerm` with `name` and `url`). Put the builder next to `buildStoryJsonLd` in `lib/storyJsonLd.ts` and use
   `serializeJsonLd`.

Design system: tokens and `components/ui/` primitives only (`docs/design-system.md`). No new arbitrary Tailwind values,
no hand-rolled buttons or inputs. Must work at 375px with no horizontal scroll.

## 4. Links in

- **Story pages:** `components/EtymologyLineage.tsx` gets an optional `hrefs?: Record<string, string>` prop (lineage
  name → href). A name with an href renders as a `next/link`. `StoryView` is a client component, so the server page
  (`app/story/[slug]/page.tsx`) builds the map for that word's lineage with `languageHref()` and passes it down through
  `StoryView`. Nothing language-related may be imported into client code to do this. Link style: same ink-soft text,
  underline on hover and focus, the existing longhand `:focus-visible` outline. It must not become a row of accent-coloured
  links. `TodayHero` is unchanged (no `hrefs`, so it stays plain text).
- **`/languages` index:** H1 "Words by language", a one-line intro, then every page as a row with the name (link), word
  count and era label (reuse `eraLabel` from `lib/languages/timeline.ts`), sorted by word count descending.
- **`/words`:** one sentence under the intro: "Or browse them by language." linking to `/languages`.
- **Sitemap:** `lib/seoRoutes.ts` adds `/languages` (weekly, 0.8) and each language page (monthly, 0.7). There's no
  `lastModified`, the same rule as the existing entries. Total today: 1,152 → 1,210 (adds `/languages` + 57 pages).
- `robots.txt` needs no change.

## 5. Testing

- `lib/languages/pages.test.ts`: the threshold (2 words → no page, 3 → page), an unapproved sheet → no page, alias
  folding (a word listing an alias counts toward the canonical page), English excluded, a duplicate name within one
  lineage counted once, A-to-Z order, unique slugs, `languageHref` for canonical name / alias / page-less name. Use
  injected fixtures where the module allows it, plus one smoke test against the real data (57 or more pages, includes
  `latin`).
- `lib/seoRoutes.test.ts`: the new entries are present, and the count equals public routes + words + 1 + pages.
- `lib/storyJsonLd.test.ts`: the `DefinedTermSet` builder.
- Component test: `EtymologyLineage` renders links only for names in `hrefs`, and plain spans otherwise.
- Browser (dev server): `/language/latin`, `/language/arabic`, a small page (3–5 words), and `/languages`, at desktop
  and 375px, light and dark. A story page's lineage line, with Tab presses through its links. A 404 for `/language/nope`.
  No console errors.
- Production after deploy: the sitemap has 1,210 `<loc>`s, `/language/latin` returns 200 with its JSON-LD, the
  story-page lineage links resolve, and Google's Rich Results Test passes for one language page (or the URL Inspection
  API reports it as fetchable).

## Out of scope

Topic themes, any Collection change, search, per-reader anything on these pages, and Lombard / Proto-West Germanic sheets
(the normal sheet pipeline handles those).
