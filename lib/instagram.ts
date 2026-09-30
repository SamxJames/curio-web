import type { WordEntry } from "./words";
import { buildCarouselSlides, buildInstagramCaption } from "./socialPost";
import { getMetaToken } from "./metaTokens";
import { absoluteUrl, siteUrl } from "./siteUrl";
import { SafeError, call, form, failureReason } from "./metaGraph";

const API = "https://graph.instagram.com/v25.0";
const POLL_EVERY_MS = 5_000;
/** 60s, not Meta's suggested 5 minutes: images are fetched when each
 * child container is created, so the carousel is normally ready within
 * seconds, and the cron has a 300s ceiling. */
const POLL_TRIES = 12;

/** A create call's container id. A 200 without one must stop the post
 * rather than carry "undefined" into the next step. */
function containerId(body: Record<string, unknown>): string {
  if (typeof body.id !== "string" || !body.id) throw new SafeError("no container id");
  return body.id;
}

/** Today's word as an Instagram carousel (slides from
 * /social/carousel/<slug>/<n>, JPEG). Never throws: the social cron runs
 * unattended. Unconfigured → logs. */
export async function postDailyCarouselToInstagram(
  word: WordEntry,
  opts: { sleep?: (ms: number) => Promise<void> } = {}
): Promise<{ posted: boolean }> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let token: string | null = null;

  try {
    const slideUrls = buildCarouselSlides(word).map((slide, i) => {
      void slide;
      return absoluteUrl(`/social/carousel/${word.slug}/${i + 1}`);
    });
    const caption = buildInstagramCaption(word);
    // Inside the try: getMetaToken rejects when Redis is unavailable.
    const userId = process.env.INSTAGRAM_USER_ID;
    token = await getMetaToken("instagram").catch((err) => {
      throw new SafeError(err instanceof Error ? err.message : "token lookup failed");
    });

    if (!userId || !token) {
      console.log(
        `[curio:instagram:dev-fallback] would post a ${slideUrls.length}-slide carousel:\n${slideUrls.join("\n")}\n[caption] ${caption}`
      );
      return { posted: false };
    }
    if (process.env.VERCEL_ENV === "production" && siteUrl().startsWith("http://localhost")) {
      console.error("[curio:instagram] CURIO_SITE_URL is not set in production — not posting");
      return { posted: false };
    }

    // One at a time and in order: the carousel shows its children in this order.
    const children: string[] = [];
    for (const image_url of slideUrls) {
      const child = await call(`${API}/${userId}/media`, form({ image_url, is_carousel_item: "true", access_token: token }));
      children.push(containerId(child));
    }
    const carousel = containerId(
      await call(
        `${API}/${userId}/media`,
        form({ media_type: "CAROUSEL", children: children.join(","), caption, access_token: token })
      )
    );

    let ready = false;
    for (let i = 0; i < POLL_TRIES && !ready; i++) {
      await sleep(POLL_EVERY_MS);
      const { status_code } = await call(`${API}/${carousel}?fields=status_code&access_token=${encodeURIComponent(token)}`);
      if (status_code === "ERROR" || status_code === "EXPIRED") throw new SafeError(`container ${String(status_code)}`);
      ready = status_code === "FINISHED";
    }
    if (!ready) throw new SafeError("container not ready");

    await call(`${API}/${userId}/media_publish`, form({ creation_id: carousel, access_token: token }));
    return { posted: true };
  } catch (err) {
    console.error("[curio:instagram] post failed:", failureReason(err, token));
    return { posted: false };
  }
}
