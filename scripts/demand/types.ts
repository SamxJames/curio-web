// Shared shapes for the demand report. A Snapshot is what gets written to
// snapshots/<date>.json each week and read back for week-on-week.

export type WordDemand = {
  slug: string;
  word: string;
  /** The Wiktionary title counted, or null when no page exists for any candidate. */
  title: string | null;
  /** Monthly user pageviews, oldest first, aligned with WiktionaryData.months. */
  views: number[];
  /** Sum of the 12 months. */
  total12: number;
  /** Mean of the last 3 months. */
  avg3: number;
  /** (last-3 mean − previous-3 mean) / previous-3 mean; null when the previous-3 mean is 0. */
  trend: number | null;
};

export type WiktionaryData = {
  /** "YYYYMM", oldest first: the last 12 complete UTC months before the run. */
  months: string[];
  words: WordDemand[];
};

export type GscRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type SearchConsoleData = {
  site: string;
  startDate: string;
  endDate: string;
  byPage: GscRow[];
  byQuery: GscRow[];
  byPageQuery: GscRow[];
};

export type Snapshot = {
  version: 1;
  /** Run date, YYYY-MM-DD (UTC). */
  date: string;
  generatedAt: string;
  wiktionary: WiktionaryData;
  /** null when Search Console was skipped (no credentials). */
  searchConsole: SearchConsoleData | null;
};
