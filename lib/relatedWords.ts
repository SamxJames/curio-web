import { WORDS, getWordBySlug, type WordEntry } from "./words";

export type RelatedLink = { slug: string; word: string };
export type RelatedWords = {
  /** The source language the peers genuinely share, or null when this word
   * has no same-language peer at all (65 of 1,147 do not). Null exactly
   * when `peers` is empty. */
  language: string | null;
  /** Up to four words that genuinely share `language` — every one of them,
   * not just some. Empty when `language` is null. */
  peers: RelatedLink[];
  /** This word's alphabetical prev/next neighbours, excluding self and
   * anything already listed in `peers`. Always present (barring a
   * pathologically small word bank), which is what makes the ≥2-outbound-
   * links guarantee below hold even for words with no language peers. */
  neighbours: RelatedLink[];
};

const MAX_PEERS = 4;

type Index = {
  sorted: WordEntry[];
  positionOf: Map<string, number>;
  byLanguage: Map<string, string[]>;
};

let index: Index | null = null;

/** Built once per process, not per page — 1,147 story pages are
 * prerendered in one build, and rebuilding the buckets for each would be
 * 1,147 full passes over the word bank for no reason. */
function getIndex(): Index {
  if (index) return index;

  const sorted = [...WORDS].sort((a, b) => a.word.localeCompare(b.word, "en") || a.slug.localeCompare(b.slug));
  const positionOf = new Map(sorted.map((w, i) => [w.slug, i]));
  const byLanguage = new Map<string, string[]>();
  for (const word of sorted) {
    // lineage always ends in "English" — grouping on it would put all
    // 1,147 words in one bucket and say nothing.
    for (const language of word.lineage) {
      if (language === "English") continue;
      const bucket = byLanguage.get(language);
      if (bucket) bucket.push(word.slug);
      else byLanguage.set(language, [word.slug]);
    }
  }

  index = { sorted, positionOf, byLanguage };
  return index;
}

function toLink(word: WordEntry): RelatedLink {
  return { slug: word.slug, word: word.word };
}

/** Deterministic outbound links for a story page, split into two kinds so
 * the page can be honest about which is which: `peers`, up to four words
 * that genuinely share this one's most specific source language, and
 * `neighbours`, its two alphabetical neighbours.
 *
 * The neighbours are what make "at least two outbound links" a guarantee
 * rather than a best effort. They form a single cycle through all 1,147
 * words, so every page has at least two outbound links and the whole set
 * is reachable from any entry point — including the 65 words with no
 * same-language peer (where `peers` is empty and `neighbours` carries the
 * whole guarantee). That matters because ~884 of these pages are linked
 * from nowhere else at all.
 *
 * Deliberately NOT derived from the `related` prose: measured over the full
 * bank, matching headwords in that sentence covers only 19.3% of pages and
 * produces false positives on incidental English words (salary -> phrase,
 * clue -> sail). See docs/superpowers/specs/
 * 2026-09-20-search-discoverability-design.md. */
export function getRelatedWords(slug: string): RelatedWords {
  const entry = getWordBySlug(slug);
  if (!entry) return { language: null, peers: [], neighbours: [] };

  const { sorted, positionOf, byLanguage } = getIndex();

  // Smallest qualifying bucket wins: "also from Old Norse" is a more
  // interesting claim than "also from Latin", and both are equally true.
  // Ties break on the language name so the choice never depends on
  // lineage ordering.
  const language =
    entry.lineage
      .filter((l) => l !== "English" && (byLanguage.get(l)?.length ?? 0) > 1)
      .sort((a, b) => byLanguage.get(a)!.length - byLanguage.get(b)!.length || a.localeCompare(b))[0] ?? null;

  const peers: RelatedLink[] = [];
  const taken = new Set<string>([slug]);

  if (language) {
    const bucket = byLanguage.get(language)!;
    // Walk forward from this word's own place in the bucket, wrapping —
    // so each word in a bucket points at a different set of peers and
    // every member gets linked from somewhere.
    const start = bucket.indexOf(slug);
    for (let i = 1; i < bucket.length && peers.length < MAX_PEERS; i++) {
      const peer = bucket[(start + i) % bucket.length];
      if (taken.has(peer)) continue;
      taken.add(peer);
      peers.push(toLink(getWordBySlug(peer)!));
    }
  }

  const neighbours: RelatedLink[] = [];
  const position = positionOf.get(slug)!;
  for (const offset of [-1, 1]) {
    const neighbour = sorted[(position + offset + sorted.length) % sorted.length];
    if (taken.has(neighbour.slug)) continue;
    taken.add(neighbour.slug);
    neighbours.push(toLink(neighbour));
  }

  return { language, peers, neighbours };
}
