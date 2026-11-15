import { absoluteUrl } from "../siteUrl";
import { BLUESKY_HASHTAGS, graphemeLength, type StoryCard } from "../blueskyPost";
import { bannedHits } from "./copyAudit";

/** The "yesterday's answer" post for Bluesky and Threads. Pure: no Redis, no fs,
 * nothing from ./server and no poster library, so the preview scripts load it
 * offline. The server-side lookup is in ./reveal.
 *
 * Every word comes from a past, finished day (nothing is made up for days
 * nobody dug) and says "asked", never anything about who did or didn't take
 * part: no counts of people, no gap, no deadline. */

export type DigReveal = {
  /** The past day, YYYY-MM-DD: yesterday, UTC. */
  date: string;
  /** That day's dig number (day 1 is DIG_LAUNCH_DATE). */
  number: number;
  /** The day's first prompt, as shown to players. */
  prompt: string;
  /** That prompt's fossil: the rarest answer. */
  fossilWord: string;
  /** The fossil's fact, if it reads as a sentence; otherwise an empty string. */
  fact: string;
};

export type RevealSource = "bluesky" | "threads";

const BLUESKY_MAX_GRAPHEMES = 300;
const THREADS_MAX_BYTES = 500;
const THREADS_TAG = "#etymology";
const ELLIPSIS = "…";
/** A trimmed fact shorter than this is a scrap, not a fact: drop it instead. */
const MIN_FACT_CHARS = 24;

/** Every other day, so the feeds don't carry a reveal daily: odd dig numbers. */
export function isRevealDay(number: number): boolean {
  return Number.isInteger(number) && number >= 1 && number % 2 === 1;
}

/** The dated answers page, tagged so the existing land:<source> funnel field
 * credits the arrival to the channel. */
export function revealUrl(date: string, source: RevealSource): string {
  const url = new URL(absoluteUrl(`/dig/${date}`));
  url.searchParams.set("utm_source", source);
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", "dig-reveal");
  return url.toString();
}

function leadLine(r: DigReveal): string {
  return `Yesterday's curio dig asked “${r.prompt}”. The rarest answer: ${r.fossilWord}.`;
}

/** The longest version of the fact that `fits`: whole, else cut at a word
 * boundary with an ellipsis, else nothing. A fact that would trip the shared
 * copy audit is dropped, so a stray "everyone" in a dictionary line can't
 * reach a feed. */
function fitFact(fact: string, fits: (fact: string) => boolean): string {
  const clean = fact.replace(/\s+/g, " ").trim();
  if (!clean || bannedHits(clean).length > 0) return "";
  if (fits(clean)) return clean;
  const words = clean.split(" ");
  for (let n = words.length - 1; n >= 1; n--) {
    const kept = words.slice(0, n).join(" ").replace(/[\s,;:.\-–—(]+$/u, "");
    if (kept.length < MIN_FACT_CHARS) return ""; // shorter prefixes only get shorter
    if (fits(kept + ELLIPSIS)) return kept + ELLIPSIS;
  }
  return "";
}

function assemble(lead: string, fact: string, url: string, tags: string): string {
  return [fact ? `${lead} ${fact}` : lead, url, tags].filter(Boolean).join("\n\n");
}

/** The lead and fact, the link as its own paragraph (a bare URL, which Bluesky's
 * facet detection makes clickable), then the same tags as the word post. Fits
 * Bluesky's 300 graphemes: the fact is trimmed or dropped, never the lead or the
 * link; only if the lead and link alone are too long do the tags go. */
export function buildBlueskyReveal(r: DigReveal): string {
  const lead = leadLine(r);
  const url = revealUrl(r.date, "bluesky");
  const fits = (s: string) => graphemeLength(s) <= BLUESKY_MAX_GRAPHEMES;
  const fact = fitFact(r.fact, (f) => fits(assemble(lead, f, url, BLUESKY_HASHTAGS)));
  const text = assemble(lead, fact, url, BLUESKY_HASHTAGS);
  return fits(text) ? text : assemble(lead, "", url, "");
}

/** The same shape for Threads: its limit is 500 UTF-8 bytes, it keeps one tag,
 * and the link sits in the text (Threads previews a lone link itself). */
export function buildThreadsReveal(r: DigReveal): string {
  const lead = leadLine(r);
  const url = revealUrl(r.date, "threads");
  const fits = (s: string) => Buffer.byteLength(s, "utf8") <= THREADS_MAX_BYTES;
  const fact = fitFact(r.fact, (f) => fits(assemble(lead, f, url, THREADS_TAG)));
  const text = assemble(lead, fact, url, THREADS_TAG);
  return fits(text) ? text : assemble(lead, "", url, "");
}

/** Bluesky's link card for the reveal: the answers page and its own preview image. */
export function buildRevealCard(r: DigReveal): StoryCard {
  return {
    uri: revealUrl(r.date, "bluesky"),
    title: `curio dig, day ${r.number}: the answers`,
    description: "The answers and the fossils from one day's dig. Free, no login.",
    thumbUrl: absoluteUrl(`/dig/${r.date}/opengraph-image`),
  };
}

/** What the preview scripts print: no real day is needed, and nothing is read. */
export const SAMPLE_REVEAL: DigReveal = {
  date: "2026-11-13",
  number: 7,
  prompt: "Name a beverage",
  fossilWord: "kvass",
  fact: "Borrowed from Russian, where it names a fermented drink made from stale rye bread.",
};
