/** Where a visit came from, in a fixed vocabulary so the counters stay a
 * short, known list (see lib/trafficStats.ts). Pure: no Redis, no DOM —
 * the browser passes in location.search / document.referrer / host. */
export const TRAFFIC_SOURCES = [
  "email",
  "bluesky",
  "threads",
  "instagram",
  "share",
  "search",
  "reddit",
  "hn",
  "other",
  "direct",
] as const;
export type TrafficSource = (typeof TRAFFIC_SOURCES)[number];

export function isTrafficSource(x: unknown): x is TrafficSource {
  return typeof x === "string" && (TRAFFIC_SOURCES as readonly string[]).includes(x);
}

/** utm_source values our own links carry (digest, social posts, share). */
const TAGGED: readonly TrafficSource[] = ["email", "bluesky", "threads", "instagram", "share"];

const REFERRER_RULES: { source: TrafficSource; test: RegExp }[] = [
  // Google and Yandex are anchored to their search hosts so mail.google.com,
  // docs.google.com and look-alikes such as google.evil.com stay "other".
  {
    source: "search",
    test: /^(www\.)?google\.(com|[a-z]{2,3}|co\.[a-z]{2}|com\.[a-z]{2})$|(^|\.)(bing\.com|duckduckgo\.com|search\.brave\.com|ecosia\.org|search\.yahoo\.com)$|^(www\.)?yandex\.(ru|com|[a-z]{2,3}|com\.[a-z]{2})$/,
  },
  { source: "bluesky", test: /(^|\.)bsky\.app$/ },
  { source: "threads", test: /(^|\.)threads\.(net|com)$/ },
  { source: "instagram", test: /(^|\.)instagram\.com$/ },
  { source: "reddit", test: /(^|\.)reddit\.com$/ },
  { source: "hn", test: /^news\.ycombinator\.com$/ },
];

const stripWww = (host: string) => host.toLowerCase().replace(/^www\./, "");

/** Our own tag first, then the referrer's host, then "direct". Returns
 * null for a referrer on our own site: that's a reload or a new tab from
 * Curio, not an arrival, so the caller counts nothing. */
export function classifySource(search: string, referrer: string, ownHost: string): TrafficSource | null {
  const tag = new URLSearchParams(search).get("utm_source");
  if (tag && (TAGGED as readonly string[]).includes(tag)) return tag as TrafficSource;
  if (!referrer) return "direct";
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "other";
  }
  if (stripWww(host) === stripWww(ownHost)) return null;
  return REFERRER_RULES.find((r) => r.test.test(host))?.source ?? "other";
}

/** Crawlers (Googlebot renders JS and would fire the beacon), link-preview
 * fetchers and headless browsers. A missing user agent counts as a bot. */
export function isLikelyBot(userAgent: string | null): boolean {
  if (!userAgent) return true;
  return /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|python|curl|wget/i.test(userAgent);
}

export type ShareKind = "story" | "puzzle";
export type TrafficEvent =
  | { kind: "visit"; source: TrafficSource }
  | { kind: "signup"; source: TrafficSource }
  | { kind: "share"; what: ShareKind };

/** The only gate between a request body and a Redis field name. */
export function parseTrafficEvent(body: unknown): TrafficEvent | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if ((b.kind === "visit" || b.kind === "signup") && isTrafficSource(b.source)) {
    return { kind: b.kind, source: b.source };
  }
  if (b.kind === "share" && (b.what === "story" || b.what === "puzzle")) {
    return { kind: "share", what: b.what };
  }
  return null;
}

export function eventField(ev: TrafficEvent): string {
  return ev.kind === "share" ? `share:${ev.what}` : `${ev.kind}:${ev.source}`;
}

export type TrafficRow = { source: TrafficSource; visits: number; signups: number; rate: number | null };
export type TrafficSummary = {
  rows: TrafficRow[];
  totals: { visits: number; signups: number };
  shares: { story: number; puzzle: number };
};

/** Folds per-day counter hashes into one row per source (only sources with
 * any activity), most visits first. `rate` is signups ÷ visits, or null with
 * no visits, so the admin page shows "—" rather than a misleading figure.
 * Unknown field names are ignored. */
export function summarizeTraffic(days: Record<string, Record<string, number>>): TrafficSummary {
  const visits = new Map<TrafficSource, number>();
  const signups = new Map<TrafficSource, number>();
  const shares = { story: 0, puzzle: 0 };
  for (const fields of Object.values(days)) {
    for (const [field, raw] of Object.entries(fields)) {
      const n = Number(raw) || 0;
      const [kind, name] = field.split(":");
      if (kind === "share" && (name === "story" || name === "puzzle")) shares[name] += n;
      else if (kind === "visit" && isTrafficSource(name)) visits.set(name, (visits.get(name) ?? 0) + n);
      else if (kind === "signup" && isTrafficSource(name)) signups.set(name, (signups.get(name) ?? 0) + n);
    }
  }
  const sources = TRAFFIC_SOURCES.filter((s) => visits.has(s) || signups.has(s));
  const rows = sources
    .map((source) => {
      const v = visits.get(source) ?? 0;
      const s = signups.get(source) ?? 0;
      return { source, visits: v, signups: s, rate: v === 0 ? null : s / v };
    })
    .sort((a, b) => b.visits - a.visits);
  return {
    rows,
    totals: {
      visits: rows.reduce((t, r) => t + r.visits, 0),
      signups: rows.reduce((t, r) => t + r.signups, 0),
    },
    shares,
  };
}
