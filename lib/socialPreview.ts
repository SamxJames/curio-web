import { getWordForDate } from "./words";
import { DAY_MS, dayKey, dayStart } from "./day";
import { absoluteUrl } from "./siteUrl";
import {
  buildCarouselSlides,
  buildInstagramCaption,
  buildThreadsPost,
  socialStoryUrl,
  type Slide,
} from "./socialPost";

// Imports only the pure builders: lib/threads.ts, instagram.ts and
// metaGraph.ts pull in tokens and Redis, and the preview must stay offline.

export type SocialPreviewRow = {
  day: string;
  word: string;
  threads: string;
  threadsLink: string;
  caption: string;
  slides: { n: number; kind: Slide["kind"]; url: string }[];
};

/** What the cron will post to Threads and Instagram on each of the next
 * `days` UTC days. Uses the calendar formula, not resolveWordForDate:
 * resolving would lock future days' words in Redis just by previewing them. */
export function buildSocialPreview(from: Date, days: number): SocialPreviewRow[] {
  const start = dayStart(dayKey(from)).getTime();
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start + i * DAY_MS);
    const word = getWordForDate(date);
    return {
      day: dayKey(date),
      word: word.word,
      threads: buildThreadsPost(word),
      threadsLink: socialStoryUrl(word, "threads"),
      caption: buildInstagramCaption(word),
      slides: buildCarouselSlides(word).map((slide, j) => ({
        n: j + 1,
        kind: slide.kind,
        url: absoluteUrl(`/social/carousel/${word.slug}/${j + 1}`),
      })),
    };
  });
}
