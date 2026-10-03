import { redis } from "./redis";
import { DAY_MS, dayKey } from "./day";
import { eventField, type TrafficEvent } from "./traffic";

/** Long enough for a quarter's comparison; short enough to clean itself up. */
export const TRAFFIC_TTL_SECONDS = 90 * 24 * 60 * 60;

export const trafficKey = (day: string) => `curio:traffic:${day}`;

/** One counter hash per UTC day. Writes only in production: local dev can
 * share production's Upstash database (see lib/digestRuns.ts), and a dev
 * session must not inflate the real numbers. Read at call time so tests can
 * stub VERCEL_ENV. Stores field names only — never who, never a URL. */
export async function recordTrafficEvent(ev: TrafficEvent, day: string = dayKey()): Promise<void> {
  if (!redis || process.env.VERCEL_ENV !== "production") return;
  const key = trafficKey(day);
  // One MULTI/EXEC round trip, so a failure between the two can't leave a
  // counter without its TTL (and it halves the Upstash round trips).
  await redis.multi().hincrby(key, eventField(ev), 1).expire(key, TRAFFIC_TTL_SECONDS).exec();
}

/** The last `days` UTC days (today included), keyed by day. Days with no
 * counters are left out. Read-only, so it's safe from any environment —
 * the admin page and scripts/trafficReport.ts both use it. */
export async function getTrafficDays(
  days: number,
  today: Date = new Date()
): Promise<Record<string, Record<string, number>>> {
  if (!redis) return {};
  const client = redis;
  const keys = Array.from({ length: days }, (_, i) => dayKey(new Date(today.getTime() - i * DAY_MS)));
  const hashes = await Promise.all(keys.map((d) => client.hgetall<Record<string, unknown>>(trafficKey(d))));
  const out: Record<string, Record<string, number>> = {};
  keys.forEach((d, i) => {
    const h = hashes[i];
    if (h && Object.keys(h).length > 0) {
      out[d] = Object.fromEntries(Object.entries(h).map(([f, v]) => [f, Number(v) || 0]));
    }
  });
  return out;
}
