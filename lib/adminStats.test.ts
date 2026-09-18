import { describe, it, expect } from "vitest";
import {
  bucketDatesByDay,
  cumulativeGrowth,
  computeRollingRetention,
  summarizePuzzleEngagement,
  buildAccountSummaries,
} from "./adminStats";
import type { PlayState } from "./storage";

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

  it("treats an account joined exactly windowDays ago as eligible", () => {
    const users = [{ joinedAt: "2026-09-06", lastSeen: null }]; // exactly 7 days before today
    const result = computeRollingRetention(users, 7, today);
    expect(result.eligible).toBe(1);
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

function playState(overrides: Partial<PlayState>): PlayState {
  return {
    puzzleDate: "2026-09-13",
    cluesRevealed: 1,
    status: "playing",
    cluesUsedToSolve: null,
    ...overrides,
  };
}

describe("summarizePuzzleEngagement", () => {
  it("returns all zeros for no plays", () => {
    expect(summarizePuzzleEngagement([])).toEqual({
      totalPlays: 0,
      solved: 0,
      failed: 0,
      inProgress: 0,
      histogram: [0, 0, 0, 0],
    });
  });

  it("tallies solved plays into the histogram by clues used", () => {
    const states = [
      playState({ status: "solved", cluesUsedToSolve: 1 }),
      playState({ status: "solved", cluesUsedToSolve: 1 }),
      playState({ status: "solved", cluesUsedToSolve: 3 }),
    ];
    const result = summarizePuzzleEngagement(states);
    expect(result.solved).toBe(3);
    expect(result.histogram).toEqual([2, 0, 1, 0]);
  });

  it("tallies failed plays into the histogram's 4th slot", () => {
    const states = [playState({ status: "failed" }), playState({ status: "failed" })];
    const result = summarizePuzzleEngagement(states);
    expect(result.failed).toBe(2);
    expect(result.histogram).toEqual([0, 0, 0, 2]);
  });

  it("counts in-progress plays separately, with no histogram entry", () => {
    const states = [playState({ status: "playing" })];
    const result = summarizePuzzleEngagement(states);
    expect(result.inProgress).toBe(1);
    expect(result.histogram).toEqual([0, 0, 0, 0]);
  });

  it("counts totalPlays as every play regardless of status", () => {
    const states = [
      playState({ status: "solved", cluesUsedToSolve: 2 }),
      playState({ status: "failed" }),
      playState({ status: "playing" }),
    ];
    expect(summarizePuzzleEngagement(states).totalPlays).toBe(3);
  });

  it("still counts a solved play as solved even with a corrupted null cluesUsedToSolve", () => {
    const states = [playState({ status: "solved", cluesUsedToSolve: null })];
    const result = summarizePuzzleEngagement(states);
    expect(result.solved).toBe(1);
    expect(result.inProgress).toBe(0);
    expect(result.histogram).toEqual([0, 0, 0, 0]);
  });
});

describe("buildAccountSummaries", () => {
  it("pairs each account with its email, most recently joined first", () => {
    const activity = [
      { userId: "u1", joinedAt: "2026-09-01", lastSeen: "2026-09-10" },
      { userId: "u2", joinedAt: "2026-09-15", lastSeen: null },
    ];
    const emails = { u1: "a@example.com", u2: "b@example.com" };
    const result = buildAccountSummaries(activity, emails);
    expect(result).toEqual([
      { userId: "u2", email: "b@example.com", joinedAt: "2026-09-15", lastSeen: null },
      { userId: "u1", email: "a@example.com", joinedAt: "2026-09-01", lastSeen: "2026-09-10" },
    ]);
  });

  it("uses null for an account whose email lookup failed or is missing", () => {
    const activity = [{ userId: "u1", joinedAt: "2026-09-01", lastSeen: null }];
    const result = buildAccountSummaries(activity, {});
    expect(result[0].email).toBeNull();
  });

  it("returns an empty list for no accounts", () => {
    expect(buildAccountSummaries([], {})).toEqual([]);
  });
});
