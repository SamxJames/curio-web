import { createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GSC_SCOPE, TOKEN_URL, buildJwt, getAccessToken, loadServiceAccountKey, GSC_SITE, collectSearchConsole, queryAll, searchConsoleWindow } from "./searchConsole";
import { fakeFetch, jsonResponse, testServiceAccount, googleRoute } from "./testing";

const account = testServiceAccount();
const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

describe("loadServiceAccountKey", () => {
  it("returns null when the variable is unset or blank", () => {
    expect(loadServiceAccountKey({})).toBeNull();
    expect(loadServiceAccountKey({ GSC_SERVICE_ACCOUNT_KEY: "   " })).toBeNull();
  });

  it("decodes a base64 JSON key file", () => {
    const key = loadServiceAccountKey({ GSC_SERVICE_ACCOUNT_KEY: account.envValue });
    expect(key).toEqual(account.key);
  });

  it("throws without echoing the value when it isn't base64 JSON", () => {
    const value = "not-a-key-but-pretend-it-is-secret";
    expect(() => loadServiceAccountKey({ GSC_SERVICE_ACCOUNT_KEY: value })).toThrow(
      "GSC_SERVICE_ACCOUNT_KEY is set but isn't base64-encoded JSON"
    );
    try {
      loadServiceAccountKey({ GSC_SERVICE_ACCOUNT_KEY: value });
    } catch (error) {
      expect(String(error)).not.toContain(value);
    }
  });

  it("throws when client_email or private_key is missing", () => {
    const value = Buffer.from(JSON.stringify({ client_email: "x@y" })).toString("base64");
    expect(() => loadServiceAccountKey({ GSC_SERVICE_ACCOUNT_KEY: value })).toThrow(
      "GSC_SERVICE_ACCOUNT_KEY has no client_email or private_key"
    );
  });
});

describe("buildJwt", () => {
  it("builds an RS256 JWT for the read-only scope, signed by the key", () => {
    const jwt = buildJwt(account.key, 1_790_000_000);
    const [header, claims, signature] = jwt.split(".");
    expect(decode(header)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decode(claims)).toEqual({
      iss: account.key.client_email,
      scope: GSC_SCOPE,
      aud: TOKEN_URL,
      iat: 1_790_000_000,
      exp: 1_790_003_600,
    });
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${claims}`);
    expect(verifier.verify(account.publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  });
});

describe("getAccessToken", () => {
  it("exchanges the JWT for an access token", async () => {
    const fetch = fakeFetch(() => jsonResponse('{"access_token":"ya29.test","expires_in":3599}'));
    const token = await getAccessToken(account.key, fetch, 1_790_000_000);
    expect(token).toBe("ya29.test");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(TOKEN_URL);
    expect(init?.method).toBe("POST");
    const form = new URLSearchParams(String(init?.body));
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(form.get("assertion")?.split(".")).toHaveLength(3);
  });

  it("reports only the status and Google's error code on failure", async () => {
    const fetch = fakeFetch(() =>
      jsonResponse('{"error":"invalid_grant","error_description":"Invalid JWT Signature for key abc123"}', 400)
    );
    const error = await getAccessToken(account.key, fetch, 1_790_000_000).catch((e: unknown) => e);
    expect(String(error)).toContain("Search Console token request failed: HTTP 400 (invalid_grant)");
    expect(String(error)).not.toContain("abc123");
  });

  it("rejects an invalid error code without echoing it", async () => {
    const fetch = fakeFetch(() =>
      jsonResponse('{"error":"Invalid key id abc-123 for account"}', 400)
    );
    const error = await getAccessToken(account.key, fetch, 1_790_000_000).catch((e: unknown) => e);
    expect(String(error)).toContain("Search Console token request failed: HTTP 400");
    expect(String(error)).not.toContain("abc");
  });

  it("throws a fixed message when 200 response body is not JSON", async () => {
    const fetch = fakeFetch(() =>
      new Response("not json ya29.secret", { status: 200, headers: { "content-type": "application/json" } })
    );
    const error = await getAccessToken(account.key, fetch, 1_790_000_000).catch((e: unknown) => e);
    expect(String(error)).toContain("Search Console token response was not JSON");
    expect(String(error)).not.toContain("ya29");
  });
});

const QUERY_URL =
  "https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain%3Acurioword.com/searchAnalytics/query";
const WINDOW = { startDate: "2026-09-03", endDate: "2026-09-30" };
const row = (key: string) => ({ keys: [key], clicks: 1, impressions: 2, ctr: 0.5, position: 3 });

describe("searchConsoleWindow", () => {
  it("covers 28 days ending 3 days before the run", () => {
    expect(searchConsoleWindow(new Date("2026-10-03T06:00:00Z"))).toEqual(WINDOW);
    expect(searchConsoleWindow(new Date("2026-03-03T23:59:00Z"))).toEqual({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });
  });
});

describe("queryAll", () => {
  it("posts the query with the bearer token and paginates until a short page", async () => {
    const pages = [[row("a"), row("b")], [row("c")]];
    const fetch = fakeFetch(() => jsonResponse(JSON.stringify({ rows: pages.shift() })));
    const rows = await queryAll("ya29.test", ["page"], WINDOW, fetch, 2);
    expect(rows.map((r) => r.keys[0])).toEqual(["a", "b", "c"]);
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, init] = fetch.mock.calls[1];
    expect(url).toBe(QUERY_URL);
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer ya29.test");
    expect(JSON.parse(String(init?.body))).toEqual({
      ...WINDOW,
      dimensions: ["page"],
      type: "web",
      rowLimit: 2,
      startRow: 2,
    });
  });

  it("treats a response with no rows as empty", async () => {
    const fetch = fakeFetch(() => jsonResponse('{"responseAggregationType":"auto"}'));
    expect(await queryAll("t", ["query"], WINDOW, fetch)).toEqual([]);
  });

  it("names the dimension and Google's status on failure", async () => {
    const fetch = fakeFetch(() =>
      jsonResponse('{"error":{"code":403,"message":"User does not have sufficient permission","status":"PERMISSION_DENIED"}}', 403)
    );
    await expect(queryAll("t", ["page", "query"], WINDOW, fetch)).rejects.toThrow(
      "Search Console query (page+query) failed: HTTP 403 (PERMISSION_DENIED)"
    );
  });
});

describe("collectSearchConsole", () => {
  it("gets a token, then pulls by page, by query and by page and query", async () => {
    const fetch = fakeFetch(googleRoute);
    const data = await collectSearchConsole(account.key, {
      fetcher: fetch,
      now: new Date("2026-10-03T06:00:00Z"),
    });
    expect(data.site).toBe(GSC_SITE);
    expect(data.startDate).toBe("2026-09-03");
    expect(data.endDate).toBe("2026-09-30");
    expect(data.byPage).toHaveLength(4);
    expect(data.byQuery).toHaveLength(4);
    expect(data.byPageQuery).toHaveLength(5);
    expect(fetch.mock.calls[0][0]).toBe(TOKEN_URL);
  });
});
