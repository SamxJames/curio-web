import { describe, expect, it } from "vitest";
import { SafeError, failureReason } from "./metaGraph";

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
