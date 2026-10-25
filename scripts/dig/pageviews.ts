// Yearly Wiktionary pageviews per word: the "Popular pick" signal and the fossil tie-break.
// Cached for 180 days in one JSON file, so only new words cost a request.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FetchLike } from "../demand/http";
import { fetchMonthlyViews, lastCompleteMonths } from "../demand/wiktionary";

const STALE_MS = 180 * 24 * 60 * 60 * 1000;
/** Requests in flight at once. With the build's 25 ms gap that is still at most 40 a second. */
const VIEW_CONCURRENCY = 6;
type Cache = Record<string, { views: number; at: string }>;

/** An unreadable or malformed cache counts as empty, so the run refetches instead of crashing. */
function readCache(file: string): Cache {
  if (!existsSync(file)) return {};
  try {
    const data: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
    for (const entry of Object.values(data)) {
      const { views, at } = (entry ?? {}) as Record<string, unknown>;
      if (typeof views !== "number" || !Number.isFinite(views)) return {};
      if (typeof at !== "string" || !Number.isFinite(Date.parse(at))) return {};
    }
    return data as Cache;
  } catch {
    return {};
  }
}

/** The failure without the word: the HTTP status when there is one, otherwise "network error". */
function failureReason(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  const status = /HTTP (\d{3})/.exec(message);
  return status ? `HTTP ${status[1]}` : "network error";
}

export async function yearlyViews(words: string[], opts: { fetcher: FetchLike; cachePath: string; now: Date }): Promise<Map<string, number>> {
  const cache = readCache(opts.cachePath);
  const months = lastCompleteMonths(opts.now, 12);
  const out = new Map<string, number>();
  let fetched = 0;
  mkdirSync(path.dirname(opts.cachePath), { recursive: true });
  const todo: string[] = [];
  for (const w of [...new Set(words)]) {
    const hit = Object.hasOwn(cache, w) ? cache[w] : undefined;
    if (hit && opts.now.getTime() - Date.parse(hit.at) < STALE_MS) out.set(w, hit.views);
    else todo.push(w);
  }
  // A few requests in flight at once; the fetcher's minimum gap still caps the rate.
  let next = 0, failure: Error | null = null;
  const worker = async () => {
    while (!failure && next < todo.length) {
      const w = todo[next++];
      try {
        const views = (await fetchMonthlyViews(w, months, opts.fetcher)).reduce((a, b) => a + b, 0);
        cache[w] = { views, at: opts.now.toISOString() };
        out.set(w, views);
        if (++fetched % 500 === 0) writeFileSync(opts.cachePath, JSON.stringify(cache));
      } catch (err) {
        // The word and the original error are left out on purpose: Actions logs are public.
        failure ??= new Error(`pageviews failed after ${fetched} fetched: ${failureReason(err)}`);
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(VIEW_CONCURRENCY, todo.length) }, worker));
    if (failure) throw failure;
  } finally {
    // Runs on failure too, so the words fetched before a thrown error survive.
    writeFileSync(opts.cachePath, JSON.stringify(cache));
  }
  return out;
}
