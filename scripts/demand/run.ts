// The demand report pipeline: collect every source first, and only once all
// of them have succeeded, write anything. A failure anywhere rejects before
// the output folder is touched, so a broken run can never replace a good
// report with an empty one.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FetchLike } from "./http";
import type { Snapshot } from "./types";
import { collectWiktionary } from "./wiktionary";

export type RunOptions = {
  entries: { slug: string; word: string }[];
  now: Date;
  outDir: string;
  wikiFetcher: FetchLike;
  log?: (line: string) => void;
};

export function snapshotPath(outDir: string, date: string): string {
  return path.join(outDir, "snapshots", `${date}.json`);
}

export async function runDemandReport(options: RunOptions): Promise<{ snapshot: Snapshot }> {
  const log = options.log ?? (() => {});

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

  const snapshot: Snapshot = {
    version: 1,
    date: options.now.toISOString().slice(0, 10),
    generatedAt: options.now.toISOString(),
    wiktionary,
    searchConsole: null,
  };

  await mkdir(path.join(options.outDir, "snapshots"), { recursive: true });
  await writeFile(snapshotPath(options.outDir, snapshot.date), `${JSON.stringify(snapshot)}\n`);
  return { snapshot };
}
