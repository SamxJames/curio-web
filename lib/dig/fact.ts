import type { DigFossil } from "./types";

/** Facts at least this long read as a sentence; shorter ones are bare formulas ("From god- + child"). */
const MIN_FACT = 40;

/** A fossil's fact if it reads as a sentence a player would enjoy, else null.
 *
 * A Curio story's teaser always passes: it was written for readers. Other facts are the first
 * clause of a Wiktionary etymology, and many of those are dictionary notation, not prose. The
 * pipeline can't be re-run over days already built, so this is applied where facts are shown:
 * a fact with list markers, editorial brackets, a cut-off ending, a scrap
 * of non-Latin script, or too few words is hidden, and the screen links to the source instead. */
export function presentableFact(fossil: Pick<DigFossil, "fact" | "story">): string | null {
  const fact = fossil.fact?.trim() ?? "";
  if (!fact) return null;
  if (fossil.story) return fact;
  if (fact.length < MIN_FACT) return null;
  if (/[*[\]]|…$|\.\.\.$/.test(fact)) return null;
  // Anything outside Latin script (Cyrillic, Greek, Javanese…) is shown only in a story we wrote.
  if (/[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(fact)) return null;
  return fact;
}

/** Where a hidden fact came from, for a "Where it came from" link. */
export function etymologyLink(word: string): string {
  return `https://en.wiktionary.org/wiki/${encodeURIComponent(word.replace(/ /g, "_"))}#Etymology`;
}
