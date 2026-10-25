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
});
