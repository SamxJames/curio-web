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

/** Bluesky's limit for an external embed's thumb blob (lexicon maxSize). */
export const THUMB_MAX_BYTES = 1_000_000;
/** The cron's send budget is shared with email; a slow image shouldn't
 * hold the post up for long. */
export const THUMB_TIMEOUT_MS = 10_000;

/** The story's own Open Graph image, uploaded as the card's thumbnail.
 * Returns undefined on any problem: the card still posts, just without an
 * image. The daily post must never fail over its picture. */
async function uploadThumb(agent: AtpAgent, thumbUrl: string) {
  try {
    const res = await fetch(thumbUrl, { signal: AbortSignal.timeout(THUMB_TIMEOUT_MS) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) throw new Error(`thumbnail ${res.status} ${type}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > THUMB_MAX_BYTES) throw new Error(`thumbnail is ${bytes.byteLength} bytes`);
    const { data } = await agent.uploadBlob(bytes, { encoding: type });
    return data.blob;
  } catch (err) {
    console.warn("[curio:bluesky] posting without a thumbnail:", err);
    return undefined;
  }
}

/** Posts today's word to Bluesky, following this codebase's existing
 * fallback pattern (lib/db.ts, lib/email.ts): without both
 * BLUESKY_IDENTIFIER and BLUESKY_APP_PASSWORD configured, this logs what
 * would have been posted instead of throwing, so the rest of the daily
 * cron (email sends) is unaffected by Bluesky being unconfigured. Posts
 * with a link card (buildStoryCard) pointing at the story page, with its
 * Open Graph image uploaded as the card's thumbnail when that succeeds. */
export async function postDailyWordToBluesky(
  word: WordEntry,
  date: Date
): Promise<{ posted: boolean }> {
  const identifier = process.env.BLUESKY_IDENTIFIER;
  const appPassword = process.env.BLUESKY_APP_PASSWORD;
  const text = buildBlueskyPost(word);
  const card = buildStoryCard(word);

  if (!identifier || !appPassword) {
    console.log(`[curio:bluesky:dev-fallback] would post: ${text}\n[card] ${card.title} — ${card.uri}`);
    return { posted: false };
  }

  try {
    const agent = new AtpAgent({ service: "https://bsky.social" });
    await agent.login({ identifier, password: appPassword });

    // detectFacets turns the hashtags into real tag facets — there's no
    // URL in the text any more, that now lives in the card below.
    const richText = new RichText({ text });
    await richText.detectFacets(agent);

    const thumb = await uploadThumb(agent, card.thumbUrl);
    await agent.post({
      text: richText.text,
      facets: richText.facets,
      // The link lives in the card, not the text: a card reads as the
      // word's story rather than a bare URL, and gets the story's image.
      embed: {
        $type: "app.bsky.embed.external",
        external: {
          uri: card.uri,
          title: card.title,
          description: card.description,
          ...(thumb ? { thumb } : {}),
        },
      },
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
