import type { WordEntry } from "./words";
import { buildThreadsPost, socialStoryUrl } from "./socialPost";
import { getMetaToken } from "./metaTokens";
import { siteUrl } from "./siteUrl";
import type { DigLine } from "./dig/digLineText";
import { buildThreadsReveal, type DigReveal } from "./dig/revealText";
import { SafeError, call, containerId, form, failureReason, tokenLookupFailed } from "./metaGraph";

const API = "https://graph.threads.net/v1.0";
const POLL_EVERY_MS = 5_000;
const POLL_TRIES = 6; // ≈30s — Meta's recommended wait before publishing

type Sleep = (ms: number) => Promise<void>;

/** The one create, wait, publish flow, for any Threads text post. `what` tags the
 * log lines ("" for the daily word, "reveal" for yesterday's answer) so the two
 * can be told apart in the logs. Never throws: the social cron runs unattended.
 * Unconfigured → logs. */
async function postTextToThreads(
  make: () => { text: string; link?: string },
  what: string,
  opts: { sleep?: Sleep }
): Promise<{ posted: boolean }> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const tag = what ? `[curio:threads:${what}]` : "[curio:threads]";
  const fallbackTag = what ? `[curio:threads:${what}:dev-fallback]` : "[curio:threads:dev-fallback]";
  let token: string | null = null;

  try {
    const { text, link } = make();
    // Inside the try: getMetaToken rejects when Redis is unavailable.
    const userId = process.env.THREADS_USER_ID;
    token = await getMetaToken("threads").catch((err) => {
      throw tokenLookupFailed(err);
    });

    if (!userId || !token) {
      console.log(`${fallbackTag} would post: ${text}${link ? `\n[link] ${link}` : ""}`);
      return { posted: false };
    }
    // In every environment: a local .env.local with real tokens must not
    // post a localhost link either.
    if (siteUrl().startsWith("http://localhost")) {
      console.error(`${tag} CURIO_SITE_URL points to localhost — not posting`);
      return { posted: false };
    }

    const container = containerId(
      await call(
        `${API}/${userId}/threads`,
        form({ media_type: "TEXT", text, ...(link ? { link_attachment: link } : {}), access_token: token })
      )
    );
    for (let i = 0; i < POLL_TRIES; i++) {
      await sleep(POLL_EVERY_MS);
      const { status } = await call(`${API}/${container}?fields=status&access_token=${encodeURIComponent(token)}`);
      if (status === "FINISHED") break;
      if (status === "ERROR" || status === "EXPIRED") throw new SafeError(`container ${String(status)}`);
    }
    await call(`${API}/${userId}/threads_publish`, form({ creation_id: container, access_token: token }));
    // On record now, even if the other channel later gets the function killed.
    console.log(`${tag} posted`);
    return { posted: true };
  } catch (err) {
    console.error(`${tag} post failed:`, failureReason(err, token));
    return { posted: false };
  }
}

/** Today's word as a Threads text post, the story as its link card.
 * Never throws: the social cron runs unattended. Unconfigured → logs. */
export async function postDailyWordToThreads(
  word: WordEntry,
  opts: { sleep?: Sleep } = {},
  dig?: DigLine | null
): Promise<{ posted: boolean }> {
  return postTextToThreads(
    () => ({ text: buildThreadsPost(word, dig), link: socialStoryUrl(word, "threads") }),
    "",
    opts
  );
}

/** Yesterday's dig answer as a text post. The answers-page link is in the text,
 * which Threads previews itself, so there is no link_attachment. Never throws. */
export async function postRevealToThreads(
  reveal: DigReveal,
  opts: { sleep?: Sleep } = {}
): Promise<{ posted: boolean }> {
  return postTextToThreads(() => ({ text: buildThreadsReveal(reveal) }), "reveal", opts);
}
