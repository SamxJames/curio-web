import { NextRequest, NextResponse } from "next/server";
import { getSubscribersForHour } from "@/lib/db";
import { sendDailyDigest } from "@/lib/email";
import { getTodayWord } from "@/lib/words";

/** Configured in vercel.json to run at minute 0 of every hour. Vercel Cron
 * requests don't carry user auth, so this checks a shared secret instead —
 * set CRON_SECRET in the project's environment variables and Vercel will
 * send it automatically as a bearer token on scheduled invocations. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const hour = now.getUTCHours();
  const word = getTodayWord();
  const subscribers = await getSubscribersForHour(hour);

  const results = await Promise.allSettled(
    subscribers.map((email) => sendDailyDigest(email, word, now))
  );
  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - sent;

  return NextResponse.json({ hour, word: word.slug, attempted: results.length, sent, failed });
}
