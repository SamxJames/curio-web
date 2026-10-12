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
