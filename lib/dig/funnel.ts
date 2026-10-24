import { DAY_MS, dayKey, dayStart } from "../day";

export type DigFunnelRow = { date: string; land: number; start: number; finish: number; share: number; story: number; signup: number; past: number };
export type DigFunnelSummary = { rows: DigFunnelRow[]; killLine: number | null };

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
    .map(([date, h]) => ({
      date, land: sum(h, "land:"), start: h.start ?? 0, finish: h.finish ?? 0, share: sum(h, "share:"),
      story: h.story ?? 0, signup: h.signup ?? 0, past: h["past:start"] ?? 0,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
  let killLine: number | null = null;
  if (launch) {
    const dates = killLineDates(launch);
    if (dates[6] < dayKey(opts.now)) {
      const starts = dates.map((d) => days[d]?.start ?? 0).sort((a, b) => a - b);
      killLine = starts[3];
    }
  }
  return { rows, killLine };
}
