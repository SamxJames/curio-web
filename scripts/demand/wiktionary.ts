// English Wiktionary demand for each word: which page to count, its monthly
// pageviews from the Wikimedia Pageviews API (agent type "user", so known
// bots are excluded), and the per-word summary the report ranks on.
//
// Caveat carried into the report: a Wiktionary page holds every language's
// entry for that spelling, so its views are a proxy for interest in the
// word, not a count of English etymology lookups.
import type { WordDemand } from "./types";

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
