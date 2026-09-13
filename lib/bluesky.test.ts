import { describe, expect, it } from "vitest";
import { buildBlueskyPost } from "./bluesky";
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
