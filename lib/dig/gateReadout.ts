import { dayKey } from "../day";
import { claimRun, releaseRun } from "../digestRuns";
import { sendGateReadout } from "../email";
import { digLaunchDate } from "./clock";
import { summarizeCohorts } from "./cohort";
import { buildGateReadoutMessage, gateDates, isGateReadoutDay, summarizeGate } from "./gate";
import { funnelDays, readCohorts } from "./server";

/** Server-only. Emails the dig gate numbers (lib/dig/gate.ts) to DIG_ALERT_TO on Mondays and on the
 * gate day, from the daily digest cron (app/api/cron/send-daily/route.ts, inside after()).
 *
 * Never throws: the digest and the Bluesky post must not depend on it. One send per UTC day (a "gate"
 * run lock); a failed attempt hands the lock back so a manual re-run can retry. Failures log the error
 * class only, since Upstash and Resend messages can carry tokens or addresses. */
export async function runGateReadout(now: Date = new Date()): Promise<"sent" | "skipped" | "failed"> {
  try {
    if (!digLaunchDate() || !isGateReadoutDay(now)) return "skipped";
    const day = dayKey(now);
    if (!(await claimRun("gate", day))) return "skipped";
    try {
      const dates = gateDates(now);
      const [cohorts, funnel] = await Promise.all([readCohorts(dates), funnelDays(dates)]);
      await sendGateReadout(buildGateReadoutMessage(summarizeGate(summarizeCohorts(cohorts, funnel, dates), day), day));
      console.log(`[curio:gate-readout] ${day}: sent`);
      return "sent";
    } catch (err) {
      await releaseRun("gate", day).catch(() => {});
      throw err;
    }
  } catch (err) {
    console.error(`[curio:gate-readout] failed (${err instanceof Error ? err.name : "unknown"})`);
    return "failed";
  }
}
