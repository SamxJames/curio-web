import type { WordEntry } from "./words";

/** Earlier stages of English itself. Naming one as the source tells a searcher nothing
 * ("from Middle English"), so the title looks past them to where the word came from. */
const ENGLISH_STAGES = new Set(["English", "Middle English", "Early Modern English", "Translingual"]);

/** The language English took the word from: the last lineage entry before the English
 * stages, e.g. ["Latin", "Old French", "Middle English", "English"] → "Old French".
 * Old English counts as a source, since "owl in old english" is how people search.
 * Null for words coined in English. */
export function sourceLanguage(word: WordEntry): string | null {
  for (let i = word.lineage.length - 1; i >= 0; i--) {
    if (!ENGLISH_STAGES.has(word.lineage[i])) return word.lineage[i];
  }
  return null;
}

/** The story page's <title>/og:title. Shared with the Bluesky link card
 * (lib/bluesky.ts) so the card and the page it opens can't drift apart.
 * Search Console shows people asking which language a word comes from
 * ("jungle which language", "argon greek"), so the title names it. */
export function storyPageTitle(word: WordEntry): string {
  const source = sourceLanguage(word);
  return source
    ? `${word.word} word origin: from ${source} — Curio`
    : `${word.word}: the origin of the word — Curio`;
}
