import { getWordForDate } from "./words";
import { DAY_MS, dayKey, dayStart } from "./day";
import { buildBlueskyPost, buildStoryCard, graphemeLength, type StoryCard } from "./blueskyPost";

export type PreviewRow = { day: string; word: string; text: string; graphemes: number; card: StoryCard };

/** What the cron will post on each of the next `days` UTC days, for the
 * owner to read before it goes out. Uses the calendar formula, not
 * resolveWordForDate: resolving would lock future days' words in Redis
 * just by previewing them. */
export function buildBlueskyPreview(from: Date, days: number): PreviewRow[] {
  const start = dayStart(dayKey(from)).getTime();
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start + i * DAY_MS);
    const word = getWordForDate(date);
    const text = buildBlueskyPost(word);
    return { day: dayKey(date), word: word.word, text, graphemes: graphemeLength(text), card: buildStoryCard(word) };
  });
}
