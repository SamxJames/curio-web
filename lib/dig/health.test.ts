import { describe, expect, it } from "vitest";
import { estimateEdgeRequests, evaluateHealth, usageAlert } from "./health";

const manifest = (lastDay: string, lastRun: string) => ({ v: 1 as const, lastRun, days: { [lastDay]: [] }, poolThemes: 50, poolOrigins: 10 });
const now = new Date("2026-12-10T07:00:00Z");

describe("evaluateHealth", () => {
  it("is quiet when everything is fine, or before the pipeline has ever run pre-launch", () => {
    expect(evaluateHealth({ today: "2026-12-10", manifest: manifest("2027-01-20", "2026-12-07T04:30:00Z"), todayExists: true, tomorrowExists: true, launch: "2026-12-01", now })).toEqual([]);
    expect(evaluateHealth({ today: "2026-12-10", manifest: null, todayExists: false, tomorrowExists: false, launch: null, now })).toEqual([]);
  });
  it("names every problem in plain words, counts only", () => {
    const problems = evaluateHealth({ today: "2026-12-10", manifest: manifest("2026-12-20", "2026-11-28T04:30:00Z"), todayExists: false, tomorrowExists: false, launch: "2026-12-01", now });
    expect(problems).toEqual([
      "Today's dig is missing, so /dig shows an error.",
      "Tomorrow's dig is missing.",
      "Only 10 days are built ahead (alert below 14).",
      "The pipeline last published 12 days ago (alert after 9).",
    ]);
  });
});

describe("usage", () => {
  it("estimates edge requests from first-party counters", () => {
    expect(estimateEdgeRequests(1000, 2000)).toBe(8000 + 12000);
  });
  it("alerts once at 50% and once at 70%, with a projected date", () => {
    const mid = new Date("2026-12-10T07:00:00Z");
    expect(usageAlert({ estimated: 400_000, now: mid, alreadySent: 0 })).toBeNull();
    const a = usageAlert({ estimated: 520_000, now: mid, alreadySent: 0 })!;
    expect(a.level).toBe(50);
    expect(a.message).toContain("52%");
    expect(a.message).toContain("20 December");
    expect(usageAlert({ estimated: 520_000, now: mid, alreadySent: 50 })).toBeNull();
    expect(usageAlert({ estimated: 720_000, now: mid, alreadySent: 50 })!.level).toBe(70);
  });
});

describe("health edge cases", () => {
  it("treats an unreadable manifest lastRun as stale, not fresh", () => {
    const p = evaluateHealth({ today: "2026-12-10", manifest: manifest("2027-01-20", "not a date"), todayExists: true, tomorrowExists: true, launch: "2026-12-01", now });
    expect(p).toContain("The pipeline manifest has no readable last-run time.");
  });

  it("says the allowance is already passed instead of naming a past date", () => {
    const a = usageAlert({ estimated: 1_100_000, now: new Date("2026-12-20T07:00:00Z"), alreadySent: 0 });
    expect(a!.message).toContain("already past the monthly allowance");
  });
});
