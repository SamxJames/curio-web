import { DAY_MS, dayKey, dayStart } from "../day";

/** The dig game's calendar, on Curio's one clock (lib/day.ts, 00:00 UTC). Server-side:
 * DIG_LAUNCH_DATE is not a NEXT_PUBLIC variable, so browsers get the day number from
 * /api/dig/today instead of calling this. */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Local and preview builds open the game from this date so it can be played before launch. */
export const DEV_LAUNCH_DATE = "2026-10-01";

export function isDateKey(s: string): boolean {
  return DATE_RE.test(s) && !Number.isNaN(dayStart(s).getTime()) && dayKey(dayStart(s)) === s;
}

/** Production stays closed (404) until Sam sets DIG_LAUNCH_DATE, so merging the code
 * can't launch the game before the pipeline has filled its buffer. */
export function digLaunchDate(env: NodeJS.ProcessEnv = process.env): string | null {
  const v = env.DIG_LAUNCH_DATE?.trim();
  if (v && isDateKey(v)) return v;
  return env.VERCEL_ENV === "production" ? null : DEV_LAUNCH_DATE;
}

export function isDigOpen(now: Date = new Date(), launch: string | null = digLaunchDate()): boolean {
  return !!launch && dayKey(now) >= launch;
}

export function dayNumber(date: string, launch: string): number {
  return Math.round((dayStart(date).getTime() - dayStart(launch).getTime()) / DAY_MS) + 1;
}

export function secondsToRollover(now: Date = new Date()): number {
  const next = dayStart(dayKey(now)).getTime() + DAY_MS;
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

export function isPastDay(date: string, now: Date = new Date(), launch: string | null = digLaunchDate()): boolean {
  return isDateKey(date) && !!launch && date >= launch && date < dayKey(now);
}
