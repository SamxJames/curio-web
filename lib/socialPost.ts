import type { WordEntry } from "./words";
import { absoluteUrl } from "./siteUrl";

// Pure builders for the Threads post, the Instagram caption and the
// carousel's slides. Every sentence comes from the stored, reviewed
// WordEntry fields or from the fixed Curio lines below — nothing is
// generated, so a post can't say anything the story page doesn't.

export type SocialChannel = "threads" | "instagram";

/** Instagram portrait (4:5) — the tallest ratio it keeps uncropped. */
export const CAROUSEL_SIZE = { width: 1080, height: 1350 } as const;
export const INSTAGRAM_HASHTAGS = "#etymology #wordoftheday #words #language #wordnerd";
const MAX_STORY_SLIDES = 3;

export function socialStoryUrl(word: WordEntry, channel: SocialChannel): string {
  const url = new URL(absoluteUrl(`/story/${word.slug}`));
  url.searchParams.set("utm_source", channel);
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", "daily-word");
  return url.toString();
}

/** The public URL of a word's nth (1-based) carousel slide — what Meta
 * fetches, the warm-up checks and the preview lists. */
export function carouselSlideUrl(word: WordEntry, n: number): string {
  return absoluteUrl(`/social/carousel/${word.slug}/${n}`);
}

function lineageLine(word: WordEntry): string {
  return `${word.word} · ${word.lineage.join(" → ")}`;
}

/** The Bluesky format with one tag: Threads treats a post's single
 * hashtag as its topic, so a second adds nothing. The link travels in the
 * post's link_attachment (see lib/threads.ts), not the text. */
export function buildThreadsPost(word: WordEntry): string {
  return `${word.teaser}\n\n${lineageLine(word)}\n\n#etymology`;
}

/** Instagram captions can't hold a clickable link, so the story is
 * "link in bio" — the profile's bio link is set to curioword.com. */
export function buildInstagramCaption(word: WordEntry): string {
  return (
    `${word.teaser}\n\n${lineageLine(word)}\n\n` +
    `The full story is at curioword.com (link in bio).\n\n${INSTAGRAM_HASHTAGS}`
  );
}

/** Sentence ends followed by whitespace. Enough for this bank: measured
 * 2026-09-29, one origin in 1,147 has an abbreviation-style "x. " and it
 * splits harmlessly. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type Slide =
  | { kind: "hook"; text: string }
  | { kind: "word"; word: string; respelling: string; partOfSpeech: string; lineage: string }
  | { kind: "story"; text: string; index: number; total: number }
  | { kind: "outro" };

/** Hook (teaser) → the word and its lineage → the origin, a sentence a
 * slide (beyond three, the rest share the third) → Curio outro. */
export function buildCarouselSlides(word: WordEntry): Slide[] {
  const sentences = splitSentences(word.origin);
  const parts =
    sentences.length <= MAX_STORY_SLIDES
      ? sentences
      : [...sentences.slice(0, MAX_STORY_SLIDES - 1), sentences.slice(MAX_STORY_SLIDES - 1).join(" ")];
  return [
    { kind: "hook", text: word.teaser },
    {
      kind: "word",
      word: word.word,
      respelling: word.respelling,
      partOfSpeech: word.partOfSpeech,
      lineage: word.lineage.join(" → "),
    },
    ...parts.map((text, i) => ({ kind: "story" as const, text, index: i + 1, total: parts.length })),
    { kind: "outro" },
  ];
}

/** The fixed words drawn on the slides (lib/carouselImage.tsx), kept here
 * so slideText sees everything a slide renders. */
export const SLIDE_COPY = {
  brand: "CURIO",
  swipe: "Swipe →",
  outroLine: "One word's origin story, every morning.",
  outroSite: "curioword.com",
  outroTagline: "No feed, no backlog.",
} as const;

/** The story slide's "2 / 3" label; none when there's only one. */
export function storyLabel(slide: Extract<Slide, { kind: "story" }>): string | null {
  return slide.total > 1 ? `${slide.index} / ${slide.total}` : null;
}

/** Every piece of text a slide draws, for needsFallbackFont. */
export function slideText(slide: Slide): string {
  switch (slide.kind) {
    case "hook":
      return [SLIDE_COPY.brand, slide.text, SLIDE_COPY.swipe].join("\n");
    case "word":
      return [slide.word, `${slide.respelling} · ${slide.partOfSpeech}`, slide.lineage].join("\n");
    case "story":
      return [storyLabel(slide) ?? "", slide.text].join("\n");
    case "outro":
      return [SLIDE_COPY.outroLine, SLIDE_COPY.outroSite, SLIDE_COPY.outroTagline].join("\n");
  }
}

/** The non-ASCII characters the slide copy uses that next/og's bundled
 * Geist has (lib/socialPost.test.ts checks them against its cmap). */
export const GEIST_EXTRAS = ["·", "→", "—", "–", "‘", "’", "“", "”", "…"] as const;

const GEIST_SAFE = new RegExp(`^[\\x20-\\x7E\\n\\t${GEIST_EXTRAS.join("")}]*$`);

/** True unless every character is one next/og's bundled font surely has.
 * Geist is its only bundled font; any other character (Han, Greek, but also
 * Latin letters such as ǭ or ḱ) makes it fetch Noto Sans from Google Fonts,
 * and a failed fetch still draws the slide, with boxes, as a 200. The slide
 * route won't let a CDN keep such a slide, so this errs towards true: an
 * allowlist, not a guess at which scripts Geist covers. */
export function needsFallbackFont(text: string): boolean {
  return !GEIST_SAFE.test(text);
}
