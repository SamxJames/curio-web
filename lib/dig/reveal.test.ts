import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./server", () => ({ readDay: vi.fn() }));
import { readDay } from "./server";
import { devDay } from "./devDay";
import { encodeDay } from "./payload";
import { getYesterdayReveal } from "./reveal";

// Dig #1 is 2026-11-07, so 11-14 is #8 (even) and 11-15 is #9 (odd).
const at = (iso: string) => new Date(`${iso}T10:00:00Z`);
const stored = (date: string, patch?: (d: ReturnType<typeof devDay>) => void) => {
  const plain = devDay(date);
  patch?.(plain);
  return encodeDay(plain);
};

beforeEach(() => {
  vi.mocked(readDay).mockReset();
  vi.stubEnv("DIG_LAUNCH_DATE", "2026-11-07");
});
afterEach(() => vi.unstubAllEnvs());

describe("getYesterdayReveal", () => {
  it("is yesterday's first prompt and its fossil, on a reveal day (odd dig number)", async () => {
    vi.mocked(readDay).mockResolvedValue(stored("2026-11-14"));
    // Today is 11-15; yesterday, 11-14, was dig #8, an even day.
    expect(await getYesterdayReveal(at("2026-11-15"))).toBeNull();

    // Today is 11-16; yesterday, 11-15, was dig #9.
    vi.mocked(readDay).mockResolvedValue(stored("2026-11-15"));
    expect(await getYesterdayReveal(at("2026-11-16"))).toEqual({
      date: "2026-11-15",
      number: 9,
      prompt: "Name a fruit",
      fossilWord: "pawpaw",
      fact: "Its name likely comes from Spanish papaya, borrowed from Carib.",
    });
    expect(readDay).toHaveBeenCalledWith("2026-11-15");
  });

  it("reads only the day before today, whatever the time of day", async () => {
    vi.mocked(readDay).mockResolvedValue(stored("2026-11-15"));
    await getYesterdayReveal(new Date("2026-11-16T00:00:01Z"));
    await getYesterdayReveal(new Date("2026-11-16T23:59:59Z"));
    expect(vi.mocked(readDay).mock.calls.map((c) => c[0])).toEqual(["2026-11-15", "2026-11-15"]);
  });

  it("is null on an even day without reading Redis", async () => {
    expect(await getYesterdayReveal(at("2026-11-15"))).toBeNull();
    expect(readDay).not.toHaveBeenCalled();
  });

  it("is null before launch and on launch day itself (nothing to look back on)", async () => {
    expect(await getYesterdayReveal(at("2026-11-07"))).toBeNull();
    expect(await getYesterdayReveal(at("2026-11-06"))).toBeNull();
    expect(readDay).not.toHaveBeenCalled();
  });

  it("is null in production while DIG_LAUNCH_DATE is unset, so the dig is closed", async () => {
    vi.stubEnv("DIG_LAUNCH_DATE", "");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(await getYesterdayReveal(at("2026-11-16"))).toBeNull();
    expect(readDay).not.toHaveBeenCalled();
  });

  it("is null when yesterday's day is missing, and never throws when the read fails", async () => {
    vi.mocked(readDay).mockResolvedValueOnce(null);
    expect(await getYesterdayReveal(at("2026-11-16"))).toBeNull();
    vi.mocked(readDay).mockRejectedValueOnce(new Error("redis down token=SECRET"));
    expect(await getYesterdayReveal(at("2026-11-16"))).toBeNull();
  });

  it("is null for a damaged day (bad payload, no prompts, no fossil word)", async () => {
    const bad = stored("2026-11-15");
    bad.prompts[0].payload = "not json";
    vi.mocked(readDay).mockResolvedValueOnce(bad);
    expect(await getYesterdayReveal(at("2026-11-16"))).toBeNull();

    vi.mocked(readDay).mockResolvedValueOnce({ ...stored("2026-11-15"), prompts: [] });
    expect(await getYesterdayReveal(at("2026-11-16"))).toBeNull();

    vi.mocked(readDay).mockResolvedValueOnce(stored("2026-11-15", (d) => (d.prompts[0].fossil.word = " ")));
    expect(await getYesterdayReveal(at("2026-11-16"))).toBeNull();
  });

  it("uses the first prompt only, never another prompt's fossil", async () => {
    vi.mocked(readDay).mockResolvedValue(stored("2026-11-15"));
    const r = await getYesterdayReveal(at("2026-11-16"));
    expect(r?.fossilWord).toBe("pawpaw");
    expect(Object.keys(r ?? {}).sort()).toEqual(["date", "fact", "fossilWord", "number", "prompt"]);
  });

  it("leaves the fact empty when it is dictionary notation rather than a sentence", async () => {
    vi.mocked(readDay).mockResolvedValue(stored("2026-11-15", (d) => (d.prompts[0].fossil.fact = "From papaya + [obsolete]")));
    expect((await getYesterdayReveal(at("2026-11-16")))?.fact).toBe("");
  });

  it("collapses stray whitespace in the prompt and the fact", async () => {
    vi.mocked(readDay).mockResolvedValue(
      stored("2026-11-15", (d) => {
        d.prompts[0].text = "  Name  a fruit ";
        d.prompts[0].fossil.fact = "Its name likely comes from\nSpanish papaya,  borrowed from Carib.";
      })
    );
    const r = await getYesterdayReveal(at("2026-11-16"));
    expect(r?.prompt).toBe("Name a fruit");
    expect(r?.fact).toBe("Its name likely comes from Spanish papaya, borrowed from Carib.");
  });
});
