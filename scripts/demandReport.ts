// Weekly demand report: English Wiktionary pageviews and (when GSC_SERVICE_ACCOUNT_KEY is set) Google Search Console data
// for every word in lib/words.ts, written to <out>/latest.md and <out>/snapshots/<date>.json.
// Usage: npm run demand:report -- [--out <dir>]   (default .reports/demand)
import { WORDS } from "../lib/words";
import { createFetcher } from "./demand/http";
import { latestPath, runDemandReport, snapshotPath } from "./demand/run";

const USAGE = "Usage: npm run demand:report -- [--out <dir>]";

function outDirFromArgs(args: string[]): string {
  const i = args.indexOf("--out");
  if (i === -1) return ".reports/demand";
  const value = args[i + 1];
  if (!value || value.startsWith("--")) {
    console.error(USAGE);
    process.exit(1);
  }
  return value;
}

async function main() {
  const outDir = outDirFromArgs(process.argv.slice(2));
  const { snapshot } = await runDemandReport({
    entries: WORDS,
    now: new Date(),
    outDir,
    wikiFetcher: createFetcher({ minGapMs: 100 }),
    googleFetcher: createFetcher(),
    env: process.env,
    log: (line) => console.log(`[demand-report] ${line}`),
  });
  const missing = snapshot.wiktionary.words.filter((w) => w.title === null).length;
  console.log(
    `[demand-report] Wrote ${latestPath(outDir)} and ${snapshotPath(outDir, snapshot.date)}: ${snapshot.wiktionary.words.length - missing} words with a Wiktionary page, ${missing} without; Search Console ${snapshot.searchConsole ? "included" : "skipped"}.`
  );
}

main().catch((error: unknown) => {
  console.error(`[demand-report] FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
