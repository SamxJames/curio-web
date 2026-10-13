import { buildFeedXml, FEED_DAYS } from "@/lib/feed";
import { resolveHistory } from "@/lib/words";

// Rebuilt at most hourly (ISR), so the new day's word appears within an
// hour of 00:00 UTC for one Redis MGET per rebuild, not per reader.
export const revalidate = 3600;

export async function GET() {
  const now = new Date();
  const days = (await resolveHistory(now)).slice(0, FEED_DAYS);
  return new Response(buildFeedXml(days, now), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
