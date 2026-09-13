import { describe, it, expect } from "vitest";
import { bucketDatesByDay, cumulativeGrowth, computeRollingRetention } from "./adminStats";

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

describe("computeRollingRetention", () => {
  const today = new Date("2026-09-13T00:00:00Z");

  it("returns a null rate when no account is old enough to be eligible", () => {
    const users = [{ joinedAt: "2026-09-10", lastSeen: "2026-09-12" }]; // joined 3 days ago
    const result = computeRollingRetention(users, 7, today);
    expect(result).toEqual({ eligible: 0, active: 0, rate: null });
  });

  it("counts an eligible account as active when last seen within the window", () => {
    const users = [{ joinedAt: "2026-08-01", lastSeen: "2026-09-10" }]; // joined 43 days ago, seen 3 days ago
    const result = computeRollingRetention(users, 7, today);
    expect(result).toEqual({ eligible: 1, active: 1, rate: 1 });
  });

  it("counts an eligible account as inactive when never seen", () => {
    const users = [{ joinedAt: "2026-08-01", lastSeen: null }];
    const result = computeRollingRetention(users, 7, today);
    expect(result).toEqual({ eligible: 1, active: 0, rate: 0 });
  });

  it("counts an eligible account as inactive when last seen outside the window", () => {
    const users = [{ joinedAt: "2026-08-01", lastSeen: "2026-08-15" }]; // seen ~29 days ago
    const result = computeRollingRetention(users, 7, today);
    expect(result).toEqual({ eligible: 1, active: 0, rate: 0 });
  });

  it("computes a fractional rate across a mixed cohort", () => {
    const users = [
      { joinedAt: "2026-08-01", lastSeen: "2026-09-12" }, // eligible, active
      { joinedAt: "2026-08-01", lastSeen: "2026-08-02" }, // eligible, inactive
      { joinedAt: "2026-09-10", lastSeen: "2026-09-12" }, // not eligible yet
    ];
    const result = computeRollingRetention(users, 7, today);
    expect(result).toEqual({ eligible: 2, active: 1, rate: 0.5 });
  });
});
