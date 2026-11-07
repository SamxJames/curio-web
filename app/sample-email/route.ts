import { buildDigestHtml } from "@/lib/email";
import { dayKey, formatDay } from "@/lib/day";
import { absoluteUrl } from "@/lib/siteUrl";
import { resolveTodayWord } from "@/lib/words";
import { getDigLine } from "@/lib/dig/digLine";

// Dynamic on purpose: resolving today's word can lock it in Redis, which must
// never happen at build time.
export const dynamic = "force-dynamic";

/** "See a sample" from the signup offer: today's digest exactly as
 * subscribers get it, unsubscribe link disabled. Kept out of search. The
 * story link is tagged utm_source=sample, not the digest's "email": an
 * email tag would mark the prospect as arriving from the digest (hiding
 * the offer from them) and count a visit:email. "sample" isn't a tagged
 * source (lib/traffic.ts), so from this page it counts as an internal
 * click, as it is. The dig line below follows the same rule (its link is
 * tagged "sample" too) and is omitted exactly when the real digest omits it. */
export async function GET() {
  const word = await resolveTodayWord();
  const storyUrl = absoluteUrl(`/story/${word.slug}?utm_source=sample`);
  const dig = await getDigLine();
  const html = buildDigestHtml(word, formatDay(dayKey(new Date())), "#", storyUrl, dig, "sample");
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
