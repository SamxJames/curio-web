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
});
