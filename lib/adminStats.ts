// Pure computation for the admin analytics portal (app/admin/page.tsx). No
// Redis, no ambient `new Date()` — every function here takes plain data (and
// an explicit `today` where "now" matters) and returns plain data, so all of
// it is trivially unit-testable without mocking anything. The actual data
// fetching (Redis scans, the Resend API call) lives next to the data it
// reads: lib/db.ts, lib/userData.ts, lib/resendMetrics.ts.

import type { PlayState } from "./storage";

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

export type RetentionResult = { eligible: number; active: number; rate: number | null };

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Rolling retention": of the accounts old enough to have had a full
 * `windowDays` to come back (joined at least that many days ago), what
 * fraction were active at all within the last `windowDays`? This is a
 * simplified, continuously-computable stand-in for classic fixed-cohort
 * Day-N retention (see this plan's Flagged Decision A) — it starts
 * producing real numbers the moment the first account crosses the window
 * age, at the cost of not being a true same-cohort curve. `rate` is `null`
 * (never `0`) when there's no eligible account yet, so the UI can show
 * "not enough data" instead of a misleading 0%. */
export function computeRollingRetention(
  users: { joinedAt: string; lastSeen: string | null }[],
  windowDays: number,
  today: Date
): RetentionResult {
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const cutoff = todayUtc - windowDays * DAY_MS;

  const eligible = users.filter((u) => Date.parse(u.joinedAt + "T00:00:00Z") <= cutoff);
  const active = eligible.filter(
    (u) => u.lastSeen !== null && Date.parse(u.lastSeen + "T00:00:00Z") > cutoff
  );

  return {
    eligible: eligible.length,
    active: active.length,
    rate: eligible.length === 0 ? null : active.length / eligible.length,
  };
}

export type PuzzleEngagementSummary = {
  totalPlays: number;
  solved: number;
  failed: number;
  inProgress: number;
  // [clues-to-solve-on-1, on-2, on-3, failed] — same shape as the
  // client-side PuzzleStats histogram (lib/storage.ts), aggregated across
  // every signed-in account's synced play state instead of one device.
  histogram: [number, number, number, number];
};

export function summarizePuzzleEngagement(states: PlayState[]): PuzzleEngagementSummary {
  const histogram: [number, number, number, number] = [0, 0, 0, 0];
  let solved = 0;
  let failed = 0;
  let inProgress = 0;

  for (const state of states) {
    if (state.status === "solved" && state.cluesUsedToSolve) {
      solved++;
      histogram[state.cluesUsedToSolve - 1]++;
    } else if (state.status === "failed") {
      failed++;
      histogram[3]++;
    } else {
      inProgress++;
    }
  }

  return { totalPlays: states.length, solved, failed, inProgress, histogram };
}
