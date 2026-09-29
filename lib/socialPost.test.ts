import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WORDS, type WordEntry } from "./words";
import {
  buildCarouselSlides,
  buildInstagramCaption,
  buildThreadsPost,
  INSTAGRAM_HASHTAGS,
  socialStoryUrl,
  splitSentences,
} from "./socialPost";

const ketchup = WORDS.find((w) => w.slug === "ketchup") as WordEntry;

beforeEach(() => vi.stubEnv("CURIO_SITE_URL", "https://curioword.com"));
afterEach(() => vi.unstubAllEnvs());

describe("socialStoryUrl", () => {
  it("tags the story link with the channel", () => {
    const url = new URL(socialStoryUrl(ketchup, "threads"));
    expect(url.origin + url.pathname).toBe("https://curioword.com/story/ketchup");
    expect(url.searchParams.get("utm_source")).toBe("threads");
    expect(url.searchParams.get("utm_medium")).toBe("social");
    expect(url.searchParams.get("utm_campaign")).toBe("daily-word");
  });
});

describe("buildThreadsPost", () => {
  it("is the teaser, word · lineage, and one topic tag — no URL", () => {
    expect(buildThreadsPost(ketchup)).toBe(
      `${ketchup.teaser}\n\nketchup · ${ketchup.lineage.join(" → ")}\n\n#etymology`
    );
  });

  it("fits Threads' 500 limit, counted in UTF-8 bytes, for every word in the bank", () => {
    for (const w of WORDS) {
      const text = buildThreadsPost(w);
      expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(500);
      expect(text).not.toMatch(/https?:/);
    }
  });
});

describe("buildInstagramCaption", () => {
  it("has the teaser, the lineage line, the link-in-bio line and the hashtags", () => {
    expect(buildInstagramCaption(ketchup)).toBe(
      `${ketchup.teaser}\n\nketchup · ${ketchup.lineage.join(" → ")}\n\n` +
        `The full story is at curioword.com (link in bio).\n\n${INSTAGRAM_HASHTAGS}`
    );
  });

  it("stays within Instagram's 2,200 characters and 30 hashtags for every word", () => {
    for (const w of WORDS) {
      const caption = buildInstagramCaption(w);
      expect([...caption].length).toBeLessThanOrEqual(2200);
      expect((caption.match(/#/g) ?? []).length).toBeLessThanOrEqual(30);
    }
  });
});

describe("splitSentences", () => {
  it("splits on sentence ends followed by a space, keeping the punctuation", () => {
    expect(splitSentences("One. Two! Three? Four")).toEqual(["One.", "Two!", "Three?", "Four"]);
  });

  it("keeps text without sentence breaks whole", () => {
    expect(splitSentences("Hokkien 膎汁 (kê-chiap), fish sauce")).toEqual(["Hokkien 膎汁 (kê-chiap), fish sauce"]);
  });
});

describe("buildCarouselSlides", () => {
  it("is hook, word, one story slide per origin sentence, then the outro", () => {
    const slides = buildCarouselSlides(ketchup);
    const sentences = splitSentences(ketchup.origin);
    expect(slides[0]).toEqual({ kind: "hook", text: ketchup.teaser });
    expect(slides[1]).toEqual({
      kind: "word",
      word: "ketchup",
      respelling: ketchup.respelling,
      partOfSpeech: ketchup.partOfSpeech,
      lineage: ketchup.lineage.join(" → "),
    });
    expect(slides.slice(2, -1).map((s) => (s.kind === "story" ? s.text : ""))).toEqual(sentences);
    expect(slides.at(-1)).toEqual({ kind: "outro" });
  });

  it("uses only stored text: the story slides rejoin to exactly the origin", () => {
    for (const w of WORDS) {
      const story = buildCarouselSlides(w).filter((s) => s.kind === "story");
      expect(story.map((s) => (s.kind === "story" ? s.text : "")).join(" ")).toBe(
        splitSentences(w.origin).join(" ")
      );
    }
  });

  it("gives every word 4–6 slides (Instagram allows 2–10), numbering the story slides", () => {
    for (const w of WORDS) {
      const slides = buildCarouselSlides(w);
      expect(slides.length).toBeGreaterThanOrEqual(4);
      expect(slides.length).toBeLessThanOrEqual(6);
      const story = slides.filter((s) => s.kind === "story");
      story.forEach((s, i) => {
        if (s.kind === "story") expect({ index: s.index, total: s.total }).toEqual({ index: i + 1, total: story.length });
      });
    }
  });
});
