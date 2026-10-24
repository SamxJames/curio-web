import { describe, expect, it } from "vitest";
import { killLineDates, summarizeDigFunnel } from "./funnel";

const LAUNCH = "2026-12-01";
// Window for LAUNCH is 2026-12-22 .. 2026-12-28; it has fully passed from 2026-12-29 onward.
const AFTER_WINDOW = new Date("2026-12-30T00:00:00Z");
const WINDOW = ["2026-12-22", "2026-12-23", "2026-12-24", "2026-12-25", "2026-12-26", "2026-12-27", "2026-12-28"];

function windowDays(starts: (number | undefined)[]): Record<string, Record<string, number>> {
  const days: Record<string, Record<string, number>> = {};
  starts.forEach((n, i) => {
    if (n !== undefined) days[WINDOW[i]] = { start: n };
  });
  return days;
}

describe("summarizeDigFunnel", () => {
  it("rolls fields into funnel rows, newest first", () => {
    const s = summarizeDigFunnel(
      {
        "2026-12-02": { "land:direct": 5, "land:share": 2, start: 4, finish: 3, "share:text": 1, "share:image": 1, story: 1, signup: 1, "past:start": 2 },
      },
      LAUNCH,
      { now: new Date("2026-12-03T12:00:00Z"), rowDates: ["2026-12-02"] },
    );
    expect(s.rows).toEqual([{ date: "2026-12-02", land: 7, start: 4, finish: 3, share: 2, story: 1, signup: 1, past: 2 }]);
    expect(s.killLine).toBeNull();
  });

  it("takes the median daily start over days 22–28 after launch", () => {
    const days = windowDays([30, 10, 20, 25, 15, 18, 22]);
    expect(summarizeDigFunnel(days, LAUNCH, { now: AFTER_WINDOW, rowDates: [] }).killLine).toBe(20);
  });

  it("stays null until the whole window has passed", () => {
    const days = windowDays([20, 20, 20, 20, 20, 20, 20]);
    // 2026-12-28 is the last window day; it is not before 2026-12-28, so the window is still open.
    expect(summarizeDigFunnel(days, LAUNCH, { now: new Date("2026-12-28T12:00:00Z"), rowDates: [] }).killLine).toBeNull();
    expect(summarizeDigFunnel(days, LAUNCH, { now: new Date("2026-12-29T00:00:00Z"), rowDates: [] }).killLine).toBe(20);
  });

  it("counts an absent window day as 0 starts", () => {
    // Six days of 30 and one absent day (0 starts): sorted [0,30,30,30,30,30,30], median 30.
    const days = windowDays([30, 30, undefined, 30, 30, 30, 30]);
    expect(summarizeDigFunnel(days, LAUNCH, { now: AFTER_WINDOW, rowDates: [] }).killLine).toBe(30);
  });

  it("counts an absent window day as 0 when it sits in the low half", () => {
    // Sorted [0,5,5,5,40,40,40], median 5.
    const days = windowDays([undefined, 5, 5, 5, 40, 40, 40]);
    expect(summarizeDigFunnel(days, LAUNCH, { now: AFTER_WINDOW, rowDates: [] }).killLine).toBe(5);
  });

  it("builds rows only for rowDates that have data", () => {
    const days = {
      "2026-12-02": { start: 1 },
      "2026-11-30": { start: 2 },
      "2026-12-20": { start: 3 },
    };
    const s = summarizeDigFunnel(days, LAUNCH, {
      now: new Date("2026-12-21T00:00:00Z"),
      rowDates: ["2026-12-02", "2026-12-20", "2026-12-21"],
    });
    expect(s.rows.map((r) => r.date)).toEqual(["2026-12-20", "2026-12-02"]);
  });

  it("returns no rows when launch is null and nothing is in rowDates", () => {
    const s = summarizeDigFunnel({}, null, { now: AFTER_WINDOW, rowDates: [] });
    expect(s).toEqual({ rows: [], killLine: null });
  });
});

describe("killLineDates", () => {
  it("returns seven consecutive dates starting launch + 21", () => {
    expect(killLineDates(LAUNCH)).toEqual(WINDOW);
  });
});
