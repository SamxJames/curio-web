/** Curio's one clock. A "day" is a UTC calendar date: the word changes at
 * 00:00 UTC for everyone, and home, the digest, Bluesky, /play, story-page
 * dates and History all derive "today" and format dates through here, so
 * no two surfaces can disagree at the boundary. */

export const DAY_MS = 24 * 60 * 60 * 1000;

export const LONG_DAY: Intl.DateTimeFormatOptions = {
  weekday: "long",
  month: "long",
  day: "numeric",
};

export function dayKey(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

export function dayStart(key: string): Date {
  return new Date(key + "T00:00:00Z");
}

/** Always formats in UTC — without it, a viewer west of Greenwich sees a
 * UTC-midnight date as the previous evening's. */
export function formatDay(key: string, options: Intl.DateTimeFormatOptions = LONG_DAY): string {
  return dayStart(key).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}
