// Wikidata (CC0) as the alternative second source for everyday themes WordNet can't anchor.
// Queries are cached for 7 days; a failed query reuses the last cache (big classes time out).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FetchLike } from "../../demand/http";
import type { WikidataTheme } from "../catalogue";

export const DIG_USER_AGENT = "CurioDig/1.0 (https://curioword.com)";
const WDQS = "https://query.wikidata.org/sparql";
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const SHAPE = /^[a-z][a-z' -]*[a-z]$/;

type Cache = { fetchedAt: string; labels: string[] };

async function sparql(fetcher: FetchLike, query: string): Promise<string[]> {
  const url = `${WDQS}?format=json&query=${encodeURIComponent(query)}`;
  const res = await fetcher(url, { headers: { "User-Agent": DIG_USER_AGENT, Accept: "application/sparql-results+json" } });
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
  const body = (await res.json()) as { results?: { bindings?: { label?: { value?: string } }[] } };
  return (body.results?.bindings ?? []).map((b) => b.label?.value ?? "").filter(Boolean);
}

const classLabel = (qid: string) => `SELECT ?label WHERE { wd:${qid} rdfs:label ?label . FILTER(LANG(?label) = "en") }`;
const memberLabels = (qid: string) =>
  `SELECT DISTINCT ?label WHERE { ?item wdt:P31/wdt:P279* wd:${qid} . ?item rdfs:label ?label . FILTER(LANG(?label) = "en") } LIMIT 20000`;

/** A cache file that is unreadable or wrong-shaped counts as no cache, so it gets refetched and overwritten. */
function readCache(file: string): Cache | null {
  if (!existsSync(file)) return null;
  try {
    const data: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (typeof data !== "object" || data === null) return null;
    const { fetchedAt, labels } = data as Record<string, unknown>;
    if (typeof fetchedAt !== "string" || !Number.isFinite(Date.parse(fetchedAt))) return null;
    if (!Array.isArray(labels) || !labels.every((l) => typeof l === "string")) return null;
    return { fetchedAt, labels };
  } catch {
    return null;
  }
}

export async function fetchWikidataLabels(
  theme: WikidataTheme,
  opts: { fetcher: FetchLike; cacheDir: string; now: Date }
): Promise<{ labels: Set<string> | null; status: "fresh" | "cached" | "stale" | "missing" | "label-mismatch" }> {
  mkdirSync(opts.cacheDir, { recursive: true });
  const file = path.join(opts.cacheDir, `${theme.qid}.json`);
  const cache = readCache(file);
  if (cache && opts.now.getTime() - Date.parse(cache.fetchedAt) < FRESH_MS) {
    return { labels: new Set(cache.labels), status: "cached" };
  }
  try {
    const own = await sparql(opts.fetcher, classLabel(theme.qid));
    if (!own.some((l) => l.toLowerCase() === theme.label)) {
      // An empty 200 is a transient gap, not a real label change: keep the last good cache.
      if (own.length === 0 && cache) return { labels: new Set(cache.labels), status: "stale" };
      return { labels: null, status: "label-mismatch" };
    }
    const labels = [...new Set((await sparql(opts.fetcher, memberLabels(theme.qid))).map((l) => l.toLowerCase()))].filter((l) => SHAPE.test(l));
    // Never cache an empty set: a transient empty 200 would otherwise hide the theme for 7 days.
    if (labels.length === 0) return cache ? { labels: new Set(cache.labels), status: "stale" } : { labels: null, status: "missing" };
    writeFileSync(file, JSON.stringify({ fetchedAt: opts.now.toISOString(), labels } satisfies Cache));
    return { labels: new Set(labels), status: "fresh" };
  } catch {
    return cache ? { labels: new Set(cache.labels), status: "stale" } : { labels: null, status: "missing" };
  }
}
