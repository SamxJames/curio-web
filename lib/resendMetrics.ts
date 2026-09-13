// Resend's account-level email engagement metrics
// (GET https://api.resend.com/emails/metrics — verified against Resend's
// own API docs on 2026-09-13: query params start_date/end_date/metrics as
// ISO dates and a comma-separated metric list, response shape
// { totals: { sent, delivered, opened, clicked, open_rate, click_rate, ... } }).
// Not wrapped by the installed `resend` npm SDK (6.27.0 has no metrics
// method as of writing), so this calls the REST endpoint directly with
// `fetch`, following lib/bluesky.ts's existing best-effort convention for
// optional external services: unconfigured or unreachable degrades to
// `null`, never a thrown error.

export type EmailMetricsTotals = {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  openRate: number | null;
  clickRate: number | null;
};

/** Defensively parses Resend's /emails/metrics response into our own
 * shape. This is an external API's JSON, not a type-checked SDK return
 * value — anything missing or unexpected coerces to a safe default (0 for
 * counts, null for rates) rather than throwing, so a malformed or
 * evolving response degrades one dashboard card instead of crashing the
 * whole admin page. */
export function parseEmailMetricsResponse(json: unknown): EmailMetricsTotals | null {
  if (typeof json !== "object" || json === null) return null;
  const totals = (json as Record<string, unknown>).totals;
  if (typeof totals !== "object" || totals === null) return null;
  const t = totals as Record<string, unknown>;

  const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const rate = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  return {
    sent: count(t.sent),
    delivered: count(t.delivered),
    opened: count(t.opened),
    clicked: count(t.clicked),
    openRate: rate(t.open_rate),
    clickRate: rate(t.click_rate),
  };
}

const RESEND_METRICS_URL = "https://api.resend.com/emails/metrics";

/** Fetches account-level email engagement totals for the last `days`
 * days. Returns `null` (never throws) when RESEND_API_KEY isn't
 * configured, the request fails, or the response can't be parsed — the
 * admin page renders "unavailable" for that card rather than crashing. */
export async function getEmailMetrics(
  days: number,
  now: Date = new Date()
): Promise<EmailMetricsTotals | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  try {
    const endDate = now.toISOString().slice(0, 10);
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const url = new URL(RESEND_METRICS_URL);
    url.searchParams.set("start_date", startDate);
    url.searchParams.set("end_date", endDate);
    url.searchParams.set("metrics", "sent,delivered,opened,clicked,open_rate,click_rate");

    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) {
      console.error(`[curio:resend-metrics] request failed with status ${res.status}`);
      return null;
    }
    return parseEmailMetricsResponse(await res.json());
  } catch (err) {
    console.error("[curio:resend-metrics] fetch failed:", err);
    return null;
  }
}
