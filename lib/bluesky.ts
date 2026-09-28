import { AtpAgent, RichText } from "@atproto/api";
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

/** Posts today's word to Bluesky, following this codebase's existing
 * fallback pattern (lib/db.ts, lib/email.ts): without both
 * BLUESKY_IDENTIFIER and BLUESKY_APP_PASSWORD configured, this logs what
 * would have been posted instead of throwing, so the rest of the daily
 * cron (email sends) is unaffected by Bluesky being unconfigured. */
export async function postDailyWordToBluesky(
  word: WordEntry,
  date: Date
): Promise<{ posted: boolean }> {
  const identifier = process.env.BLUESKY_IDENTIFIER;
  const appPassword = process.env.BLUESKY_APP_PASSWORD;
  const text = buildBlueskyPost(word);

  if (!identifier || !appPassword) {
    console.log(`[curio:bluesky:dev-fallback] would post: ${text}`);
    return { posted: false };
  }

  try {
    const agent = new AtpAgent({ service: "https://bsky.social" });
    await agent.login({ identifier, password: appPassword });

    // RichText auto-detects the URL and turns it into a real clickable
    // facet — without this, the link would just be plain unclickable text
    // in the post, defeating the UTM tracking's whole purpose.
    const richText = new RichText({ text });
    await richText.detectFacets(agent);

    await agent.post({
      text: richText.text,
      facets: richText.facets,
      createdAt: date.toISOString(),
    });

    return { posted: true };
  } catch (err) {
    // The daily cron runs unattended with nobody watching its response —
    // without this log, a real posting failure (bad credentials, a
    // revoked app password, rate limiting) would be indistinguishable
    // from "just not configured" and could go unnoticed indefinitely.
    console.error("[curio:bluesky] post failed:", err);
    return { posted: false };
  }
}
