// Weekly demand report: English Wiktionary pageviews and (when GSC_SERVICE_ACCOUNT_KEY is set) Google Search Console data
// for every word in lib/words.ts, written to <out>/snapshots/<date>.json.
// Usage: npm run demand:report -- [--out <dir>]   (default .reports/demand)
import { WORDS } from "../lib/words";
import { createFetcher } from "./demand/http";
import { runDemandReport } from "./demand/run";
import type { WordDemand } from "./demand/types";
import { formatTrend, rankByDemand } from "./demand/wiktionary";

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

function row(w: WordDemand): string {
  const title = w.title !== w.word ? ` (as "${w.title}")` : "";
  return `${String(w.total12).padStart(9)}  ${w.avg3.toFixed(0).padStart(7)}  ${formatTrend(w.trend, w.avg3).padStart(6)}  ${w.word}${title}`;
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

  const ranked = rankByDemand(snapshot.wiktionary.words);
  const missing = snapshot.wiktionary.words.filter((w) => w.title === null);
  const header = `${"12-month".padStart(9)}  ${"3-mo avg".padStart(7)}  ${"trend".padStart(6)}  word`;
  console.log(`\nTop 50 by Wiktionary demand (${snapshot.wiktionary.months[0]}–${snapshot.wiktionary.months[11]})\n${header}`);
  ranked.slice(0, 50).forEach((w) => console.log(row(w)));
  console.log(`\nBottom 50\n${header}`);
  ranked.slice(-50).forEach((w) => console.log(row(w)));
  console.log(`\nNo Wiktionary page (${missing.length}): ${missing.map((w) => w.word).join(", ") || "none"}`);
}

main().catch((error: unknown) => {
  console.error(`[demand-report] FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
