import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { redis } from "../lib/redis";
import { dayKey } from "../lib/day";

/** One-off, for the 2026-09-26 switch to one shared word for everyone.
 * Existing accounts' History was built from their old personal rotation;
 * recomputing it from the shared calendar would show words they were never
 * shown. Moving joinedAt to the cutover date starts their History clean.
 * Touches only curio:user:<id>:joinedAt — never favourites, never the old
 * per-account word locks (kept as a revert path). Dry run unless --apply;
 * --apply backs up every affected value to backups/ first. Idempotent:
 * re-running with the same --cutover changes nothing. Delete after use. */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const JOINED = /^curio:user:([^:]+):joinedAt$/;

export type AccountPlan = {
  key: string;
  userId: string;
  current: string;
  proposed: string;
  changes: boolean;
  historyFrom: string;
  historyTo: string;
};

export type ParsedArgs = {
  apply: boolean;
  cutover: string | undefined;
};

export function parseArgs(args: string[]): ParsedArgs {
  const dryRun = args.includes("--dry-run");
  const apply = args.includes("--apply");
  if (dryRun && apply) {
    throw new Error("Cannot pass both --dry-run and --apply");
  }
  const cutover = args.find((a) => a.startsWith("--cutover="))?.slice("--cutover=".length);
  return { apply, cutover };
}

export function planJoinedAtReset(
  joined: Record<string, string>,
  cutover: string,
  today: string
): AccountPlan[] {
  if (!DATE.test(cutover)) throw new Error(`Bad --cutover date: ${cutover}`);
  return Object.entries(joined)
    .filter(([key]) => JOINED.test(key))
    .map(([key, current]) => {
      const proposed = current < cutover ? cutover : current;
      const historyTo = proposed > today ? proposed : today;
      return {
        key,
        userId: key.match(JOINED)![1],
        current,
        proposed,
        changes: proposed !== current,
        historyFrom: proposed,
        historyTo,
      };
    });
}

async function main() {
  const args = process.argv.slice(2);
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(args);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  const { apply, cutover } = parsed;
  if (!cutover) {
    console.error("Usage: npx tsx --env-file=.env.local scripts/resetJoinedAt.ts --cutover=YYYY-MM-DD [--dry-run | --apply]");
    process.exit(1);
  }
  if (!redis) {
    console.error("Upstash isn't configured — pass --env-file=.env.local.");
    process.exit(1);
  }

  const keys = await redis.keys("curio:user:*:joinedAt");
  const values = keys.length > 0 ? await redis.mget<(string | null)[]>(...keys) : [];
  const joined: Record<string, string> = {};
  keys.forEach((key, i) => {
    if (values[i]) joined[key] = values[i]!;
  });
  const plans = planJoinedAtReset(joined, cutover, dayKey());

  console.log(`${apply ? "APPLY" : "DRY RUN"} — cutover ${cutover}, ${plans.length} account(s)\n`);
  for (const p of plans) {
    console.log(
      `${p.userId}\n  joinedAt: ${p.current} -> ${p.proposed}${p.changes ? "" : " (unchanged)"}\n  History:  ${p.historyFrom} .. ${p.historyTo}`
    );
  }
  const toWrite = plans.filter((p) => p.changes);
  if (!apply) {
    console.log(`\n${toWrite.length} write(s) planned. Nothing written. Re-run with --apply to write.`);
    return;
  }
  if (toWrite.length === 0) {
    console.log("\nNothing to change — already applied.");
    return;
  }

  const backupsDir = join(__dirname, "..", "backups");
  mkdirSync(backupsDir, { recursive: true });
  const backupPath = join(backupsDir, `joinedAt-${cutover}-${Date.now()}.json`);
  writeFileSync(
    backupPath,
    JSON.stringify({ takenAt: new Date().toISOString(), cutover, joinedAt: Object.fromEntries(toWrite.map((p) => [p.key, p.current])) }, null, 2)
  );
  console.log(`\nBacked up ${toWrite.length} value(s) to ${backupPath}`);

  for (const p of toWrite) await redis.set(p.key, p.proposed);
  console.log(`Applied ${toWrite.length} write(s).`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
