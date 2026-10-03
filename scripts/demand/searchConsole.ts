// Google Search Console, read-only, through a service account. The JWT is
// signed here with node:crypto (RS256, the OAuth JWT bearer grant) rather
// than pulling in google-auth-library for one request.
//
// Secrets: the key arrives base64-encoded in GSC_SERVICE_ACCOUNT_KEY and is
// never printed. Errors carry the HTTP status and Google's short error code
// only, never response bodies (error_description can quote key ids).
import { createSign } from "node:crypto";
import type { FetchLike } from "./http";

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
 * or "" when there isn't one. Nothing else from the body is used. */
export async function googleErrorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string | { status?: string } };
    const code = typeof body.error === "string" ? body.error : body.error?.status;
    return code ? ` (${code})` : "";
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
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("Search Console token response had no access_token.");
  return body.access_token;
}
