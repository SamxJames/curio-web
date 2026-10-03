// The weekly demand report, built from a snapshot (and, for week-on-week,
// the previous one). Pure: no I/O and no clock, so every rule here is
// testable against fixtures.
import type { GscRow, SearchConsoleData, Snapshot, WordDemand } from "./types";
import { rankByDemand } from "./wiktionary";

export type PageStats = { impressions: number; clicks: number; ctr: number; position: number };
export type JoinedWord = WordDemand & { gsc: PageStats | null };
export type PageRow = PageStats & { path: string; word: string | null };
export type QueryRow = PageStats & { query: string; path: string; word: string };

export const TOP_LIMIT = 30;
export const OPPORTUNITY_MAX_IMPRESSIONS = 10;
const NEARLY_THERE = { min: 8, max: 20 };
/** Story titles promise the word's origin. A query naming the word with none
 * of these stems is after something else (meaning, pronunciation…). */
export const INTENT_STEMS = ["origin", "etymolog", "histor", "come from", "comes from", "came from", "deriv"];

const SITE_HOSTS = new Set(["curioword.com", "www.curioword.com"]);

/** "/story/quarantine" for a curioword.com URL, apex or www; null for anything else. */
export function pagePath(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!SITE_HOSTS.has(parsed.hostname)) return null;
  const path = parsed.pathname.replace(/\/+$/, "");
  return path === "" ? "/" : path;
}

export function storySlug(path: string): string | null {
  const match = /^\/story\/([^/]+)$/.exec(path);
  return match ? decodeURIComponent(match[1]) : null;
}

type Totals = { impressions: number; clicks: number; weightedPosition: number };

function accumulate(totals: Map<string, Totals>, key: string, row: GscRow) {
  const t = totals.get(key) ?? { impressions: 0, clicks: 0, weightedPosition: 0 };
  t.impressions += row.impressions;
  t.clicks += row.clicks;
  t.weightedPosition += row.position * row.impressions;
  totals.set(key, t);
}

function toStats(t: Totals): PageStats {
  return {
    impressions: t.impressions,
    clicks: t.clicks,
    ctr: t.impressions ? t.clicks / t.impressions : 0,
    position: t.impressions ? t.weightedPosition / t.impressions : 0,
  };
}

/** Page stats keyed by path, with apex and www rows for the same path merged
 * (position weighted by impressions). Off-site URLs are dropped. */
export function pageStatsByPath(rows: GscRow[]): Map<string, PageStats> {
  const totals = new Map<string, Totals>();
  for (const row of rows) {
    const path = pagePath(row.keys[0]);
    if (path) accumulate(totals, path, row);
  }
  return new Map([...totals].map(([path, t]) => [path, toStats(t)]));
}

export function wordsBySlug(snapshot: Snapshot): Map<string, string> {
  return new Map(snapshot.wiktionary.words.map((w) => [w.slug, w.word]));
}

export function joinByWord(snapshot: Snapshot): JoinedWord[] {
  const pages = snapshot.searchConsole ? pageStatsByPath(snapshot.searchConsole.byPage) : null;
  return snapshot.wiktionary.words.map((w) => ({ ...w, gsc: pages?.get(`/story/${w.slug}`) ?? null }));
}

export function topByDemand(joined: JoinedWord[], limit = TOP_LIMIT): JoinedWord[] {
  return rankByDemand(joined).slice(0, limit);
}

/** High Wiktionary demand (the top quarter of words with any views) but
 * fewer than OPPORTUNITY_MAX_IMPRESSIONS Search Console impressions. */
export function opportunities(joined: JoinedWord[], limit = TOP_LIMIT): JoinedWord[] {
  const ranked = rankByDemand(joined).filter((w) => w.total12 > 0);
  return ranked
    .slice(0, Math.ceil(ranked.length / 4))
    .filter((w) => (w.gsc?.impressions ?? 0) < OPPORTUNITY_MAX_IMPRESSIONS)
    .slice(0, limit);
}

const byImpressions = <T extends PageStats>(key: (row: T) => string) => (a: T, b: T) =>
  b.impressions - a.impressions || key(a).localeCompare(key(b));

export function nearlyThere(
  data: SearchConsoleData,
  bySlug: Map<string, string>,
  limit = TOP_LIMIT
): PageRow[] {
  return [...pageStatsByPath(data.byPage)]
    .map(([path, stats]) => {
      const slug = storySlug(path);
      return { path, word: (slug && bySlug.get(slug)) || null, ...stats };
    })
    .filter((p) => p.position >= NEARLY_THERE.min && p.position <= NEARLY_THERE.max)
    .sort(byImpressions<PageRow>((p) => p.path))
    .slice(0, limit);
}

export function offPatternQueries(
  data: SearchConsoleData,
  bySlug: Map<string, string>,
  limit = TOP_LIMIT
): { offWord: QueryRow[]; otherIntent: QueryRow[] } {
  const totals = new Map<string, Totals>();
  for (const row of data.byPageQuery) {
    const path = pagePath(row.keys[0]);
    const slug = path && storySlug(path);
    if (path && slug && bySlug.has(slug)) accumulate(totals, `${path}\t${row.keys[1]}`, row);
  }
  const rows: QueryRow[] = [...totals].map(([key, t]) => {
    const [path, query] = key.split("\t");
    return { path, query, word: bySlug.get(storySlug(path)!)!, ...toStats(t) };
  });
  const sort = byImpressions<QueryRow>((r) => r.query);
  const offWord = rows.filter((r) => !r.query.toLowerCase().includes(r.word.toLowerCase()));
  const otherIntent = rows.filter((r) => {
    const q = r.query.toLowerCase();
    return q.includes(r.word.toLowerCase()) && !INTENT_STEMS.some((stem) => q.includes(stem));
  });
  return {
    offWord: offWord.sort(sort).slice(0, limit),
    otherIntent: otherIntent.sort(sort).slice(0, limit),
  };
}
