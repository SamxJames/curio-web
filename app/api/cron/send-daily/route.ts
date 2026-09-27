import { NextRequest, NextResponse } from "next/server";
import { getAllSubscribers } from "@/lib/db";
import { sendDailyDigests } from "@/lib/email";
import { postDailyWordToBluesky } from "@/lib/bluesky";
import { resolveTodayWord } from "@/lib/words";
import { unsubscribeSecret } from "@/lib/unsubscribeToken";
import { dayKey } from "@/lib/day";

/** Configured in vercel.json to run once a day at 0 9 * * * (9am UTC) — the
 * Vercel Hobby plan caps cron at once/day, so there is no per-hour bucket
 * to honor here even though Subscriber still carries an `hour` field
 * (vestigial — see lib/db.ts). Every subscriber — anonymous or an account
 * holder — gets the one shared word, the same word the site shows everyone
 * today and the same run posts to Bluesky, all resolved from one `now`. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 401 });
  }
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Unverifiable unsubscribe links must never go out. Checked before anything
  // is sent or posted, so once the secret is set a plain re-run just works.
  const unsubscribe = unsubscribeSecret();
  if (!unsubscribe) {
    console.error("[curio:digest] UNSUBSCRIBE_SECRET is not set in production — refusing to send today's digest or post to Bluesky");
    return NextResponse.json({ error: "UNSUBSCRIBE_SECRET is not configured" }, { status: 500 });
  }

  const now = new Date();
  const word = await resolveTodayWord(now);
  const subscribers = await getAllSubscribers();

  const [emailResult, blueskyResult] = await Promise.allSettled([
    sendDailyDigests(subscribers, word, now, { secret: unsubscribe, runKey: `curio-digest-${dayKey(now)}-scheduled` }),
    postDailyWordToBluesky(word, now),
  ]);

  const email =
    emailResult.status === "fulfilled"
      ? emailResult.value
      : { attempted: subscribers.length, sent: 0, failed: subscribers.length, errors: [String(emailResult.reason)], failedRecipients: subscribers };
  if (email.failed > 0) {
    console.error(`[curio:digest] ${email.failed} of ${email.attempted} digests failed:`, email.errors);
  }
  const bluesky = blueskyResult.status === "fulfilled" ? blueskyResult.value.posted : false;

  return NextResponse.json({ word: word.slug, attempted: email.attempted, sent: email.sent, failed: email.failed, bluesky });
}
