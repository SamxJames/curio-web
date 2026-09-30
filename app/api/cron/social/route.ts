import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cronAuth";
import { resolveTodayWord } from "@/lib/words";
import { dayKey } from "@/lib/day";
import { claimRun, releaseRun, type Channel } from "@/lib/digestRuns";
import { postDailyWordToThreads } from "@/lib/threads";
import { postDailyCarouselToInstagram } from "@/lib/instagram";

/** Threads waits ~30s before publishing and Instagram up to 60s for its
 * carousel; 300s is the Hobby ceiling. */
export const maxDuration = 300;

type SocialChannel = Extract<Channel, "threads" | "instagram">;
const CHANNELS: SocialChannel[] = ["threads", "instagram"];

/** Configured in vercel.json at 0 10 * * * — Hobby fires it any time in
 * 10:00–10:59 UTC, after the 09:xx digest and Bluesky post, and separate
 * from them so a slow Instagram upload can never hold up email. Posts the
 * same shared word as every other surface. Idempotent per UTC day per
 * channel; `?repost=threads|instagram` (CRON_SECRET only) forces one
 * channel's lock and posts it alone — see handover.md. */
export async function GET(req: NextRequest) {
  const { secret, denied } = authorizeCron(req);
  if (denied) return denied;

  const reposts = req.nextUrl.searchParams.getAll("repost");
  if (reposts.length > 0 && !secret) {
    return NextResponse.json({ error: "repost requires CRON_SECRET" }, { status: 401 });
  }
  if (reposts.length > 1 || (reposts.length === 1 && !CHANNELS.includes(reposts[0] as SocialChannel))) {
    return NextResponse.json({ error: "Use repost=threads or repost=instagram" }, { status: 400 });
  }
  const repost = reposts[0] as SocialChannel | undefined;

  const now = new Date();
  const day = dayKey(now);
  const word = await resolveTodayWord(now);

  const claimed: SocialChannel[] = [];
  const run: Record<SocialChannel, boolean> = { threads: false, instagram: false };
  try {
    for (const channel of CHANNELS) {
      if (repost && channel !== repost) continue;
      run[channel] = await claimRun(channel, day, { force: channel === repost });
      if (run[channel]) claimed.push(channel);
    }
  } catch (err) {
    // Don't strand the day as "already ran" with nothing posted.
    for (const channel of claimed) {
      await releaseRun(channel, day).catch((releaseErr) => {
        // Name only: an Upstash error message echoes the command. A stranded
        // lock needs a `?repost=`, so it must at least be on record.
        console.error(
          `[curio:social] releasing ${channel} lock failed:`,
          releaseErr instanceof Error ? releaseErr.name : "unknown"
        );
      });
    }
    throw err;
  }

  // allSettled: the posters never throw today, but if one ever does the
  // other channel must still post and the response must still go out.
  const [threadsResult, instagramResult] = await Promise.allSettled([
    run.threads ? postDailyWordToThreads(word) : Promise.resolve({ posted: false }),
    run.instagram ? postDailyCarouselToInstagram(word) : Promise.resolve({ posted: false }),
  ]);
  const settle = (channel: SocialChannel, result: PromiseSettledResult<{ posted: boolean }>) => {
    if (result.status === "fulfilled") return result.value;
    // Name only: a message could carry a token.
    console.error(`[curio:social] ${channel} threw:`, result.reason instanceof Error ? result.reason.name : "unknown");
    return { posted: false };
  };
  const threads = settle("threads", threadsResult);
  const instagram = settle("instagram", instagramResult);

  const alreadyRan = {
    threads: !repost && !run.threads,
    instagram: !repost && !run.instagram,
  };
  const status = (ran: boolean, posted: boolean) => (!ran ? "skipped" : posted ? "posted" : "failed");
  console.log(
    `[curio:social] ${repost ? `repost-${repost}` : "scheduled"} ${day}: threads ${status(run.threads, threads.posted)}; instagram ${status(run.instagram, instagram.posted)}`
  );

  return NextResponse.json({ word: word.slug, threads: threads.posted, instagram: instagram.posted, alreadyRan });
}
