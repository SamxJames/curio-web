import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WORDS, type WordEntry } from "./words";

vi.mock("./metaTokens", () => ({ getMetaToken: vi.fn(async () => "tok-123") }));
const { postDailyWordToThreads } = await import("./threads");
const { getMetaToken } = await import("./metaTokens");

const word = WORDS.find((w) => w.slug === "ketchup") as WordEntry;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const noSleep = vi.fn(async () => {});
let log: ReturnType<typeof vi.spyOn>;

/** Everything logged through console.error, captured for assertions. */
function captureErrors() {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  return () => {
    const logged = spy.mock.calls.flat().map(String).join(" ");
    spy.mockRestore();
    return logged;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  log = vi.spyOn(console, "log").mockImplementation(() => {});
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
  log.mockRestore();
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

  it("logs a success line, without the post text", async () => {
    await postDailyWordToThreads(word, { sleep: noSleep });
    const logged = log.mock.calls.flat().map(String).join(" ");
    expect(logged).toContain("[curio:threads] posted");
    expect(logged).not.toContain(word.teaser);
  });

  it("stops with no publish when the create call returns 200 without an id", async () => {
    vi.mocked(fetch).mockReset().mockResolvedValueOnce(json({}));
    const errors = captureErrors();
    expect(await postDailyWordToThreads(word, { sleep: noSleep })).toEqual({ posted: false });
    expect(errors()).toContain("no container id");
    expect(fetch).toHaveBeenCalledTimes(1);
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
    expect(await postDailyWordToThreads(word, { sleep: noSleep })).toEqual({ posted: false });
    expect(log.mock.calls.flat().join(" ")).toContain("[curio:threads:dev-fallback]");
    expect(fetch).not.toHaveBeenCalled();
  });

  // Not only in production: a local .env.local with real tokens must never
  // post a localhost link either.
  it.each(["production", "preview", ""])("refuses to post a localhost link (VERCEL_ENV=%j)", async (env) => {
    vi.stubEnv("VERCEL_ENV", env);
    vi.stubEnv("CURIO_SITE_URL", "");
    const errors = captureErrors();
    expect(await postDailyWordToThreads(word, { sleep: noSleep })).toEqual({ posted: false });
    expect(errors()).toContain("[curio:threads] CURIO_SITE_URL points to localhost — not posting");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never throws when the token lookup rejects (e.g. Redis down), logs no message, and does not post", async () => {
    vi.mocked(getMetaToken).mockRejectedValueOnce(new Error("redis down"));
    const errors = captureErrors();
    expect(await postDailyWordToThreads(word, { sleep: noSleep })).toEqual({ posted: false });
    const logged = errors();
    expect(logged).toContain("[curio:threads] post failed: token lookup failed (Error)");
    expect(logged).not.toContain("redis down");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never logs a token that a failed Redis command echoes in its message", async () => {
    // @upstash/redis puts the command body in its error message, and a
    // failing set of the token record carries the live token.
    const upstash = new Error(
      'ERR max requests limit exceeded, command was: ["set","curio:social:token:threads",{"token":"EAAlive-threads-secret","seed":"EAAlive-threads-secret"}]'
    );
    upstash.name = "UpstashError";
    vi.mocked(getMetaToken).mockRejectedValueOnce(upstash);
    const errors = captureErrors();
    expect(await postDailyWordToThreads(word, { sleep: noSleep })).toEqual({ posted: false });
    const logged = errors();
    expect(logged).toContain("token lookup failed");
    expect(logged).toContain("UpstashError");
    expect(logged).not.toContain("EAAlive-threads-secret");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("logs only the error name for a network failure whose message could echo a URL", async () => {
    vi.mocked(fetch)
      .mockReset()
      .mockRejectedValueOnce(new TypeError("fetch failed: https://graph.threads.net/x?access_token=tok-123"));
    const errors = captureErrors();
    expect(await postDailyWordToThreads(word, { sleep: noSleep })).toEqual({ posted: false });
    const logged = errors();
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
    const errors = captureErrors();
    expect(await postDailyWordToThreads(word, { sleep: noSleep })).toEqual({ posted: false });
    const logged = errors();
    expect(logged).toContain("[curio:threads] post failed");
    expect(logged).not.toContain("tok-123");
    expect(log.mock.calls.flat().join(" ")).not.toContain("[curio:threads] posted");
  });
});
