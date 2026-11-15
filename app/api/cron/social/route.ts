import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cronAuth";
import { resolveTodayWord } from "@/lib/words";
import { dayKey } from "@/lib/day";
import { claimRun, releaseRun, type Channel } from "@/lib/digestRuns";
import { postDailyWordToThreads, postRevealToThreads } from "@/lib/threads";
import { postRevealToBluesky } from "@/lib/bluesky";
import { postDailyCarouselToInstagram } from "@/lib/instagram";
import { getDigLine } from "@/lib/dig/digLine";
import { getYesterdayReveal } from "@/lib/dig/reveal";

/** Threads waits ~30s before publishing and Instagram up to 60s for its
 * carousel; 300s is the Hobby ceiling. */
export const maxDuration = 300;

type SocialChannel = Extract<Channel, "threads" | "instagram">;
const CHANNELS: SocialChannel[] = ["threads", "instagram"];
type RevealChannel = Extract<Channel, "bluesky-reveal" | "threads-reveal">;
const REVEAL_CHANNELS: RevealChannel[] = ["bluesky-reveal", "threads-reveal"];
const isRevealChannel = (c: string): c is RevealChannel => REVEAL_CHANNELS.includes(c as RevealChannel);

const status = (ran: boolean, posted: boolean) => (!ran ? "skipped" : posted ? "posted" : "failed");

/** Names only: an Upstash error message echoes the command, a poster's could carry a token. */
const errName = (err: unknown) => (err instanceof Error ? err.name : "unknown");

type RevealOutcome = {
  /** Yesterday was a reveal day with a built day to look back on. */
  available: boolean;
  bluesky: boolean;
  threads: boolean;
  alreadyRan: { bluesky: boolean; threads: boolean };
};

/** "Yesterday's answer" on Bluesky and Threads, on alternate days (lib/dig/reveal.ts
 * decides which). Runs after the word posts, and nothing in here may throw or
 * hold them up: a failed lookup, claim or post leaves them as they were. Each
 * channel is claimed per UTC day before it posts, like the word posts. */
async function postReveals(now: Date, day: string, repost: RevealChannel | undefined): Promise<RevealOutcome> {
  const out: RevealOutcome = { available: false, bluesky: false, threads: false, alreadyRan: { bluesky: false, threads: false } };
  const reveal = await getYesterdayReveal(now).catch(() => null);
  if (!reveal) return out;
  out.available = true;

  const run: Record<RevealChannel, boolean> = { "bluesky-reveal": false, "threads-reveal": false };
  const claimed: RevealChannel[] = [];
  try {
    for (const channel of REVEAL_CHANNELS) {
      if (repost && channel !== repost) continue;
      run[channel] = await claimRun(channel, day, { force: channel === repost });
      if (run[channel]) claimed.push(channel);
    }
  } catch (err) {
    for (const channel of claimed) {
      await releaseRun(channel, day).catch((releaseErr) => {
        console.error(`[curio:social] releasing ${channel} lock failed:`, errName(releaseErr));
      });
    }
    console.error("[curio:social] reveal claim failed:", errName(err));
    return out;
  }

  const [bluesky, threads] = await Promise.allSettled([
    run["bluesky-reveal"] ? postRevealToBluesky(reveal, now) : Promise.resolve({ posted: false }),
    run["threads-reveal"] ? postRevealToThreads(reveal) : Promise.resolve({ posted: false }),
  ]);
  const settle = (channel: RevealChannel, result: PromiseSettledResult<{ posted: boolean }>) => {
    if (result.status === "fulfilled") return result.value.posted;
    console.error(`[curio:social] ${channel} threw:`, errName(result.reason));
    return false;
  };
  out.bluesky = settle("bluesky-reveal", bluesky);
  out.threads = settle("threads-reveal", threads);
  out.alreadyRan = { bluesky: !repost && !run["bluesky-reveal"], threads: !repost && !run["threads-reveal"] };
  console.log(
    `[curio:social] reveal ${day}: bluesky ${status(run["bluesky-reveal"], out.bluesky)}; threads ${status(run["threads-reveal"], out.threads)}`
  );
  return out;
}

/** Configured in vercel.json at 0 10 * * * — Hobby fires it any time in
 * 10:00–10:59 UTC, after the 09:xx digest and Bluesky post, and separate
 * from them so a slow Instagram upload can never hold up email. Posts the
 * same shared word as every other surface. Idempotent per UTC day per
 * channel; `?repost=threads|instagram` (CRON_SECRET only) forces one
 * channel's lock and posts it alone — see handover.md.
 *
 * With env DIG_REVEAL_POSTS set to "on", it also posts yesterday's dig answer
 * to Bluesky and Threads on alternate days, after the word posts; `?repost=`
 * takes `bluesky-reveal` and `threads-reveal` for those. Anything but "on"
 * (including unset) posts nothing of the kind, repost included. */
export async function GET(req: NextRequest) {
  const { secret, denied } = authorizeCron(req);
  if (denied) return denied;

  const reposts = req.nextUrl.searchParams.getAll("repost");
  if (reposts.length > 0 && !secret) {
    return NextResponse.json({ error: "repost requires CRON_SECRET" }, { status: 401 });
  }
  if (
    reposts.length > 1 ||
    (reposts.length === 1 && !CHANNELS.includes(reposts[0] as SocialChannel) && !isRevealChannel(reposts[0]))
  ) {
    return NextResponse.json(
      { error: "Use repost=threads, repost=instagram, repost=bluesky-reveal or repost=threads-reveal" },
      { status: 400 }
    );
  }
  const repost = reposts[0] as SocialChannel | RevealChannel | undefined;
  const revealOn = process.env.DIG_REVEAL_POSTS === "on";
  if (repost && isRevealChannel(repost) && !revealOn) {
    return NextResponse.json({ error: "Dig reveal posts are off: DIG_REVEAL_POSTS is not set to on" }, { status: 409 });
  }

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
        console.error(`[curio:social] releasing ${channel} lock failed:`, errName(releaseErr));
      });
    }
    throw err;
  }

  // Today's dig line, once per run: null (never an error) before launch or
  // when the day isn't there, so the posts are then unchanged.
  const dig = run.threads || run.instagram ? await getDigLine(now).catch(() => null) : null;

  // allSettled: the posters never throw today, but if one ever does the
  // other channel must still post and the response must still go out.
  const [threadsResult, instagramResult] = await Promise.allSettled([
    run.threads ? postDailyWordToThreads(word, {}, dig) : Promise.resolve({ posted: false }),
    run.instagram ? postDailyCarouselToInstagram(word, {}, dig) : Promise.resolve({ posted: false }),
  ]);
  const settle = (channel: SocialChannel, result: PromiseSettledResult<{ posted: boolean }>) => {
    if (result.status === "fulfilled") return result.value;
    // Name only: a message could carry a token.
    console.error(`[curio:social] ${channel} threw:`, errName(result.reason));
    return { posted: false };
  };
  const threads = settle("threads", threadsResult);
  const instagram = settle("instagram", instagramResult);

  const alreadyRan = {
    threads: !repost && !run.threads,
    instagram: !repost && !run.instagram,
  };
  console.log(
    `[curio:social] ${repost ? `repost-${repost}` : "scheduled"} ${day}: threads ${status(run.threads, threads.posted)}; instagram ${status(run.instagram, instagram.posted)}`
  );

  // After the word posts, and only on a normal run or a reveal repost: a word
  // repost touches that one channel and nothing else.
  const reveal =
    revealOn && (!repost || isRevealChannel(repost))
      ? await postReveals(now, day, repost && isRevealChannel(repost) ? repost : undefined)
      : null;

  return NextResponse.json({
    word: word.slug,
    threads: threads.posted,
    instagram: instagram.posted,
    alreadyRan,
    ...(reveal ? { reveal } : {}),
  });
}
