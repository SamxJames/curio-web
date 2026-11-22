import { describe, expect, it } from "vitest";
import { buildGateReadoutMessage, gateDates, isGateReadoutDay, summarizeGate, type CohortRow } from "./gate";

const row = (date: string, p: Partial<CohortRow> = {}): CohortRow => ({
  date, newFinishers: 0, d1: 0, d7: 0, d8to13: 0, sharedNew: 0, sharedNewSheet: 0, finishVs: 0, finishVsNew: 0, reachedNew: 0, repeatSharers: 0, ...p,
});

describe("isGateReadoutDay", () => {
  it("is true on Mondays and on the gate day, false otherwise (UTC)", () => {
    expect(isGateReadoutDay(new Date("2026-11-23T09:00:00Z"))).toBe(true); // Monday
    expect(isGateReadoutDay(new Date("2026-12-04T09:00:00Z"))).toBe(true); // Friday, the gate
    expect(isGateReadoutDay(new Date("2026-11-24T09:00:00Z"))).toBe(false);
    expect(isGateReadoutDay(new Date("2026-12-05T09:00:00Z"))).toBe(false);
  });
});

describe("gateDates", () => {
  it("runs from the cohort start to the day before today", () => {
    expect(gateDates(new Date("2026-11-11T09:00:00Z"))).toEqual(["2026-11-08", "2026-11-09", "2026-11-10"]);
  });
  it("is empty before the cohort start", () => {
    expect(gateDates(new Date("2026-11-08T09:00:00Z"))).toEqual([]);
  });
});

describe("summarizeGate", () => {
  it("counts finishers, ignores today's partial row, and judges day-7 only on cohorts whose day 7 has passed", () => {
    const rows = [
      row("2026-11-08", { newFinishers: 100, d7: 20 }),
      row("2026-11-14", { newFinishers: 50, d7: 5 }), // day 7 is 11-21: complete when today is 11-22
      row("2026-11-15", { newFinishers: 40, d7: 40 }), // day 7 is 11-22 = today: not yet complete
      row("2026-11-22", { newFinishers: 999, d7: 999 }), // today: excluded
    ];
    const s = summarizeGate(rows, "2026-11-22");
    expect(s.finishers).toBe(190);
    expect(s.d7).toEqual({ finishers: 150, returned: 25, rate: 25 / 150 });
  });

  it("measures the share rate only from 2026-11-12, when the counter started", () => {
    const rows = [
      row("2026-11-10", { newFinishers: 100, sharedNew: 90 }),
      row("2026-11-12", { newFinishers: 40, sharedNew: 4 }),
      row("2026-11-13", { newFinishers: 60, sharedNew: 11 }),
    ];
    const s = summarizeGate(rows, "2026-11-20");
    expect(s.share).toEqual({ finishers: 100, shared: 15, rate: 0.15 });
    expect(s.finishers).toBe(200);
  });

  it("gives null rates, not 0%, when there is nothing to divide by", () => {
    const s = summarizeGate([], "2026-11-20");
    expect(s.finishers).toBe(0);
    expect(s.d7.rate).toBeNull();
    expect(s.share.rate).toBeNull();
  });
});

describe("buildGateReadoutMessage", () => {
  const rows = [
    row("2026-11-12", { newFinishers: 120, d7: 12, sharedNew: 30 }),
    row("2026-11-13", { newFinishers: 80, d7: 20, sharedNew: 10 }),
  ];

  it("states each line against its threshold with the real numbers", () => {
    const m = buildGateReadoutMessage(summarizeGate(rows, "2026-11-30"), "2026-11-30");
    expect(m.subject).toBe("curio dig gate readout: 200 first-time finishers, day-7 return 16%");
    expect(m.text).toContain("First-time finishers since 2026-11-08: 200 (need 200): met");
    expect(m.text).toContain("Day-7 return: 16% (32 of 200 finishers whose day 7 has passed; need 15%): met");
    expect(m.text).toContain("Share rate: 20% (40 of 200 finishers since 2026-11-12; need 15%): met");
    expect(m.text).toContain("4 days to the 2026-12-04 read");
  });

  it("says below and not yet rather than rounding a miss into a pass", () => {
    const low = [row("2026-11-12", { newFinishers: 150, d7: 10, sharedNew: 10 })];
    const m = buildGateReadoutMessage(summarizeGate(low, "2026-11-30"), "2026-11-30");
    expect(m.text).toContain("(need 200): not yet");
    expect(m.text).toContain("need 15%): below");
  });

  it("marks the gate day as the read, and says no data yet when a rate has no base", () => {
    const m = buildGateReadoutMessage(summarizeGate([], "2026-12-04"), "2026-12-04");
    expect(m.text).toContain("Today is the 2026-12-04 read");
    expect(m.text).toContain("Day-7 return: no data yet");
    expect(m.subject).toBe("curio dig gate readout: 0 first-time finishers, day-7 return no data yet");
  });

  it("never names a person: counts only", () => {
    const m = buildGateReadoutMessage(summarizeGate(rows, "2026-11-30"), "2026-11-30");
    expect(m.text).not.toMatch(/@/);
  });
});
