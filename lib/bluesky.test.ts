import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WordEntry } from "./words";

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
const { buildBlueskyPost, postDailyWordToBluesky } = await import("./bluesky");

describe("buildBlueskyPost", () => {
  it("includes the word, teaser, and link", () => {
    const post = buildBlueskyPost(word("A short teaser."), URL);
    expect(post).toContain("quarantine");
    expect(post).toContain("A short teaser.");
    expect(post).toContain(URL);
  });

  it("stays within 300 characters", () => {
    const longTeaser = "T".repeat(400);
    const post = buildBlueskyPost(word(longTeaser), URL);
    expect(post.length).toBeLessThanOrEqual(300);
  });

  it("truncates the teaser, never the word or link, when too long", () => {
    const longTeaser = "T".repeat(400);
    const post = buildBlueskyPost(word(longTeaser), URL);
    expect(post).toContain("quarantine");
    expect(post).toContain(URL);
    expect(post).toContain("…");
  });

  it("leaves a short teaser untruncated", () => {
    const post = buildBlueskyPost(word("Short."), URL);
    expect(post).not.toContain("…");
  });
});

const ORIGINAL_ENV = { ...process.env };

describe("postDailyWordToBluesky", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLUESKY_IDENTIFIER = "curiodaily.bsky.social";
    process.env.BLUESKY_APP_PASSWORD = "app-password";
    // postDailyWordToBluesky builds its own story URL internally (via
    // buildStoryUrl + CURIO_SITE_URL, same fallback pattern as
    // lib/email.ts) rather than accepting one as a parameter — pinning it
    // here to the same origin the top-level URL constant uses is what lets
    // the success test below assert the posted text contains that exact
    // UTM-tagged link.
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
    expect(postedText).toContain(URL);
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
