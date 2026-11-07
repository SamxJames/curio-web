import { DAY_MS, dayKey, dayStart } from "../day";

export type DigFunnelRow = { date: string; land: number; start: number; finish: number; share: number; story: number; signup: number; past: number; returning: number; returnShare: number | null; via: Record<string, number> };
export type DigFunnelSummary = { rows: DigFunnelRow[]; killLine: number | null; killReturnShare: number | null };

const sum = (h: Record<string, number>, prefix: string) => Object.entries(h).reduce((a, [f, n]) => (f.startsWith(prefix) ? a + n : a), 0);

/** The seven kill-check dates: days 22–28 after launch (launch is day 1, so offsets 21..27). */
export function killLineDates(launch: string): string[] {
  return Array.from({ length: 7 }, (_, i) => dayKey(new Date(dayStart(launch).getTime() + (21 + i) * DAY_MS)));
}

/** Daily players = start (architecture §9). The kill check is the median daily start over
 * days 22–28 after launch: below 20 means stop. Null until the last window day has passed.
 * funnelDays omits days with no events, so an absent window day counts as 0 starts. Rows
 * cover only rowDates (the displayed 28 days), so kill-window days fetched outside them don't show. */
export function summarizeDigFunnel(
  days: Record<string, Record<string, number>>,
  launch: string | null,
  opts: { now: Date; rowDates: string[] },
): DigFunnelSummary {
  const shown = new Set(opts.rowDates);
  const rows = Object.entries(days)
    .filter(([date]) => shown.has(date))
    .map(([date, h]) => {
      const start = h.start ?? 0;
      const returning = sum(h, "start:ret:");
      return {
        date, land: sum(h, "land:"), start, finish: h.finish ?? 0, share: sum(h, "share:"),
        story: h.story ?? 0, signup: h.signup ?? 0, past: h["past:start"] ?? 0,
        returning, returnShare: start ? Math.round((returning / start) * 1000) / 10 : null,
        via: Object.fromEntries(Object.entries(h).filter(([f]) => f.startsWith("via:")).map(([f, n]) => [f.slice(4), n])),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  let killLine: number | null = null;
  let killReturnShare: number | null = null;
  if (launch) {
    const dates = killLineDates(launch);
    if (dates[6] < dayKey(opts.now)) {
      const returning = dates.map((d) => sum(days[d] ?? {}, "start:ret:"));
      killLine = [...returning].sort((a, b) => a - b)[3];
      const starts = dates.reduce((a, d) => a + (days[d]?.start ?? 0), 0);
      killReturnShare = starts ? Math.round((returning.reduce((a, n) => a + n, 0) / starts) * 1000) / 10 : null;
    }
  }
  return { rows, killLine, killReturnShare };
}

/** The admin kill-line sentence. The % belongs to admin only, not the player copy audit. */
export function killLineText(killLine: number | null, killReturnShare: number | null): string {
  return `Kill line (median daily returning starts, days 22–28 after launch): ${killLine ?? "not yet"}; below 5 means stop. Returning share of starts: ${killReturnShare === null ? "not yet" : `${killReturnShare}%`} (target 30% or more; informs the call, does not trigger it).`;
}
