// The weekly demand report, built from a snapshot (and, for week-on-week,
// the previous one). Pure: no I/O and no clock, so every rule here is
// testable against fixtures.
import type { GscRow, SearchConsoleData, Snapshot, WordDemand } from "./types";
import { formatTrend, rankByDemand } from "./wiktionary";

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
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
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

export type Change = { label: string; before: number; after: number };
export type WeekOnWeek = {
  previousDate: string | null;
  searchConsole: {
    impressions: Change;
    clicks: Change;
    gains: Change[];
    losses: Change[];
    positionGains: Change[];
    newPages: Change[];
  } | null;
  wiktionary: { gains: Change[]; losses: Change[] } | null;
};

export const MOVER_LIMIT = 10;
/** Position moves on pages with fewer impressions than this are mostly noise. */
export const POSITION_MIN_IMPRESSIONS = 10;

/** The `limit` changes with the highest score (ties by label), dropping any scoring 0 or less. */
function topChanges(changes: Change[], score: (c: Change) => number, limit = MOVER_LIMIT): Change[] {
  return changes
    .filter((c) => score(c) > 0)
    .sort((a, b) => score(b) - score(a) || a.label.localeCompare(b.label))
    .slice(0, limit);
}

const sumOf = (pages: Map<string, PageStats>, field: "impressions" | "clicks") =>
  [...pages.values()].reduce((total, p) => total + p[field], 0);

function compareSearchConsole(
  current: SearchConsoleData | null,
  previous: SearchConsoleData | null
): WeekOnWeek["searchConsole"] {
  if (!current || !previous) return null;
  const now = pageStatsByPath(current.byPage);
  const before = pageStatsByPath(previous.byPage);
  const paths = [...new Set([...now.keys(), ...before.keys()])];
  const impressionChanges = paths.map((path) => ({
    label: path,
    before: before.get(path)?.impressions ?? 0,
    after: now.get(path)?.impressions ?? 0,
  }));
  const positionChanges = [...now]
    .filter(([path, stats]) => before.has(path) && stats.impressions >= POSITION_MIN_IMPRESSIONS)
    .map(([path, stats]) => ({ label: path, before: before.get(path)!.position, after: stats.position }));
  const newPages = [...now]
    .filter(([path]) => !before.has(path))
    .map(([path, stats]) => ({ label: path, before: 0, after: stats.impressions }));
  return {
    impressions: { label: "impressions", before: sumOf(before, "impressions"), after: sumOf(now, "impressions") },
    clicks: { label: "clicks", before: sumOf(before, "clicks"), after: sumOf(now, "clicks") },
    gains: topChanges(impressionChanges, (c) => c.after - c.before),
    losses: topChanges(impressionChanges, (c) => c.before - c.after),
    positionGains: topChanges(positionChanges, (c) => c.before - c.after),
    newPages: topChanges(newPages, (c) => c.after, TOP_LIMIT),
  };
}

function compareWiktionary(current: Snapshot["wiktionary"], previous: Snapshot["wiktionary"]): WeekOnWeek["wiktionary"] {
  // Monthly data only changes when a new month completes.
  if (current.months[current.months.length - 1] === previous.months[previous.months.length - 1]) return null;
  const before = new Map(previous.words.map((w) => [w.slug, w.total12]));
  const changes = current.words
    .filter((w) => w.title !== null && before.has(w.slug))
    .map((w) => ({ label: w.word, before: before.get(w.slug)!, after: w.total12 }));
  return {
    gains: topChanges(changes, (c) => c.after - c.before),
    losses: topChanges(changes, (c) => c.before - c.after),
  };
}

export function weekOnWeek(current: Snapshot, previous: Snapshot | null): WeekOnWeek {
  if (!previous) return { previousDate: null, searchConsole: null, wiktionary: null };
  return {
    previousDate: previous.date,
    searchConsole: compareSearchConsole(current.searchConsole, previous.searchConsole),
    wiktionary: compareWiktionary(current.wiktionary, previous.wiktionary),
  };
}

export const WIKTIONARY_CAVEAT =
  "A Wiktionary page covers every language's entry for that spelling, so these views are a proxy for interest in the word, not a count of English etymology searches.";
export const GSC_LAG_NOTE =
  "Search Console data lags by a few days, so the window ends 3 days before this run. Google leaves rare queries out of query-level data, so the query tables undercount.";

const SITE = "https://curioword.com";
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SKIPPED = "_Search Console was skipped this run._";

const monthLabel = (yyyymm: string) => `${MONTH_NAMES[Number(yyyymm.slice(4)) - 1]} ${yyyymm.slice(0, 4)}`;
const int = (n: number) => Math.round(n).toLocaleString("en-US");
const pos = (p: number) => p.toFixed(1);
const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
const signed = (n: number, format: (n: number) => string) =>
  n > 0 ? `+${format(n)}` : n < 0 ? `-${format(-n)}` : "0";
const pageLink = (path: string) => `[${path}](${SITE}${path})`;

function wordCell(w: WordDemand): string {
  const link = `[${w.word}](${SITE}/story/${w.slug})`;
  return w.title && w.title !== w.word ? `${link} (as “${w.title}")` : link;
}

function table(headers: string[], rows: string[][]): string[] {
  if (rows.length === 0) return ["_None this week._"];
  const cell = (c: string) => c.replace(/\|/g, "\\|");
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`),
  ];
}

function changeTable(label: string, rows: Change[], format: (n: number) => string = int): string[] {
  return table(
    [label, "Before", "After", "Change"],
    rows.map((c) => [c.label, format(c.before), format(c.after), signed(c.after - c.before, format)])
  );
}

function renderWeekOnWeek(w: WeekOnWeek): string[] {
  if (!w.previousDate) return ["_No earlier snapshot to compare with; this is the first run._"];
  const out = [`Compared with the snapshot from ${w.previousDate}.`, ""];
  const s = w.searchConsole;
  if (s) {
    out.push(
      `- Impressions (summed over pages): ${int(s.impressions.before)} → ${int(s.impressions.after)} (${signed(s.impressions.after - s.impressions.before, int)})`,
      `- Clicks: ${int(s.clicks.before)} → ${int(s.clicks.after)} (${signed(s.clicks.after - s.clicks.before, int)})`,
      "",
      "### Biggest impression gains",
      "",
      ...changeTable("Page", s.gains),
      "",
      "### Biggest impression losses",
      "",
      ...changeTable("Page", s.losses),
      "",
      `### Biggest position improvements (pages with at least ${POSITION_MIN_IMPRESSIONS} impressions)`,
      "",
      ...changeTable("Page", s.positionGains, pos),
      "",
      "### New pages",
      "",
      ...table(["Page", "Impressions"], s.newPages.map((c) => [c.label, int(c.after)]))
    );
  } else {
    out.push("_No Search Console comparison: it was skipped this week or in the earlier snapshot._");
  }
  out.push("");
  if (w.wiktionary) {
    out.push(
      "### Wiktionary: biggest 12-month gains",
      "",
      ...changeTable("Word", w.wiktionary.gains),
      "",
      "### Wiktionary: biggest 12-month falls",
      "",
      ...changeTable("Word", w.wiktionary.losses)
    );
  } else {
    out.push("_Wiktionary figures are monthly, and the month window hasn't rolled over since the earlier snapshot._");
  }
  return out;
}

export function renderReport(current: Snapshot, previous: Snapshot | null): string {
  const joined = joinByWord(current);
  const bySlug = wordsBySlug(current);
  const gsc = current.searchConsole;
  const { months } = current.wiktionary;
  const out: string[] = [];
  const section = (title: string, ...body: string[]) => out.push("", `## ${title}`, "", ...body);
  const escapeQuery = (q: string) => q.replace(/[\\\`*_\[\]<>]/g, "\\$&");
  const queryTable = (rows: QueryRow[]) =>
    table(
      ["Query", "Page", "Impressions", "Clicks", "Position"],
      rows.map((r) => [escapeQuery(r.query), pageLink(r.path), int(r.impressions), int(r.clicks), pos(r.position)])
    );

  out.push(
    `# Curio demand report — ${current.date}`,
    "",
    `Generated ${current.generatedAt}.`,
    "",
    `- **Wiktionary:** monthly pageviews from people (bots excluded), ${monthLabel(months[0])} to ${monthLabel(months[months.length - 1])}. ${WIKTIONARY_CAVEAT}`,
    gsc
      ? `- **Search Console:** ${gsc.startDate} to ${gsc.endDate} (28 days). ${GSC_LAG_NOTE}`
      : "- **Search Console: skipped.** `GSC_SERVICE_ACCOUNT_KEY` was not set, so this report has the Wiktionary half only."
  );

  section(
    `1. Top ${TOP_LIMIT} words by Wiktionary demand`,
    ...table(
      ["#", "Word", "12-month views", "3-month avg", "Trend", "Impressions", "Clicks", "Position"],
      topByDemand(joined).map((w, i) => [
        String(i + 1),
        wordCell(w),
        int(w.total12),
        int(w.avg3),
        formatTrend(w.trend, w.avg3),
        w.gsc ? int(w.gsc.impressions) : "—",
        w.gsc ? int(w.gsc.clicks) : "—",
        w.gsc ? pos(w.gsc.position) : "—",
      ])
    )
  );

  section(
    "2. Opportunities",
    `Words in the top quarter for Wiktionary demand with fewer than ${OPPORTUNITY_MAX_IMPRESSIONS} Search Console impressions in 28 days.`,
    "",
    ...(gsc
      ? table(
          ["Word", "12-month views", "Trend", "Impressions"],
          opportunities(joined).map((w) => [
            wordCell(w),
            int(w.total12),
            formatTrend(w.trend, w.avg3),
            int(w.gsc?.impressions ?? 0),
          ])
        )
      : [SKIPPED])
  );

  section(
    "3. Nearly there",
    "Pages averaging position 8 to 20, where a better title or more internal links could lift them onto page one.",
    "",
    ...(gsc
      ? table(
          ["Page", "Word", "Impressions", "Clicks", "CTR", "Position"],
          nearlyThere(gsc, bySlug).map((p) => [
            pageLink(p.path),
            p.word ?? "—",
            int(p.impressions),
            int(p.clicks),
            pct(p.ctr),
            pos(p.position),
          ])
        )
      : [SKIPPED])
  );

  if (gsc) {
    const { offWord, otherIntent } = offPatternQueries(gsc, bySlug);
    section(
      "4. Queries that don't match the title pattern",
      "Story titles read `<word>: the origin of the word — Curio`.",
      "",
      "### Off-word: the query doesn't contain the page's word",
      "",
      ...queryTable(offWord),
      "",
      "### Other intent: the word, but not its origin",
      "",
      ...queryTable(otherIntent)
    );
  } else {
    section("4. Queries that don't match the title pattern", SKIPPED);
  }

  section("5. Week on week", ...renderWeekOnWeek(weekOnWeek(current, previous)));

  const missing = current.wiktionary.words.filter((w) => w.title === null).map((w) => w.word);
  section(`No Wiktionary page (${missing.length})`, missing.length ? missing.join(", ") : "_Every word has a page._");

  return `${out.join("\n")}\n`;
}


