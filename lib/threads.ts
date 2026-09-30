import type { WordEntry } from "./words";
import { buildThreadsPost, socialStoryUrl } from "./socialPost";
import { getMetaToken } from "./metaTokens";
import { siteUrl } from "./siteUrl";
import { SafeError, call, containerId, form, failureReason, tokenLookupFailed } from "./metaGraph";

const API = "https://graph.threads.net/v1.0";
const POLL_EVERY_MS = 5_000;
const POLL_TRIES = 6; // ≈30s — Meta's recommended wait before publishing

/** Today's word as a Threads text post, the story as its link card.
 * Never throws: the social cron runs unattended. Unconfigured → logs. */
export async function postDailyWordToThreads(
  word: WordEntry,
  opts: { sleep?: (ms: number) => Promise<void> } = {}
): Promise<{ posted: boolean }> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let token: string | null = null;

  try {
    const text = buildThreadsPost(word);
    const link = socialStoryUrl(word, "threads");
    // Inside the try: getMetaToken rejects when Redis is unavailable.
    const userId = process.env.THREADS_USER_ID;
    token = await getMetaToken("threads").catch((err) => {
      throw tokenLookupFailed(err);
    });

    if (!userId || !token) {
      console.log(`[curio:threads:dev-fallback] would post: ${text}\n[link] ${link}`);
      return { posted: false };
    }
    // In every environment: a local .env.local with real tokens must not
    // post a localhost link either.
    if (siteUrl().startsWith("http://localhost")) {
      console.error("[curio:threads] CURIO_SITE_URL points to localhost — not posting");
      return { posted: false };
    }

    const container = containerId(
      await call(`${API}/${userId}/threads`, form({ media_type: "TEXT", text, link_attachment: link, access_token: token }))
    );
    for (let i = 0; i < POLL_TRIES; i++) {
      await sleep(POLL_EVERY_MS);
      const { status } = await call(`${API}/${container}?fields=status&access_token=${encodeURIComponent(token)}`);
      if (status === "FINISHED") break;
      if (status === "ERROR" || status === "EXPIRED") throw new SafeError(`container ${String(status)}`);
    }
    await call(`${API}/${userId}/threads_publish`, form({ creation_id: container, access_token: token }));
    // On record now, even if the other channel later gets the function killed.
    console.log("[curio:threads] posted");
    return { posted: true };
  } catch (err) {
    console.error("[curio:threads] post failed:", failureReason(err, token));
    return { posted: false };
  }
}
