import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { dayKey } from "@/lib/day";

const { fake, sharedWord } = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  return {
    sharedWord: { slug: "custard", word: "custard" },
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
vi.mock("@/lib/threads", () => ({ postDailyWordToThreads: vi.fn(async () => ({ posted: true })) }));
vi.mock("@/lib/instagram", () => ({ postDailyCarouselToInstagram: vi.fn(async () => ({ posted: true })) }));

const { GET, maxDuration } = await import("./route");
const { postDailyWordToThreads } = await import("@/lib/threads");
const { postDailyCarouselToInstagram } = await import("@/lib/instagram");

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
