import type { HistoryDay } from "./words";

const ENGLISH = "English";

/** One language's share of a collection, for the lineage band and chips.
 * `opacity` steps linearly from 0.58 (most common) down to 0.24 (least
 * common) across the sorted list — the band's only visual encoding of "how
 * much", deliberately not a chart. */
export type LanguageStat = {
  name: string;
  count: number;
  opacity: number;
};

/** Language → word count, excluding English (every word ends there, so it
 * carries no information for the band/chips — see the "Your collection"
 * design handoff), ordered by count descending then alphabetically. */
export function computeLanguageStats(entries: HistoryDay[]): LanguageStat[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const lang of entry.word.lineage) {
      if (lang === ENGLISH) continue;
      counts.set(lang, (counts.get(lang) ?? 0) + 1);
    }
  }
  const names = Array.from(counts.keys()).sort((a, b) => {
    const byCount = counts.get(b)! - counts.get(a)!;
    return byCount !== 0 ? byCount : a.localeCompare(b);
  });
  // Spreads evenly across the 0.58–0.24 range regardless of how many
  // languages there are; a single language just sits at the top of the
  // range (the `span` guard avoids a divide-by-zero there).
  const span = Math.max(1, names.length - 1);
  return names.map((name, i) => ({
    name,
    count: counts.get(name)!,
    opacity: 0.58 - 0.34 * (i / span),
  }));
}

export type WordGroup = { label: string | null; items: HistoryDay[] };

function monthKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
}

export function monthLabel(dateStr: string): string {
  return new Date(dateStr + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
}

/** Groups consecutive entries sharing a calendar month. Entries are assumed
 * already sorted (every HistoryDay list in this app is), so adjacency is
 * enough — two Septembers a year apart still land in separate groups even
 * though both display the same "September" label. */
export function groupByMonth(entries: HistoryDay[]): WordGroup[] {
  const groups: { key: string; label: string; items: HistoryDay[] }[] = [];
  for (const entry of entries) {
    const key = monthKey(entry.date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(entry);
    else groups.push({ key, label: monthLabel(entry.date), items: [entry] });
  }
  return groups;
}

/** "9 Sep" — day-then-month, matching the collection screen's date column.
 * Deliberately distinct from the rest of the app's "Sep 9" formatting
 * (lib/words.ts callers, HistoryList) because the design spec calls for
 * this order specifically here. */
export function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${d.getUTCDate()} ${month}`;
}

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
];

/** Spells out small counts for the sparse-collection caption ("Seven
 * languages so far…"). Falls back to digits past twenty, which the caption
 * never actually reaches — it only fires at nine words or fewer, so there
 * can be at most nine distinct non-English languages. */
export function spellNumber(n: number): string {
  if (n >= 0 && n < NUMBER_WORDS.length) return NUMBER_WORDS[n];
  return String(n);
}

export function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

export function pluralize(n: number, singular: string, plural: string = `${singular}s`): string {
  return n === 1 ? singular : plural;
}

/** A visually generous "·" separator — the design calls for two spaces
 * either side of the dot, which plain spaces can't render (browsers
 * collapse consecutive whitespace), so this uses non-breaking spaces. */
export const WIDE_DOT = "  ·  ";
