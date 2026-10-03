// Google Search Console, read-only, through a service account. The JWT is
// signed here with node:crypto (RS256, the OAuth JWT bearer grant) rather
// than pulling in google-auth-library for one request.
//
// Secrets: the key arrives base64-encoded in GSC_SERVICE_ACCOUNT_KEY and is
// never printed. Errors carry the HTTP status and Google's short error code
// only, never response bodies (error_description can quote key ids).
import { createSign } from "node:crypto";
import type { FetchLike } from "./http";
import type { GscRow, SearchConsoleData } from "./types";

export const GSC_SITE = "sc-domain:curioword.com";
export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";

export type ServiceAccountKey = { client_email: string; private_key: string };

/** The service account key from GSC_SERVICE_ACCOUNT_KEY, or null when it
 * isn't set (Search Console is then skipped, not failed). A set but
 * malformed value throws: a broken key mustn't pass for "not set up yet". */
export function loadServiceAccountKey(
  env: Record<string, string | undefined> = process.env
): ServiceAccountKey | null {
  const raw = env.GSC_SERVICE_ACCOUNT_KEY?.trim();
  if (!raw) return null;
  let parsed: Partial<ServiceAccountKey> | null;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as Partial<ServiceAccountKey> | null;
  } catch {
    throw new Error("GSC_SERVICE_ACCOUNT_KEY is set but isn't base64-encoded JSON.");
  }
  if (typeof parsed?.client_email !== "string" || typeof parsed.private_key !== "string") {
    throw new Error("GSC_SERVICE_ACCOUNT_KEY has no client_email or private_key.");
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

const base64url = (value: string) => Buffer.from(value).toString("base64url");

export function buildJwt(key: ServiceAccountKey, nowSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: GSC_SCOPE,
      aud: TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(key.private_key).toString("base64url")}`;
}

/** " (CODE)" from a Google error body — `{"error":"invalid_grant"}` from the
 * token endpoint, `{"error":{"status":"PERMISSION_DENIED"}}` from the API —
 * or "" when there isn't one. Nothing else from the body is used. Only echoes
 * the code if it matches /^[A-Za-z0-9_]{1,64}$/. */
export async function googleErrorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string | { status?: string } };
    const code = typeof body.error === "string" ? body.error : body.error?.status;
    if (code && /^[A-Za-z0-9_]{1,64}$/.test(code)) {
      return ` (${code})`;
    }
    return "";
  } catch {
    return "";
  }
}

export async function getAccessToken(
  key: ServiceAccountKey,
  fetcher: FetchLike,
  nowSeconds: number
): Promise<string> {
  const response = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: buildJwt(key, nowSeconds),
    }).toString(),
  });
  if (!response.ok) {
    throw new Error(
      `Search Console token request failed: HTTP ${response.status}${await googleErrorCode(response)}`
    );
  }
  const body = await response.json().catch(() => null);
  if (!body) {
    throw new Error("Search Console token response was not JSON.");
  }
  if (typeof body.access_token !== "string") {
    throw new Error("Search Console token response had no access_token.");
  }
  return body.access_token;
}

/** Search Console data lags by a few days, so the window ends this many days before the run. */
export const LAG_DAYS = 3;
const WINDOW_DAYS = 28;
const DAY_MS = 24 * 60 * 60 * 1000;
const QUERY_URL = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
  GSC_SITE
)}/searchAnalytics/query`;
/** The API's maximum rows per request. */
const ROW_LIMIT = 25_000;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function searchConsoleWindow(now: Date): { startDate: string; endDate: string } {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = new Date(today - LAG_DAYS * DAY_MS);
  const start = new Date(end.getTime() - (WINDOW_DAYS - 1) * DAY_MS);
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

/** Every row for one dimension set, paging with startRow until a short page. */
export async function queryAll(
  accessToken: string,
  dimensions: string[],
  window: { startDate: string; endDate: string },
  fetcher: FetchLike,
  rowLimit = ROW_LIMIT
): Promise<GscRow[]> {
  const rows: GscRow[] = [];
  for (let startRow = 0; ; startRow += rowLimit) {
    const response = await fetcher(QUERY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...window, dimensions, type: "web", rowLimit, startRow }),
    });
    if (!response.ok) {
      throw new Error(
        `Search Console query (${dimensions.join("+")}) failed: HTTP ${response.status}${await googleErrorCode(response)}`
      );
    }
    const body = await response.json().catch(() => null);
    if (!body) {
      throw new Error(
        `Search Console query (${dimensions.join("+")}) returned non-JSON.`
      );
    }
    const page = (body as { rows?: GscRow[] }).rows ?? [];
    for (const r of page) {
      rows.push({ keys: r.keys, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position });
    }
    if (page.length < rowLimit) return rows;
  }
}

export async function collectSearchConsole(
  key: ServiceAccountKey,
  options: { fetcher: FetchLike; now: Date }
): Promise<SearchConsoleData> {
  const token = await getAccessToken(key, options.fetcher, Math.floor(options.now.getTime() / 1000));
  const window = searchConsoleWindow(options.now);
  const byPage = await queryAll(token, ["page"], window, options.fetcher);
  const byQuery = await queryAll(token, ["query"], window, options.fetcher);
  const byPageQuery = await queryAll(token, ["page", "query"], window, options.fetcher);
  return { site: GSC_SITE, ...window, byPage, byQuery, byPageQuery };
}
