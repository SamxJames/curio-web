import { describe, expect, it } from "vitest";
import { killLineDates, killLineText, summarizeDigFunnel } from "./funnel";

const LAUNCH = "2026-12-01";
// Window for LAUNCH is 2026-12-22 .. 2026-12-28; it has fully passed from 2026-12-29 onward.
const AFTER_WINDOW = new Date("2026-12-30T00:00:00Z");
const WINDOW = ["2026-12-22", "2026-12-23", "2026-12-24", "2026-12-25", "2026-12-26", "2026-12-27", "2026-12-28"];

/** Each number is that day's returning starts; total starts are four times as many. */
function windowDays(returning: (number | undefined)[]): Record<string, Record<string, number>> {
  const days: Record<string, Record<string, number>> = {};
  returning.forEach((n, i) => {
    if (n !== undefined) days[WINDOW[i]] = { start: n * 4, "start:ret:d1": n - Math.floor(n / 2), "start:ret:d2_6": Math.floor(n / 2) };
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
    expect(s.rows).toEqual([{ date: "2026-12-02", land: 7, start: 4, finish: 3, share: 2, story: 1, signup: 1, past: 2, returning: 0, returnShare: 0, via: {} }]);
    expect(s.killLine).toBeNull();
  });

  it("collects via counts per row", () => {
    const s = summarizeDigFunnel({ "2026-12-02": { "via:nav": 3, "via:home": 2, start: 1 } }, null, { now: new Date("2026-12-03T00:00:00Z"), rowDates: ["2026-12-02"] });
    expect(s.rows[0].via).toEqual({ nav: 3, home: 2 });
  });

  it("sums returning starts and gives the share of all starts", () => {
    const days = { "2026-11-08": { start: 40, "start:ret:d1": 6, "start:ret:d2_6": 3, "start:ret:d7": 1 }, "2026-11-09": { land: 3 } };
    const { rows } = summarizeDigFunnel(days, null, { now: new Date("2026-11-10T12:00:00Z"), rowDates: ["2026-11-08", "2026-11-09"] });
    const r8 = rows.find((r) => r.date === "2026-11-08")!, r9 = rows.find((r) => r.date === "2026-11-09")!;
    expect(r8.returning).toBe(10);
    expect(r8.returnShare).toBe(25);
    expect(r9.returning).toBe(0);
    expect(r9.returnShare).toBeNull();
  });

  it("takes the median daily returning starts over days 22–28 after launch", () => {
    const days = windowDays([30, 10, 20, 25, 15, 18, 22]);
    expect(summarizeDigFunnel(days, LAUNCH, { now: AFTER_WINDOW, rowDates: [] }).killLine).toBe(20);
  });

  it("ignores total starts: a busy window with no returners reads 0", () => {
    const days: Record<string, Record<string, number>> = {};
    WINDOW.forEach((d) => { days[d] = { start: 90 }; });
    const s = summarizeDigFunnel(days, LAUNCH, { now: AFTER_WINDOW, rowDates: [] });
    expect(s.killLine).toBe(0);
    expect(s.killReturnShare).toBe(0);
  });

  it("shows the window's returning share of starts alongside", () => {
    const days = windowDays([8, 8, 8, 8, 8, 8, 8]);
    expect(summarizeDigFunnel(days, LAUNCH, { now: AFTER_WINDOW, rowDates: [] }).killReturnShare).toBe(25);
    expect(summarizeDigFunnel(days, LAUNCH, { now: new Date("2026-12-28T12:00:00Z"), rowDates: [] }).killReturnShare).toBeNull();
  });

  it("stays null until the whole window has passed", () => {
    const days = windowDays([20, 20, 20, 20, 20, 20, 20]);
    // 2026-12-28 is the last window day; it is not before 2026-12-28, so the window is still open.
    expect(summarizeDigFunnel(days, LAUNCH, { now: new Date("2026-12-28T12:00:00Z"), rowDates: [] }).killLine).toBeNull();
    expect(summarizeDigFunnel(days, LAUNCH, { now: new Date("2026-12-29T00:00:00Z"), rowDates: [] }).killLine).toBe(20);
  });

  it("counts an absent window day as 0 returning starts", () => {
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
    expect(s).toEqual({ rows: [], killLine: null, killReturnShare: null });
  });
});

describe("killLineDates", () => {
  it("returns seven consecutive dates starting launch + 21", () => {
    expect(killLineDates(LAUNCH)).toEqual(WINDOW);
  });
});

describe("killLineText", () => {
  it("states the new rule with the share beside it", () => {
    expect(killLineText(7, 31.4)).toBe("Kill line (median daily returning starts, days 22–28 after launch): 7; below 5 means stop. Returning share of starts: 31.4% (target 30% or more; informs the call, does not trigger it).");
  });
  it("says not yet before the window has passed", () => {
    expect(killLineText(null, null)).toBe("Kill line (median daily returning starts, days 22–28 after launch): not yet; below 5 means stop. Returning share of starts: not yet (target 30% or more; informs the call, does not trigger it).");
  });
});
