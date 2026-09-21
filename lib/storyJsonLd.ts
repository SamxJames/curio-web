import type { WordEntry } from "./words";
import { absoluteUrl } from "./siteUrl";

/** schema.org DefinedTerm for a word's story page.
 *
 * DefinedTerm, not Article, on purpose: Curio's story pages have no author,
 * no publication date and no article body, and Article would require
 * inventing at least one of them. Every property below is something the
 * page can actually support — the word, the sentence Curio wrote about it,
 * its URL, and the set it belongs to. Nothing else goes in here. */
export function buildStoryJsonLd(word: WordEntry): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: word.word,
    description: word.teaser,
    url: absoluteUrl(`/story/${word.slug}`),
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      name: "Curio",
      url: absoluteUrl("/words"),
    },
  };
}

/** JSON for embedding inside a <script> tag. The `<` escape is what stops
 * any future content containing "</script>" from closing the tag early —
 * the content is Curio's own today, but this is the cheap habit, not the
 * paranoid one. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
