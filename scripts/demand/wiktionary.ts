// English Wiktionary demand for each word: which page to count, its monthly
// pageviews from the Wikimedia Pageviews API (agent type "user", so known
// bots are excluded), and the per-word summary the report ranks on.
//
// Caveat carried into the report: a Wiktionary page holds every language's
// entry for that spelling, so its views are a proxy for interest in the
// word, not a count of English etymology lookups.
import type { FetchLike } from "./http";
import type { WordDemand, WiktionaryData } from "./types";

/** Wikimedia's API policy asks for a descriptive User-Agent with a contact. */
export const USER_AGENT =
  "CurioDemandReport/1.0 (https://curioword.com; samfillingham@protonmail.com)";

/** The exact spelling first, then the same word with its first letter's case
 * swapped. Exact-first matters for the capitalised words (December,
 * Jupiter…): Wiktionary's lowercase "december" holds other languages'
 * entries, so lowercase-first would count the wrong page. */
export function titleCandidates(word: string): string[] {
  const first = word.charAt(0);
  const swapped = first === first.toUpperCase() ? first.toLowerCase() : first.toUpperCase();
  const other = swapped + word.slice(1);
  return other === word ? [word] : [word, other];
}

/** A title as the Pageviews API wants it in the URL path. */
export function encodeTitle(title: string): string {
  return encodeURIComponent(title.replace(/ /g, "_"));
}

/** The `count` complete UTC months before `now`, as "YYYYMM", oldest first. */
export function lastCompleteMonths(now: Date, count = 12): string[] {
  const months: string[] = [];
  for (let back = count; back >= 1; back--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    months.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

const sum = (xs: number[]) => xs.reduce((total, x) => total + x, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);

export function summarizeViews(views: number[]): Pick<WordDemand, "total12" | "avg3" | "trend"> {
  const avg3 = mean(views.slice(-3));
  const previous = mean(views.slice(-6, -3));
  return {
    total12: sum(views),
    avg3,
    trend: previous === 0 ? null : (avg3 - previous) / previous,
  };
}

export function formatTrend(trend: number | null, avg3: number): string {
  if (trend === null) return avg3 > 0 ? "new" : "—";
  const pct = Math.round(trend * 100);
  if (pct === 0) return "0%";
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

/** Words that have a Wiktionary page, highest 12-month total first. */
export function rankByDemand<T extends WordDemand>(words: T[]): T[] {
  return words
    .filter((w) => w.title !== null)
    .sort((a, b) => b.total12 - a.total12 || a.word.localeCompare(b.word));
}

const HEADERS = { "User-Agent": USER_AGENT, Accept: "application/json" };
const MEDIAWIKI_API = "https://en.wiktionary.org/w/api.php";
const PAGEVIEWS_API =
  "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wiktionary.org/all-access/user";
/** The MediaWiki API's per-request title limit for non-bot clients. */
const TITLE_BATCH = 50;

type QueryResponse = {
  error?: { code?: string };
  query?: {
    normalized?: { from: string; to: string }[];
    pages?: { title: string; missing?: boolean; invalid?: boolean }[];
  };
};

/** Each given title that exists on English Wiktionary, mapped to its canonical title. */
export async function existingTitles(
  titles: string[],
  fetcher: FetchLike
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (let i = 0; i < titles.length; i += TITLE_BATCH) {
    const batch = titles.slice(i, i + TITLE_BATCH);
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      titles: batch.join("|"),
    });
    const response = await fetcher(`${MEDIAWIKI_API}?${params}`, { headers: HEADERS });
    if (!response.ok) throw new Error(`Wiktionary title lookup failed: HTTP ${response.status}`);
    const body = (await response.json()) as QueryResponse;
    if (!body.query) {
      const code = body.error?.code ? ` (${body.error.code})` : "";
      throw new Error(`Wiktionary title lookup returned no query result${code}`);
    }
    const normalized = new Map((body.query.normalized ?? []).map((n) => [n.from, n.to]));
    const live = new Set(
      (body.query.pages ?? []).filter((p) => !p.missing && !p.invalid).map((p) => p.title)
    );
    for (const title of batch) {
      const canonical = normalized.get(title) ?? title;
      if (live.has(canonical)) found.set(title, canonical);
    }
  }
  return found;
}

/** The Wiktionary title to count for each word: the exact spelling if it has
 * a page, else the other-case form, else null (no page). Checking existence
 * up front matters because the Pageviews API answers 404 both for a missing
 * page and for a real page with no views. */
export async function resolveTitles(
  words: string[],
  fetcher: FetchLike
): Promise<Map<string, string | null>> {
  const resolved = new Map<string, string | null>();
  const exact = await existingTitles(words, fetcher);
  const fallbacks = new Map<string, string>();
  for (const word of words) {
    const hit = exact.get(word);
    const other = titleCandidates(word)[1];
    if (hit) resolved.set(word, hit);
    else if (other) fallbacks.set(word, other);
    else resolved.set(word, null);
  }
  const second = await existingTitles([...fallbacks.values()], fetcher);
  for (const [word, other] of fallbacks) resolved.set(word, second.get(other) ?? null);
  return resolved;
}

function lastDayOfMonth(yyyymm: string): string {
  const year = Number(yyyymm.slice(0, 4));
  const month = Number(yyyymm.slice(4));
  return String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0");
}

type PageviewsResponse = { items?: { timestamp: string; views: number }[] };

/** Monthly user pageviews for one existing title, aligned with `months`. */
export async function fetchMonthlyViews(
  title: string,
  months: string[],
  fetcher: FetchLike
): Promise<number[]> {
  const first = months[0];
  const last = months[months.length - 1];
  const url = `${PAGEVIEWS_API}/${encodeTitle(title)}/monthly/${first}01/${last}${lastDayOfMonth(last)}`;
  const response = await fetcher(url, { headers: HEADERS });
  // The page's existence was confirmed by resolveTitles, so a 404 here
  // means "no recorded views in the range", not "no such page".
  if (response.status === 404) return months.map(() => 0);
  if (!response.ok) {
    throw new Error(`Wiktionary pageviews failed for "${title}": HTTP ${response.status}`);
  }
  const body = (await response.json()) as PageviewsResponse;
  const byMonth = new Map((body.items ?? []).map((item) => [item.timestamp.slice(0, 6), item.views]));
  return months.map((month) => byMonth.get(month) ?? 0);
}

export async function collectWiktionary(
  entries: { slug: string; word: string }[],
  options: { fetcher: FetchLike; now: Date; onProgress?: (done: number, total: number) => void }
): Promise<WiktionaryData> {
  const months = lastCompleteMonths(options.now);
  const titles = await resolveTitles(
    entries.map((e) => e.word),
    options.fetcher
  );
  const words: WordDemand[] = [];
  for (const [i, entry] of entries.entries()) {
    const title = titles.get(entry.word) ?? null;
    const views = title
      ? await fetchMonthlyViews(title, months, options.fetcher)
      : months.map(() => 0);
    words.push({ slug: entry.slug, word: entry.word, title, views, ...summarizeViews(views) });
    options.onProgress?.(i + 1, entries.length);
  }
  return { months, words };
}
