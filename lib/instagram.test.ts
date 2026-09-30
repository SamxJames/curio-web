import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { WORDS, type WordEntry } from "./words";
import { buildInstagramCaption } from "./socialPost";

vi.mock("./metaTokens", () => ({ getMetaToken: vi.fn(async () => "tok-ig") }));
const { postDailyCarouselToInstagram } = await import("./instagram");
const { getMetaToken } = await import("./metaTokens");

const word = WORDS.find((w) => w.slug === "ketchup") as WordEntry;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const noSleep = vi.fn(async () => {});
const BASE = "https://graph.instagram.com/v25.0";
const SLIDES = "https://curioword.com/social/carousel/ketchup/";
const jpeg = () => new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200, headers: { "content-type": "image/jpeg" } });

/** fetch is split by host: the slide warm-up GETs go to `slide`, the Graph
 * API calls to `meta`. Both are swapped per test. */
let meta: Mock;
let slide: (url: string) => Promise<Response>;
let log: ReturnType<typeof vi.spyOn>;
const graphCalls = () => vi.mocked(fetch).mock.calls.filter(([url]) => String(url).startsWith("https://graph.instagram.com/"));

/** Happy path: 5 child containers, the carousel, one FINISHED poll, publish. */
function happyMeta() {
  const f = vi.fn();
  for (let n = 1; n <= 5; n++) f.mockResolvedValueOnce(json({ id: `child${n}` }));
  f.mockResolvedValueOnce(json({ id: "car1" }))
    .mockResolvedValueOnce(json({ status_code: "FINISHED" }))
    .mockResolvedValueOnce(json({ id: "media1" }));
  return f;
}

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
  vi.stubEnv("INSTAGRAM_USER_ID", "ig1");
  vi.stubEnv("CURIO_SITE_URL", "https://curioword.com");
  meta = happyMeta();
  slide = async () => jpeg();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
      String(url).startsWith(SLIDES) ? slide(String(url)) : meta(url, init)
    )
  );
});
afterEach(() => {
  log.mockRestore();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("postDailyCarouselToInstagram", () => {
  it("warms every slide in order, then creates a child per slide in order, the carousel, waits for FINISHED, publishes", async () => {
    expect(await postDailyCarouselToInstagram(word, { sleep: noSleep })).toEqual({ posted: true });

    const calls = vi.mocked(fetch).mock.calls;
    expect(calls).toHaveLength(13);
    // The warm-up: plain GETs of each public slide URL, before any Meta call.
    for (let n = 1; n <= 5; n++) {
      const [url, init] = calls[n - 1];
      expect(url).toBe(`${SLIDES}${n}`);
      expect(init?.method ?? "GET").toBe("GET");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }

    for (let n = 1; n <= 5; n++) {
      const [url, init] = calls[5 + n - 1];
      expect(url).toBe(`${BASE}/ig1/media`);
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("image_url")).toBe(`${SLIDES}${n}`);
      expect(body.get("is_carousel_item")).toBe("true");
      expect(body.get("access_token")).toBe("tok-ig");
    }

    const [carUrl, carInit] = calls[10];
    expect(carUrl).toBe(`${BASE}/ig1/media`);
    const carBody = new URLSearchParams(String(carInit?.body));
    expect(carBody.get("media_type")).toBe("CAROUSEL");
    expect(carBody.get("children")).toBe("child1,child2,child3,child4,child5");
    expect(carBody.get("caption")).toBe(buildInstagramCaption(word));

    expect(String(calls[11][0])).toContain("/v25.0/car1?fields=status_code");
    const [publishUrl, publishInit] = calls[12];
    expect(publishUrl).toBe(`${BASE}/ig1/media_publish`);
    expect(new URLSearchParams(String(publishInit?.body)).get("creation_id")).toBe("car1");
    expect(noSleep).toHaveBeenCalledWith(5000);
  });

  it("logs a success line, without the caption", async () => {
    await postDailyCarouselToInstagram(word, { sleep: noSleep });
    const logged = log.mock.calls.flat().map(String).join(" ");
    expect(logged).toContain("[curio:instagram] posted");
    expect(logged).not.toContain(word.teaser);
  });

  it.each([
    { n: 3, status: 404 },
    { n: 1, status: 500 },
  ])("stops before any Meta call when slide $n answers $status", async ({ n, status }) => {
    slide = async (url) => (url === `${SLIDES}${n}` ? new Response("nope", { status }) : jpeg());
    const errors = captureErrors();
    expect(await postDailyCarouselToInstagram(word, { sleep: noSleep })).toEqual({ posted: false });
    expect(errors()).toContain(`[curio:instagram] post failed: slide ${n} not ready: ${status}`);
    expect(graphCalls()).toHaveLength(0);
    expect(fetch).toHaveBeenCalledTimes(n); // sequential: stops at the first bad slide
  });

  it("stops before any Meta call when a slide answers 200 but isn't a JPEG", async () => {
    slide = async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } });
    const errors = captureErrors();
    expect(await postDailyCarouselToInstagram(word, { sleep: noSleep })).toEqual({ posted: false });
    expect(errors()).toContain("slide 1 not ready: 200 text/html");
    expect(graphCalls()).toHaveLength(0);
  });

  it("stops before any Meta call when a slide warm-up times out, logging the error name", async () => {
    slide = async () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    const errors = captureErrors();
    expect(await postDailyCarouselToInstagram(word, { sleep: noSleep })).toEqual({ posted: false });
    expect(errors()).toContain("[curio:instagram] post failed: TimeoutError");
    expect(graphCalls()).toHaveLength(0);
  });

  it("logs instead of posting (and warms nothing) when there's no token or user id", async () => {
    vi.mocked(getMetaToken).mockResolvedValueOnce(null);
    expect(await postDailyCarouselToInstagram(word, { sleep: noSleep })).toEqual({ posted: false });
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toContain("[curio:instagram:dev-fallback] would post a 5-slide carousel");
    for (let n = 1; n <= 5; n++) expect(logged).toContain(`${SLIDES}${n}`);
    expect(fetch).not.toHaveBeenCalled();
  });

  // Not only in production: a local .env.local with real tokens must never
  // hand Meta localhost URLs either.
  it.each(["production", "preview", ""])("refuses to post localhost slide URLs (VERCEL_ENV=%j)", async (env) => {
    vi.stubEnv("VERCEL_ENV", env);
    vi.stubEnv("CURIO_SITE_URL", "");
    const errors = captureErrors();
    expect(await postDailyCarouselToInstagram(word, { sleep: noSleep })).toEqual({ posted: false });
    expect(errors()).toContain("[curio:instagram] CURIO_SITE_URL points to localhost — not posting");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never throws when the token lookup rejects (e.g. Redis down), logs no message, and does not post", async () => {
    vi.mocked(getMetaToken).mockRejectedValueOnce(new Error("redis down"));
    const errors = captureErrors();
    expect(await postDailyCarouselToInstagram(word, { sleep: noSleep })).toEqual({ posted: false });
    const logged = errors();
    expect(logged).toContain("[curio:instagram] post failed: token lookup failed (Error)");
    expect(logged).not.toContain("redis down");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never logs a token that a failed Redis command echoes in its message", async () => {
    // @upstash/redis puts the command body in its error message, and a
    // failing set of the token record carries the live token.
    const upstash = new Error(
      'ERR max requests limit exceeded, command was: ["set","curio:social:token:instagram",{"token":"IGQlive-ig-secret","seed":"IGQlive-ig-secret"}]'
    );
    upstash.name = "UpstashError";
    vi.mocked(getMetaToken).mockRejectedValueOnce(upstash);
    const errors = captureErrors();
    expect(await postDailyCarouselToInstagram(word, { sleep: noSleep })).toEqual({ posted: false });
    const logged = errors();
    expect(logged).toContain("token lookup failed");
    expect(logged).toContain("UpstashError");
    expect(logged).not.toContain("IGQlive-ig-secret");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("logs only the error name for a network failure whose message echoes the token", async () => {
    meta.mockReset().mockRejectedValueOnce(new TypeError("fetch failed: https://graph.instagram.com/x?access_token=tok-ig"));
    const errors = captureErrors();
    expect(await postDailyCarouselToInstagram(word, { sleep: noSleep })).toEqual({ posted: false });
    const logged = errors();
    expect(logged).toContain("[curio:instagram] post failed:");
    expect(logged).toContain("TypeError");
    expect(logged).not.toContain("tok-ig");
  });

  it.each([
    { label: "the carousel create", position: 5 },
    { label: "a child create", position: 0 },
  ])("stops with no publish when $label returns 200 without an id", async ({ position }) => {
    meta = vi.fn();
    for (let i = 0; i < position; i++) meta.mockResolvedValueOnce(json({ id: `child${i + 1}` }));
    meta.mockResolvedValueOnce(json({}));
    const errors = captureErrors();
    expect(await postDailyCarouselToInstagram(word, { sleep: noSleep })).toEqual({ posted: false });
    expect(errors()).toContain("no container id");
    expect(meta).toHaveBeenCalledTimes(position + 1);
  });

  it.each([
    {
      label: "a child create fails",
      arrange: () => meta.mockReset().mockResolvedValueOnce(json({ error: { message: "bad image" } }, 400)),
      expected: "bad image",
    },
    {
      label: "the carousel container errors",
      arrange: () => {
        meta = vi.fn();
        for (let n = 1; n <= 5; n++) meta.mockResolvedValueOnce(json({ id: `child${n}` }));
        meta.mockResolvedValueOnce(json({ id: "car1" })).mockResolvedValueOnce(json({ status_code: "ERROR" }));
      },
      expected: "container ERROR",
    },
    {
      label: "the network throws",
      arrange: () => meta.mockReset().mockRejectedValueOnce(new Error("socket hang up")),
      expected: "Error",
    },
  ])("never throws, and logs without the token, when $label", async ({ arrange, expected }) => {
    arrange();
    const errors = captureErrors();
    expect(await postDailyCarouselToInstagram(word, { sleep: noSleep })).toEqual({ posted: false });
    const logged = errors();
    expect(logged).toContain("[curio:instagram] post failed");
    expect(logged).toContain(expected);
    expect(logged).not.toContain("tok-ig");
    expect(log.mock.calls.flat().join(" ")).not.toContain("[curio:instagram] posted");
  });

  it("gives up after 12 polls of IN_PROGRESS without publishing", async () => {
    const urls: string[] = [];
    meta = vi.fn(async (url: RequestInfo | URL) => {
      urls.push(String(url));
      if (urls.length <= 5) return json({ id: `child${urls.length}` });
      if (urls.length === 6) return json({ id: "car1" });
      return json({ status_code: "IN_PROGRESS" });
    });
    const errors = captureErrors();
    expect(await postDailyCarouselToInstagram(word, { sleep: noSleep })).toEqual({ posted: false });
    const logged = errors();
    expect(logged).toContain("container not ready");
    expect(logged).not.toContain("tok-ig");
    expect(noSleep).toHaveBeenCalledTimes(12);
    expect(urls.filter((u) => u.includes("fields=status_code"))).toHaveLength(12);
    expect(urls.some((u) => u.endsWith("/media_publish"))).toBe(false);
  });
});
