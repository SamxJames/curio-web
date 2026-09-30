import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { GET } from "./route";

// next/og fetches Google Fonts for glyphs Geist lacks (fiasco's origin has
// a ǭ). Tests must not touch the network, so refuse every http(s) fetch and
// let the image render with a missing glyph; data: URLs (its own wasm) pass.
let httpFetches: string[];
beforeEach(() => {
  httpFetches = [];
  const real = globalThis.fetch;
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("data:")) return real(input, init);
    httpFetches.push(url);
    return Promise.reject(new Error("network disabled in tests"));
  });
});
afterEach(() => vi.unstubAllGlobals());

const call = (slug: string, slide: string) =>
  GET(new Request(`http://localhost/social/carousel/${slug}/${slide}`), {
    params: Promise.resolve({ slug, slide }),
  });

describe("GET /social/carousel/[slug]/[slide]", () => {
  it("renders a 1080×1350 JPEG for each of a word's slides", async () => {
    for (const n of ["1", "2", "3"]) {
      const res = await call("fiasco", n);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/jpeg");
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff])); // JPEG magic
      const meta = await sharp(bytes).metadata();
      expect({ w: meta.width, h: meta.height, f: meta.format }).toEqual({ w: 1080, h: 1350, f: "jpeg" });
    }
    // Proves the stub is what kept us offline, not luck.
    expect(httpFetches.every((u) => u.startsWith("https://fonts.g"))).toBe(true);
  }, 30_000);

  it.each([
    ["nope-not-a-word", "1"],
    ["fiasco", "0"],
    ["fiasco", "99"],
    ["fiasco", "1.5"],
    ["fiasco", "abc"],
  ])("404s for %s / %s, marked noindex", async (slug, slide) => {
    const res = await call(slug, slide);
    expect(res.status).toBe(404);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });

  // Meta's fetcher must be able to reach these (so robots.txt allows
  // /social/), but they aren't pages: every response says noindex.
  it("marks a rendered slide noindex", async () => {
    const res = await call("fiasco", "1");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  }, 30_000);

  it("lets the CDN keep an all-Latin slide for a day", async () => {
    const res = await call("ketchup", "1");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600, s-maxage=86400");
  }, 30_000);

  it("never caches a slide that needs a Google Font (ketchup's 膎汁): a failed font fetch draws boxes", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call("ketchup", "3");
    const logged = error.mock.calls.flat().map(String).join(" ");
    error.mockRestore();
    // The stub refused the font, and next/og only logged it: exactly the
    // silent failure a cached 200 would have preserved.
    expect(logged).toContain("Failed to load dynamic font");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("no-store");
  }, 30_000);
});
