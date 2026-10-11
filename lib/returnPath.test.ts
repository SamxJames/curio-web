import { describe, expect, it } from "vitest";
import { loginHref, safeReturnPath } from "./returnPath";

describe("safeReturnPath", () => {
  it("keeps a same-site path", () => {
    expect(safeReturnPath("/story/culvert")).toBe("/story/culvert");
    expect(safeReturnPath("/play")).toBe("/play");
  });

  it("falls back to home for anything off-site or missing", () => {
    for (const raw of [null, undefined, "", "https://evil.example", "//evil.example", "/\\evil.example", "story/x"]) {
      expect(safeReturnPath(raw)).toBe("/");
    }
  });

  it("never returns to the login page or an API route", () => {
    expect(safeReturnPath("/login")).toBe("/");
    expect(safeReturnPath("/login?next=/play")).toBe("/");
    expect(safeReturnPath("/api/auth/device-link")).toBe("/");
  });
});

describe("loginHref", () => {
  it("carries the current page", () => {
    expect(loginHref("/story/culvert")).toBe("/login?next=%2Fstory%2Fculvert");
  });

  it("is plain /login from home or the login page", () => {
    expect(loginHref("/")).toBe("/login");
    expect(loginHref("/login")).toBe("/login");
    expect(loginHref(null)).toBe("/login");
  });
});
