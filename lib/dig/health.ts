import { DAY_MS, dayStart } from "../day";
import type { DigManifest } from "./keys";

/** pipeline-design §13 watchdog 2: problems in plain words, counts only (they go into an
 * email). An empty list means healthy. */
export function evaluateHealth(i: { today: string; manifest: DigManifest | null; todayExists: boolean; tomorrowExists: boolean; launch: string | null; now: Date }): string[] {
  if (!i.manifest) return i.launch ? ["The dig pipeline has never published, but DIG_LAUNCH_DATE is set."] : [];
  const problems: string[] = [];
  if (i.launch && i.today >= i.launch && !i.todayExists) problems.push("Today's dig is missing, so /dig shows an error.");
  if (!i.tomorrowExists) problems.push("Tomorrow's dig is missing.");
  const furthest = Object.keys(i.manifest.days).sort().at(-1);
  const buffer = furthest ? Math.round((dayStart(furthest).getTime() - dayStart(i.today).getTime()) / DAY_MS) : 0;
  if (buffer < 14) problems.push(`Only ${Math.max(buffer, 0)} days are built ahead (alert below 14).`);
  const age = Math.floor((i.now.getTime() - Date.parse(i.manifest.lastRun)) / DAY_MS);
  if (age > 9) problems.push(`The pipeline last published ${age} days ago (alert after 9).`);
  return problems;
}

/** Vercel publishes no usage API for Hobby, so this is an estimate from first-party
 * counters (architecture §12's per-visit figures). Recalibrate against the Vercel
 * dashboard after launch week 1. Vercel's own usage emails are the backstop.
 *
 * A dig landing is also a site visit, so it is counted twice here (8 for the landing,
 * and 6 for the visit in the traffic counters). The 8 + 6 per-visit figure is a deliberate
 * over-estimate until the launch-week recalibration. */
export const EDGE_PER_DIG_LAND = 8;
export const EDGE_PER_SITE_VISIT = 6;
export const HOBBY_EDGE_REQUESTS = 1_000_000;

export function estimateEdgeRequests(digLands: number, siteVisits: number): number {
  return digLands * EDGE_PER_DIG_LAND + siteVisits * EDGE_PER_SITE_VISIT;
}

/** One alert at 50% and one at 70% of the month's allotment (decided 2026-10-24), with
 * the date the current daily rate reaches 100%. The upgrade is Sam's call. */
export function usageAlert(i: { estimated: number; now: Date; alreadySent: number }): { level: 50 | 70; message: string } | null {
  const pct = (i.estimated / HOBBY_EDGE_REQUESTS) * 100;
  const level = pct >= 70 ? 70 : pct >= 50 ? 50 : null;
  if (!level || level <= i.alreadySent) return null;
  const day = i.now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(i.now.getUTCFullYear(), i.now.getUTCMonth() + 1, 0)).getUTCDate();
  const hitDay = Math.ceil(HOBBY_EDGE_REQUESTS / (i.estimated / day));
  const when = hitDay <= daysInMonth
    ? new Date(Date.UTC(i.now.getUTCFullYear(), i.now.getUTCMonth(), hitDay)).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })
    : null;
  return {
    level,
    message: `Edge requests are an estimated ${Math.round(pct)}% of Hobby's 1,000,000 this month. ${when ? `At this rate they reach 100% on ${when}.` : "At this rate they stay under 100% this month."} Check the Vercel usage page and decide whether to upgrade to Pro ($20, about £16 a month).`,
  };
}
