import { describe, expect, it } from "vitest";
import { bufferDaysFrom, datesToBuild, guardedAdjudication, heartbeatProblem, resolveSeedSalt, summaryLines } from "./build";

describe("datesToBuild", () => {
  it("returns every unbuilt date from today to today + target - 1, earliest first", () => {
    expect(datesToBuild("2026-12-01", [], 3)).toEqual(["2026-12-01", "2026-12-02", "2026-12-03"]);
    expect(datesToBuild("2026-12-01", ["2026-12-01", "2026-12-02"], 3)).toEqual(["2026-12-03"]);
    expect(datesToBuild("2026-12-10", ["2026-12-01"], 2)).toEqual(["2026-12-10", "2026-12-11"]);
  });

  it("fills a hole inside the built dates and never returns a built date", () => {
    expect(datesToBuild("2026-12-01", ["2026-12-01", "2026-12-03"], 4)).toEqual(["2026-12-02", "2026-12-04"]);
    expect(datesToBuild("2026-12-01", ["2026-12-01", "2026-12-02", "2026-12-03"], 3)).toEqual([]);
  });

  it("ignores built dates that are all before today", () => {
    expect(datesToBuild("2026-12-10", ["2026-11-01", "2026-11-02"], 2)).toEqual(["2026-12-10", "2026-12-11"]);
  });

  it("leaves dates beyond the window alone", () => {
    expect(datesToBuild("2026-12-01", ["2026-12-09"], 2)).toEqual(["2026-12-01", "2026-12-02"]);
  });
});

describe("bufferDaysFrom", () => {
  it("counts consecutive built days starting from today", () => {
    expect(bufferDaysFrom("2026-12-01", ["2026-12-01", "2026-12-02", "2026-12-03"])).toBe(3);
  });
  it("stops at the first hole, even when later days are built", () => {
    expect(bufferDaysFrom("2026-12-01", ["2026-12-01", "2026-12-02", "2026-12-04", "2026-12-05"])).toBe(2);
  });
  it("is zero when today itself is not built", () => {
    expect(bufferDaysFrom("2026-12-01", ["2026-12-02", "2026-12-03"])).toBe(0);
    expect(bufferDaysFrom("2026-12-10", ["2026-11-01"])).toBe(0);
  });
});

describe("summaryLines", () => {
  it("prints counts only", () => {
    const lines = summaryLines({ themes: 210, origins: 33, letterVariants: 40, built: 7, retries: 2, failedDates: 0, bufferDays: 45, poolThemes: 120, poolOrigins: 20, wikidata: { fresh: 6, cached: 1, stale: 0, missing: 1, "label-mismatch": 0 }, adjudication: { judged: 3, accepted: 1, amendedDays: 2 } });
    expect(lines.join("\n")).toMatch(/Buffer: 45 days/);
    expect(lines.join("\n")).not.toMatch(/[a-z]+:[a-z-]+:/);
  });
  it("shows a failed adjudication as failed", () => {
    const lines = summaryLines({ themes: 1, origins: 1, letterVariants: 0, built: 0, retries: 0, failedDates: 0, bufferDays: 45, poolThemes: 1, poolOrigins: 1, wikidata: { fresh: 0, cached: 0, stale: 0, missing: 0, "label-mismatch": 0 }, adjudication: "failed" });
    expect(lines.join("\n")).toMatch(/Adjudication: failed/);
  });
});

describe("resolveSeedSalt", () => {
  it("defaults to a fixed string without --publish, and uses the secret when given", () => {
    expect(resolveSeedSalt(false, undefined)).toBe("local-dev");
    expect(resolveSeedSalt(false, "")).toBe("local-dev");
    expect(resolveSeedSalt(false, "a-secret-of-some-length")).toBe("a-secret-of-some-length");
  });
  it("refuses to publish with a missing or short salt, naming the variable but never the value", () => {
    expect(() => resolveSeedSalt(true, undefined)).toThrow(/^DIG_SEED_SALT /);
    expect(() => resolveSeedSalt(true, "")).toThrow(/^DIG_SEED_SALT /);
    let message = "";
    try { resolveSeedSalt(true, "shortvalue"); } catch (e) { message = (e as Error).message; }
    expect(message).toMatch(/16 characters/);
    expect(message).not.toContain("shortvalue");
    expect(resolveSeedSalt(true, "0123456789abcdef")).toBe("0123456789abcdef");
  });
});

describe("heartbeatProblem", () => {
  const now = Date.parse("2026-12-10T04:00:00Z");
  it("is fine for a fresh heartbeat and stale for an old or unparseable one", () => {
    expect(heartbeatProblem("2026-12-09T07:00:00Z", ["2026-12-01"], "2026-12-10", now)).toBeNull();
    expect(heartbeatProblem("2026-12-01T07:00:00Z", ["2026-12-01"], "2026-12-10", now)).toMatch(/stale/);
    expect(heartbeatProblem("garbage", ["2026-12-09"], "2026-12-10", now)).toMatch(/stale/);
  });
  it("fails a missing heartbeat only once the oldest built day is more than 3 days old", () => {
    expect(heartbeatProblem(null, [], "2026-12-10", now)).toBeNull(); // very first run
    expect(heartbeatProblem(null, ["2026-12-10", "2026-12-11"], "2026-12-10", now)).toBeNull();
    expect(heartbeatProblem(null, ["2026-12-07", "2026-12-10"], "2026-12-10", now)).toBeNull(); // exactly 3 days
    expect(heartbeatProblem(null, ["2026-12-09", "2026-12-06"], "2026-12-10", now)).toMatch(/missing/);
  });
});

describe("guardedAdjudication", () => {
  it("passes a result through, and turns a throw into a failure with a safe message", async () => {
    const result = { judged: 1, accepted: 0, amendedDays: 0, skippedOversize: 0, skippedTypo: 0 };
    expect(await guardedAdjudication(async () => result)).toEqual({ ok: true, result });
    const known = await guardedAdjudication(async () => { throw new Error("adjudicate: day 2026-12-01 unreadable"); });
    expect(known).toEqual({ ok: false, message: "adjudicate: day 2026-12-01 unreadable" });
    const unknown = await guardedAdjudication(async () => { throw new Error("value quoted: secretword"); });
    expect(unknown.ok).toBe(false);
    expect(JSON.stringify(unknown)).not.toContain("secretword");
  });
});
