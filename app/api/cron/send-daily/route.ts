import { NextRequest, NextResponse } from "next/server";
import { getAllSubscribers } from "@/lib/db";
import { sendDailyDigest } from "@/lib/email";
import { postDailyWordToBluesky } from "@/lib/bluesky";
import { getTodayWord, getDigestWordForSubscriber, type WordEntry } from "@/lib/words";
import { getUserIdByEmail } from "@/lib/auth";
import { getUserJoinedAt } from "@/lib/userData";

/** Resolves the word one subscriber's email should carry: their own
 * personalized rotation if the address belongs to a signed-in account with
 * a recorded join date, otherwise the shared calendar word everyone else
 * gets — see lib/words.ts's getDigestWordForSubscriber for why this split
 * exists (an account's Today page already shows the personalized word, so
 * the email should match it instead of surprising them with a second,
 * different word). */
async function resolveSubscriberWord(
  email: string,
  sharedWord: WordEntry,
  now: Date
): Promise<{ word: WordEntry; personalized: boolean }> {
  const userId = await getUserIdByEmail(email);
  const joinedAtStr = userId ? await getUserJoinedAt(userId) : null;
  return {
    word: getDigestWordForSubscriber(userId, joinedAtStr, now, sharedWord),
    personalized: Boolean(userId && joinedAtStr),
  };
}

/** Configured in vercel.json to run once a day at 0 9 * * * (9am UTC) — the
 * Vercel Hobby plan caps cron at once/day, so there is no per-hour bucket
 * to honor here even though Subscriber still carries an `hour` field
 * (vestigial — see lib/db.ts). Every subscriber gets a word at this one
 * run, regardless of what hour they were ever assigned. The same run also
 * posts the word to Bluesky — same trigger, same frequency, zero extra
 * infra; Bluesky always gets the shared calendar word, since it's one
 * public post rather than something personalized per account. */
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
  const sharedWord = getTodayWord();
  const subscribers = await getAllSubscribers();
  const resolved = await Promise.all(
    subscribers.map((email) => resolveSubscriberWord(email, sharedWord, now))
  );

  const [emailResults, blueskyResult] = await Promise.allSettled([
    Promise.allSettled(
      subscribers.map((email, i) => sendDailyDigest(email, resolved[i].word, now))
    ),
    postDailyWordToBluesky(sharedWord, now),
  ]);

  const emailOutcomes = emailResults.status === "fulfilled" ? emailResults.value : [];
  const sent = emailOutcomes.filter((r) => r.status === "fulfilled").length;
  const failed = emailOutcomes.length - sent;
  const bluesky =
    blueskyResult.status === "fulfilled" ? blueskyResult.value.posted : false;
  const personalized = resolved.filter((r) => r.personalized).length;

  return NextResponse.json({
    word: sharedWord.slug,
    attempted: emailOutcomes.length,
    sent,
    failed,
    personalized,
    bluesky,
  });
}
