// Pure computation for the admin analytics portal (app/admin/page.tsx). No
// Redis, no ambient `new Date()` — every function here takes plain data (and
// an explicit `today` where "now" matters) and returns plain data, so all of
// it is trivially unit-testable without mocking anything. The actual data
// fetching (Redis scans, the Resend API call) lives next to the data it
// reads: lib/db.ts, lib/userData.ts, lib/resendMetrics.ts.

export type DailyCount = { date: string; count: number };

/** Buckets a list of YYYY-MM-DD dates into one row per distinct date,
 * sorted oldest first. A date with zero occurrences simply doesn't appear
 * — this is a sparse "days something happened" list, not a zero-filled
 * calendar; a table doesn't need empty rows the way a chart's x-axis
 * would, and this app's own tables (lib/collection.ts's month grouping)
 * already only render months that actually have entries. */
export function bucketDatesByDay(dates: string[]): DailyCount[] {
  const counts = new Map<string, number>();
  for (const date of dates) {
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type CumulativeCount = { date: string; total: number };

/** Running total across an already-sorted list of daily counts — turns "3
 * signups on day A, 1 on day B" into "3 total after day A, 4 total after
 * day B," for a growth-over-time view. */
export function cumulativeGrowth(daily: DailyCount[]): CumulativeCount[] {
  let total = 0;
  return daily.map(({ date, count }) => {
    total += count;
    return { date, total };
  });
}
