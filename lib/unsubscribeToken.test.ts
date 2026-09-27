import { afterEach, describe, expect, it, vi } from "vitest";
import {
  maskEmail,
  signUnsubscribeToken,
  unsubscribeSecret,
  verifyUnsubscribeToken,
} from "./unsubscribeToken";

const SECRET = "test-secret-a";

describe("unsubscribe tokens", () => {
  it("round-trips, normalising the address", () => {
    const token = signUnsubscribeToken("  Sam@Example.com ", SECRET);
    expect(verifyUnsubscribeToken(token, SECRET)).toBe("sam@example.com");
  });

  it("is base64url(email) + '.' + base64url(32-byte HMAC-SHA256)", () => {
    const [payload, sig] = signUnsubscribeToken("a@b.co", SECRET).split(".");
    expect(Buffer.from(payload, "base64url").toString("utf-8")).toBe("a@b.co");
    expect(Buffer.from(sig, "base64url")).toHaveLength(32);
  });

  it("rejects a tampered payload (someone else's address with a valid signature)", () => {
    const [, sig] = signUnsubscribeToken("attacker@example.com", SECRET).split(".");
    const forged = `${Buffer.from("victim@example.com").toString("base64url")}.${sig}`;
    expect(verifyUnsubscribeToken(forged, SECRET)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const [payload, sig] = signUnsubscribeToken("sam@example.com", SECRET).split(".");
    const bytes = Buffer.from(sig, "base64url");
    bytes[0] ^= 1;
    expect(verifyUnsubscribeToken(`${payload}.${bytes.toString("base64url")}`, SECRET)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signUnsubscribeToken("sam@example.com", "test-secret-b");
    expect(verifyUnsubscribeToken(token, SECRET)).toBeNull();
  });

  it("rejects the legacy unsigned base64url(email) token", () => {
    const legacy = Buffer.from("sam@example.com").toString("base64url");
    expect(verifyUnsubscribeToken(legacy, SECRET)).toBeNull();
  });

  it.each(["", ".", "abc.", ".abc", "a.b.c"])("rejects malformed token %j", (token) => {
    expect(verifyUnsubscribeToken(token, SECRET)).toBeNull();
  });

  it("rejects a signed payload that isn't an email address", () => {
    const [, sig] = signUnsubscribeToken("not-an-email", SECRET).split(".");
    expect(verifyUnsubscribeToken(`${Buffer.from("not-an-email").toString("base64url")}.${sig}`, SECRET)).toBeNull();
  });
});

describe("maskEmail", () => {
  it("keeps the first character and the domain", () => {
    expect(maskEmail("sam@gmail.com")).toBe("s***@gmail.com");
    expect(maskEmail("x@example.org")).toBe("x***@example.org");
  });
});

describe("unsubscribeSecret", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses UNSUBSCRIBE_SECRET when it's set", () => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", "from-env");
    expect(unsubscribeSecret()).toBe("from-env");
  });

  it("is null in production when unset, so callers fail closed", () => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(unsubscribeSecret()).toBeNull();
  });

  it("falls back to a fixed dev-only secret outside production", () => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(unsubscribeSecret()).toEqual(expect.any(String));
    expect(unsubscribeSecret()).not.toBe("");
  });
});
