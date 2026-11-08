import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildFinishEvent, buildShareEvent, buildStartEvent, returningBucket, sendDigEvent, sendFinish, sendLandOnce, viaFrom } from "./client";
import { MAX_REJECTED_PER_FINISH, parseDigEvent } from "./events";
import type { PromptResult } from "./game";

const none: PromptResult = { answer: null, tier: null, rejected: [], lastGuess: null };

describe("buildFinishEvent", () => {
  const results: PromptResult[] = [
    { answer: "keel", tier: "familiar", rejected: ["Jib"], lastGuess: "Jib" },
    { ...none, rejected: ["Boom", "Gaff Rig"], lastGuess: "Gaff Rig" },
    ...Array.from({ length: 5 }, () => ({ ...none })),
  ];
  const tiers = results.map((r) => r.tier);

  it("sends display-form guesses with their prompt index, and the server accepts it", () => {
    const ev = buildFinishEvent("2026-11-01", tiers, 30, results, true, false);
    expect(ev.rejected).toEqual([[0, "Jib"], [1, "Boom"], [1, "Gaff Rig"]]);
    expect(parseDigEvent(ev, "2026-11-01")).toEqual({
      kind: "finish", date: "2026-11-01", score: 30, tiers, rejected: [[0, "jib"], [1, "boom"], [1, "gaffrig"]],
    });
  });

  it("sends no guesses when the day's sample skips them", () => {
    expect(buildFinishEvent("2026-11-01", tiers, 30, results, false, false).rejected).toEqual([]);
  });

  it("caps the list at the server's limit so an over-long finish still parses", () => {
    const heavy: PromptResult[] = Array.from({ length: 7 }, () => ({ ...none, rejected: ["aa", "bb", "cc", "dd", "ee"], lastGuess: "ee" }));
    const ev = buildFinishEvent("2026-11-01", heavy.map(() => null), 0, heavy, true, false);
    expect(ev.rejected).toHaveLength(MAX_REJECTED_PER_FINISH);
    expect(parseDigEvent(ev, "2026-11-01")).not.toBeNull();
  });
});

describe("browser senders", () => {
  const fetchMock = vi.fn();
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ status: 200, json: async () => ({ spread: { "30": 4 } }) });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("defers the land event so TrafficBeacon records the arrival source first, and sends it once", () => {
    // window.setTimeout is how the production code schedules it.
    (window as unknown as { setTimeout: typeof setTimeout }).setTimeout = setTimeout;
    sendLandOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).kind).toBe("land");
    sendLandOnce();
    vi.runAllTimers();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sendDigEvent never throws, even when fetch does", () => {
    fetchMock.mockImplementation(() => { throw new Error("offline"); });
    expect(() => sendDigEvent({ kind: "past" })).not.toThrow();
  });

  it("sendFinish returns the spread on 200 and null on anything else", async () => {
    expect(await sendFinish({ kind: "finish" })).toEqual({ "30": 4 });
    fetchMock.mockResolvedValue({ status: 404, json: async () => ({}) });
    expect(await sendFinish({ kind: "finish" })).toBeNull();
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await sendFinish({ kind: "finish" })).toBeNull();
  });
});

const g = (finishedAt: string) => ({ finishedAt });
describe("returningBucket", () => {
  const today = "2026-11-10";
  it("is null for an empty store", () => expect(returningBucket({}, today)).toBeNull());
  it("is null when the only finish is today (even on an archive date)", () => {
    expect(returningBucket({ "2026-11-01": g("2026-11-10T08:00:00.000Z") }, today)).toBeNull();
  });
  it.each([
    ["2026-11-09T23:59:00.000Z", "d1"],
    ["2026-11-08T00:00:00.000Z", "d2_6"],
    ["2026-11-04T10:00:00.000Z", "d2_6"],
    ["2026-11-03T10:00:00.000Z", "d7"],
    ["2026-10-01T10:00:00.000Z", "d7"],
  ])("finish at %s is %s", (at, want) => {
    expect(returningBucket({ "2026-11-07": g(at) }, today)).toBe(want);
  });
  it("uses the most recent earlier finish and ignores junk dates", () => {
    const games = { a: g("2026-11-01T00:00:00.000Z"), b: g("2026-11-09T05:00:00.000Z"), c: g("nope") };
    expect(returningBucket(games, today)).toBe("d1");
  });
});
describe("buildStartEvent", () => {
  it("adds ret only when the device is returning", () => {
    expect(buildStartEvent("2026-11-10", {})).toEqual({ kind: "start", date: "2026-11-10" });
    expect(buildStartEvent("2026-11-10", { x: g("2026-11-09T01:00:00.000Z") })).toEqual({ kind: "start", date: "2026-11-10", ret: "d1", first: "2026-11-09" });
  });
  it("adds first (the earliest earlier finish day) for a returning device", () => {
    const games = { a: g("2026-11-03T01:00:00.000Z"), b: g("2026-11-09T01:00:00.000Z") };
    expect(buildStartEvent("2026-11-10", games)).toMatchObject({ ret: "d1", first: "2026-11-03" });
  });
});

describe("viaFrom", () => {
  it("reads a known from param", () => {
    expect(viaFrom("?from=nav")).toBe("nav");
    expect(viaFrom("?x=1&from=story")).toBe("story");
  });
  it("ignores unknown or missing values", () => {
    expect(viaFrom("?from=evil")).toBeNull();
    expect(viaFrom("")).toBeNull();
  });
});

describe("buildShareEvent", () => {
  const g = (finishedAt: string, shared?: boolean) => ({ finishedAt, ...(shared ? { shared } : {}) });
  const date = "2026-11-10";
  it("is uncounted when it isn't a real share of today's dig", () => {
    expect(buildShareEvent("image", date, { [date]: g(`${date}T09:00:00Z`) }, false, false)).toEqual({ kind: "share", how: "image" });
  });
  it("counts a first-timer's first share once", () => {
    expect(buildShareEvent("text", date, { [date]: g(`${date}T09:00:00Z`) }, true, false)).toEqual({ kind: "share", how: "text", once: true, isNew: true });
  });
  it("marks a counted share that went through the share sheet, and only then", () => {
    expect(buildShareEvent("text", date, { [date]: g(`${date}T09:00:00Z`) }, true, true)).toEqual({ kind: "share", how: "text", once: true, isNew: true, sheet: true });
    expect(buildShareEvent("text", date, { [date]: g(`${date}T09:00:00Z`) }, true, false)).not.toHaveProperty("sheet");
    expect(buildShareEvent("text", date, { [date]: g(`${date}T09:00:00Z`) }, false, true)).toEqual({ kind: "share", how: "text" });
  });
  it("does not count a second share of the same dig", () => {
    expect(buildShareEvent("text", date, { [date]: g(`${date}T09:00:00Z`, true) }, true, true)).toEqual({ kind: "share", how: "text" });
  });
  it("flags the third sharing day and not first-timers", () => {
    const games = { "2026-11-08": g("2026-11-08T09:00:00Z", true), "2026-11-09": g("2026-11-09T09:00:00Z", true), [date]: g(`${date}T09:00:00Z`) };
    expect(buildShareEvent("text", date, games, true, false)).toEqual({ kind: "share", how: "text", once: true, third: true });
  });
});

it("buildStartEvent and buildFinishEvent carry vs only when true", () => {
  expect(buildStartEvent("2026-11-10", {}, true)).toMatchObject({ vs: true });
  expect(buildStartEvent("2026-11-10", {})).not.toHaveProperty("vs");
  expect(buildFinishEvent("2026-11-10", Array(7).fill(null), 0, [], false, true, true)).toMatchObject({ isNew: true, vs: true });
});
