import type { WordEntry } from "./words";
import { buildCarouselSlides, buildInstagramCaption, carouselSlideUrl } from "./socialPost";
import { getMetaToken } from "./metaTokens";
import { siteUrl } from "./siteUrl";
import { SafeError, call, containerId, form, failureReason, tokenLookupFailed } from "./metaGraph";

const API = "https://graph.instagram.com/v25.0";
const POLL_EVERY_MS = 5_000;
/** 60s, not Meta's suggested 5 minutes: images are fetched when each
 * child container is created, so the carousel is normally ready within
 * seconds, and the cron has a 300s ceiling. */
const POLL_TRIES = 12;
const WARM_TIMEOUT_MS = 15_000;

/** Fetches every slide ourselves, in order, before Meta does: a slide that
 * 404s, errors or isn't a JPEG stops the post before anything is created,
 * and a good one is rendered (and, if cacheable, at the CDN) by the time
 * Meta asks for it. */
async function warmSlides(urls: string[]): Promise<void> {
  for (const [i, url] of urls.entries()) {
    const res = await fetch(url, { signal: AbortSignal.timeout(WARM_TIMEOUT_MS) });
    await res.arrayBuffer().catch(() => {}); // drain, so the connection is freed
    const type = res.headers.get("content-type") ?? "";
    if (res.status !== 200) throw new SafeError(`slide ${i + 1} not ready: ${res.status}`);
    if (!type.startsWith("image/jpeg")) throw new SafeError(`slide ${i + 1} not ready: ${res.status} ${type || "no content-type"}`);
  }
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
    const slideUrls = Array.from(buildCarouselSlides(word).keys(), (i) => carouselSlideUrl(word, i + 1));
    const caption = buildInstagramCaption(word);
    // Inside the try: getMetaToken rejects when Redis is unavailable.
    const userId = process.env.INSTAGRAM_USER_ID;
    token = await getMetaToken("instagram").catch((err) => {
      throw tokenLookupFailed(err);
    });

    if (!userId || !token) {
      console.log(
        `[curio:instagram:dev-fallback] would post a ${slideUrls.length}-slide carousel:\n${slideUrls.join("\n")}\n[caption] ${caption}`
      );
      return { posted: false };
    }
    // In every environment: a local .env.local with real tokens must not
    // hand Meta localhost URLs either.
    if (siteUrl().startsWith("http://localhost")) {
      console.error("[curio:instagram] CURIO_SITE_URL points to localhost — not posting");
      return { posted: false };
    }

    await warmSlides(slideUrls);

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
    // On record now, even if the other channel later gets the function killed.
    console.log("[curio:instagram] posted");
    return { posted: true };
  } catch (err) {
    console.error("[curio:instagram] post failed:", failureReason(err, token));
    return { posted: false };
  }
}
