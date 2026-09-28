import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppBskyFeedPost } from "@atproto/api";
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
const { mockLogin, mockPost, mockDetectFacets, mockUploadBlob } = vi.hoisted(() => ({
  mockLogin: vi.fn(),
  mockPost: vi.fn(),
  mockDetectFacets: vi.fn(async () => {}),
  mockUploadBlob: vi.fn(),
}));

// The factory stays async so it can re-import the real @atproto/api and keep
// its actual AppBskyFeedPost — this test validates real post records against
// the real lexicon, not a hand-rolled shape that could drift from it.
vi.mock("@atproto/api", async (importOriginal) => ({
  AppBskyFeedPost: (await importOriginal<typeof import("@atproto/api")>()).AppBskyFeedPost,
  AtpAgent: vi.fn(function () {
    return {
      login: mockLogin,
      post: mockPost,
      uploadBlob: mockUploadBlob,
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
    // CURIO_SITE_URL feeds the card link and thumbnail URL.
    process.env.CURIO_SITE_URL = "https://example.com";
    mockLogin.mockResolvedValue(undefined);
    mockPost.mockResolvedValue(undefined);

    // The thumbnail fetch is a real fetch() to the story's own OG image
    // route — stub it so no test reaches the network, and default it to a
    // small valid PNG so the happy path exercises the upload too.
    const png = new Uint8Array([137, 80, 78, 71]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(png, { status: 200, headers: { "content-type": "image/png" } }))
    );
    mockUploadBlob.mockResolvedValue({ data: { blob: { ref: "bafy-thumb" } } });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("logs in, detects facets, posts, and reports success (and a thumbnail) when the client succeeds", async () => {
    const result = await postDailyWordToBluesky(word("A teaser."), new Date("2026-01-01T00:00:00Z"));
    expect(result).toEqual({ posted: true, thumb: true });
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

    expect(result).toEqual({ posted: false, thumb: false });
    expect(mockPost).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("[curio:bluesky] post failed:", expect.any(Error));
    consoleError.mockRestore();
  });

  it("catches a post failure, logs it, and reports posted: false without throwing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockPost.mockRejectedValue(new Error("rate limited"));

    const result = await postDailyWordToBluesky(word("A teaser."), new Date("2026-01-01T00:00:00Z"));

    expect(result).toEqual({ posted: false, thumb: false });
    expect(consoleError).toHaveBeenCalledWith("[curio:bluesky] post failed:", expect.any(Error));
    consoleError.mockRestore();
  });

  it("skips the network call and reports posted: false when unconfigured", async () => {
    delete process.env.BLUESKY_IDENTIFIER;
    delete process.env.BLUESKY_APP_PASSWORD;

    const result = await postDailyWordToBluesky(word("A teaser."), new Date("2026-01-01T00:00:00Z"));

    expect(result).toEqual({ posted: false, thumb: false });
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("refuses to post in production when CURIO_SITE_URL isn't set (would link and thumbnail to localhost)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("VERCEL_ENV", "production");
    delete process.env.CURIO_SITE_URL;

    const result = await postDailyWordToBluesky(word("A teaser."), new Date("2026-01-01T00:00:00Z"));

    expect(result).toEqual({ posted: false, thumb: false });
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      "[curio:bluesky] CURIO_SITE_URL is not set in production — not posting a card that links to localhost"
    );
    consoleError.mockRestore();
    vi.unstubAllEnvs();
  });

  it("posts the text with an external link card carrying the uploaded thumbnail — a valid post record", async () => {
    const result = await postDailyWordToBluesky(word("A teaser."), new Date("2026-01-01T00:00:00Z"));
    expect(result).toEqual({ posted: true, thumb: true });

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "https://example.com/story/quarantine/opengraph-image",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(mockUploadBlob).toHaveBeenCalledWith(expect.any(Uint8Array), { encoding: "image/png" });

    const record = mockPost.mock.calls[0][0];
    expect(record.embed).toEqual({
      $type: "app.bsky.embed.external",
      external: {
        uri: URL,
        title: "quarantine: the origin of the word — Curio",
        description: CARD_DESCRIPTION,
        thumb: { ref: "bafy-thumb" },
      },
    });
    // The mock's { ref: "bafy-thumb" } isn't a real BlobRef, so validating
    // the full record would fail on that alone — strip it and validate the
    // card's shape without it.
    const { external } = record.embed;
    const externalWithoutThumb = { uri: external.uri, title: external.title, description: external.description };
    expect(
      AppBskyFeedPost.validateRecord({
        $type: "app.bsky.feed.post",
        text: record.text,
        createdAt: record.createdAt,
        embed: { $type: "app.bsky.embed.external", external: externalWithoutThumb },
      }).success
    ).toBe(true);
  });

  it.each([
    ["the image fetch fails", () => vi.mocked(fetch).mockRejectedValueOnce(new Error("timeout"))],
    [
      "the image is not an image",
      () => vi.mocked(fetch).mockResolvedValueOnce(new Response("nope", { headers: { "content-type": "text/html" } })),
    ],
    [
      "the image is too big",
      () =>
        vi
          .mocked(fetch)
          .mockResolvedValueOnce(new Response(new Uint8Array(1_000_001), { headers: { "content-type": "image/png" } })),
    ],
    ["the upload fails", () => mockUploadBlob.mockRejectedValueOnce(new Error("blob rejected"))],
  ])("still posts the card, without a thumbnail, when %s", async (label, arrange) => {
    void label;
    arrange();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await postDailyWordToBluesky(word("A teaser."), new Date("2026-01-01T00:00:00Z"));
    warn.mockRestore();

    expect(result).toEqual({ posted: true, thumb: false });
    const external = mockPost.mock.calls[0][0].embed.external;
    expect(external.uri).toBe(URL);
    expect(external).not.toHaveProperty("thumb");
  });
});
