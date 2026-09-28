import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WordEntry } from "./words";
import { WORDS } from "./words";
import { storyPageTitle } from "./storyTitle";

function word(teaser: string): WordEntry {
  return {
    slug: "quarantine",
    word: "quarantine",
    respelling: "KWOR-uhn-teen",
    partOfSpeech: "noun",
    teaser,
    origin: "",
    journey: "",
    related: "",
    lineage: ["Latin", "Italian", "English"],
    clues: ["", "", ""],
  };
}

const URL = "https://example.com/story/quarantine?utm_source=bluesky&utm_medium=social&utm_campaign=daily-word";

// postDailyWordToBluesky's own success/failure/unconfigured paths, with the
// real @atproto/api client mocked — this is the path lib/bluesky.ts's own
// doc comment flags as running unattended in the daily cron with nobody
// watching, so a real posting failure needs to degrade gracefully (logged,
// not thrown) rather than break the rest of that cron run.
const { mockLogin, mockPost, mockDetectFacets } = vi.hoisted(() => ({
  mockLogin: vi.fn(),
  mockPost: vi.fn(),
  mockDetectFacets: vi.fn(async () => {}),
}));

vi.mock("@atproto/api", () => ({
  AtpAgent: vi.fn(function () {
    return {
      login: mockLogin,
      post: mockPost,
    };
  }),
  RichText: vi.fn(function ({ text }: { text: string }) {
    return {
      text,
      facets: undefined,
      detectFacets: mockDetectFacets,
    };
  }),
}));

// A single import, after the mock is registered — vi.mock is hoisted above
// this whole file regardless of where it's written, so one import already
// sees the mocked @atproto/api; a second, earlier-looking import of the
// same module wouldn't get an unmocked version, it would just be redundant.
const { buildBlueskyPost, buildStoryCard, graphemeLength, CARD_DESCRIPTION, postDailyWordToBluesky } =
  await import("./bluesky");

const ORIGINAL_ENV = { ...process.env };

describe("buildBlueskyPost", () => {
  it("is the teaser, then word · lineage, then the hashtags — and no link", () => {
    expect(buildBlueskyPost(word("A short teaser."))).toBe(
      "A short teaser.\n\nquarantine · Latin → Italian → English\n\n#etymology #wordoftheday"
    );
  });

  it("fits every word in the bank in 300 graphemes without truncating anything", () => {
    for (const w of WORDS) {
      const post = buildBlueskyPost(w);
      expect(graphemeLength(post)).toBeLessThanOrEqual(300);
      expect(post.startsWith(w.teaser)).toBe(true);
      expect(post).not.toContain("…");
    }
  });

  it("truncates only the teaser, by graphemes, if a teaser were ever too long", () => {
    const post = buildBlueskyPost(word("T".repeat(400)));
    expect(graphemeLength(post)).toBeLessThanOrEqual(300);
    expect(post).toContain("…");
    expect(post).toContain("quarantine · Latin → Italian → English");
    expect(post.endsWith("#etymology #wordoftheday")).toBe(true);
  });

  it("counts graphemes, not UTF-16 units", () => {
    expect(graphemeLength("é👍🏽")).toBe(2);
  });
});

describe("buildStoryCard", () => {
  beforeEach(() => {
    process.env.CURIO_SITE_URL = "https://example.com/";
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("links the UTM-tagged story page, titled like the page itself", () => {
    const card = buildStoryCard(word("A teaser."));
    expect(card.uri).toBe(URL);
    expect(card.title).toBe(storyPageTitle(word("A teaser.")));
    expect(card.title).toBe("quarantine: the origin of the word — Curio");
    expect(card.description).toBe(CARD_DESCRIPTION);
    expect(card.thumbUrl).toBe("https://example.com/story/quarantine/opengraph-image");
  });
});

describe("postDailyWordToBluesky", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLUESKY_IDENTIFIER = "curiodaily.bsky.social";
    process.env.BLUESKY_APP_PASSWORD = "app-password";
    // CURIO_SITE_URL is read by lib/siteUrl.ts (same fallback pattern as
    // lib/email.ts). The post text itself no longer contains a link — the
    // link now lives in the card, added in Task 2 — but this stays set for
    // parity with the rest of the cron path.
    process.env.CURIO_SITE_URL = "https://example.com";
    mockLogin.mockResolvedValue(undefined);
    mockPost.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("logs in, detects facets, posts, and reports success when the client succeeds", async () => {
    const result = await postDailyWordToBluesky(word("A teaser."), new Date("2026-01-01T00:00:00Z"));
    expect(result).toEqual({ posted: true });
    expect(mockLogin).toHaveBeenCalledWith({
      identifier: "curiodaily.bsky.social",
      password: "app-password",
    });
    // Facet detection is what turns the link into a real clickable facet
    // (see lib/bluesky.ts's own comment on RichText) — asserting it was
    // actually invoked means a silent removal of that call would fail this
    // test, not just a removal of the post itself.
    expect(mockDetectFacets).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledTimes(1);
    const postedText = mockPost.mock.calls[0][0].text;
    expect(postedText).not.toContain("http");
    expect(postedText).toContain("#etymology #wordoftheday");
  });

  it("catches a login failure, logs it, and reports posted: false without throwing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockLogin.mockRejectedValue(new Error("invalid credentials"));

    const result = await postDailyWordToBluesky(word("A teaser."), new Date("2026-01-01T00:00:00Z"));

    expect(result).toEqual({ posted: false });
    expect(mockPost).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("[curio:bluesky] post failed:", expect.any(Error));
    consoleError.mockRestore();
  });

  it("catches a post failure, logs it, and reports posted: false without throwing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockPost.mockRejectedValue(new Error("rate limited"));

    const result = await postDailyWordToBluesky(word("A teaser."), new Date("2026-01-01T00:00:00Z"));

    expect(result).toEqual({ posted: false });
    expect(consoleError).toHaveBeenCalledWith("[curio:bluesky] post failed:", expect.any(Error));
    consoleError.mockRestore();
  });

  it("skips the network call and reports posted: false when unconfigured", async () => {
    delete process.env.BLUESKY_IDENTIFIER;
    delete process.env.BLUESKY_APP_PASSWORD;

    const result = await postDailyWordToBluesky(word("A teaser."), new Date("2026-01-01T00:00:00Z"));

    expect(result).toEqual({ posted: false });
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });
});
