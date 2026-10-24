import { describe, expect, it } from "vitest";
import { datesToBuild, summaryLines } from "./build";

describe("datesToBuild", () => {
  it("appends from the day after the last built date, never rebuilding, up to today + target", () => {
    expect(datesToBuild("2026-12-01", [], 3)).toEqual(["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04"]);
    expect(datesToBuild("2026-12-01", ["2026-12-01", "2026-12-02"], 3)).toEqual(["2026-12-03", "2026-12-04"]);
    expect(datesToBuild("2026-12-10", ["2026-12-01"], 1)).toEqual(["2026-12-10", "2026-12-11"]);
  });
});

describe("summaryLines", () => {
  it("prints counts only", () => {
    const lines = summaryLines({ themes: 210, origins: 33, letterVariants: 40, built: 7, retries: 2, failedDates: 0, bufferDays: 45, poolThemes: 120, poolOrigins: 20, wikidata: { fresh: 6, cached: 1, stale: 0, missing: 1, "label-mismatch": 0 }, adjudication: { judged: 3, accepted: 1, amendedDays: 2 } });
    expect(lines.join("\n")).toMatch(/Buffer: 45 days/);
    expect(lines.join("\n")).not.toMatch(/[a-z]+:[a-z-]+:/);
  });
});
