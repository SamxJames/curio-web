# Language Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** on Collection, after tapping a language chip, "About {language}" opens a panel about that language. The panel shows:
- **where** it was spoken, as a dot map with the region lit;
- **when**, as a lifespan bar on a timeline shared by every language;
- **speakers at its peak**, or an honest "no reliable count";
- **its family path**;
- **where it came from**, with a source link.

**Architecture:**
- **Content.** Facts live in one static, reviewed module, `lib/languages/data.ts`. A three-step pipeline produces it, mirroring the word pipeline (extract, rewrite, approve):
  1. `languages:facts` fetches Wikipedia summaries and Wikidata claims per language.
  2. `languages:draft` has Claude write a fact sheet using **only** those facts.
  3. `languages:approve` validates the owner-reviewed sheet and writes it into the module.
- **Only approved sheets** get an "About" link. Languages without one keep today's behaviour, so the panel can ship before all 168 languages are reviewed.
- **The map** is a dot matrix sampled once from public-domain Natural Earth land data by a dev-only script, into a committed module. The panel loads it with a dynamic import, so nothing is added to the Collection page's initial bundle.
- **Pure helpers** (timeline position, map projection and highlight, alias resolution, family path) live in `lib/languages/` and are unit-tested.

**Tech Stack:**
- Next.js 16.3.4, React 19 and vitest;
- tsx scripts;
- Anthropic Messages API, called through `fetch` (as in `scripts/rewriteEtymology.ts`);
- Wikipedia REST and Wikidata APIs, which are public;
- dev-only `d3-geo`, `topojson-client` and `world-atlas` (Natural Earth 110m, public domain).

**Spec:**
- **The owner's request (2026-10-04):** "when you click on a language you should be able to find out more about the language: location(s); when it was primarily used and how many peak amount of speakers did it have; origin of that language; try and be visually creative in how we show this information."
- **Approvals.** The owner approved the proposal and the mockup with "go ahead" and then "write the language plan". The proposal was:
  - Wikipedia-sourced fact sheets that the owner reviews;
  - an honest "unknown" where facts don't exist, with no invented numbers;
  - a map, a timeline and a family path;
  - an "About {language}" link from the filter line;
  - duplicate names merged.
- **The mockup** (shown in chat on 2026-10-04) has these parts:
  - an eyebrow "Language", the name, and a one-line classification;
  - **Where**: the dot map, plus a one-line region caption;
  - **When**: a timeline from 4500 BCE to now, with the lifespan bar, a faint tail for later written-only use, and a "now" tick;
  - **Speakers at its peak**: a big line, plus a note;
  - **Family path**: chips with "›" between them. Reconstructed languages have dashed borders, and the current language is accented;
  - **Where it came from**: 2–3 sentences, plus "Source: Wikipedia".

## Global Constraints

- **Never invent facts.**
  - Each sheet's prose and numbers must come from the fetched facts.
  - When peak speakers are unknown, `peakSpeakers` is `null` and the copy uses `unknownSpeakersNote`.
  - The panel shows that note, never a number Claude guessed.
- **Reconstructed languages:** `status: "reconstructed"` covers every `Proto-*` language plus others the facts mark that way. They get a dashed bar and dashed chips, and the note "Reconstructed by scholars — never written down."
- **Owner review gates everything.** Only sheets with `approved: true` render. `languages:approve` refuses any sheet that fails validation.
- **Attribution.** Every sheet has `sourceUrl` (Wikipedia). The panel shows "Source: Wikipedia" linked to it, and the existing `/attribution` page gets a line about language facts (CC BY-SA).
- **No new client weight on Collection's first load.** The panel and map dots load with a dynamic `import()` when "About …" is first pressed.
- **Dev dependencies only:** `d3-geo`, `topojson-client`, `world-atlas` and `@types/d3-geo` go in `devDependencies`. They're used only by `scripts/languages/buildMapDots.ts`. Nothing in `app/` or `components/` may import them.
- **Design system:** tokens and `components/ui` only, with no new arbitrary Tailwind values. SVG inline styles for computed geometry are fine, as are colour tokens through CSS vars, e.g. `var(--accent)`. Typography follows Collection's existing patterns: `Eyebrow`, `font-serif`, `text-ink-soft`.
- **Accessibility:**
  - The "About" control is a `Button` with `aria-expanded` and `aria-controls`.
  - The panel is an inline region (`<section aria-labelledby>`), not a modal.
  - The map SVG has `role="img"` and an `aria-label` naming the region.
  - The timeline SVG has an `aria-label` with the dates in words.
- **Principle:** "archive, never backlog". Counts are about the reader's own favourites, e.g. "3 of your favourites passed through Latin". There are no totals or "you haven't seen".
- **Scripts:**
  - Read `ANTHROPIC_API_KEY` from `.env.local` with `tsx --env-file=.env.local`.
  - Never log the key.
  - Network scripts are never run in tests: tests cover only the pure parsing and validation.
  - The model is `claude-sonnet-5-5`.
- **Tests:** `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` must all pass. Collection stays ○, and story pages stay ●.
- **Commits** end with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **No push or deploy without the owner's go-ahead.** Another Claude session shares the main checkout, so work in a worktree and update `master` without checking it out.

---

## Data model (shared by every task)

```ts
// lib/languages/types.ts
export type LanguageStatus = "living" | "extinct" | "historical" | "reconstructed";
// historical = an earlier stage of a language still spoken today (Old English, Middle French…)

export type LanguageSheet = {
  name: string;               // canonical display name, exactly as in word lineages (e.g. "Latin")
  aliases: string[];          // other lineage spellings that mean the same language (e.g. ["Lombardic"])
  status: LanguageStatus;
  classification: string;     // one line, e.g. "Italic branch of the Indo-European family"
  region: string;             // one line, e.g. "Latium, central Italy → across the Roman Empire"
  map: { lat: number; lon: number; radiusKm: number } | null; // centre + rough spread; null if no location is known
  era: {
    from: number;             // year, negative = BCE (e.g. -700)
    to: number | null;        // null = still spoken natively today
    writtenUntil?: number | null; // optional faint tail: still used in writing (null = to now)
    approximate: boolean;
  } | null;                   // null = dates unknown
  peakSpeakers: { count: number; year: number; note?: string } | null;
  unknownSpeakersNote: string | null; // required when peakSpeakers is null
  parent: string | null;      // canonical name of the language it descends from, if in our data
  origin: string;             // 2–3 sentences, only from the fetched facts
  sourceUrl: string;          // https://en.wikipedia.org/wiki/...
  approved: boolean;
};
```

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/languages/types.ts` (new) | The types above. |
| `lib/languages/validate.ts` + test (new) | `validateSheet(sheet): string[]` (a list of problems; empty means valid). |
| `lib/languages/data.ts` (new) | `export const LANGUAGE_SHEETS: LanguageSheet[]`, written by `languages:approve`. Starts as `[]`. |
| `lib/languages/lookup.ts` + test (new) | `findSheet(name)` (alias-aware, approved only); `familyPath(name)`; `nextLanguages(name, lineages)`. |
| `lib/languages/timeline.ts` + test (new) | The shared axis and `yearToX`, `formatYear` and `eraLabel`. |
| `lib/languages/mapGeometry.ts` + test (new) | Equirectangular projection, `dotsInView`, `isLit` (haversine). |
| `lib/languages/mapDots.ts` (generated, committed) | `export const LAND_DOTS: [lon: number, lat: number][]` |
| `scripts/languages/buildMapDots.ts` (new) | Samples Natural Earth land on a 1.5° grid and writes `mapDots.ts`. |
| `scripts/languages/fetchFacts.ts` (new) + `lib/languages/facts.ts` + test | Wikipedia and Wikidata fetch, plus pure parsing into a facts bundle. |
| `scripts/languages/draftSheets.ts` (new) + `lib/languages/draftPrompt.ts` + test | Claude drafts, one JSON per language in `content/languages/drafts/`. |
| `scripts/languages/approveSheets.ts` (new) | Validates the reviewed drafts and writes `lib/languages/data.ts`. |
| `scripts/languages/reviewPage.ts` (new) | Writes `content/languages/review.html` so the owner can read every draft as it will look. |
| `components/LanguagePanel.tsx` (new) | The panel UI (map, timeline, speakers, family, origin). |
| `components/CollectionScreen.tsx` | The "About {language}" control in the filter line, and the lazy panel. |
| `app/attribution/page.tsx` | A line for language facts. |
| `package.json` | Scripts and dev deps. |
| `handover.md`, `README.md` | Docs. |

---

### Task 1: Types, validation, lookup, timeline, map geometry (all pure)

**Files:** `lib/languages/{types,validate,lookup,timeline,mapGeometry,data}.ts` + tests

- [ ] **Step 1: Write the tests first.** Required cases:

  **`validate.test.ts`**
  - A complete valid sheet passes.
  - Each of the following produces a problem:
    - an empty `name`;
    - an `origin` longer than 600 characters or shorter than 40;
    - a `sourceUrl` that doesn't start with `https://en.wikipedia.org/wiki/`;
    - `peakSpeakers === null` with an empty `unknownSpeakersNote`;
    - a non-positive or non-integer `peakSpeakers.count`;
    - `era.to < era.from`;
    - `map.lat` outside ±90, `map.lon` outside ±180, or `map.radiusKm` outside 1–5000;
    - a `Proto-` name whose status isn't `reconstructed`;
    - a reconstructed language with `peakSpeakers` set.

  **`lookup.test.ts`** (pass sheets as an argument, so tests don't depend on `data.ts`)
  - `findSheet` matches the canonical name and the aliases.
  - It ignores unapproved sheets.
  - It returns undefined for unknown names.
  - `familyPath("Latin")` walks `parent` up to the root, oldest first, e.g. `["Proto-Indo-European","Proto-Italic","Latin"]`.
  - `familyPath` stops on a cycle or a missing parent.
  - `nextLanguages("Latin", [["Latin","Old French","English"],["Latin","English"],["Proto-Italic","Latin","Old French","English"]])` returns `["Old French","English"]`: the unique next steps, in first-seen order.

  **`timeline.test.ts`**
  - `AXIS = { from: -4500, to: currentYear }`.
  - `yearToX(-4500, 300) === 0`, and `yearToX(AXIS.to, 300) === 300`.
  - Values are clamped outside the axis.
  - `formatYear(-700) === "700 BCE"`, `formatYear(600) === "600 CE"`, and `formatYear(1400) === "1400"` (CE is shown only below 1000).
  - `eraLabel({from:-700,to:600,approximate:true}) === "c. 700 BCE – 600 CE"`.
  - `eraLabel({from:1100,to:null,approximate:false}) === "1100 – today"`.

  **`mapGeometry.test.ts`**
  - `project([0,0], view)` maps to the centre of the view.
  - `viewAround({lat,lon,radiusKm})` returns a lon/lat box at least 30°×18° wide and padded to 2.5× the radius, clamped to the world.
  - `dotsInView` filters to the box.
  - `isLit(dot, centre, radiusKm)` is true inside the haversine radius and false outside. Test with Rome (41.9, 12.5) at 600 km: Florence (43.8, 11.25) is in, London (51.5, −0.1) is out.

- [ ] **Step 2: Implement them so the tests pass.**
  - `data.ts` starts as `export const LANGUAGE_SHEETS: LanguageSheet[] = [];`, with a header comment: "written by scripts/languages/approveSheets.ts — edit drafts, not this file."
  - `findSheet(name, sheets = LANGUAGE_SHEETS)`, and likewise for the others, so tests can inject sheets.
- [ ] **Step 3: Commit.**

```bash
git commit -m "feat: language sheet types, validation, lookup, timeline and map geometry"
```

### Task 2: Map dots generator

**Files:** `scripts/languages/buildMapDots.ts`, `lib/languages/mapDots.ts` (generated), `package.json`

- [ ] **Step 1: Add the dev deps.** Run `npm i -D d3-geo topojson-client world-atlas @types/d3-geo @types/topojson-client`.
- [ ] **Step 2: Write the script.**
  - Load `world-atlas/land-110m.json`, convert it with `topojson-client`'s `feature`, and test points with `d3-geo`'s `geoContains`.
  - Sample on a 1.5° grid: lon −180 to 178.5, lat −58.5 to 81 (Antarctica is skipped).
  - Write `lib/languages/mapDots.ts` with a header comment naming the source (Natural Earth via world-atlas, public domain) and the grid.
  - Write numbers with at most one decimal place.
- [ ] **Step 3: Add `"languages:map": "tsx scripts/languages/buildMapDots.ts"` to `package.json`.** Run it.
  - Expect roughly 5,000–7,000 dots and a file under 150 KB.
  - Sanity-test `mapDots.ts`: Rome (≈42,12.5) has a dot within 1.5°, and the mid-Atlantic (30,−40) has none.
- [ ] **Step 4: Check that no file under `app/` or `components/` imports `d3-geo`, `topojson-client` or `world-atlas`.** Add a small test that greps the source tree to enforce it.
- [ ] **Step 5: Commit.**

### Task 3: Content pipeline (facts → draft → review page → approve)

**Files:** `lib/languages/facts.ts` + test, `lib/languages/draftPrompt.ts` + test, `scripts/languages/{fetchFacts,draftSheets,reviewPage,approveSheets}.ts`, `package.json`, `content/languages/.gitkeep`

- [ ] **Step 1: Language list.** `lib/languages/facts.ts` exports `collectLineageLanguages(words)`: the unique lineage names minus `English` and `Translingual`, sorted by how many words use them, descending.
- [ ] **Step 2: Aliases.** Export `ALIASES: Record<string,string>`, mapping alias to canonical name:
  - `Lombardic`→`Lombard`
  - `Kiswahili`→`Swahili`
  - `Ottoman`→`Ottoman Turkish`
  - `Old Provençal`→`Old Occitan`

  Also export `SKIP = ["English","Translingual","Phrygian or Anatolian","Indian English","Late Middle English"]`. Sheets for aliases are merged under the canonical name, and the alias goes into `aliases`. Test that every name in `ALIASES` and `SKIP` really occurs in `WORDS` lineages, so stale entries fail loudly.
- [ ] **Step 3: Pure parsing, with tests using fixture JSON, not the network.**
  - `parseWikipediaSummary(json)` returns `{ title, extract, url }`, using the `content_urls.desktop.page` URL.
  - `parseWikidataClaims(entityJson)` returns these, each value or null:
    - `coordinates` from P625 (first value);
    - `inception` from P571, as a year (negative for BCE);
    - `dissolved` from P576, as a year;
    - `speakers` from P1098, the max amount with its point-in-time year (P585) where present;
    - `instanceOf` labels, used only to help classification.
- [ ] **Step 4: The `fetchFacts.ts` script.** For each language:
  - **Request:** call `https://en.wikipedia.org/api/rest_v1/page/summary/{Name}_language`, falling back to `{Name}` if it 404s or if the page isn't about a language. Use the `wikibase_item` from the summary to fetch `https://www.wikidata.org/wiki/Special:EntityData/{Q}.json`.
  - **Etiquette:** send a descriptive `User-Agent` (`CurioLanguageFacts/1.0 (curioword.com; hello@curioword.com)`), wait 300 ms between requests, and retry once on 429 or 5xx.
  - **Output:** write `content/languages/facts/<slug>.json` containing `{ name, wikipedia, wikidata, fetchedAt }`.
  - **Resumable:** skip files that already exist unless `--refresh` is passed.
  - **Usage:** `npm run languages:facts -- [--only "Latin,Old Norse"] [--limit 30]`.
- [ ] **Step 5: `draftPrompt.ts`.** `buildSheetPrompt(name, facts)` returns the prompt text. It must:
  - list the facts as the **only** allowed source, in the same style as `buildRewritePrompt` in `scripts/rewriteEtymology.ts`;
  - require JSON matching `LanguageSheet` minus `approved`;
  - forbid guessing speaker counts. With no `speakers` fact, it requires `peakSpeakers: null` and an honest `unknownSpeakersNote`, e.g. "No census of its speakers exists." or "Reconstructed by scholars — never written down.";
  - require `status: "reconstructed"` for `Proto-*`;
  - require `map: null` when no location is stated or implied by the facts. A region named in the extract is allowed: the model may give that region's approximate centre and spread.
  - set the voice to match Curio: warm, curious, precise, never academic or cute, with no streak or FOMO words.

  Test that the prompt contains every fact, the "only" rule, the null-speakers rule and the JSON field list.
- [ ] **Step 6: The `draftSheets.ts` script.**
  - For each facts file without a draft, call the Messages API through `fetch`, exactly as `rewriteEtymology.ts` does. Use model `claude-sonnet-5-5` and `max_tokens` 1200.
  - Parse the JSON, set `approved: false`, run `validateSheet`, and write `content/languages/drafts/<slug>.json`, putting any validation problems in `_problems`.
  - Print a one-line summary per language and the total tokens used. Never print the key.
- [ ] **Step 7: The `reviewPage.ts` script.** Write `content/languages/review.html`: a self-contained page with one card per draft.
  - Each card shows every field in plain text: the era label, speakers or the unknown note, region, origin, classification, parent and source link.
  - Problems are shown in red.
  - It doesn't need the map.
  - This page is local only, and `content/languages/review.html` is git-ignored.
- [ ] **Step 8: The `approveSheets.ts` script.**
  - `npm run languages:approve -- --all-valid | --only "Latin,Old French"` sets `approved: true` on the named drafts that pass validation, then writes `lib/languages/data.ts`.
  - The output is canonical-sorted, with a header comment and a `satisfies LanguageSheet[]`.
  - It refuses any draft with `_problems`.
  - Its pure core goes in `lib/languages/approve.ts` with tests: invalid sheets are refused, aliases are merged, and the output is stable.
- [ ] **Step 9: `package.json` scripts.** Add `languages:facts`, `languages:draft`, `languages:review` and `languages:approve`, each run as `tsx --env-file=.env.local …` where a key is needed.
- [ ] **Step 10: Verify and commit.**
  - `npm test`, `tsc` and `lint` pass.
  - **Don't run the network scripts in the task.** The controller runs them with the owner.
  - Commit with `feat: language fact pipeline (facts, draft, review page, approve)`.

### Task 4: The panel

**Files:** `components/LanguagePanel.tsx` (new), `components/CollectionScreen.tsx`, `app/attribution/page.tsx`

- [ ] **Step 1: The "About" control in `CollectionScreen`.** When a language is active and `findSheet(activeLanguage)` exists, the filter line gains `<Button variant="link" …>About {sheet.name}</Button>` beside "clear", in the same style as clear. Pressing it toggles the panel open. If there's no approved sheet, nothing changes from today.
- [ ] **Step 2: Load the panel lazily.**
  - Use `const LanguagePanel = dynamic(() => import("./LanguagePanel"), { ssr: false, loading: () => null })`, with `next/dynamic`. Read `node_modules/next/dist/docs/` on lazy loading first, because this Next.js differs from training data.
  - `LanguagePanel` itself does `import("@/lib/languages/mapDots")` inside an effect, so the dots load only when the panel opens.
- [ ] **Step 3: `LanguagePanel({ sheet, favouriteLineages, favouriteCount })` renders** the sections in the mockup's order, inside `<section aria-labelledby>` below the filter line. Use the existing tokens and primitives:
  - **Header:**
    - `Eyebrow` "Language";
    - the name in `font-serif text-4xl leading-display` (the Collection h1 scale);
    - the classification and the status note:
      - living: "spoken today";
      - extinct: "no native speakers today";
      - historical: "an earlier stage of {nearest descendant in the family path, or 'a living language'}";
      - reconstructed: "reconstructed by scholars".
  - **Where:**
    - An SVG dot map of `viewAround(sheet.map)`: dots in `text-line-strong`, and lit dots in `var(--accent)` at a larger radius. Add a ring at the centre.
    - The `region` line below it.
    - If `map` is null, show the region line only.
  - **When:**
    - An SVG timeline on the shared `AXIS`: a baseline, the `era` bar in accent (minimum width 4px), and the `writtenUntil` tail at 35% opacity.
    - A "now" tick labelled "now", plus `eraLabel` above the bar.
    - Axis labels at "4500 BCE" and "1000 BCE".
    - Reconstructed languages get a dashed outline bar with no fill.
    - If `era` is null, show "Dates unknown".
  - **Speakers at its peak:**
    - Either the count, formatted with `Intl.NumberFormat("en-GB", { notation: "compact" })` (e.g. "4.5M"), with its year and note.
    - Or the large line "No reliable count" with `unknownSpeakersNote` beneath it.
  - **Family path:**
    - `familyPath(name)` chips, then the current language (accented), then `nextLanguages(name, favouriteLineages)` chips, then "English".
    - "›" separators, using the existing chip classes from the Collection chips.
    - Reconstructed chips have a dashed border.
    - The caption: "Dashed: reconstructed, never written down". Show it only when at least one dashed chip is visible.
  - **Your favourites:** "{n} of your favourites passed through {name}", using `pluralize`.
  - **Where it came from:** the `origin` paragraph (`font-serif`), then "Source: Wikipedia" as a link to `sourceUrl` (`target="_blank" rel="noopener noreferrer"`).
- [ ] **Step 4: Behaviour.**
  - Changing or clearing the active language closes the panel.
  - The panel's open state isn't persisted.
  - It's keyboard reachable, and the "About" button reflects `aria-expanded`.
- [ ] **Step 5: `/attribution`.** Add one paragraph: language facts are adapted from Wikipedia and Wikidata (CC BY-SA and CC0), summarised by the same offline language-model pass under a no-invention rule, and reviewed before publishing.
- [ ] **Step 6: Test fixtures.** Add a test-only fixture sheet for Latin under `lib/languages/__fixtures__/`, used by unit tests of any pure helpers added in this task. Don't add it to `data.ts`, which stays empty in the code tasks.
- [ ] **Step 7: Verify.**
  - `npm test`, `tsc`, `lint` and `build` all pass.
  - `/collection` stays ○.
  - The build output shows the panel chunk as separate. Check `.next` for a chunk containing `LAND_DOTS` that isn't in the `/collection` page's initial chunks, and report how you checked.
- [ ] **Step 8: Commit.** `feat: language panel on Collection (map, timeline, speakers, family, origin)`

### Task 5: Docs

- [ ] **`handover.md`:**
  - A "Language panel (2026-10-04)" section covering:
    - the data model;
    - the pipeline commands, in order;
    - the review gate;
    - the honesty rules;
    - the map source and grid;
    - lazy loading;
    - the alias and skip lists.
  - Note that `lib/languages/data.ts` is generated by `languages:approve`.
  - A Verification placeholder.
- [ ] **`README.md`:** the new npm scripts.
- [ ] **Commit:** `docs: language panel`.

---

## After the plan (controller and owner)

1. Final review, then merge into `master`. Check which branch the main checkout is on first, and don't check it out.
2. **First content batch, with the owner:**
   - Run `languages:facts -- --limit 30`, which covers the most common languages.
   - Run `languages:draft` and then `languages:review`.
   - The owner reads `review.html`, and Claude applies corrections to the drafts.
   - Run `languages:approve -- --only "…"` with the names the owner approves.
   - Commit `data.ts` with `content: first 30 language sheets (owner-reviewed)`.
   - Commit the drafts and facts too, so later edits have history.
3. **Browser check on the branch's dev server** (a separate port, as on 2026-10-04):
   - Latin, a reconstructed language and a language with `map: null` all render well at 375px and on desktop.
   - The "About" link only appears for approved sheets.
4. Push only with the owner's go-ahead.
5. Later batches cover the remaining ~138 languages the same way.
