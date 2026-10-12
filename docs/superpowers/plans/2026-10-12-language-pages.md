# Language pages ("Words from {language}") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Static `/language/[slug]` pages (57 today) plus a `/languages` index, linked from story-page lineages, `/words` and the sitemap.

**Architecture:** A server-only module `lib/languages/pages.ts` derives the page set from `WORDS` + approved sheets at build time. The route renders plain server markup plus the existing language panel; the panel is split so its presentational client view (`components/LanguagePanelView.tsx`) receives a precomputed model and imports nothing that reaches `lib/languages/data.ts` or `lib/words.ts`. Story pages get lineage links via a server-built `hrefs` map passed down through the client `StoryView`.

**Tech Stack:** Next.js 16 App Router (static params, `dynamicParams = false`), React 19, TypeScript, Tailwind v4 tokens, Vitest (`environment: "node"`, components tested with `renderToStaticMarkup`).

**Spec:** `docs/superpowers/specs/2026-10-12-language-pages-design.md` (approved; don't reopen its decisions).

## Global Constraints

- Archive, never backlog: a page may show a public total ("35 words"); nothing per-reader (no seen marks, no favourites line, no "X of Y").
- A language gets a page iff it has an **approved** sheet AND **3 or more** words (`MIN_WORDS = 3`) have it anywhere in `lineage`, after folding aliases into the sheet's canonical name. "English" never counts. A word counts once per language.
- Never hand-edit `lib/languages/data.ts` or `lib/languages/sheetIndex.ts` (generated).
- Client components may only `import type` from `lib/words.ts` and must never import `lib/languages/data.ts` (directly or via `lookup.ts`, `panel.ts`, `pages.ts`).
- No new arbitrary Tailwind values (`text-[…]`, `tracking-[…]`, etc.); tokens and `components/ui/` only. No hand-rolled `<button>`/`<input>`. Works at 375px, no horizontal scroll.
- Nothing on these pages reads cookies, headers or Redis (they must stay static).
- Title: `Words from {Name}: English words with {Name} origins | Curio`. `/languages` title: `Words by language: where English words come from | Curio`.
- Description: `{n} English words that passed through {Name}, each with its origin story. ` + first sentence of `sheet.origin`, trimmed to about 155 characters at a word boundary.
- Sitemap: `/languages` weekly 0.8; each language page monthly 0.7; no `lastModified`.
- No Python; any script is Node/tsx. Commit after every task (message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
- Commands: `npx vitest run <file>`, `npm run lint`, `npm run build`.

## File map

| File | Responsibility |
|---|---|
| `lib/languages/pages.ts` (new, server-only) | Page set, lookup, hrefs, description, family links |
| `lib/languages/pages.test.ts` (new) | Fixture tests + real-data smoke |
| `lib/languages/panelView.ts` (new, data-free) | Panel types, `PANEL_WIDTH`, `mapHeight`, `mapModel` |
| `lib/languages/panel.ts` | Imports/re-exports the above; keeps model builders |
| `components/LanguagePanelView.tsx` (new, client) | Presentational panel: takes `sheet` + `model` + `variant` |
| `components/LanguagePanel.tsx` | Collection wrapper: finds sheet, builds model, renders view |
| `components/LanguagePanelView.imports.test.ts` (new) | Guards the view's import graph |
| `lib/storyJsonLd.ts` | `buildLanguageJsonLd` |
| `lib/seoRoutes.ts` | Sitemap entries for `/languages` + pages |
| `app/language/[slug]/page.tsx` (new) | Language page |
| `app/languages/page.tsx` (new) | Index |
| `app/words/page.tsx` | "Or browse them by language." |
| `components/EtymologyLineage.tsx` | Optional `hrefs` |
| `components/StoryView.tsx`, `app/story/[slug]/page.tsx` | Pass `lineageHrefs` down |

---

### Task 1: `lib/languages/pages.ts` — which pages exist

**Files:**
- Create: `lib/languages/pages.ts`
- Test: `lib/languages/pages.test.ts`

**Interfaces:**
- Produces:
  - `MIN_WORDS = 3`
  - `type LanguagePage = { name: string; slug: string; sheet: LanguageSheet; words: WordEntry[] }`
  - `buildLanguagePages(words: WordEntry[], sheets: LanguageSheet[]): LanguagePage[]`
  - `languagePages(): LanguagePage[]` (real data, memoised)
  - `findLanguagePage(slug: string, pages?: LanguagePage[]): LanguagePage | undefined`
  - `languageHref(name: string, pages?: LanguagePage[]): string | null`

- [ ] **Step 1: Write the failing tests** — `lib/languages/pages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { WordEntry } from "../words";
import type { LanguageSheet } from "./types";
import { LATIN_FIXTURE } from "./__fixtures__/latin";
import {
  MIN_WORDS,
  buildLanguagePages,
  findLanguagePage,
  languageHref,
  languagePages,
} from "./pages";

const word = (w: string, lineage: string[]): WordEntry =>
  ({ slug: w.toLowerCase(), word: w, teaser: `${w} teaser`, lineage }) as WordEntry;

const sheet = (name: string, extra: Partial<LanguageSheet> = {}): LanguageSheet => ({
  ...LATIN_FIXTURE,
  name,
  aliases: [],
  parent: null,
  approved: true,
  ...extra,
});

describe("buildLanguagePages", () => {
  it(`needs ${MIN_WORDS} words: 2 → no page, 3 → page`, () => {
    const sheets = [sheet("Latin"), sheet("Arabic")];
    const words = [
      word("a", ["Latin", "English"]),
      word("b", ["Latin", "English"]),
      word("c", ["Latin", "English"]),
      word("d", ["Arabic", "English"]),
      word("e", ["Arabic", "English"]),
    ];
    expect(buildLanguagePages(words, sheets).map((p) => p.name)).toEqual(["Latin"]);
  });

  it("gives an unapproved sheet no page", () => {
    const words = ["a", "b", "c"].map((w) => word(w, ["Latin", "English"]));
    expect(buildLanguagePages(words, [sheet("Latin", { approved: false })])).toEqual([]);
  });

  it("gives a lineage name with no sheet no page", () => {
    const words = ["a", "b", "c"].map((w) => word(w, ["Gothic", "English"]));
    expect(buildLanguagePages(words, [sheet("Latin")])).toEqual([]);
  });

  it("folds aliases into the canonical page", () => {
    const sheets = [sheet("Ottoman Turkish", { aliases: ["Ottoman"] })];
    const words = [
      word("a", ["Ottoman", "English"]),
      word("b", ["Ottoman Turkish", "English"]),
      word("c", ["Ottoman", "English"]),
    ];
    const [page] = buildLanguagePages(words, sheets);
    expect(page.name).toBe("Ottoman Turkish");
    expect(page.slug).toBe("ottoman-turkish");
    expect(page.words).toHaveLength(3);
  });

  it("never makes a page for English", () => {
    const words = ["a", "b", "c"].map((w) => word(w, ["English"]));
    expect(buildLanguagePages(words, [sheet("English")])).toEqual([]);
  });

  it("counts a word once even if its lineage names the language twice (or via an alias)", () => {
    const sheets = [sheet("Old Occitan", { aliases: ["Old Provençal"] })];
    const words = [
      word("a", ["Old Occitan", "Old Provençal", "English"]),
      word("b", ["Old Occitan", "Old Occitan", "English"]),
    ];
    expect(buildLanguagePages(words, sheets)).toEqual([]);
  });

  it("sorts words A to Z and pages by word count, then name", () => {
    const sheets = [sheet("Latin"), sheet("Greek"), sheet("Arabic")];
    const words = [
      word("zebra", ["Latin", "English"]),
      word("Apple", ["Latin", "Greek", "Arabic", "English"]),
      word("mango", ["Latin", "Greek", "Arabic", "English"]),
      word("kite", ["Latin", "Greek", "Arabic", "English"]),
    ];
    const pages = buildLanguagePages(words, sheets);
    expect(pages.map((p) => p.name)).toEqual(["Latin", "Arabic", "Greek"]);
    expect(pages[0].words.map((w) => w.word)).toEqual(["Apple", "kite", "mango", "zebra"]);
  });
});

describe("findLanguagePage / languageHref", () => {
  const sheets = [sheet("Ottoman Turkish", { aliases: ["Ottoman"] }), sheet("Lombard")];
  const words = [
    ...["a", "b", "c"].map((w) => word(w, ["Ottoman", "English"])),
    word("d", ["Lombard", "English"]),
  ];
  const pages = buildLanguagePages(words, sheets);

  it("finds a page by slug", () => {
    expect(findLanguagePage("ottoman-turkish", pages)?.name).toBe("Ottoman Turkish");
    expect(findLanguagePage("nope", pages)).toBeUndefined();
  });

  it("links a canonical name and an alias, not a page-less name", () => {
    expect(languageHref("Ottoman Turkish", pages)).toBe("/language/ottoman-turkish");
    expect(languageHref("Ottoman", pages)).toBe("/language/ottoman-turkish");
    expect(languageHref("Lombard", pages)).toBeNull();
    expect(languageHref("English", pages)).toBeNull();
  });
});

describe("languagePages (real data)", () => {
  const pages = languagePages();

  it("has 57 or more pages including Latin", () => {
    expect(pages.length).toBeGreaterThanOrEqual(57);
    expect(pages.map((p) => p.slug)).toContain("latin");
  });

  it("has unique slugs", () => {
    const slugs = pages.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("only includes approved sheets with at least MIN_WORDS words", () => {
    for (const p of pages) {
      expect(p.sheet.approved).toBe(true);
      expect(p.words.length).toBeGreaterThanOrEqual(MIN_WORDS);
    }
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run lib/languages/pages.test.ts` — Expected: FAIL (cannot find module `./pages`).

- [ ] **Step 3: Implement** — `lib/languages/pages.ts`:

```ts
// "Words from {language}" pages. SERVER-ONLY: this imports the whole word bank and
// every language sheet. Never import it from a client component; pass its results
// down as props (see app/story/[slug]/page.tsx and app/language/[slug]/page.tsx).
import { WORDS, type WordEntry } from "../words";
import { LANGUAGE_SHEETS } from "./data";
import { languageSlug } from "./facts";
import type { LanguageSheet } from "./types";

/** A language needs at least this many words in Curio to get a page. */
export const MIN_WORDS = 3;
const ENGLISH = "English";

export type LanguagePage = {
  name: string; // the sheet's canonical name
  slug: string;
  sheet: LanguageSheet;
  words: WordEntry[]; // A to Z
};

/**
 * One page per approved sheet that MIN_WORDS or more words passed through. Alias
 * spellings fold into the sheet's canonical name (the same mapping SHEET_NAMES is
 * generated from); a word counts once per language. Pages sort by word count
 * (desc), then name: the /languages index order.
 */
export function buildLanguagePages(words: WordEntry[], sheets: LanguageSheet[]): LanguagePage[] {
  const sheetFor = new Map<string, LanguageSheet>();
  for (const s of sheets) {
    if (!s.approved || s.name === ENGLISH) continue;
    for (const n of [s.name, ...s.aliases]) sheetFor.set(n, s);
  }

  const found = new Map<string, { sheet: LanguageSheet; words: WordEntry[] }>();
  for (const w of words) {
    const hits = new Set<LanguageSheet>();
    for (const n of w.lineage) {
      const s = sheetFor.get(n);
      if (s) hits.add(s);
    }
    for (const s of hits) {
      const entry = found.get(s.name) ?? { sheet: s, words: [] };
      entry.words.push(w);
      found.set(s.name, entry);
    }
  }

  return [...found.values()]
    .filter((e) => e.words.length >= MIN_WORDS)
    .map((e) => ({
      name: e.sheet.name,
      slug: languageSlug(e.sheet.name),
      sheet: e.sheet,
      words: [...e.words].sort((a, b) => a.word.localeCompare(b.word, "en")),
    }))
    .sort((a, b) => b.words.length - a.words.length || a.name.localeCompare(b.name, "en"));
}

let cached: LanguagePage[] | null = null;

/** The real page set, derived once per process from WORDS and LANGUAGE_SHEETS. */
export function languagePages(): LanguagePage[] {
  return (cached ??= buildLanguagePages(WORDS, LANGUAGE_SHEETS));
}

export function findLanguagePage(slug: string, pages: LanguagePage[] = languagePages()) {
  return pages.find((p) => p.slug === slug);
}

/** `/language/{slug}` for a lineage name (canonical or alias) that has a page, else null. */
export function languageHref(name: string, pages: LanguagePage[] = languagePages()): string | null {
  const page = pages.find((p) => p.name === name || p.sheet.aliases.includes(name));
  return page ? `/language/${page.slug}` : null;
}
```

- [ ] **Step 4: Run tests** — `npx vitest run lib/languages/pages.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** — `git add lib/languages/pages.ts lib/languages/pages.test.ts && git commit -m "feat(languages): derive language pages from approved sheets"`

---

### Task 2: Split the panel view so it can render on a static page

**Why:** `LanguagePanelView` currently imports `panelModel` from `lib/languages/panel.ts`, which imports `data.ts` at module top level. A client view used on the language page must not ship `data.ts`, so the view takes a precomputed `model` and imports only data-free modules. Collection's behaviour (lazy `next/dynamic` load of `components/LanguagePanel.tsx`) must not change.

**Files:**
- Create: `lib/languages/panelView.ts`, `components/LanguagePanelView.tsx`, `components/LanguagePanelView.imports.test.ts`
- Modify: `lib/languages/panel.ts`, `components/LanguagePanel.tsx`, `components/LanguagePanel.test.tsx`

**Interfaces:**
- Produces:
  - `lib/languages/panelView.ts` exports `PANEL_WIDTH`, types `FamilyChip`, `TimelineModel`, `SpeakersModel`, `PanelModel`, `MapModel`, and `mapHeight(map)`, `mapModel(map, landDots)` (moved verbatim from `panel.ts`). It imports only `./mapGeometry` and `type` from `./types`.
  - `lib/languages/panel.ts` re-exports all of those (existing importers, including `panel.test.ts`, keep working).
  - `components/LanguagePanelView.tsx` (`"use client"`), default export
    `LanguagePanelView({ id, sheet, model, variant = "collection" }: { id: string; sheet: LanguageSheet; model: PanelModel; variant?: "collection" | "page" })`.
    - `"collection"`: exactly today's markup (eyebrow "Language", `h2` = sheet name, favourites line when `model.favouriteCount > 0`).
    - `"page"`: no "Language" eyebrow; the `h2` (same `id={`${id}-heading`}`) reads `About {sheet.name}` with classes `font-serif text-2xl leading-display font-normal tracking-headline`; the favourites line never renders.
  - `components/LanguagePanel.tsx` default export unchanged in signature: `LanguagePanel({ id, name, favouriteLineages })`. It no longer exports `LanguagePanelView`.

- [ ] **Step 1: Check `mapGeometry.ts` is data-free** — `grep -n "^import" lib/languages/mapGeometry.ts` must show no `data`, `lookup`, `mapDots` or `words` import. (If it does, stop and report.)

- [ ] **Step 2: Write the failing import-guard test** — `components/LanguagePanelView.imports.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// The language page renders LanguagePanelView as a client component. Its import
// graph must not reach the sheets (data.ts, or lookup/panel/pages which import it)
// or the word bank (value imports of lib/words). Type-only imports are erased.
const valueSpecifiers = (file: string) =>
  readFileSync(path.join(process.cwd(), file), "utf8")
    .split("\n")
    .filter((line) => !/^\s*import\s+type\b/.test(line))
    .join("\n")
    .matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)
    .toArray()
    .map((m) => m[1]);

const FORBIDDEN = /(?:^|\/)(data|lookup|panel|pages|words)(\.tsx?)?$/;

describe("LanguagePanelView imports", () => {
  for (const file of ["components/LanguagePanelView.tsx", "lib/languages/panelView.ts"]) {
    it(`${file} imports nothing that loads the sheets or the word bank`, () => {
      expect(valueSpecifiers(file).filter((s) => FORBIDDEN.test(s))).toEqual([]);
    });
  }

  it("the view takes its model from the data-free panelView module", () => {
    expect(valueSpecifiers("components/LanguagePanelView.tsx")).toContain("@/lib/languages/panelView");
  });
});
```

(If `Iterator.prototype.toArray` is unavailable in the Node version, use `[...src.matchAll(...)]` instead.)

- [ ] **Step 3: Run it** — `npx vitest run components/LanguagePanelView.imports.test.ts` — Expected: FAIL (file not found).

- [ ] **Step 4: Create `lib/languages/panelView.ts`** — move from `panel.ts`, unchanged: `PANEL_WIDTH`, `FamilyChip`, `TimelineModel`, `SpeakersModel`, `PanelModel`, `MapModel`, `mapHeight`, `mapModel`. Header comment:

```ts
// Data-free half of the language panel: view-model types and the map projection.
// Imported by the client view (components/LanguagePanelView.tsx), so it must never
// import data.ts, lookup.ts, panel.ts or lib/words — see LanguagePanelView.imports.test.ts.
import { dotsInView, isLit, project, viewAround, type Dot } from "./mapGeometry";
import type { LanguageSheet } from "./types";
```

- [ ] **Step 5: Update `lib/languages/panel.ts`** — delete the moved declarations and add:

```ts
import { PANEL_WIDTH, type FamilyChip, type PanelModel, type SpeakersModel, type TimelineModel } from "./panelView";

export { PANEL_WIDTH, mapHeight, mapModel } from "./panelView";
export type { FamilyChip, MapModel, PanelModel, SpeakersModel, TimelineModel } from "./panelView";
```

Remove now-unused imports (`dotsInView`, `isLit`, `project`, `viewAround`, `Dot`). Keep `MIN_BAR_WIDTH` and every builder in `panel.ts`.

- [ ] **Step 6: Create `components/LanguagePanelView.tsx`** — move `LanguagePanelView`, `Part`, `DotMap`, `Timeline`, `FamilyPath`, `TIMELINE_HEIGHT`, `BASELINE_Y` out of `LanguagePanel.tsx` unchanged except:

```tsx
"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { WIDE_DOT } from "@/lib/collection";
import type { Dot } from "@/lib/languages/mapGeometry";
import {
  mapHeight,
  mapModel,
  PANEL_WIDTH,
  type FamilyChip,
  type PanelModel,
  type TimelineModel,
} from "@/lib/languages/panelView";
import type { LanguageSheet } from "@/lib/languages/types";
import Eyebrow from "@/components/ui/Eyebrow";

/** The "About {language}" panel. Presentational: the caller builds `model` (panelModel in
 * lib/languages/panel.ts) so this file never loads the sheets. "collection" is Collection's
 * panel; "page" is the language page, where the H1 already names the language and nothing
 * per-reader may show (no favourites line). */
export default function LanguagePanelView({
  id,
  sheet,
  model,
  variant = "collection",
}: {
  id: string;
  sheet: LanguageSheet;
  model: PanelModel;
  variant?: "collection" | "page";
}) {
  const headingId = `${id}-heading`;
  const onPage = variant === "page";

  return (
    <section id={id} aria-labelledby={headingId} className="mt-5 border-b border-line pb-7">
      {onPage ? (
        <h2 id={headingId} className="font-serif text-2xl leading-display font-normal tracking-headline">
          About {sheet.name}
        </h2>
      ) : (
        <>
          <Eyebrow as="p" className="tracking-eyebrow-wider text-accent">
            Language
          </Eyebrow>
          <h2
            id={headingId}
            className="mt-1.5 font-serif text-3xl leading-display font-normal tracking-headline"
          >
            {sheet.name}
          </h2>
        </>
      )}
      {/* …the rest exactly as before, with the favourites paragraph guarded by
          `!onPage && model.favouriteCount > 0`… */}
    </section>
  );
}
```

(Copy the existing body — classification line, `Part`s for Where/When/Speakers/Family path/Where it came from — verbatim. The only body change is the favourites guard.)

- [ ] **Step 7: Slim `components/LanguagePanel.tsx`**:

```tsx
"use client";

import { useMemo } from "react";
import { findSheet } from "@/lib/languages/lookup";
import { panelModel } from "@/lib/languages/panel";
import LanguagePanelView from "./LanguagePanelView";

/** "About {language}" on Collection. Loaded with next/dynamic from CollectionScreen, so
 * this is the only place the sheets (data.ts, via findSheet/panelModel) are pulled in; the
 * land dots load only once the map mounts. None of it is in the page's first JS. */
export default function LanguagePanel({
  id,
  name,
  favouriteLineages,
}: {
  id: string;
  name: string; // canonical name from SHEET_NAMES
  favouriteLineages: string[][];
}) {
  const sheet = findSheet(name);
  const model = useMemo(
    () => (sheet ? panelModel(sheet, favouriteLineages) : null),
    [sheet, favouriteLineages],
  );
  if (!sheet || !model) return null;
  return <LanguagePanelView id={id} sheet={sheet} model={model} />;
}
```

- [ ] **Step 8: Update `components/LanguagePanel.test.tsx`** — change the import and render helper:

```tsx
import LanguagePanel from "./LanguagePanel";
import LanguagePanelView from "./LanguagePanelView";
import { panelModel } from "@/lib/languages/panel";
// …
const render = (sheet: LanguageSheet, lineages: string[][] = [["Latin", "English"]]) =>
  renderToStaticMarkup(
    <LanguagePanelView id="lp" sheet={sheet} model={panelModel(sheet, lineages)} />,
  );
```

Replace any other direct `<LanguagePanelView … favouriteLineages=…>` usages the same way. Add:

```tsx
describe("LanguagePanelView variant=page", () => {
  const html = renderToStaticMarkup(
    <LanguagePanelView
      id="lp"
      sheet={LATIN_FIXTURE}
      model={panelModel(LATIN_FIXTURE, [["Latin", "English"], ["Latin", "Old French", "English"]])}
      variant="page"
    />,
  );

  it("headings read 'About {name}' with no Language eyebrow", () => {
    expect(html).toContain('<h2 id="lp-heading"');
    expect(html).toContain(">About Latin</h2>");
    expect(html).not.toContain(">Language<");
  });

  it("never shows the per-reader favourites line", () => {
    expect(html).not.toContain("favourites");
  });

  it("still renders every other part", () => {
    for (const t of ["Where", "When", "Speakers", "Family path", "Where it came from"]) {
      expect(html).toContain(`>${t}<`);
    }
  });
});
```

- [ ] **Step 9: Run** — `npx vitest run components lib/languages` — Expected: all PASS (including the unchanged `CollectionScreen.imports.test.ts` and `panel.test.ts`). Then `npx tsc --noEmit` — Expected: no errors.
- [ ] **Step 10: Commit** — `git add -A lib/languages components && git commit -m "refactor(languages): data-free LanguagePanelView with a page variant"`

---

### Task 3: `DefinedTermSet` JSON-LD builder

**Files:** Modify `lib/storyJsonLd.ts`; Test `lib/storyJsonLd.test.ts`

**Interfaces:**
- Produces: `buildLanguageJsonLd(input: { name: string; slug: string; words: { word: string; slug: string }[] }): Record<string, unknown>` (structural param so `LanguagePage` fits without importing `pages.ts` here).

- [ ] **Step 1: Failing test** — append to `lib/storyJsonLd.test.ts` (the file already sets `CURIO_SITE_URL=https://curio.example` in `beforeEach`; add `buildLanguageJsonLd` to its import):

```ts
describe("buildLanguageJsonLd", () => {
  it("describes the page as a DefinedTermSet listing each word", () => {
    expect(
      buildLanguageJsonLd({
        name: "Arabic",
        slug: "arabic",
        words: [
          { word: "algebra", slug: "algebra" },
          { word: "coffee", slug: "coffee" },
        ],
      }),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "DefinedTermSet",
      name: "Words from Arabic",
      url: "https://curio.example/language/arabic",
      hasDefinedTerm: [
        { "@type": "DefinedTerm", name: "algebra", url: "https://curio.example/story/algebra" },
        { "@type": "DefinedTerm", name: "coffee", url: "https://curio.example/story/coffee" },
      ],
    });
  });
});
```

- [ ] **Step 2: Run** `npx vitest run lib/storyJsonLd.test.ts` — Expected: FAIL (not exported).
- [ ] **Step 3: Implement** — add after `buildStoryJsonLd` in `lib/storyJsonLd.ts`:

```ts
/** schema.org DefinedTermSet for a "Words from {language}" page: the page's name,
 * its URL, and each word on it as a DefinedTerm pointing at its story page. Same
 * rule as buildStoryJsonLd: only what the page itself shows. */
export function buildLanguageJsonLd(page: {
  name: string;
  slug: string;
  words: { word: string; slug: string }[];
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    name: `Words from ${page.name}`,
    url: absoluteUrl(`/language/${page.slug}`),
    hasDefinedTerm: page.words.map((w) => ({
      "@type": "DefinedTerm",
      name: w.word,
      url: absoluteUrl(`/story/${w.slug}`),
    })),
  };
}
```

- [ ] **Step 4: Run** — PASS. **Step 5: Commit** — `git commit -am "feat(seo): DefinedTermSet JSON-LD for language pages"`

---

### Task 4: Sitemap entries

**Files:** Modify `lib/seoRoutes.ts`; Test `lib/seoRoutes.test.ts`

**Interfaces:** Consumes `languagePages()` from Task 1.

- [ ] **Step 1: Update tests** in `lib/seoRoutes.test.ts`: import `{ languagePages } from "./languages/pages"`; change the count test to

```ts
  it("lists every public route, every word, /languages and every language page, and nothing else", () => {
    const entries = buildSitemapEntries();
    expect(entries).toHaveLength(PUBLIC_ROUTES.length + WORDS.length + 1 + languagePages().length);
  });
```

(keep the existing body's other assertions if it has any), and add:

```ts
  it("includes /languages (weekly, 0.8) and each language page (monthly, 0.7)", () => {
    const entries = buildSitemapEntries();
    expect(entries).toContainEqual({
      url: "https://curio.example/languages",
      changeFrequency: "weekly",
      priority: 0.8,
    });
    for (const page of languagePages()) {
      expect(entries).toContainEqual({
        url: `https://curio.example/language/${page.slug}`,
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }
    expect(entries.some((e) => "lastModified" in e)).toBe(false);
  });
```

- [ ] **Step 2: Run** `npx vitest run lib/seoRoutes.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** in `lib/seoRoutes.ts`: `import { languagePages } from "./languages/pages";` and in `buildSitemapEntries`, before the return:

```ts
  // The language pages and their index. Monthly: a page only changes when a new
  // sheet batch or new words land.
  const languages: SitemapEntry[] = [
    { url: absoluteUrl("/languages"), changeFrequency: "weekly", priority: 0.8 },
    ...languagePages().map((page) => ({
      url: absoluteUrl(`/language/${page.slug}`),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];

  return [...routes, ...stories, ...languages];
```

Do **not** add `/languages` to `PUBLIC_ROUTES` (that would double-count it).
- [ ] **Step 4: Run** — PASS (also the no-duplicates and no-private-route tests). **Step 5: Commit** — `git commit -am "feat(seo): language pages in the sitemap"`

---

### Task 5: Page helpers — description and family links

**Files:** Modify `lib/languages/pages.ts`; Test `lib/languages/pages.test.ts`

**Interfaces:**
- Produces:
  - `languageDescription(page: LanguagePage, max = 155): string`
  - `type FamilyLink = { name: string; href: string | null }`
  - `familyLinks(page: LanguagePage, sheets?: LanguageSheet[], pages?: LanguagePage[]): { parent: FamilyLink | null; children: FamilyLink[] }`

- [ ] **Step 1: Failing tests** — append to `lib/languages/pages.test.ts` (add `languageDescription, familyLinks` to the import):

```ts
describe("languageDescription", () => {
  const three = ["a", "b", "c"].map((w) => word(w, ["Latin", "English"]));

  it("is the count line plus the origin's first sentence", () => {
    const [page] = buildLanguagePages(three, [
      sheet("Latin", { origin: "Latin was spoken in Latium. It spread with Rome." }),
    ]);
    expect(languageDescription(page)).toBe(
      "3 English words that passed through Latin, each with its origin story. Latin was spoken in Latium.",
    );
  });

  it("trims to about 155 characters at a word boundary", () => {
    const long = `Latin ${"belongs to a very long family of words ".repeat(6)}indeed.`;
    const [page] = buildLanguagePages(three, [sheet("Latin", { origin: long })]);
    const d = languageDescription(page);
    expect(d.length).toBeLessThanOrEqual(155);
    expect(d.endsWith("…")).toBe(true);
    expect(d).not.toMatch(/\s…$/);
    expect(long).toContain(d.slice(d.indexOf("Latin belongs"), -1));
  });
});

describe("familyLinks", () => {
  const sheets = [
    sheet("Latin", { parent: "Old Latin" }),
    sheet("Italian", { parent: "Latin" }),
    sheet("Late Latin", { parent: "Latin" }),
    sheet("Medieval Latin", { parent: "Late Latin" }),
    sheet("Unapproved Child", { parent: "Latin", approved: false }),
  ];
  const words = [
    ...["a", "b", "c"].map((w) => word(w, ["Latin", "Italian", "English"])),
    word("d", ["Late Latin", "English"]),
  ];
  const pages = buildLanguagePages(words, sheets);
  const latin = findLanguagePage("latin", pages)!;
  const italian = findLanguagePage("italian", pages)!;

  it("parent without a page is plain text; children link only when they have a page, A to Z", () => {
    expect(familyLinks(latin, sheets, pages)).toEqual({
      parent: { name: "Old Latin", href: null },
      children: [
        { name: "Italian", href: "/language/italian" },
        { name: "Late Latin", href: null },
      ],
    });
  });

  it("links a parent that has a page; no children → empty list", () => {
    expect(familyLinks(italian, sheets, pages)).toEqual({
      parent: { name: "Latin", href: "/language/latin" },
      children: [],
    });
  });
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** — append to `lib/languages/pages.ts`:

```ts
/** First sentence of a sheet's origin (up to the first . ! or ? followed by a capital or the end). */
function firstSentence(text: string): string {
  const m = text.match(/^.*?[.!?](?=\s+[A-Z]|\s*$)/s);
  return (m ? m[0] : text).trim();
}

/** Meta description: "{n} English words that passed through {Name}, each with its origin
 * story. " + the origin's first sentence, cut at a word boundary to at most `max` chars. */
export function languageDescription(page: LanguagePage, max = 155): string {
  const full = `${page.words.length} English words that passed through ${page.name}, each with its origin story. ${firstSentence(page.sheet.origin)}`;
  if (full.length <= max) return full;
  const cut = full.slice(0, max - 1);
  const end = cut.lastIndexOf(" ");
  return `${(end > 0 ? cut.slice(0, end) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

export type FamilyLink = { name: string; href: string | null };

/** "{Name} grew out of {parent}" and "Languages that grew out of {Name}": each name links
 * only if it has a page. Children are approved sheets whose parent is this language, A to Z. */
export function familyLinks(
  page: LanguagePage,
  sheets: LanguageSheet[] = LANGUAGE_SHEETS,
  pages: LanguagePage[] = languagePages(),
): { parent: FamilyLink | null; children: FamilyLink[] } {
  const link = (name: string): FamilyLink => ({ name, href: languageHref(name, pages) });
  const parent = page.sheet.parent ? link(page.sheet.parent) : null;
  const children = sheets
    .filter((s) => s.approved && s.parent === page.name)
    .map((s) => s.name)
    .sort((a, b) => a.localeCompare(b, "en"))
    .map(link);
  return { parent, children };
}
```

- [ ] **Step 4: Run** — PASS. **Step 5: Commit** — `git commit -am "feat(languages): page description and family links"`

---

### Task 6: `/language/[slug]` route

**Files:** Create `app/language/[slug]/page.tsx`

**Interfaces:** Consumes `languagePages`, `findLanguagePage`, `languageDescription`, `familyLinks` (Tasks 1, 5), `panelModel` (`lib/languages/panel.ts`), `LanguagePanelView` (Task 2, `variant="page"`), `buildLanguageJsonLd` + `serializeJsonLd` (Task 3).

- [ ] **Step 1: Read the docs** — `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-static-params.md` and `.../02-route-segment-config/dynamicParams.md`. (Cache Components is off in `next.config.ts`, so `dynamicParams` is available.) Mirror `app/story/[slug]/page.tsx`.

- [ ] **Step 2: Implement** — `app/language/[slug]/page.tsx`:

```tsx
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import LanguagePanelView from "@/components/LanguagePanelView";
import { panelModel } from "@/lib/languages/panel";
import {
  familyLinks,
  findLanguagePage,
  languageDescription,
  languagePages,
  type FamilyLink,
} from "@/lib/languages/pages";
import { buildLanguageJsonLd, serializeJsonLd } from "@/lib/storyJsonLd";

// Only the derived set; anything else 404s.
export const dynamicParams = false;

export function generateStaticParams() {
  return languagePages().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = findLanguagePage(slug);
  if (!page) return {};
  const title = `Words from ${page.name}: English words with ${page.name} origins | Curio`;
  const description = languageDescription(page);
  return {
    title,
    description,
    alternates: { canonical: `/language/${slug}` },
    openGraph: { type: "website", siteName: "Curio", title, description, url: `/language/${slug}` },
  };
}

const linkClass = "text-ink transition-colors hover:text-accent";

function Name({ link }: { link: FamilyLink }) {
  return link.href ? (
    <Link href={link.href} prefetch={false} className={linkClass}>
      {link.name}
    </Link>
  ) : (
    <>{link.name}</>
  );
}

// Static and public: nothing here reads cookies, headers, Redis or the reader's
// favourites (archive, never backlog: a public total only).
export default async function LanguagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = findLanguagePage(slug);
  if (!page) notFound();

  const { name, sheet, words } = page;
  // Family path "next languages" come from this page's words, not anyone's favourites.
  const model = panelModel(sheet, words.map((w) => w.lineage));
  const family = familyLinks(page);

  return (
    <div className="mx-auto max-w-page px-6 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildLanguageJsonLd(page)) }}
      />
      <h1 className="font-serif text-4xl leading-display">Words from {name}</h1>
      <p className="mt-3 font-sans text-sm text-ink-soft">
        {words.length} words in Curio passed through {name} on their way into English.
      </p>

      <LanguagePanelView id="about" sheet={sheet} model={model} variant="page" />

      {(family.parent || family.children.length > 0) && (
        <section aria-labelledby="family-heading" className="mt-10">
          <h2 id="family-heading" className="font-serif text-2xl leading-display">
            Family
          </h2>
          {family.parent && (
            <p className="mt-3 font-serif text-base leading-body text-ink-soft">
              {name} grew out of <Name link={family.parent} />.
            </p>
          )}
          {family.children.length > 0 && (
            <p className="mt-2 font-serif text-base leading-body text-ink-soft">
              Languages that grew out of {name}:{" "}
              {family.children.map((c, i) => (
                <Fragment key={c.name}>
                  {i > 0 && ", "}
                  <Name link={c} />
                </Fragment>
              ))}
              .
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="words-heading" className="mt-10">
        <h2 id="words-heading" className="font-serif text-2xl leading-display">
          The words, A to Z
        </h2>
        <ul className="mt-4">
          {words.map((w) => (
            <li key={w.slug} className="border-b border-line py-3">
              {/* prefetch={false}: up to 560 links on one page (see app/words/page.tsx). */}
              <Link href={`/story/${w.slug}`} prefetch={false} className={`font-serif text-lg ${linkClass}`}>
                {w.word}
              </Link>
              <p className="mt-1 font-serif text-sm leading-body text-ink-soft">{w.teaser}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

Check every class exists as a token or Tailwind built-in (`leading-display`, `leading-body`, `border-line`, `text-ink-soft` are tokens per `docs/design-system.md`); no arbitrary values.

- [ ] **Step 3: Type-check and lint** — `npx tsc --noEmit && npm run lint` — Expected: clean.
- [ ] **Step 4: Build-check the route** — `npm run build` — Expected: route list shows `● /language/[slug]` (SSG) with 57+ paths. Then `rm -rf .next`.
- [ ] **Step 5: Commit** — `git add app/language && git commit -m "feat: Words from {language} pages"`

---

### Task 7: `/languages` index and the `/words` link

**Files:** Create `app/languages/page.tsx`; Modify `app/words/page.tsx`

**Interfaces:** Consumes `languagePages()` (Task 1), `eraLabel` (`lib/languages/timeline.ts`).

- [ ] **Step 1: Implement** `app/languages/page.tsx`:

```tsx
import Link from "next/link";
import type { Metadata } from "next";
import { languagePages } from "@/lib/languages/pages";
import { eraLabel } from "@/lib/languages/timeline";

export const metadata: Metadata = {
  title: "Words by language: where English words come from | Curio",
  description:
    "The languages Curio's words passed through on their way into English, from Latin and Old French to Arabic and Old Norse.",
  alternates: { canonical: "/languages" },
};

export default function LanguagesPage() {
  const pages = languagePages();
  return (
    <div className="mx-auto max-w-page px-6 py-16">
      <h1 className="font-serif text-3xl">Words by language</h1>
      <p className="mt-3 font-sans text-sm text-ink-soft">
        Every language with at least a few of Curio&rsquo;s words passing through it on the way into English.
      </p>
      <ul className="mt-8">
        {pages.map((p) => (
          <li
            key={p.slug}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line py-3"
          >
            <Link
              href={`/language/${p.slug}`}
              prefetch={false}
              className="font-serif text-lg text-ink transition-colors hover:text-accent"
            >
              {p.name}
            </Link>
            <span className="font-sans text-sm text-ink-soft">
              {p.words.length} words · {p.sheet.era ? eraLabel(p.sheet.era) : "Dates unknown"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: `/words` sentence** — in `app/words/page.tsx`, directly after the intro `<p>`, add:

```tsx
      <p className="mt-2 font-sans text-sm text-ink-soft">
        Or{" "}
        <Link href="/languages" className="underline underline-offset-2 transition-colors hover:text-accent">
          browse them by language
        </Link>
        .
      </p>
```

- [ ] **Step 3:** `npx tsc --noEmit && npm run lint` — clean. **Step 4: Commit** — `git add app/languages app/words && git commit -m "feat: /languages index, linked from /words"`

---

### Task 8: Lineage links on story pages

**Files:** Modify `components/EtymologyLineage.tsx`, `components/StoryView.tsx`, `app/story/[slug]/page.tsx`, `lib/languages/pages.ts`; Test `components/EtymologyLineage.test.tsx` (new), `lib/languages/pages.test.ts`

**Interfaces:**
- Produces: `lineageHrefs(lineage: string[], pages?: LanguagePage[]): Record<string, string>` in `pages.ts`; `EtymologyLineage` prop `hrefs?: Record<string, string>`; `StoryView` prop `lineageHrefs?: Record<string, string>`.

- [ ] **Step 1: Failing tests.** Append to `lib/languages/pages.test.ts` (import `lineageHrefs`), inside the `findLanguagePage / languageHref` describe (reuses its `pages`):

```ts
  it("lineageHrefs maps only names that have pages", () => {
    expect(lineageHrefs(["Ottoman", "Lombard", "English"], pages)).toEqual({
      Ottoman: "/language/ottoman-turkish",
    });
  });
```

Create `components/EtymologyLineage.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EtymologyLineage from "./EtymologyLineage";

describe("EtymologyLineage", () => {
  it("renders plain text when no hrefs are given (TodayHero)", () => {
    const html = renderToStaticMarkup(<EtymologyLineage lineage={["Latin", "French", "English"]} />);
    expect(html).not.toContain("<a");
    expect(html).toContain(">Latin<");
  });

  it("links only the names in hrefs", () => {
    const html = renderToStaticMarkup(
      <EtymologyLineage
        lineage={["Latin", "Old French", "English"]}
        hrefs={{ Latin: "/language/latin" }}
      />,
    );
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toMatch(/<a [^>]*href="\/language\/latin"[^>]*>Latin<\/a>/);
    expect(html).toContain("<span>Old French</span>");
    expect(html).toContain("<span>English</span>");
  });
});
```

If `next/link` fails to render outside Next in Vitest, add at the top: `vi.mock("next/link", () => ({ default: ({ href, prefetch: _p, ...rest }: any) => <a href={href} {...rest} /> }));` (import `vi`).

- [ ] **Step 2: Run** `npx vitest run components/EtymologyLineage.test.tsx lib/languages/pages.test.ts` — FAIL.

- [ ] **Step 3: Implement.**

`lib/languages/pages.ts`:

```ts
/** Lineage name → language page href, for the names in one word's lineage that have a page. */
export function lineageHrefs(lineage: string[], pages: LanguagePage[] = languagePages()): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of lineage) {
    const href = languageHref(name, pages);
    if (href) out[name] = href;
  }
  return out;
}
```

`components/EtymologyLineage.tsx` — add `import Link from "next/link";`, the prop `hrefs?: Record<string, string>` (doc: "lineage name → href; built on the server by lib/languages/pages.ts, so nothing language-related is imported here"), and replace `<span>{language}</span>` with:

```tsx
          {hrefs?.[language] ? (
            <Link
              href={hrefs[language]}
              prefetch={false}
              className="underline-offset-2 hover:underline focus-visible:underline"
            >
              {language}
            </Link>
          ) : (
            <span>{language}</span>
          )}
```

(Inherits `text-ink-soft`; focus ring comes from the global longhand `:focus-visible` rule in `app/globals.css`. Not accent-coloured.)

`components/StoryView.tsx` — props become `{ word, related, lineageHrefs }: { word: WordEntry; related: RelatedWords; lineageHrefs?: Record<string, string> }` and the lineage line becomes `<EtymologyLineage lineage={word.lineage} hrefs={lineageHrefs} className="mt-4 text-sm" />`. Import nothing new.

`app/story/[slug]/page.tsx` — `import { lineageHrefs } from "@/lib/languages/pages";` and render `<StoryView word={word} related={getRelatedWords(slug)} lineageHrefs={lineageHrefs(word.lineage)} />`.

- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit && npm run lint` — all clean. Confirm `TodayHero` still passes no `hrefs` (`grep -n EtymologyLineage components/TodayHero.tsx`).
- [ ] **Step 5: Commit** — `git commit -am "feat: story-page lineage links to language pages"`

---

## After the tasks (controller, not subagents)

1. `requesting-code-review` on the branch.
2. `verification-before-completion`: clean `npm ci`, `npm run lint`, `npx vitest run`, `npm run build` (route list shows `/language/[slug]` with 57+ prerendered paths and `/languages` static). Client-JS check: a Node script reads the `<script src>` chunks referenced by `.next/server/app/language/latin.html` and asserts none contains a string unique to `data.ts` for another language (e.g. Anglo-Norman's origin text) or to `lib/words.ts` (a teaser of a word not on the Latin page). Browser checks from spec §5 (desktop + 375px, light + dark, Tab through lineage links, `/language/nope` 404, no console errors).
3. `finishing-a-development-branch`: merge to `master` locally; remove the worktree.
4. `release-manager`: push `master`; on https://curioword.com check sitemap has 1,210 `<loc>`s, `/language/latin` 200 + JSON-LD, story lineage links resolve, Rich Results Test (or URL Inspection) for one page.
5. Update `handover.md` (replace Current state / Open threads) and add a dated `docs/handover/history.md` entry; stop dev servers; `rm -rf .next`.
