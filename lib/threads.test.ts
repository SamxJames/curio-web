import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WORDS, type WordEntry } from "./words";

vi.mock("./metaTokens", () => ({ getMetaToken: vi.fn(async () => "tok-123") }));
const { postDailyWordToThreads } = await import("./threads");
const { getMetaToken } = await import("./metaTokens");

const word = WORDS.find((w) => w.slug === "ketchup") as WordEntry;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const noSleep = vi.fn(async () => {});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("THREADS_USER_ID", "u1");
  vi.stubEnv("CURIO_SITE_URL", "https://curioword.com");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(json({ id: "c1" }))
      .mockResolvedValueOnce(json({ status: "FINISHED" }))
      .mockResolvedValueOnce(json({ id: "post1" }))
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("postDailyWordToThreads", () => {
  it("creates a TEXT container with the link as link_attachment, waits for FINISHED, then publishes", async () => {
    expect(await postDailyWordToThreads(word, { sleep: noSleep })).toEqual({ posted: true });

    const [createUrl, createInit] = vi.mocked(fetch).mock.calls[0];
    expect(createUrl).toBe("https://graph.threads.net/v1.0/u1/threads");
    const body = new URLSearchParams(String(createInit?.body));
    expect(body.get("media_type")).toBe("TEXT");
    expect(body.get("text")).toContain("#etymology");
    expect(body.get("link_attachment")).toContain("/story/ketchup?utm_source=threads");

    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain("/v1.0/c1?fields=status");
    const [publishUrl, publishInit] = vi.mocked(fetch).mock.calls[2];
    expect(publishUrl).toBe("https://graph.threads.net/v1.0/u1/threads_publish");
    expect(new URLSearchParams(String(publishInit?.body)).get("creation_id")).toBe("c1");
    expect(noSleep).toHaveBeenCalledWith(5000);
  });

  it("publishes anyway when the container is still processing after every poll", async () => {
    const urls: string[] = [];
    vi.mocked(fetch).mockReset().mockImplementation(async (url) => {
      urls.push(String(url));
      if (urls.length === 1) return json({ id: "c1" });
      if (String(url).endsWith("/threads_publish")) return json({ id: "post1" });
      return json({ status: "IN_PROGRESS" });
    });
    expect(await postDailyWordToThreads(word, { sleep: noSleep })).toEqual({ posted: true });
    expect(noSleep).toHaveBeenCalledTimes(6);
    expect(urls).toHaveLength(8); // create + 6 polls + publish
  });

  it("logs instead of posting when there's no token or user id", async () => {
    vi.mocked(getMetaToken).mockResolvedValueOnce(null);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await postDailyWordToThreads(word, { sleep: noSleep })).toEqual({ posted: false });
    expect(log.mock.calls.flat().join(" ")).toContain("[curio:threads:dev-fallback]");
    log.mockRestore();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses to post a localhost link in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("CURIO_SITE_URL", "");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await postDailyWordToThreads(word, { sleep: noSleep })).toEqual({ posted: false });
    error.mockRestore();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never throws when the token lookup rejects (e.g. Redis down), and does not post", async () => {
    vi.mocked(getMetaToken).mockRejectedValueOnce(new Error("redis down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await postDailyWordToThreads(word, { sleep: noSleep })).toEqual({ posted: false });
    const logged = error.mock.calls.flat().map(String).join(" ");
    error.mockRestore();
    expect(logged).toContain("[curio:threads] post failed");
    expect(logged).toContain("redis down");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("logs only the error name for a network failure whose message could echo a URL", async () => {
    vi.mocked(fetch)
      .mockReset()
      .mockRejectedValueOnce(new TypeError("fetch failed: https://graph.threads.net/x?access_token=tok-123"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await postDailyWordToThreads(word, { sleep: noSleep })).toEqual({ posted: false });
    const logged = error.mock.calls.flat().map(String).join(" ");
    error.mockRestore();
    expect(logged).toContain("TypeError");
    expect(logged).not.toContain("tok-123");
  });

  it.each([
    {
      label: "the create call fails",
      arrange: () => vi.mocked(fetch).mockReset().mockResolvedValueOnce(json({ error: { message: "bad" } }, 400)),
    },
    {
      label: "the container errors",
      arrange: () => vi.mocked(fetch).mockReset().mockResolvedValueOnce(json({ id: "c1" })).mockResolvedValueOnce(json({ status: "ERROR" })),
    },
    {
      label: "the network throws",
      arrange: () => vi.mocked(fetch).mockReset().mockRejectedValueOnce(new Error("socket hang up")),
    },
  ])("never throws, and logs without the token, when $label", async ({ arrange }) => {
    arrange();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await postDailyWordToThreads(word, { sleep: noSleep })).toEqual({ posted: false });
    const logged = error.mock.calls.flat().map(String).join(" ");
    error.mockRestore();
    expect(logged).toContain("[curio:threads] post failed");
    expect(logged).not.toContain("tok-123");
  });
});
