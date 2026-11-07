import { describe, expect, it, vi } from "vitest";

const WORD = {
  word: "tulip",
  slug: "tulip",
  teaser: "T",
  origin: "O",
  respelling: "r",
  partOfSpeech: "noun",
} as never;

vi.mock("@/lib/words", () => ({
  resolveTodayWord: vi.fn(async () => WORD),
}));

vi.mock("@/lib/dig/digLine", () => ({ getDigLine: vi.fn(async () => ({ prompt: "Name a beverage" })) }));

import { getDigLine } from "@/lib/dig/digLine";
import { GET } from "./route";

describe("GET /sample-email", () => {
  it("serves today's digest as noindex HTML with no real unsubscribe link", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    const html = await res.text();
    expect(html).toContain("tulip");
    expect(html).not.toContain("/unsubscribe");
  });

  it("story link is tagged as the sample, not the digest, so a prospect still sees the offer", async () => {
    const html = await (await GET()).text();
    expect(html).not.toContain("utm_source=email");
    expect(html).toMatch(/href="https?:\/\/[^"]+\/story\/tulip\?utm_source=sample"/);
  });

  it("shows today's dig line, tagged as the sample", async () => {
    const html = await (await GET()).text();
    expect(html).toContain("Play today");
    expect(html).toContain("Name a beverage");
    expect(html).toContain("utm_source=sample");
    expect(html).not.toContain("utm_source=email");
  });

  it("omits the dig line when there is no dig today", async () => {
    vi.mocked(getDigLine).mockResolvedValueOnce(null);
    const html = await (await GET()).text();
    expect(html).not.toContain("Play today");
    expect(html).not.toContain("daily-dig");
  });
});

describe("GET /sample-email caching", () => {
  it("lets the CDN cache it (s-maxage), so a public hit does not read the day from Redis each time", async () => {
    expect((await GET()).headers.get("cache-control")).toMatch(/s-maxage=300/);
  });
});
