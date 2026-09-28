import type { WordEntry } from "./words";

/** The story page's <title>/og:title. Shared with the Bluesky link card
 * (lib/bluesky.ts) so the card and the page it opens can't drift apart. */
export function storyPageTitle(word: WordEntry): string {
  return `${word.word}: the origin of the word — Curio`;
}
