import { describe, it, expect } from "vitest";
import { bucketDatesByDay, cumulativeGrowth } from "./adminStats";

describe("bucketDatesByDay", () => {
  it("returns an empty list for no dates", () => {
    expect(bucketDatesByDay([])).toEqual([]);
  });

  it("collapses repeated dates into one row with the right count", () => {
    const result = bucketDatesByDay(["2026-09-01", "2026-09-01", "2026-09-01"]);
    expect(result).toEqual([{ date: "2026-09-01", count: 3 }]);
  });

  it("sorts distinct dates ascending regardless of input order", () => {
    const result = bucketDatesByDay(["2026-09-03", "2026-09-01", "2026-09-02"]);
    expect(result.map((r) => r.date)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
  });

  it("counts each distinct date independently", () => {
    const result = bucketDatesByDay(["2026-09-01", "2026-09-02", "2026-09-02"]);
    expect(result).toEqual([
      { date: "2026-09-01", count: 1 },
      { date: "2026-09-02", count: 2 },
    ]);
  });
});

describe("cumulativeGrowth", () => {
  it("returns an empty list for no daily counts", () => {
    expect(cumulativeGrowth([])).toEqual([]);
  });

  it("runs a total across dates in order", () => {
    const daily = [
      { date: "2026-09-01", count: 3 },
      { date: "2026-09-02", count: 1 },
      { date: "2026-09-03", count: 5 },
    ];
    expect(cumulativeGrowth(daily)).toEqual([
      { date: "2026-09-01", total: 3 },
      { date: "2026-09-02", total: 4 },
      { date: "2026-09-03", total: 9 },
    ]);
  });
});
