import { redis } from "./redis";

/** Long enough to outlive any same-day re-run or next-morning debugging,
 * short enough that the keys clean themselves up. */
const RUN_TTL_SECONDS = 3 * 24 * 60 * 60;
/** The pending set keeps longer: a week's grace to notice and inspect it. */
const FAILURES_TTL_SECONDS = 7 * 24 * 60 * 60;

export type Channel = "email" | "bluesky" | "threads" | "instagram";

// Email keeps its original "run" key so existing locks stay valid.
const RUN_KEY_PREFIX: Record<Channel, string> = {
  email: "curio:digest:run:",
  bluesky: "curio:digest:bluesky:",
  threads: "curio:digest:threads:",
  instagram: "curio:digest:instagram:",
};
const runKey = (channel: Channel, day: string) => `${RUN_KEY_PREFIX[channel]}${day}`;
const failuresKey = (day: string) => `curio:digest:failed:${day}`;

// Redis only in production. Local dev (and preview) can share production's
// Upstash database, so a local cron run through Redis would claim
// production's day locks — the real 09:00 run would then see "already ran"
// and send nothing — and would overwrite its pending set. Everywhere else
// these live in the server's memory: a second run against the same
// `next dev` is still a no-op, and a restart forgets. Read at call time so
// tests can stub VERCEL_ENV.
const memoryRuns = new Set<string>();
const memoryFailures = new Map<string, string[]>();

function store() {
  return process.env.VERCEL_ENV === "production" ? redis : null;
}

export function resetDigestRunsMemory(): void {
  memoryRuns.clear();
  memoryFailures.clear();
}

/** Claims today's run for one channel. Claimed *before* sending, so a
 * concurrent or repeated run (a manual "Run" in Vercel's Cron Jobs page)
 * can't double-send; the claim stays even after a partial failure, and
 * the unsent are re-sent via getFailures/removeFailures instead. */
export async function claimRun(channel: Channel, day: string, opts: { force?: boolean } = {}): Promise<boolean> {
  const key = runKey(channel, day);
  const value = new Date().toISOString();
  const redis = store();
  if (!redis) {
    if (!opts.force && memoryRuns.has(key)) return false;
    memoryRuns.add(key);
    return true;
  }
  if (opts.force) {
    await redis.set(key, value, { ex: RUN_TTL_SECONDS });
    return true;
  }
  return (await redis.set(key, value, { nx: true, ex: RUN_TTL_SECONDS })) === "OK";
}

/** Releases a lock this run claimed but couldn't use — e.g. the route
 * claimed email's lock, then the Bluesky claim itself threw. Without this,
 * a Redis error after a claim would strand the day as "already ran" with
 * nothing actually sent. */
export async function releaseRun(channel: Channel, day: string): Promise<void> {
  const key = runKey(channel, day);
  const redis = store();
  if (!redis) {
    memoryRuns.delete(key);
    return;
  }
  await redis.del(key);
}

/** Replaces the day's pending set — addresses not yet confirmed sent — with
 * every recipient, *before* a scheduled or forced run sends anything. Each
 * accepted chunk then leaves it (removeFailures), so whatever is left —
 * rejections, failed chunks, or everything after a run killed partway — is
 * exactly what `?resend=failed` should pick up. Stored, never logged. */
export async function seedPending(day: string, emails: string[]): Promise<void> {
  const key = failuresKey(day);
  const redis = store();
  if (!redis) {
    memoryFailures.set(key, [...emails]);
    return;
  }
  await redis.del(key);
  if (emails.length > 0) {
    await redis.sadd(key, emails[0], ...emails.slice(1));
    await redis.expire(key, FAILURES_TTL_SECONDS);
  }
}

/** Forgets addresses as each chunk is accepted, in every mode, so a resend
 * (even after a run that died partway) never double-sends. */
export async function removeFailures(day: string, emails: string[]): Promise<void> {
  if (emails.length === 0) return;
  const key = failuresKey(day);
  const redis = store();
  if (!redis) {
    const gone = new Set(emails);
    memoryFailures.set(key, (memoryFailures.get(key) ?? []).filter((e) => !gone.has(e)));
    return;
  }
  await redis.srem(key, emails[0], ...emails.slice(1));
}

/** The day's addresses not yet confirmed sent. */
export async function getFailures(day: string): Promise<string[]> {
  const redis = store();
  if (!redis) return [...(memoryFailures.get(failuresKey(day)) ?? [])];
  return redis.smembers<string[]>(failuresKey(day));
}
