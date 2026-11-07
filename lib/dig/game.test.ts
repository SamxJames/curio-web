import { describe, expect, it, vi } from "vitest";
import { ANSWER_SECONDS, createReducer, initialGame, prepareDay, resultTiers, type GameState } from "./game";
import { parseDigEvent } from "./events";
import { encodeDay } from "./payload";
import { devDay } from "./devDay";
import { scoreOf } from "./score";
import { effectiveNoTimer, markReported, parseStore, readStore, saveGame, setNoTimer, withGame, type StoredGame } from "./storage";

const day = prepareDay({ ...encodeDay(devDay("2026-12-05")), number: 5 });
const reduce = createReducer(day);
const run = (s: GameState, ...actions: Parameters<typeof reduce>[1][]) => actions.reduce(reduce, s);

describe("prepareDay", () => {
  it("decodes every prompt and builds its lookup", () => {
    expect(day.prompts[0].text).toBe("Name a fruit");
    expect(day.secrets[0].fossil.word).toBe("pawpaw");
    expect(day.lookups[0].keys.get("apple")).toBe(0);
  });
});

describe("timer action", () => {
  const started = run(initialGame(), { type: "start", noTimer: false });
  it("answering -> No timer stops the clock and stays answering", () => {
    const s = { ...started, phase: "answering" as const, clock: 12 };
    expect(reduce(s, { type: "timer", noTimer: true })).toMatchObject({ phase: "answering", noTimer: true, clock: 0 });
  });
  it("answering -> timer on restarts the prompt clock at 25", () => {
    const s = { ...started, phase: "answering" as const, noTimer: true, clock: 0 };
    expect(reduce(s, { type: "timer", noTimer: false })).toMatchObject({ phase: "answering", noTimer: false, clock: ANSWER_SECONDS });
  });
  it("reading -> No timer goes straight to answering", () => {
    const s = { ...started, phase: "reading" as const, clock: 2 };
    expect(reduce(s, { type: "timer", noTimer: true })).toMatchObject({ phase: "answering", noTimer: true, clock: 0 });
  });
  it("reading -> timer on leaves phase and clock alone", () => {
    const s = { ...started, phase: "reading" as const, noTimer: true, clock: 2 };
    expect(reduce(s, { type: "timer", noTimer: false })).toMatchObject({ phase: "reading", noTimer: false, clock: 2 });
  });
  it("reveal: only records the setting; next prompt honours it", () => {
    const r = reduce({ ...started, phase: "reveal" as const }, { type: "timer", noTimer: true });
    expect(r.phase).toBe("reveal");
    expect(reduce(r, { type: "next" })).toMatchObject({ phase: "answering", noTimer: true });
  });
  it("is ignored in intro and done", () => {
    expect(reduce(initialGame(), { type: "timer", noTimer: true }).noTimer).toBe(false);
    const done = { ...started, phase: "done" as const };
    expect(reduce(done, { type: "timer", noTimer: true })).toBe(done);
  });
});

describe("game reducer", () => {
  it("reads for 3 seconds, then answers for 25", () => {
    let s = run(initialGame(), { type: "start", noTimer: false });
    expect(s).toMatchObject({ phase: "reading", clock: 3 });
    s = run(s, { type: "tick" }, { type: "tick" }, { type: "tick" });
    expect(s).toMatchObject({ phase: "answering", clock: ANSWER_SECONDS });
  });
  it("skips the read pause and ignores ticks with No timer", () => {
    const s = run(initialGame(), { type: "start", noTimer: true }, { type: "tick" });
    expect(s).toMatchObject({ phase: "answering", clock: 0 });
  });
  it("locks in a match and moves to the reveal", () => {
    const s = run(initialGame(), { type: "start", noTimer: true }, { type: "submit", guess: "Apples" });
    expect(s.phase).toBe("reveal");
    expect(s.results[0]).toMatchObject({ answer: "apple", tier: "common" });
  });
  it("suggests a near miss, accepts it on the same guess, and judges a new guess on its own", () => {
    let s = run(initialGame(), { type: "start", noTimer: true }, { type: "submit", guess: "persimon" });
    expect(s.feedback).toEqual({ kind: "near", guess: "persimon", suggestion: "persimmon", index: 7 });
    s = run(s, { type: "submit", guess: "persimon" });
    expect(s.results[0]).toMatchObject({ answer: "persimmon", tier: "uncommon" });
    let t = run(initialGame(), { type: "start", noTimer: true }, { type: "submit", guess: "persimon" }, { type: "submit", guess: "zzzz" });
    expect(t.feedback).toEqual({ kind: "miss", guess: "zzzz" });
    t = run(t, { type: "submit", guess: "plum" });
    expect(t.results[0].tier).toBe("familiar");
  });
  it("keeps at most 3 distinct rejected guesses", () => {
    const s = run(initialGame(), { type: "start", noTimer: true },
      ...["zzzz", "ZZZZ", "yyyy", "xxxx", "wwww"].map((guess) => ({ type: "submit" as const, guess })));
    expect(s.results[0].rejected).toEqual(["zzzz", "yyyy", "xxxx"]);
    expect(s.results[0].lastGuess).toBe("wwww");
  });
  it("keeps the display form of a rejected guess and dedupes by key", () => {
    const s = run(initialGame(), { type: "start", noTimer: true },
      { type: "submit", guess: " Ice cream " }, { type: "submit", guess: "ICECREAM" },
      { type: "submit", guess: "zzzz" }, { type: "submit", guess: "Z Z Z Z" });
    expect(s.results[0].rejected).toEqual(["Ice cream", "zzzz"]);
    expect(s.results[0].lastGuess).toBe("Z Z Z Z");
  });
  it("keeps the accents of a rejected guess in state", () => {
    const s = run(initialGame(), { type: "start", noTimer: true }, { type: "submit", guess: "Crème brûlée" });
    expect(s.results[0].rejected).toEqual(["Crème brûlée"]);
  });
  it("pass locks an empty layer with No timer on", () => {
    const s = run(initialGame(), { type: "start", noTimer: true }, { type: "pass" });
    expect(s.phase).toBe("reveal");
    expect(s.results[0]).toMatchObject({ answer: null, tier: null });
  });
  it("pass locks an empty layer with the timer on, and is ignored while reading", () => {
    let s = run(initialGame(), { type: "start", noTimer: false }, { type: "pass" });
    expect(s).toMatchObject({ phase: "reading" });
    s = run(s, { type: "tick" }, { type: "tick" }, { type: "tick" }, { type: "pass" });
    expect(s.phase).toBe("reveal");
    expect(s.results[0]).toMatchObject({ answer: null, tier: null });
  });
  it("times out to an empty layer and finishes after the seventh prompt", () => {
    let s = run(initialGame(), { type: "start", noTimer: false });
    for (let i = 0; i < 3 + ANSWER_SECONDS; i++) s = run(s, { type: "tick" });
    expect(s.phase).toBe("reveal");
    expect(s.results[0].answer).toBeNull();
    for (let i = 0; i < 6; i++) s = run(s, { type: "next" }, { type: "tick" }, { type: "tick" }, { type: "tick" }, { type: "submit", guess: day.secrets[i + 1].fossil.word });
    s = run(s, { type: "next" });
    expect(s.phase).toBe("done");
    expect(resultTiers(s)).toEqual([null, "fossil", "fossil", "fossil", "fossil", "fossil", "fossil"]);
  });
  it("sends a finish that parses even after more than 21 misses", () => {
    let s = run(initialGame(), { type: "start", noTimer: true });
    for (let p = 0; p < 7; p++) {
      for (const guess of ["zzzz", "yyyy", "xxxx", "wwww", "vvvv"]) s = run(s, { type: "submit", guess });
      s = run(s, { type: "submit", guess: day.secrets[p].answers[0][0] }, { type: "next" });
    }
    expect(s.phase).toBe("done");
    const rejected = s.results.flatMap((r, i) => r.rejected.map((g): [number, string] => [i, g]));
    expect(rejected).toHaveLength(21);
    const tiers = resultTiers(s);
    expect(parseDigEvent({ kind: "finish", date: day.date, score: scoreOf(tiers), tiers, rejected }, day.date)).toMatchObject({
      kind: "finish",
      score: scoreOf(tiers),
      rejected,
    });
  });
});

describe("storage", () => {
  it("survives junk and keeps the newest 400 games", () => {
    expect(parseStore("{nope")).toEqual({ v: 1, settings: {}, games: {} });
    let store = parseStore(null);
    for (let i = 0; i < 405; i++) {
      const date = new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10);
      store = withGame(store, date, { answers: [], tiers: [], score: 0, finishedAt: date });
    }
    expect(Object.keys(store.games)).toHaveLength(400);
    expect(store.games["2026-01-01"]).toBeUndefined();
  });
  it("keeps a stored timer choice, leaves an unchosen one absent, keeps coached", () => {
    expect(parseStore(JSON.stringify({ v: 1, settings: { noTimer: false }, games: {} })).settings).toEqual({ noTimer: false });
    expect(parseStore(JSON.stringify({ v: 1, settings: {}, games: {} })).settings).toEqual({});
    expect(parseStore(JSON.stringify({ v: 1, settings: { noTimer: "x", coached: true }, games: {} })).settings).toEqual({ coached: true });
  });
  it("treats an unchosen timer as no timer", () => {
    expect(effectiveNoTimer({})).toBe(true);
    expect(effectiveNoTimer({ noTimer: false })).toBe(false);
    expect(effectiveNoTimer({ noTimer: true })).toBe(true);
  });
  it("drops corrupted game entries and keeps the rest", () => {
    const NULLS = Array.from({ length: 7 }, () => null);
    const good = { answers: NULLS, tiers: NULLS, score: 0, finishedAt: "2026-12-01T10:00:00.000Z" };
    const raw = JSON.stringify({
      v: 1,
      settings: { noTimer: true },
      games: {
        "2026-12-01": good,
        "2026-12-02": { ...good, score: 5 },
        "2026-12-03": { ...good, tiers: [null] },
        "2026-12-04": { ...good, score: "0" },
        "12/05/2026": good,
        "2026-12-06": null,
        "2026-12-07": { ...good, answers: [1, 2, 3, 4, 5, 6, 7] },
        "2026-12-08": { ...good, spread: { "10": "many" }, reported: "yes" },
      },
    });
    const store = parseStore(raw);
    expect(store.settings.noTimer).toBe(true);
    expect(Object.keys(store.games)).toEqual(["2026-12-01", "2026-12-08"]);
    expect(store.games["2026-12-08"]).toEqual(good);
    expect(store.games["2026-12-08"]).not.toHaveProperty("spread");
  });
  it("keeps in-session saves in memory when localStorage refuses them", () => {
    const NULLS = Array.from({ length: 7 }, () => null);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => { throw new Error("denied"); },
        setItem: () => { throw new Error("full"); },
      },
    });
    try {
      const game: StoredGame = { answers: NULLS, tiers: NULLS, score: 0, finishedAt: "2026-12-05T10:00:00.000Z" };
      saveGame("2026-12-05", game);
      setNoTimer(true);
      markReported("2026-12-05", { "0": 60 });
      const store = readStore();
      expect(store.settings.noTimer).toBe(true);
      expect(store.games["2026-12-05"]).toMatchObject({ reported: true, spread: { "0": 60 } });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("letters feedback", () => {
  it("tells a player typing another alphabet to use A to Z", () => {
    const reduce = createReducer(day);
    let s = reduce(initialGame(), { type: "start", noTimer: true });
    s = reduce(s, { type: "submit", guess: "друг" });
    expect(s.feedback).toEqual({ kind: "letters" });
    s = reduce(s, { type: "submit", guess: "   " });
    expect(s.feedback).toEqual({ kind: "empty" });
  });
});
