import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { dayKey } from "@/lib/day";

const { fake, sharedWord, sampleReveal } = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  return {
    sharedWord: { slug: "custard", word: "custard" },
    sampleReveal: { date: "2026-11-13", number: 7, prompt: "Name a beverage", fossilWord: "kvass", fact: "" },
    fake: {
      store,
      set: vi.fn(async (k: string, v: string, o?: { nx?: boolean; ex?: number }) => {
        if (o?.nx && store.has(k)) return null;
        store.set(k, v);
        return "OK";
      }),
      del: vi.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
    },
  };
});

vi.mock("@/lib/redis", () => ({ redis: fake, usingUpstash: true }));
vi.mock("@/lib/words", () => ({ resolveTodayWord: vi.fn(async () => sharedWord) }));
vi.mock("@/lib/threads", () => ({
  postDailyWordToThreads: vi.fn(async () => ({ posted: true })),
  postRevealToThreads: vi.fn(async () => ({ posted: true })),
}));
vi.mock("@/lib/bluesky", () => ({ postRevealToBluesky: vi.fn(async () => ({ posted: true, thumb: true })) }));
vi.mock("@/lib/dig/reveal", () => ({ getYesterdayReveal: vi.fn(async () => sampleReveal) }));
vi.mock("@/lib/dig/digLine", () => ({ getDigLine: vi.fn(async () => ({ prompt: "P" })) }));
vi.mock("@/lib/instagram", () => ({ postDailyCarouselToInstagram: vi.fn(async () => ({ posted: true })) }));

const { GET, maxDuration } = await import("./route");
const { postDailyWordToThreads, postRevealToThreads } = await import("@/lib/threads");
const { postRevealToBluesky } = await import("@/lib/bluesky");
const { getYesterdayReveal } = await import("@/lib/dig/reveal");
const { postDailyCarouselToInstagram } = await import("@/lib/instagram");
const { getDigLine } = await import("@/lib/dig/digLine");

function cronRequest() {
  return new NextRequest("http://localhost/api/cron/social", {
    headers: { authorization: "Bearer test-secret" },
  });
}

function cronRequestTo(query: string, auth = "Bearer test-secret") {
  return new NextRequest(`http://localhost/api/cron/social${query}`, {
    headers: auth ? { authorization: auth } : {},
  });
}

let log: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  fake.store.clear();
  process.env.CRON_SECRET = "test-secret";
  // lib/digestRuns.ts only uses Redis (here, the fake) in production.
  vi.stubEnv("VERCEL_ENV", "production");
  // Off unless a test turns it on, whatever the developer's own environment says.
  vi.stubEnv("DIG_REVEAL_POSTS", "");
  log = vi.spyOn(console, "log").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  log.mockRestore();
  error.mockRestore();
  vi.unstubAllEnvs();
});

describe("GET /api/cron/social", () => {
  it("posts today's shared word to both channels, from one instant", async () => {
    const body = await (await GET(cronRequest())).json();
    expect(vi.mocked(postDailyWordToThreads).mock.calls[0][0]).toBe(sharedWord);
    expect(vi.mocked(postDailyCarouselToInstagram).mock.calls[0][0]).toBe(sharedWord);
    expect(body).toEqual({ word: "custard", threads: true, instagram: true, alreadyRan: { threads: false, instagram: false } });
  });

  it("hands today's dig line to both channels, read once", async () => {
    await GET(cronRequest());
    expect(vi.mocked(postDailyWordToThreads).mock.calls[0][2]).toEqual({ prompt: "P" });
    expect(vi.mocked(postDailyCarouselToInstagram).mock.calls[0][2]).toEqual({ prompt: "P" });
    expect(getDigLine).toHaveBeenCalledTimes(1);
  });

  it("posts as before, with no dig, when there is none today or the lookup rejects", async () => {
    vi.mocked(getDigLine).mockResolvedValueOnce(null);
    expect((await (await GET(cronRequest())).json()).threads).toBe(true);
    expect(vi.mocked(postDailyWordToThreads).mock.calls[0][2]).toBeNull();

    fake.store.clear();
    vi.clearAllMocks();
    vi.mocked(getDigLine).mockRejectedValueOnce(new Error("redis"));
    const body = await (await GET(cronRequest())).json();
    expect(body).toMatchObject({ threads: true, instagram: true });
    expect(vi.mocked(postDailyWordToThreads).mock.calls[0][2]).toBeNull();
    expect(vi.mocked(postDailyCarouselToInstagram).mock.calls[0][2]).toBeNull();
  });

  it("a second run the same UTC day posts nothing", async () => {
    await GET(cronRequest());
    const body = await (await GET(cronRequest())).json();
    expect(postDailyWordToThreads).toHaveBeenCalledTimes(1);
    expect(postDailyCarouselToInstagram).toHaveBeenCalledTimes(1);
    expect(body.alreadyRan).toEqual({ threads: true, instagram: true });
  });

  it("?repost=instagram re-posts Instagram only", async () => {
    await GET(cronRequest());
    const body = await (await GET(cronRequestTo("?repost=instagram"))).json();
    expect(postDailyCarouselToInstagram).toHaveBeenCalledTimes(2);
    expect(postDailyWordToThreads).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({ instagram: true, threads: false });
  });

  it.each(["?repost=email", "?repost=", "?repost=bluesky", "?repost=threads&repost=instagram"])(
    "rejects %s with 400 and posts nothing",
    async (q) => {
      expect((await GET(cronRequestTo(q))).status).toBe(400);
      expect(postDailyWordToThreads).not.toHaveBeenCalled();
      expect(postDailyCarouselToInstagram).not.toHaveBeenCalled();
    }
  );

  it("rejects a missing or wrong secret", async () => {
    expect((await GET(cronRequestTo("", ""))).status).toBe(401);
    expect((await GET(cronRequestTo("?repost=threads", "Bearer wrong"))).status).toBe(401);
    expect(postDailyWordToThreads).not.toHaveBeenCalled();
  });

  it("a failing channel doesn't stop the other, and the day's lock stays claimed", async () => {
    vi.mocked(postDailyWordToThreads).mockResolvedValueOnce({ posted: false });
    const body = await (await GET(cronRequest())).json();
    expect(body).toMatchObject({ threads: false, instagram: true });
    const again = await (await GET(cronRequest())).json();
    expect(again.alreadyRan.threads).toBe(true);
  });

  it("a poster that rejects is reported as not posted, logs only its error name, and the other channel still posts", async () => {
    vi.mocked(postDailyWordToThreads).mockRejectedValueOnce(new TypeError("token=SECRET-abc"));
    const body = await (await GET(cronRequest())).json();
    expect(body).toMatchObject({ threads: false, instagram: true });
    expect(postDailyCarouselToInstagram).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("[curio:social] threads threw:", "TypeError");
    expect(JSON.stringify(error.mock.calls)).not.toContain("SECRET");
  });

  it("releases any lock already claimed when a later claim throws", async () => {
    // The Threads claim really writes to the store; the Instagram one throws.
    const real = fake.set.getMockImplementation()!;
    fake.set.mockImplementationOnce(real).mockRejectedValueOnce(new Error("redis down"));
    await expect(GET(cronRequest())).rejects.toThrow("redis down");
    expect(fake.del).toHaveBeenCalledWith(`curio:digest:threads:${dayKey(new Date())}`);
    expect(fake.store.size).toBe(0);
    expect(postDailyWordToThreads).not.toHaveBeenCalled();
  });

  it("logs, by error name only, a lock release that itself fails, and still rethrows the claim error", async () => {
    const real = fake.set.getMockImplementation()!;
    fake.set.mockImplementationOnce(real).mockRejectedValueOnce(new Error("redis down"));
    fake.del.mockRejectedValueOnce(new TypeError("del failed token=SECRET-abc"));
    await expect(GET(cronRequest())).rejects.toThrow("redis down");
    expect(error).toHaveBeenCalledWith("[curio:social] releasing threads lock failed:", "TypeError");
    expect(JSON.stringify(error.mock.calls)).not.toContain("SECRET");
  });

  it("pins maxDuration to 300", () => expect(maxDuration).toBe(300));
});

describe("GET /api/cron/social: the dig reveal posts", () => {
  const today = () => dayKey(new Date());
  const revealKeys = () => [...fake.store.keys()].filter((k) => k.includes("-reveal:")).sort();
  const on = () => vi.stubEnv("DIG_REVEAL_POSTS", "on");

  it.each(["", "off", "true", "1", "ON", " on"])("posts nothing of the kind, and never looks, when DIG_REVEAL_POSTS is %j", async (value) => {
    vi.stubEnv("DIG_REVEAL_POSTS", value);
    const body = await (await GET(cronRequest())).json();
    expect(getYesterdayReveal).not.toHaveBeenCalled();
    expect(postRevealToBluesky).not.toHaveBeenCalled();
    expect(postRevealToThreads).not.toHaveBeenCalled();
    expect(revealKeys()).toEqual([]);
    expect(body).not.toHaveProperty("reveal");
    expect(body).toMatchObject({ threads: true, instagram: true });
  });

  it("flag on: claims both reveal channels for today and posts yesterday's reveal after the word posts", async () => {
    on();
    const body = await (await GET(cronRequest())).json();
    expect(postRevealToBluesky).toHaveBeenCalledTimes(1);
    expect(vi.mocked(postRevealToBluesky).mock.calls[0][0]).toBe(sampleReveal);
    expect(postRevealToThreads).toHaveBeenCalledTimes(1);
    expect(vi.mocked(postRevealToThreads).mock.calls[0][0]).toBe(sampleReveal);
    expect(revealKeys()).toEqual([`curio:digest:bluesky-reveal:${today()}`, `curio:digest:threads-reveal:${today()}`]);
    expect(body).toEqual({
      word: "custard",
      threads: true,
      instagram: true,
      alreadyRan: { threads: false, instagram: false },
      reveal: { available: true, bluesky: true, threads: true, alreadyRan: { bluesky: false, threads: false } },
    });
    const order = (fn: unknown) => vi.mocked(fn as never as () => void).mock.invocationCallOrder[0];
    expect(order(postDailyWordToThreads)).toBeLessThan(order(postRevealToBluesky));
    expect(order(postDailyCarouselToInstagram)).toBeLessThan(order(postRevealToThreads));
  });

  it("flag on, no reveal today (an even day, before launch, no built day): nothing posts and no lock is spent", async () => {
    on();
    vi.mocked(getYesterdayReveal).mockResolvedValueOnce(null);
    const body = await (await GET(cronRequest())).json();
    expect(postRevealToBluesky).not.toHaveBeenCalled();
    expect(postRevealToThreads).not.toHaveBeenCalled();
    expect(revealKeys()).toEqual([]);
    expect(body.reveal).toEqual({ available: false, bluesky: false, threads: false, alreadyRan: { bluesky: false, threads: false } });
    expect(body).toMatchObject({ threads: true, instagram: true });
  });

  it("a lookup that rejects is the same as no reveal, and the word posts are unharmed", async () => {
    on();
    vi.mocked(getYesterdayReveal).mockRejectedValueOnce(new Error("redis down token=SECRET"));
    const body = await (await GET(cronRequest())).json();
    expect(body).toMatchObject({ threads: true, instagram: true, reveal: { available: false } });
    expect(postRevealToBluesky).not.toHaveBeenCalled();
  });

  it("a second run the same UTC day posts no second reveal", async () => {
    on();
    await GET(cronRequest());
    const body = await (await GET(cronRequest())).json();
    expect(postRevealToBluesky).toHaveBeenCalledTimes(1);
    expect(postRevealToThreads).toHaveBeenCalledTimes(1);
    expect(body.reveal).toEqual({ available: true, bluesky: false, threads: false, alreadyRan: { bluesky: true, threads: true } });
  });

  it("a failing reveal channel doesn't stop the other, keeps its lock, and leaves the word posts alone", async () => {
    on();
    vi.mocked(postRevealToBluesky).mockResolvedValueOnce({ posted: false, thumb: false });
    const body = await (await GET(cronRequest())).json();
    expect(body).toMatchObject({ threads: true, instagram: true, reveal: { bluesky: false, threads: true } });
    const again = await (await GET(cronRequest())).json();
    expect(again.reveal.alreadyRan.bluesky).toBe(true);
  });

  it("a reveal poster that rejects is reported as not posted, logs only its error name, and the other still posts", async () => {
    on();
    vi.mocked(postRevealToBluesky).mockRejectedValueOnce(new TypeError("token=SECRET-abc"));
    const body = await (await GET(cronRequest())).json();
    expect(body).toMatchObject({ threads: true, instagram: true, reveal: { bluesky: false, threads: true } });
    expect(error).toHaveBeenCalledWith("[curio:social] bluesky-reveal threw:", "TypeError");
    expect(JSON.stringify(error.mock.calls)).not.toContain("SECRET");
  });

  it("a reveal claim that throws is released and logged by name, and the word posts still go out with a 200", async () => {
    on();
    const real = fake.set.getMockImplementation()!;
    // Claims 1 and 2 are the word channels; the third is bluesky-reveal's (it really writes), the fourth throws.
    fake.set.mockImplementationOnce(real).mockImplementationOnce(real).mockImplementationOnce(real).mockRejectedValueOnce(new Error("redis down token=SECRET"));
    const res = await GET(cronRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ threads: true, instagram: true, reveal: { available: true, bluesky: false, threads: false } });
    expect(fake.del).toHaveBeenCalledWith(`curio:digest:bluesky-reveal:${today()}`);
    expect(revealKeys()).toEqual([]);
    expect(postRevealToBluesky).not.toHaveBeenCalled();
    expect(postRevealToThreads).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("[curio:social] reveal claim failed:", "Error");
    expect(JSON.stringify(error.mock.calls)).not.toContain("SECRET");
  });

  it.each([
    ["bluesky-reveal", postRevealToBluesky, postRevealToThreads],
    ["threads-reveal", postRevealToThreads, postRevealToBluesky],
  ] as const)("?repost=%s re-posts that reveal channel alone, forcing its lock", async (channel, posted, notPosted) => {
    on();
    await GET(cronRequest());
    vi.clearAllMocks();
    const body = await (await GET(cronRequestTo(`?repost=${channel}`))).json();
    expect(posted).toHaveBeenCalledTimes(1);
    expect(notPosted).not.toHaveBeenCalled();
    expect(postDailyWordToThreads).not.toHaveBeenCalled();
    expect(postDailyCarouselToInstagram).not.toHaveBeenCalled();
    expect(body).toMatchObject({ threads: false, instagram: false, alreadyRan: { threads: false, instagram: false } });
    expect(body.reveal.alreadyRan).toEqual({ bluesky: false, threads: false });
    expect(body.reveal[channel === "bluesky-reveal" ? "bluesky" : "threads"]).toBe(true);
  });

  it("?repost=threads (a word channel) leaves the reveal posts alone even with the flag on", async () => {
    on();
    const body = await (await GET(cronRequestTo("?repost=threads"))).json();
    expect(getYesterdayReveal).not.toHaveBeenCalled();
    expect(postRevealToBluesky).not.toHaveBeenCalled();
    expect(postRevealToThreads).not.toHaveBeenCalled();
    expect(body).not.toHaveProperty("reveal");
  });

  it("?repost=bluesky-reveal with the flag off is refused with 409 and posts nothing at all", async () => {
    const res = await GET(cronRequestTo("?repost=bluesky-reveal"));
    expect(res.status).toBe(409);
    expect(postRevealToBluesky).not.toHaveBeenCalled();
    expect(postDailyWordToThreads).not.toHaveBeenCalled();
    expect(revealKeys()).toEqual([]);
  });

  it("?repost=threads-reveal on a day with no reveal posts nothing and spends no lock", async () => {
    on();
    vi.mocked(getYesterdayReveal).mockResolvedValueOnce(null);
    const body = await (await GET(cronRequestTo("?repost=threads-reveal"))).json();
    expect(postRevealToThreads).not.toHaveBeenCalled();
    expect(revealKeys()).toEqual([]);
    expect(body.reveal.available).toBe(false);
  });

  it("a reveal repost needs CRON_SECRET, like the others", async () => {
    on();
    expect((await GET(cronRequestTo("?repost=bluesky-reveal", "Bearer wrong"))).status).toBe(401);
    expect(postRevealToBluesky).not.toHaveBeenCalled();
  });

  it("the 400 for a bad repost names every channel that is accepted", async () => {
    const res = await GET(cronRequestTo("?repost=email"));
    expect(res.status).toBe(400);
    const { error: message } = await res.json();
    for (const c of ["threads", "instagram", "bluesky-reveal", "threads-reveal"]) expect(message).toContain(c);
  });

  it("logs counts and statuses only", async () => {
    on();
    await GET(cronRequest());
    const logged = log.mock.calls.flat().map(String).join(" ");
    expect(logged).toContain(`[curio:social] reveal ${today()}: bluesky posted; threads posted`);
    expect(logged).not.toContain("kvass");
  });
});
