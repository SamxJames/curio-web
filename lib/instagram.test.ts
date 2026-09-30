import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WORDS, type WordEntry } from "./words";
import { buildInstagramCaption } from "./socialPost";

vi.mock("./metaTokens", () => ({ getMetaToken: vi.fn(async () => "tok-ig") }));
const { postDailyCarouselToInstagram } = await import("./instagram");
const { getMetaToken } = await import("./metaTokens");

const word = WORDS.find((w) => w.slug === "ketchup") as WordEntry;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const noSleep = vi.fn(async () => {});
const BASE = "https://graph.instagram.com/v25.0";

/** Happy path: 5 child containers, the carousel, one FINISHED poll, publish. */
function stubHappyPath() {
  const f = vi.fn();
  for (let n = 1; n <= 5; n++) f.mockResolvedValueOnce(json({ id: `child${n}` }));
  f.mockResolvedValueOnce(json({ id: "car1" }))
    .mockResolvedValueOnce(json({ status_code: "FINISHED" }))
    .mockResolvedValueOnce(json({ id: "media1" }));
  vi.stubGlobal("fetch", f);
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
  vi.stubEnv("INSTAGRAM_USER_ID", "ig1");
  vi.stubEnv("CURIO_SITE_URL", "https://curioword.com");
  stubHappyPath();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("postDailyCarouselToInstagram", () => {
  it("creates a child per slide in order, then the carousel, waits for FINISHED, then publishes", async () => {
    expect(await postDailyCarouselToInstagram(word, { sleep: noSleep })).toEqual({ posted: true });

    const calls = vi.mocked(fetch).mock.calls;
    expect(calls).toHaveLength(8);
    for (let n = 1; n <= 5; n++) {
      const [url, init] = calls[n - 1];
      expect(url).toBe(`${BASE}/ig1/media`);
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("image_url")).toBe(`https://curioword.com/social/carousel/ketchup/${n}`);
      expect(body.get("is_carousel_item")).toBe("true");
      expect(body.get("access_token")).toBe("tok-ig");
    }

    const [carUrl, carInit] = calls[5];
    expect(carUrl).toBe(`${BASE}/ig1/media`);
    const carBody = new URLSearchParams(String(carInit?.body));
    expect(carBody.get("media_type")).toBe("CAROUSEL");
    expect(carBody.get("children")).toBe("child1,child2,child3,child4,child5");
    expect(carBody.get("caption")).toBe(buildInstagramCaption(word));

    expect(String(calls[6][0])).toContain("/v25.0/car1?fields=status_code");
    const [publishUrl, publishInit] = calls[7];
    expect(publishUrl).toBe(`${BASE}/ig1/media_publish`);
    expect(new URLSearchParams(String(publishInit?.body)).get("creation_id")).toBe("car1");
    expect(noSleep).toHaveBeenCalledWith(5000);
  });

  it("logs instead of posting when there's no token or user id", async () => {
    vi.mocked(getMetaToken).mockResolvedValueOnce(null);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await postDailyCarouselToInstagram(word, { sleep: noSleep })).toEqual({ posted: false });
    const logged = log.mock.calls.flat().join(" ");
    log.mockRestore();
    expect(logged).toContain("[curio:instagram:dev-fallback] would post a 5-slide carousel");
    for (let n = 1; n <= 5; n++) expect(logged).toContain(`https://curioword.com/social/carousel/ketchup/${n}`);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses to post localhost slide URLs in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("CURIO_SITE_URL", "");
    const errors = captureErrors();
    expect(await postDailyCarouselToInstagram(word, { sleep: noSleep })).toEqual({ posted: false });
    expect(errors()).toContain("[curio:instagram] CURIO_SITE_URL is not set in production");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never throws when the token lookup rejects (e.g. Redis down), and does not post", async () => {
    vi.mocked(getMetaToken).mockRejectedValueOnce(new Error("redis down"));
    const errors = captureErrors();
    expect(await postDailyCarouselToInstagram(word, { sleep: noSleep })).toEqual({ posted: false });
    const logged = errors();
    expect(logged).toContain("[curio:instagram] post failed:");
    expect(logged).toContain("redis down");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("logs only the error name for a network failure whose message echoes the token", async () => {
    vi.mocked(fetch)
      .mockReset()
      .mockRejectedValueOnce(new TypeError("fetch failed: https://graph.instagram.com/x?access_token=tok-ig"));
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
    const f = vi.fn();
    for (let i = 0; i < position; i++) f.mockResolvedValueOnce(json({ id: `child${i + 1}` }));
    f.mockResolvedValueOnce(json({}));
    vi.stubGlobal("fetch", f);
    const errors = captureErrors();
    expect(await postDailyCarouselToInstagram(word, { sleep: noSleep })).toEqual({ posted: false });
    expect(errors()).toContain("no container id");
    expect(f).toHaveBeenCalledTimes(position + 1);
  });

  it.each([
    {
      label: "a child create fails",
      arrange: () => vi.mocked(fetch).mockReset().mockResolvedValueOnce(json({ error: { message: "bad image" } }, 400)),
      expected: "bad image",
    },
    {
      label: "the carousel container errors",
      arrange: () => {
        const f = vi.fn();
        for (let n = 1; n <= 5; n++) f.mockResolvedValueOnce(json({ id: `child${n}` }));
        f.mockResolvedValueOnce(json({ id: "car1" })).mockResolvedValueOnce(json({ status_code: "ERROR" }));
        vi.stubGlobal("fetch", f);
      },
      expected: "container ERROR",
    },
    {
      label: "the network throws",
      arrange: () => vi.mocked(fetch).mockReset().mockRejectedValueOnce(new Error("socket hang up")),
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
  });

  it("gives up after 12 polls of IN_PROGRESS without publishing", async () => {
    const urls: string[] = [];
    vi.mocked(fetch).mockReset().mockImplementation(async (url) => {
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
