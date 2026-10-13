import type { HistoryDay } from "./words";
import { absoluteUrl } from "./siteUrl";

export const FEED_DAYS = 30;
export const FEED_PATH = "/feed.xml";

const FEED_DESCRIPTION =
  "One word and the story of where it came from, every day. Stories are rewritten by a language model from Wiktionary's etymology data (CC BY-SA 4.0).";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** RSS 2.0 for the shared calendar's most recent days. Pull archive only:
 * every item is a day that has already happened, dated the day it was the
 * word, newest first. Nothing here knows or says what a reader has seen. */
export function buildFeedXml(days: HistoryDay[], now: Date): string {
  const items = days.map(({ date, word }) => {
    const url = absoluteUrl(`/story/${word.slug}`);
    // The utm tag lets /admin count feed clicks as the "rss" source.
    const html = `<p>${escapeXml(word.teaser)}</p><p>${escapeXml(word.origin)}</p><p><a href="${url}?utm_source=rss">Read the full story on Curio</a></p>`;
    return [
      "<item>",
      `<title>${escapeXml(word.word)}</title>`,
      `<link>${url}?utm_source=rss</link>`,
      `<guid isPermaLink="true">${url}</guid>`,
      `<pubDate>${new Date(`${date}T00:00:00Z`).toUTCString()}</pubDate>`,
      `<description>${escapeXml(html)}</description>`,
      "</item>",
    ].join("");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    "<title>Curio: one word, one story, every day</title>",
    `<link>${absoluteUrl("/")}</link>`,
    `<description>${escapeXml(FEED_DESCRIPTION)}</description>`,
    "<language>en</language>",
    `<copyright>${escapeXml("Word origins adapted from Wiktionary, CC BY-SA 4.0. See " + absoluteUrl("/attribution"))}</copyright>`,
    `<lastBuildDate>${now.toUTCString()}</lastBuildDate>`,
    "<ttl>60</ttl>",
    `<atom:link href="${absoluteUrl(FEED_PATH)}" rel="self" type="application/rss+xml"/>`,
    ...items,
    "</channel>",
    "</rss>",
  ].join("\n");
}
