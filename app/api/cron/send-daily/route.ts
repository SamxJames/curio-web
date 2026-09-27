import { NextRequest, NextResponse } from "next/server";
import { getAllSubscribers } from "@/lib/db";
import { sendDailyDigests } from "@/lib/email";
import { postDailyWordToBluesky } from "@/lib/bluesky";
import { resolveTodayWord } from "@/lib/words";
import { unsubscribeSecret } from "@/lib/unsubscribeToken";
import { claimRun, getFailures, recordFailures, releaseRun, removeFailures } from "@/lib/digestRuns";
import { dayKey } from "@/lib/day";

/** Vercel Hobby with Fluid compute allows up to 300s (the project default
 * is also 300; pinned here so a dashboard change can't cut a retrying send
 * short). The sender itself stops starting retries at SEND_BUDGET_MS, so
 * there's always time left to record failures and respond. */
export const maxDuration = 300;
const SEND_BUDGET_MS = 240_000;

/** Configured in vercel.json to run once a day at 0 9 * * * (9am UTC) — the
 * Vercel Hobby plan caps cron at once/day, so there is no per-hour bucket
 * to honor here even though Subscriber still carries an `hour` field
 * (vestigial — see lib/db.ts). Every subscriber — anonymous or an account
 * holder — gets the one shared word, the same word the site shows everyone
 * today and the same run posts to Bluesky, all resolved from one `now`.
 *
 * Idempotent per UTC day: email and Bluesky each claim a day lock before
 * sending, so a repeat (e.g. Vercel's manual "Run") is a no-op. Deliberate
 * overrides, all requiring CRON_SECRET (commands in handover.md):
 * - `?resend=failed` — only today's recorded failures who are still
 *   subscribed; each leaves the set as its chunk succeeds. Never posts.
 * - `?force=1` — every subscriber again. Bluesky still only posts if it
 *   hasn't today...
 * - `?force=1&bluesky=1` — ...unless this is added. */
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

  const params = req.nextUrl.searchParams;
  const force = params.get("force") === "1";
  const resendFailed = params.get("resend") === "failed";
  const repostBluesky = params.get("bluesky") === "1";
  if ((force || resendFailed || repostBluesky) && !secret) {
    return NextResponse.json({ error: "Overrides require CRON_SECRET" }, { status: 401 });
  }
  if ((force && resendFailed) || (repostBluesky && !force)) {
    return NextResponse.json(
      { error: "Use force=1 (optionally with bluesky=1) or resend=failed" },
      { status: 400 }
    );
  }

  // Unverifiable unsubscribe links must never go out. Checked before any
  // lock is claimed, so once the secret is set a plain re-run just works.
  const unsubscribe = unsubscribeSecret();
  if (!unsubscribe) {
    console.error("[curio:digest] UNSUBSCRIBE_SECRET is not set in production — refusing to send today's digest or post to Bluesky");
    return NextResponse.json({ error: "UNSUBSCRIBE_SECRET is not configured" }, { status: 500 });
  }

  const started = Date.now();
  const now = new Date();
  const day = dayKey(now);
  const word = await resolveTodayWord(now);
  // Read before claiming anything: a failed read must not leave a lock
  // behind with nothing sent.
  const subscribers = await getAllSubscribers();
  const subscriberSet = new Set(subscribers);
  const recipients = resendFailed
    ? (await getFailures(day)).filter((email) => subscriberSet.has(email))
    : subscribers;

  const mode = resendFailed ? "resend-failed" : force ? "force" : "scheduled";
  let sendEmail = false;
  let postBluesky = false;
  try {
    sendEmail = resendFailed || (await claimRun("email", day, { force }));
    postBluesky = !resendFailed && (await claimRun("bluesky", day, { force: repostBluesky }));
  } catch (err) {
    // A claim throwing partway through must not strand today as
    // "already ran" with nothing sent: release whatever this run did
    // manage to claim (best effort — logged, not thrown, if that itself
    // fails), then let the error surface as this request's 500.
    const claimedEmailLock = sendEmail && !resendFailed;
    if (claimedEmailLock) {
      await releaseRun("email", day).catch((releaseErr) =>
        console.error(`[curio:digest] failed to release the email lock for ${day} after a claim error:`, releaseErr)
      );
    }
    throw err;
  }
  const alreadyRan = { email: !resendFailed && !sendEmail, bluesky: !resendFailed && !postBluesky };

  if (!sendEmail && !postBluesky) {
    console.log(`[curio:digest] ${day} already ran; nothing to do`);
    return NextResponse.json({ word: word.slug, attempted: 0, sent: 0, failed: 0, bluesky: false, alreadyRan });
  }

  // "scheduled" is stable within the day; overrides get a unique key, or
  // Resend would dedupe a deliberate re-send against the morning's run.
  const runKey = `curio-digest-${day}-${mode === "scheduled" ? "scheduled" : `${mode}-${started}`}`;
  // Both start concurrently, but only email carries a timing budget, so a
  // hung Bluesky call must never delay recording today's failures: await
  // and fully process the email result (including recordFailures) first,
  // then await Bluesky separately.
  const emailPromise = sendEmail
    ? sendDailyDigests(recipients, word, now, {
        secret: unsubscribe,
        runKey,
        deadline: started + SEND_BUDGET_MS,
        // A resend forgets each address as its chunk succeeds, so a second
        // resend (even after this one dies) can't double-send.
        onSent: resendFailed ? (sent) => removeFailures(day, sent) : undefined,
      })
    : Promise.resolve({ attempted: 0, sent: 0, failed: 0, errors: [], failedRecipients: [] });
  const blueskyPromise = postBluesky ? postDailyWordToBluesky(word, now) : Promise.resolve({ posted: false });
  // Settled immediately (not just awaited later): otherwise a Bluesky
  // rejection while the email result is still being processed above would
  // surface as an unhandled rejection instead of being caught here.
  const blueskySettled = blueskyPromise.then(
    (result) => result.posted,
    () => false
  );

  const email = await emailPromise.catch((err) => ({
    attempted: recipients.length,
    sent: 0,
    failed: recipients.length,
    errors: [String(err)],
    failedRecipients: recipients,
  }));
  // Scheduled and forced runs replace the set with their own failures. A
  // resend only ever removes from it (above): its failures are already in it.
  if (sendEmail && !resendFailed) {
    try {
      await recordFailures(day, email.failedRecipients);
    } catch (err) {
      console.error(`[curio:digest] failed to record ${email.failedRecipients.length} ${mode} ${day} failure(s):`, err);
    }
  }
  if (email.failed > 0) {
    console.error(`[curio:digest] ${mode} ${day}: ${email.failed} of ${email.attempted} digests failed:`, email.errors);
  }
  const bluesky = await blueskySettled;
  console.log(
    `[curio:digest] ${mode} ${day}: sent ${email.sent} of ${email.attempted}; bluesky ${postBluesky ? (bluesky ? "posted" : "failed") : "skipped"}`
  );

  return NextResponse.json({
    word: word.slug,
    attempted: email.attempted,
    sent: email.sent,
    failed: email.failed,
    bluesky,
    alreadyRan,
  });
}
