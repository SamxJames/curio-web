import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cronAuth";
import { DAY_MS, dayKey } from "@/lib/day";
import { digLaunchDate } from "@/lib/dig/clock";
import { estimateEdgeRequests, evaluateHealth, usageAlert } from "@/lib/dig/health";
import { funnelDays, healthReads, housekeep, markUsageAlert, writeHeartbeat, writesRedis } from "@/lib/dig/server";
import { sendDigAlert } from "@/lib/email";
import { getTrafficDays } from "@/lib/trafficStats";

export const dynamic = "force-dynamic";

/** Daily at 07:00 UTC (vercel.json): checks the dig's buffer and freshness, estimates
 * the month's edge requests, sets yesterday's counter expiries, writes the heartbeat the
 * pipeline checks, and emails Sam once if anything needs a look. Production only. */
export async function GET(req: NextRequest) {
  const { denied } = authorizeCron(req);
  if (denied) return denied;
  if (!writesRedis()) return NextResponse.json({ skipped: "not production" });
  const now = new Date();
  const today = dayKey(now);
  const tomorrow = dayKey(new Date(now.getTime() + DAY_MS));
  const yesterday = dayKey(new Date(now.getTime() - DAY_MS));
  const month = today.slice(0, 7);
  try {
    const reads = await healthReads(today, tomorrow, month);
    if (!reads) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });
    const problems = evaluateHealth({ today, manifest: reads.manifest, todayExists: reads.todayExists, tomorrowExists: reads.tomorrowExists, launch: digLaunchDate(), now });

    // The usage estimate is secondary: if its reads fail, the buffer alert and the heartbeat still go out.
    let alert: ReturnType<typeof usageAlert> = null;
    try {
      const dayOfMonth = now.getUTCDate();
      const monthDates = Array.from({ length: dayOfMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
      const [dig, site] = await Promise.all([funnelDays(monthDates), getTrafficDays(dayOfMonth, now)]);
      const sum = (days: Record<string, Record<string, number>>, prefix: string) =>
        Object.values(days).reduce((a, h) => a + Object.entries(h).reduce((b, [f, n]) => (f.startsWith(prefix) ? b + n : b), 0), 0);
      alert = usageAlert({ estimated: estimateEdgeRequests(sum(dig, "land:"), sum(site, "visit:")), now, alreadySent: reads.usageSent });
    } catch (err) {
      console.error("dig-health usage estimate failed", err instanceof Error ? err.name : "unknown");
    }
    if (alert) problems.push(alert.message);

    // Heartbeat first: the pipeline fails closed without it, so counter expiry can't block it.
    await writeHeartbeat(now);
    await housekeep(yesterday);
    if (problems.length) {
      await sendDigAlert(problems);
      if (alert) await markUsageAlert(month, alert.level);
    }
    return NextResponse.json({ problems: problems.length });
  } catch (err) {
    console.error("dig-health failed", err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
