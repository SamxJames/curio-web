import { AtpAgent, RichText } from "@atproto/api";
import type { WordEntry } from "./words";

const MAX_LENGTH = 300;
const ELLIPSIS = "…";

/** Builds the post text: word, a blank line, the teaser (truncated if
 * needed — the word and link are never cut), a blank line, the link.
 * Pure and synchronous so it's cheaply unit-testable without a network
 * call or a real Bluesky session. */
export function buildBlueskyPost(word: WordEntry, url: string): string {
  const fixed = `${word.word}\n\n\n\n${url}`; // word + two blank-line gaps + url, teaser slotted between
  const budgetForTeaser = MAX_LENGTH - fixed.length;

  let teaser = word.teaser;
  if (teaser.length > budgetForTeaser) {
    teaser = teaser.slice(0, Math.max(0, budgetForTeaser - ELLIPSIS.length)) + ELLIPSIS;
  }

  return `${word.word}\n\n${teaser}\n\n${url}`;
}

function buildStoryUrl(slug: string, siteUrl: string): string {
  const url = new URL(`/story/${slug}`, siteUrl);
  url.searchParams.set("utm_source", "bluesky");
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", "daily-word");
  return url.toString();
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
  const siteUrl = process.env.CURIO_SITE_URL ?? "http://localhost:3000";
  const url = buildStoryUrl(word.slug, siteUrl);
  const text = buildBlueskyPost(word, url);

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
