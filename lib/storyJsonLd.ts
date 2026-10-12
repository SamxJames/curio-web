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

/** JSON for embedding inside a <script> tag. The `<` escape is what stops
 * any future content containing "</script>" from closing the tag early —
 * the content is Curio's own today, but this is the cheap habit, not the
 * paranoid one. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** The social accounts Curio posts to, for Organization.sameAs. */
export const CURIO_PROFILES = [
  "https://bsky.app/profile/curiodaily.bsky.social",
  "https://www.threads.com/@curio.word.daily",
  "https://www.instagram.com/curio.word.daily/",
];

/** schema.org WebSite + Organization for the homepage. "Curio" alone is a
 * crowded word in search (hotels, cabinets, other apps), so this tells Google
 * the site's name, the alternative names people might type, and which social
 * accounts belong to it. Google reads WebSite.name for the site name it shows
 * above a result. */
export function buildSiteJsonLd(): Record<string, unknown> {
  const url = absoluteUrl("/");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${url}#website`,
        name: "Curio",
        alternateName: ["Curio Word", "curioword.com"],
        url,
        publisher: { "@id": `${url}#organization` },
      },
      {
        "@type": "Organization",
        "@id": `${url}#organization`,
        name: "Curio",
        url,
        logo: absoluteUrl("/apple-icon.png"),
        sameAs: CURIO_PROFILES,
      },
    ],
  };
}
