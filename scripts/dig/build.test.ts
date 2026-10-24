import { describe, expect, it } from "vitest";
import { bufferDaysFrom, datesToBuild, summaryLines } from "./build";

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
});
