import { buildDigestHtml } from "@/lib/email";
import { dayKey, formatDay } from "@/lib/day";
import { resolveTodayWord } from "@/lib/words";

// Dynamic on purpose: resolving today's word can lock it in Redis, which must
// never happen at build time.
export const dynamic = "force-dynamic";

/** "See a sample" from the signup offer: today's digest exactly as
 * subscribers get it, unsubscribe link disabled. Kept out of search. */
export async function GET() {
  const word = await resolveTodayWord();
  const html = buildDigestHtml(word, formatDay(dayKey(new Date())), "#");
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex",
      "Cache-Control": "public, max-age=300",
    },
  });
}
