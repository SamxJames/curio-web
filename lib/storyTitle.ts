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
 * ("jungle which language", "argon greek"), so the title names it.
 * A word's own `seoTitle`, when set, replaces the generated title. */
export function storyPageTitle(word: WordEntry): string {
  if (word.seoTitle) return word.seoTitle;
  const source = sourceLanguage(word);
  return source
    ? `${word.word} word origin: from ${source} — Curio`
    : `${word.word}: the origin of the word — Curio`;
}

/** The story page's <meta name="description">. The teaser alone ("This unit of
 * loudness is quietly a fraction of something bigger.") never names the word,
 * and pages sitting at positions 8–12 were getting ~0% click-through. Leading
 * with "Etymology of <word>:" matches how people actually search (the demand
 * report's queries: "<word> etymology", "<word> origin"). OG/Twitter keep the
 * bare teaser: on a social card the word is already in the image. */
export function storyMetaDescription(word: WordEntry): string {
  return `Etymology of ${word.word}: ${word.teaser}`;
}
