// The demand report pipeline: collect every source first, and only once all
// of them have succeeded (and the report has rendered), write anything. A
// failure anywhere rejects before the output folder is touched, so a broken
// run can never replace a good report with an empty one.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FetchLike } from "./http";
import { renderReport } from "./report";
import { collectSearchConsole, loadServiceAccountKey } from "./searchConsole";
import type { SearchConsoleData, Snapshot } from "./types";
import { collectWiktionary } from "./wiktionary";

export type RunOptions = {
  entries: { slug: string; word: string }[];
  now: Date;
  outDir: string;
  wikiFetcher: FetchLike;
  googleFetcher: FetchLike;
  env: Record<string, string | undefined>;
  /** Fail instead of skipping Search Console when its key isn't set (CI). */
  requireSearchConsole?: boolean;
  log?: (line: string) => void;
};

export function snapshotPath(outDir: string, date: string): string {
  return path.join(outDir, "snapshots", `${date}.json`);
}

export function latestPath(outDir: string): string {
  return path.join(outDir, "latest.md");
}

/** The newest snapshot dated strictly before `date`, or null on a first run. */
export async function readPreviousSnapshot(outDir: string, date: string): Promise<Snapshot | null> {
  let files: string[];
  try {
    files = await readdir(path.join(outDir, "snapshots"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const earlier = files
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) < date)
    .sort();
  if (earlier.length === 0) return null;
  const newest = earlier[earlier.length - 1].slice(0, 10);
  return JSON.parse(await readFile(snapshotPath(outDir, newest), "utf8")) as Snapshot;
}

export async function runDemandReport(
  options: RunOptions
): Promise<{ snapshot: Snapshot; markdown: string }> {
  const log = options.log ?? (() => {});
  // Read the key first: a malformed key fails now, not after the slow
  // Wiktionary pass.
  const key = loadServiceAccountKey(options.env);
  if (!key && options.requireSearchConsole) {
    throw new Error("GSC_SERVICE_ACCOUNT_KEY is not set, and this run requires Search Console.");
  }

  const wiktionary = await collectWiktionary(options.entries, {
    fetcher: options.wikiFetcher,
    now: options.now,
    onProgress: (done, total) => {
      if (done % 100 === 0 || done === total) log(`Wiktionary: ${done}/${total}`);
    },
  });
  if (!wiktionary.words.some((w) => w.total12 > 0)) {
    throw new Error("No word has any Wiktionary pageviews; refusing to write an empty report.");
  }

  let searchConsole: SearchConsoleData | null = null;
  if (key) {
    searchConsole = await collectSearchConsole(key, { fetcher: options.googleFetcher, now: options.now });
    // Counts only: the Actions log is public, the queries aren't.
    log(
      `Search Console: ${searchConsole.byPage.length} page rows, ${searchConsole.byQuery.length} query rows, ${searchConsole.byPageQuery.length} page+query rows`
    );
  } else {
    log("Search Console: skipped (GSC_SERVICE_ACCOUNT_KEY is not set)");
  }

  const snapshot: Snapshot = {
    version: 1,
    date: options.now.toISOString().slice(0, 10),
    generatedAt: options.now.toISOString(),
    wiktionary,
    searchConsole,
  };
  const previous = await readPreviousSnapshot(options.outDir, snapshot.date);
  const markdown = renderReport(snapshot, previous);

  await mkdir(path.join(options.outDir, "snapshots"), { recursive: true });
  await writeFile(snapshotPath(options.outDir, snapshot.date), `${JSON.stringify(snapshot)}\n`);
  await writeFile(latestPath(options.outDir), markdown);
  return { snapshot, markdown };
}
