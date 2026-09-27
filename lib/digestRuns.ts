import { redis } from "./redis";

/** Long enough to outlive any same-day re-run or next-morning debugging,
 * short enough that the keys clean themselves up. */
const RUN_TTL_SECONDS = 3 * 24 * 60 * 60;
/** Failures keep longer: a week's grace to notice and `?resend=failed`. */
const FAILURES_TTL_SECONDS = 7 * 24 * 60 * 60;

export type Channel = "email" | "bluesky";

const runKey = (channel: Channel, day: string) =>
  channel === "email" ? `curio:digest:run:${day}` : `curio:digest:bluesky:${day}`;
const failuresKey = (day: string) => `curio:digest:failed:${day}`;

// Without Upstash (local dev) these live in the dev server's memory: a
// second run against the same `next dev` is still a no-op, and a restart
// forgets. Production always has Upstash.
const memoryRuns = new Set<string>();
const memoryFailures = new Map<string, string[]>();

export function resetDigestRunsMemory(): void {
  memoryRuns.clear();
  memoryFailures.clear();
}

/** Claims today's run for one channel. Claimed *before* sending, so a
 * concurrent or repeated run (a manual "Run" in Vercel's Cron Jobs page)
 * can't double-send; the claim stays even after a partial failure, and
 * the failures are re-sent via getFailures/removeFailures instead. */
export async function claimRun(channel: Channel, day: string, opts: { force?: boolean } = {}): Promise<boolean> {
  const key = runKey(channel, day);
  const value = new Date().toISOString();
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
  if (!redis) {
    memoryRuns.delete(key);
    return;
  }
  await redis.del(key);
}

/** Replaces the day's set of addresses whose digest failed after retries.
 * Stored, never logged. */
export async function recordFailures(day: string, emails: string[]): Promise<void> {
  const key = failuresKey(day);
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

/** Forgets addresses as a `?resend=failed` run's chunks succeed, so a
 * second resend (even after one that died partway) never double-sends. */
export async function removeFailures(day: string, emails: string[]): Promise<void> {
  if (emails.length === 0) return;
  const key = failuresKey(day);
  if (!redis) {
    const gone = new Set(emails);
    memoryFailures.set(key, (memoryFailures.get(key) ?? []).filter((e) => !gone.has(e)));
    return;
  }
  await redis.srem(key, emails[0], ...emails.slice(1));
}

export async function getFailures(day: string): Promise<string[]> {
  if (!redis) return [...(memoryFailures.get(failuresKey(day)) ?? [])];
  return redis.smembers<string[]>(failuresKey(day));
}
