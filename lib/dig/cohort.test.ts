import { describe, expect, it } from "vitest";
import { COHORT_START, cohortDay, firstPlayDate, isNewPlayer, summarizeCohorts } from "./cohort";

const games = { "2026-11-08": { finishedAt: "2026-11-08T10:00:00Z" }, "2026-11-10": { finishedAt: "2026-11-10T09:00:00Z" } };
describe("cohorts", () => {
  it("first play is the earliest finish before today", () => {
    expect(firstPlayDate(games, "2026-11-15")).toBe("2026-11-08");
    expect(firstPlayDate(games, "2026-11-08")).toBeNull();
    expect(firstPlayDate({}, "2026-11-15")).toBeNull();
  });
  it("new means no earlier finish", () => {
    expect(isNewPlayer({}, "2026-11-08")).toBe(true);
    expect(isNewPlayer(games, "2026-11-08")).toBe(true);
    expect(isNewPlayer(games, "2026-11-09")).toBe(false);
  });
  it("cohort day is 1–60 whole days", () => {
    expect(cohortDay("2026-11-08", "2026-11-15")).toBe(7);
    expect(cohortDay("2026-11-08", "2026-11-08")).toBeNull();
    expect(cohortDay("2026-09-01", "2026-11-15")).toBeNull();
    expect(cohortDay("nonsense", "2026-11-15")).toBeNull();
    expect(cohortDay("2026-02-30", "2026-03-15")).toBeNull();
    expect(cohortDay("2026-11-31", "2026-12-05")).toBeNull();
  });
  const ZERO = { sharedNew: 0, finishVs: 0, finishVsNew: 0, reachedNew: 0, repeatSharers: 0 };
  it("summarizes new finishers and returns", () => {
    const rows = summarizeCohorts(
      { "2026-11-08": { d1: 4, d7: 2, d8: 1, d12: 1 } },
      { "2026-11-08": { "finish:new": 20 } },
      ["2026-11-08", "2026-11-09"],
    );
    expect(rows).toEqual([
      { date: "2026-11-08", newFinishers: 20, d1: 4, d7: 2, d8to13: 2, ...ZERO },
      { date: "2026-11-09", newFinishers: 0, d1: 0, d7: 0, d8to13: 0, ...ZERO },
    ]);
  });
  it("carries the share, challenge and prompt-4 counters", () => {
    const row = summarizeCohorts({}, { "2026-11-10": { "finish:new": 10, "shared:new": 3, "finish:vs": 4, "finish:vs:new": 2, "reached:4:new": 12, "shared:third": 1 } }, ["2026-11-10"])[0];
    expect(row).toMatchObject({ newFinishers: 10, sharedNew: 3, finishVs: 4, finishVsNew: 2, reachedNew: 12, repeatSharers: 1 });
  });
  it("hides dates before the cohort start", () => {
    const rows = summarizeCohorts({}, {}, ["2026-11-09", COHORT_START, "2026-11-07"]);
    expect(rows.map((r) => r.date)).toEqual(["2026-11-09", COHORT_START]);
  });
});
