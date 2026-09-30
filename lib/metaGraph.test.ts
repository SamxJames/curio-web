import { describe, expect, it } from "vitest";
import { SafeError, containerId, failureReason, tokenLookupFailed } from "./metaGraph";

describe("tokenLookupFailed", () => {
  it("keeps the error name and drops the message", () => {
    const err = new Error('command was: ["set",{"token":"live"}]');
    err.name = "UpstashError";
    const safe = tokenLookupFailed(err);
    expect(safe).toBeInstanceOf(SafeError);
    expect(safe.message).toBe("token lookup failed (UpstashError)");
    expect(tokenLookupFailed("boom").message).toBe("token lookup failed (unknown)");
  });
});

describe("containerId", () => {
  it("returns a create call's id", () => {
    expect(containerId({ id: "c1" })).toBe("c1");
  });

  it.each([{}, { id: "" }, { id: 42 }])("throws a SafeError 'no container id' for %j", (body) => {
    expect(() => containerId(body)).toThrow(SafeError);
    expect(() => containerId(body)).toThrow("no container id");
  });
});

describe("failureReason", () => {
  it("keeps a SafeError message in full", () => {
    expect(failureReason(new SafeError("container ERROR"), "tok")).toBe("container ERROR");
  });

  it("reduces any other Error to its name", () => {
    expect(failureReason(new TypeError("fetch failed: ?access_token=tok"), "tok")).toBe("TypeError");
  });

  it("redacts the raw and the URL-encoded token from a SafeError message", () => {
    const token = "a+b/c=";
    const reason = failureReason(new SafeError(`bad ${token} and ${encodeURIComponent(token)}`), token);
    expect(reason).toBe("bad [redacted] and [redacted]");
  });

  it("reports a non-Error throw generically", () => {
    expect(failureReason("boom", null)).toBe("unknown error");
  });
});
