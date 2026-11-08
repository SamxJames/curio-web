/** Pure and client-safe: no server imports. Used by the browser (what to send) and the server (what to trust). */
const DAY = 86_400_000;
const day = (iso: string) => { const t = Date.parse(iso.slice(0, 10) + "T00:00:00Z"); return Number.isNaN(t) ? null : t; };
const MAX_COHORT_DAY = 60;
/** Finishes before this deploy never sent isNew, so earlier cohort rows are wrong and stay hidden. */
export const COHORT_START = "2026-11-08";

export function firstPlayDate(games: Record<string, { finishedAt: string }>, today: string): string | null {
  const now = day(today);
  let first: number | null = null;
  for (const g of Object.values(games)) {
    const d = typeof g.finishedAt === "string" ? day(g.finishedAt) : null;
    if (d !== null && now !== null && d < now && (first === null || d < first)) first = d;
  }
  return first === null ? null : new Date(first).toISOString().slice(0, 10);
}

export const isNewPlayer = (games: Record<string, { finishedAt: string }>, today: string) => firstPlayDate(games, today) === null;

export function cohortDay(first: string, today: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(first)) return null;
  const a = day(first), b = day(today);
  if (a === null || b === null || new Date(a).toISOString().slice(0, 10) !== first) return null;
  const n = Math.round((b - a) / DAY);
  return n >= 1 && n <= MAX_COHORT_DAY ? n : null;
}

export function summarizeCohorts(
  cohorts: Record<string, Record<string, number>>,
  funnel: Record<string, Record<string, number>>,
  dates: string[],
) {
  return dates.filter((date) => date >= COHORT_START).map((date) => {
    const c = cohorts[date] ?? {};
    let d8to13 = 0;
    for (let i = 8; i <= 13; i++) d8to13 += c[`d${i}`] ?? 0;
    const f = funnel[date] ?? {};
    return {
      date, newFinishers: f["finish:new"] ?? 0, d1: c.d1 ?? 0, d7: c.d7 ?? 0, d8to13,
      sharedNew: f["shared:new"] ?? 0, sharedNewSheet: f["shared:new:sheet"] ?? 0, finishVs: f["finish:vs"] ?? 0, finishVsNew: f["finish:vs:new"] ?? 0,
      reachedNew: f["reached:4:new"] ?? 0, repeatSharers: f["shared:third"] ?? 0,
    };
  });
}
