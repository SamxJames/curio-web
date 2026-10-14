import { buildFeedXml, FEED_DAYS } from "@/lib/feed";
import { resolveHistorySince } from "@/lib/words";

// Dynamic on purpose: prerendering would run this at build time, and a local
// or preview build (which shares production's Upstash) could then SET NX
// word locks through the word-lock layer. The CDN header below gives the same
// hourly freshness for one Redis read per cache fill, not per reader.
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export async function GET() {
  const now = new Date();
  const since = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (FEED_DAYS - 1) * DAY_MS
  );
  const days = await resolveHistorySince(since, now);
  return new Response(buildFeedXml(days, now), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}
