// Prints Curio's first-party traffic counters for the last N days: visits
// requests (confirmation emails sent) and signups (confirmed) by source,
// plus share taps, and the last week of confirmation-email attempts
// against the daily cap (lib/confirmDailyCap.ts). Read-only — HGETALL and GET only, never a
// write. Needs UPSTASH_REDIS_REST_URL/TOKEN in .env.local (the weekly
// check-in runs this). Prints counts only; no personal data exists here.
// Usage: npm run traffic:report -- [days=28]
import { getTrafficDays } from "../lib/trafficStats";
import { summarizeTraffic } from "../lib/traffic";
import { usingUpstash } from "../lib/redis";
import { DAILY_CONFIRM_CAP, getDailyConfirmSends } from "../lib/confirmDailyCap";

const days = Number(process.argv[2] ?? 28);
if (!Number.isInteger(days) || days < 1 || days > 90) {
  console.error("Usage: npm run traffic:report -- [days=28]   (1–90)");
  process.exit(1);
}
if (!usingUpstash) {
  console.error("Upstash isn't configured (UPSTASH_REDIS_REST_URL/TOKEN missing from .env.local).");
  process.exit(1);
}

const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);

// No top-level await: tsx runs this repo's scripts as CommonJS.
async function main() {
  const perDay = await getTrafficDays(days);
  const s = summarizeTraffic(perDay);
  console.log(`Curio traffic — last ${days} days (UTC), ${Object.keys(perDay).length} days with data`);
  console.log("source       visits  requests  signups  rate");
  for (const r of s.rows) {
    console.log(
      `${r.source.padEnd(12)} ${String(r.visits).padStart(6)}  ${String(r.requests).padStart(8)}  ${String(r.signups).padStart(7)}  ${pct(r.rate)}`
    );
  }
  console.log(
    `total        ${String(s.totals.visits).padStart(6)}  ${String(s.totals.requests).padStart(8)}  ${String(s.totals.signups).padStart(7)}`
  );
  console.log(`share taps: story ${s.shares.story}, puzzle ${s.shares.puzzle}`);
  console.log("\nby day (visits):");
  for (const day of Object.keys(perDay).sort()) {
    const v = Object.entries(perDay[day])
      .filter(([f]) => f.startsWith("visit:"))
      .reduce((t, [, n]) => t + n, 0);
    console.log(`  ${day}  ${v}`);
  }

  // The keys live 8 days, so this looks back at most a week.
  const sends = await getDailyConfirmSends(Math.min(days, 7));
  console.log(`\nconfirmation-email attempts (cap ${DAILY_CONFIRM_CAP}/day; failed sends count too):`);
  for (const { day, sends: n } of sends) {
    const flag = n > DAILY_CONFIRM_CAP ? `  CAP REACHED (${n - DAILY_CONFIRM_CAP} requests not sent)` : "";
    console.log(`  ${day}  ${Math.min(n, DAILY_CONFIRM_CAP)}${flag}`);
  }
}

main().catch((err) => {
  console.error("traffic:report failed:", err instanceof Error ? err.name : "unknown");
  process.exit(1);
});
