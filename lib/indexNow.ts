import { redis } from "./redis";
import { absoluteUrl, siteUrl } from "./siteUrl";
import { buildSitemapEntries } from "./seoRoutes";

/** IndexNow (Bing, Yandex, Seznam, Naver; Bing's index also feeds
 * DuckDuckGo, Copilot and ChatGPT search). Google does not use IndexNow.
 * The key is public by design: it's served at /<key>.txt to prove we own
 * the host. Rotating it means a new public/ file and a new constant. */
export const INDEXNOW_KEY = "3f5e065a4027a9dbca71664664e0b4f1";
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS = 10_000;
const LOCK_TTL_SECONDS = 3 * 24 * 60 * 60;
const SUBMITTED_KEY = "curio:digest:indexnow:submitted";
const lockKey = (day: string) => `curio:digest:indexnow:${day}`;

export type IndexNowOutcome = "skipped" | "already-ran" | "submitted" | "failed";

/** The pages whose HTML changes every day. */
export function dailyIndexNowUrls(todaySlug: string): string[] {
  return [absoluteUrl("/"), absoluteUrl("/play"), absoluteUrl(`/story/${todaySlug}`)];
}

/** Called from the 09:00 cron inside after(). Never throws, so it can't
 * touch the digest or Bluesky. Once per UTC day (its own lock); a failed
 * submission releases the lock so a plain re-run of the cron retries. */
export async function submitDailyIndexNow(
  todaySlug: string,
  day: string,
  deps: { fetcher?: typeof fetch } = {}
): Promise<IndexNowOutcome> {
  const fetcher = deps.fetcher ?? fetch;
  if (process.env.VERCEL_ENV !== "production") return skip("not production");
  if (!redis) return skip("no Redis");
  if (!siteUrl().startsWith("https://")) return skip("site URL is not https");

  let claimed = false;
  try {
    claimed = (await redis.set(lockKey(day), new Date().toISOString(), { nx: true, ex: LOCK_TTL_SECONDS })) === "OK";
    if (!claimed) return "already-ran";

    const sitemapUrls = buildSitemapEntries().map((e) => e.url);
    const seen = await redis.smismember(SUBMITTED_KEY, sitemapUrls);
    const unsent = sitemapUrls.filter((_, i) => !seen[i]);
    const urlList = [...new Set([...dailyIndexNowUrls(todaySlug), ...unsent])].slice(0, MAX_URLS);

    const response = await fetcher(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: new URL(siteUrl()).host,
        key: INDEXNOW_KEY,
        keyLocation: absoluteUrl(`/${INDEXNOW_KEY}.txt`),
        urlList,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status !== 200 && response.status !== 202) {
      console.error(`[curio:indexnow] ${day}: HTTP ${response.status}; lock released for a retry`);
      await release(day);
      return "failed";
    }
    const sentFromSitemap = unsent.filter((u) => urlList.includes(u));
    if (sentFromSitemap.length > 0) await redis.sadd(SUBMITTED_KEY, ...(sentFromSitemap as [string, ...string[]]));
    console.log(`[curio:indexnow] ${day}: submitted ${urlList.length} URLs (HTTP ${response.status})`);
    return "submitted";
  } catch (err) {
    // err.name only: a raw fetch or Upstash error can carry URLs or tokens.
    console.error(`[curio:indexnow] ${day}: ${err instanceof Error ? err.name : "error"}; lock released for a retry`);
    if (claimed) await release(day);
    return "failed";
  }
}

function skip(reason: string): IndexNowOutcome {
  console.log(`[curio:indexnow] skipped (${reason})`);
  return "skipped";
}

async function release(day: string): Promise<void> {
  await redis?.del(lockKey(day)).catch(() => {});
}
