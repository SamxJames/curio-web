import { redis } from "./redis";
import { DAY_MS, dayKey } from "./day";

/** At most this many confirmation emails per UTC day, across every
 * address. The per-address cooldown (lib/confirmCooldown.ts) can't stop a
 * script feeding in many different addresses, and every send spends the
 * Resend quota the digest and sign-in share. Past the cap, /api/subscribe
 * still answers "check your inbox" but sends nothing. */
export const DAILY_CONFIRM_CAP = 200;

/** Long enough for the weekly check-in's 7-day report to read every day. */
const KEY_TTL_SECONDS = 8 * 24 * 60 * 60;

const capKey = (day: string) => `curio:confirmsends:${day}`;

/** Takes one of today's slots. Counts only in production: local dev can
 * share production's Upstash (see lib/digestRuns.ts), and a test signup
 * must not use up a real slot. Read at call time so tests can stub it. */
export async function claimDailyConfirmSlot(day: string = dayKey()): Promise<boolean> {
  if (!redis || process.env.VERCEL_ENV !== "production") return true;
  // One atomic MULTI, with the expiry refreshed on every send, so the
  // day's key can never be left without a TTL.
  const [n] = await redis.multi().incr(capKey(day)).expire(capKey(day), KEY_TTL_SECONDS).exec<[number, number]>();
  return n <= DAILY_CONFIRM_CAP;
}

export type DailyConfirmSends = { day: string; sends: number };

/** Slots taken on each of the last `days` UTC days, today first. A count
 * above DAILY_CONFIRM_CAP means signups were turned away that day. Read-only;
 * scripts/trafficReport.ts prints it. */
export async function getDailyConfirmSends(days: number, today: Date = new Date()): Promise<DailyConfirmSends[]> {
  if (!redis) return [];
  const client = redis;
  const keys = Array.from({ length: days }, (_, i) => dayKey(new Date(today.getTime() - i * DAY_MS)));
  const counts = await Promise.all(keys.map((d) => client.get<number>(capKey(d))));
  return keys.map((day, i) => ({ day, sends: Number(counts[i]) || 0 }));
}
