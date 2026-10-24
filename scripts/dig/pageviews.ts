// Yearly Wiktionary pageviews per word: the "Popular pick" signal and the fossil tie-break.
// Cached for 180 days in one JSON file, so only new words cost a request.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FetchLike } from "../demand/http";
import { fetchMonthlyViews, lastCompleteMonths } from "../demand/wiktionary";

const STALE_MS = 180 * 24 * 60 * 60 * 1000;
type Cache = Record<string, { views: number; at: string }>;

export async function yearlyViews(words: string[], opts: { fetcher: FetchLike; cachePath: string; now: Date }): Promise<Map<string, number>> {
  const cache: Cache = existsSync(opts.cachePath) ? JSON.parse(readFileSync(opts.cachePath, "utf8")) : {};
  const months = lastCompleteMonths(opts.now, 12);
  const out = new Map<string, number>();
  let fetched = 0;
  for (const w of [...new Set(words)]) {
    const hit = cache[w];
    if (hit && opts.now.getTime() - Date.parse(hit.at) < STALE_MS) { out.set(w, hit.views); continue; }
    const views = (await fetchMonthlyViews(w, months, opts.fetcher)).reduce((a, b) => a + b, 0);
    cache[w] = { views, at: opts.now.toISOString() };
    out.set(w, views);
    if (++fetched % 500 === 0) writeFileSync(opts.cachePath, JSON.stringify(cache));
  }
  mkdirSync(path.dirname(opts.cachePath), { recursive: true });
  writeFileSync(opts.cachePath, JSON.stringify(cache));
  return out;
}
