import { createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GSC_SCOPE, TOKEN_URL, buildJwt, getAccessToken, loadServiceAccountKey } from "./searchConsole";
import { fakeFetch, jsonResponse, testServiceAccount } from "./testing";

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
});
