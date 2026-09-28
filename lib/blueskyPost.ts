// Pure and network-free: no @atproto/api import here, so the tsx preview
// script (scripts/previewBlueskyPosts.ts) can load this without pulling in
// @atproto/api's ESM-only dependency chain (see lib/bluesky.ts for the
// posting side, which does need it).
import type { WordEntry } from "./words";
import { absoluteUrl } from "./siteUrl";
import { storyPageTitle } from "./storyTitle";

const MAX_GRAPHEMES = 300;
const ELLIPSIS = "…";
const HASHTAGS = "#etymology #wordoftheday";

/** The card's description. Not the teaser: that's already the post's first
 * line. This tells someone who's never heard of Curio what it is. */
export const CARD_DESCRIPTION = "One word's origin story, every morning. No feed, no backlog.";

const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

/** Bluesky's 300 limit counts graphemes, so "é" or a skin-toned emoji is
 * one, however many UTF-16 units it takes. */
export function graphemeLength(text: string): number {
  return [...segmenter.segment(text)].length;
}

function sliceGraphemes(text: string, count: number): string {
  let out = "";
  let n = 0;
  for (const { segment } of segmenter.segment(text)) {
    if (n++ >= count) break;
    out += segment;
  }
  return out;
}

/** Format (a), chosen 2026-09-26: the teaser, then `word · Latin → … →
 * English`, then the hashtags. No link: it lives in the card (see
 * buildStoryCard). Every word in the bank fits (longest: "wine", 291), so
 * truncating the teaser is only a guard for future content. The word and
 * lineage are never cut. */
export function buildBlueskyPost(word: WordEntry): string {
  const tail = `\n\n${word.word} · ${word.lineage.join(" → ")}\n\n${HASHTAGS}`;
  const budget = MAX_GRAPHEMES - graphemeLength(tail);

  let teaser = word.teaser;
  if (graphemeLength(teaser) > budget) {
    teaser = sliceGraphemes(teaser, Math.max(0, budget - 1)).trimEnd() + ELLIPSIS;
  }
  return `${teaser}${tail}`;
}

export type StoryCard = { uri: string; title: string; description: string; thumbUrl: string };

/** The link card: the story page (UTM-tagged, as the link in the text used
 * to be), its own title, and its Open Graph image for a thumbnail. */
export function buildStoryCard(word: WordEntry): StoryCard {
  const url = new URL(absoluteUrl(`/story/${word.slug}`));
  url.searchParams.set("utm_source", "bluesky");
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", "daily-word");
  return {
    uri: url.toString(),
    title: storyPageTitle(word),
    description: CARD_DESCRIPTION,
    thumbUrl: absoluteUrl(`/story/${word.slug}/opengraph-image`),
  };
}
