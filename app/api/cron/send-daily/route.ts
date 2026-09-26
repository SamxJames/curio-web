import { NextRequest, NextResponse } from "next/server";
import { getAllSubscribers } from "@/lib/db";
import { sendDailyDigest } from "@/lib/email";
import { postDailyWordToBluesky } from "@/lib/bluesky";
import { resolveTodayWord } from "@/lib/words";

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

  const now = new Date();
  const word = await resolveTodayWord(now);
  const subscribers = await getAllSubscribers();

  const [emailResults, blueskyResult] = await Promise.allSettled([
    Promise.allSettled(subscribers.map((email) => sendDailyDigest(email, word, now))),
    postDailyWordToBluesky(word, now),
  ]);

  const emailOutcomes = emailResults.status === "fulfilled" ? emailResults.value : [];
  const sent = emailOutcomes.filter((r) => r.status === "fulfilled").length;
  const failed = emailOutcomes.length - sent;
  const bluesky =
    blueskyResult.status === "fulfilled" ? blueskyResult.value.posted : false;

  return NextResponse.json({ word: word.slug, attempted: emailOutcomes.length, sent, failed, bluesky });
}
