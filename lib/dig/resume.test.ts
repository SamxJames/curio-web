import { describe, expect, it } from "vitest";
import { ANSWER_SECONDS, READ_SECONDS, initialGame, resumeGame, toSavedRun, type GameState } from "./game";

const empty = () => ({ answer: null, tier: null, rejected: [], lastGuess: null });
const results = () => Array.from({ length: 7 }, empty);

function playing(over: Partial<GameState>): GameState {
  return { ...initialGame(), results: results(), ...over };
}

describe("toSavedRun / resumeGame", () => {
  it("saves nothing before the start or after the end", () => {
    expect(toSavedRun("2026-11-07", initialGame(), [])).toBeNull();
    expect(toSavedRun("2026-11-07", playing({ phase: "done" }), [])).toBeNull();
  });

  it("comes back to a revealed prompt as revealed, with its result and pass", () => {
    const r = results();
    r[2] = { answer: "mead", tier: "familiar", rejected: ["mud"], lastGuess: "mud" };
    const run = toSavedRun("2026-11-07", playing({ phase: "reveal", current: 2, results: r }), [1]);
    const back = resumeGame(JSON.parse(JSON.stringify(run)), "2026-11-07", 7);
    expect(back?.state.phase).toBe("reveal");
    expect(back?.state.current).toBe(2);
    expect(back?.state.results[2].answer).toBe("mead");
    expect(back?.passed).toEqual([1]);
  });

  it("restarts an unanswered prompt with a fresh read pause", () => {
    const run = toSavedRun("2026-11-07", playing({ phase: "answering", current: 4, clock: 3 }), []);
    const back = resumeGame(run, "2026-11-07", 7);
    expect(back?.state).toMatchObject({ phase: "reading", current: 4, clock: READ_SECONDS });
    expect(ANSWER_SECONDS).toBeGreaterThan(READ_SECONDS);
  });

  it("goes straight to answering with No timer", () => {
    const run = toSavedRun("2026-11-07", playing({ phase: "reading", current: 1, noTimer: true }), []);
    expect(resumeGame(run, "2026-11-07", 7)?.state).toMatchObject({ phase: "answering", clock: 0, noTimer: true });
  });

  it("ignores another day's run and anything malformed", () => {
    const run = toSavedRun("2026-11-06", playing({ phase: "reveal", current: 0 }), []);
    expect(resumeGame(run, "2026-11-07", 7)).toBeNull();
    expect(resumeGame(null, "2026-11-07", 7)).toBeNull();
    expect(resumeGame({ ...run, date: "2026-11-07", current: 9 }, "2026-11-07", 7)).toBeNull();
    expect(resumeGame({ ...run, date: "2026-11-07", results: [{ answer: 3 }] }, "2026-11-07", 7)).toBeNull();
    expect(resumeGame({ ...run, date: "2026-11-07", results: results().map(() => ({ ...empty(), tier: "gold" })) }, "2026-11-07", 7)).toBeNull();
  });
});
