import { AtpAgent, RichText } from "@atproto/api";
import type { WordEntry } from "./words";
import { buildBlueskyPost, buildStoryCard } from "./blueskyPost";
import { siteUrl } from "./siteUrl";

// The pure post/card builders live in ./blueskyPost (no @atproto/api import,
// so tsx scripts can load them standalone); re-exported here so existing
// importers of lib/bluesky.ts keep working unchanged.
export { graphemeLength, buildBlueskyPost, buildStoryCard, CARD_DESCRIPTION, type StoryCard } from "./blueskyPost";

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
): Promise<{ posted: boolean; thumb: boolean }> {
  const identifier = process.env.BLUESKY_IDENTIFIER;
  const appPassword = process.env.BLUESKY_APP_PASSWORD;
  const text = buildBlueskyPost(word);
  const card = buildStoryCard(word);

  if (!identifier || !appPassword) {
    console.log(`[curio:bluesky:dev-fallback] would post: ${text}\n[card] ${card.title} — ${card.uri}`);
    return { posted: false, thumb: false };
  }

  // A misconfigured CURIO_SITE_URL in production would otherwise post a
  // real public card whose link and thumbnail point at localhost — refuse
  // rather than log in and post something broken.
  if (process.env.VERCEL_ENV === "production" && siteUrl().startsWith("http://localhost")) {
    console.error("[curio:bluesky] CURIO_SITE_URL is not set in production — not posting a card that links to localhost");
    return { posted: false, thumb: false };
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

    return { posted: true, thumb: thumb !== undefined };
  } catch (err) {
    // The daily cron runs unattended with nobody watching its response —
    // without this log, a real posting failure (bad credentials, a
    // revoked app password, rate limiting) would be indistinguishable
    // from "just not configured" and could go unnoticed indefinitely.
    console.error("[curio:bluesky] post failed:", err);
    return { posted: false, thumb: false };
  }
}
