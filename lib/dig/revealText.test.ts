import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { graphemeLength } from "@/lib/blueskyPost";
import { isTrafficSource } from "@/lib/traffic";
import { bannedHits } from "./copyAudit";
import {
  SAMPLE_REVEAL,
  buildBlueskyReveal,
  buildRevealCard,
  buildThreadsReveal,
  isRevealDay,
  revealUrl,
  type DigReveal,
} from "./revealText";

const reveal: DigReveal = {
  date: "2026-11-14",
  number: 8,
  prompt: "Name a beverage",
  fossilWord: "kvass",
  fact: "Borrowed from Russian, where it names a fermented drink made from stale rye bread.",
};
const withFact = (fact: string, over: Partial<DigReveal> = {}): DigReveal => ({ ...reveal, fact, ...over });
const bytes = (s: string) => Buffer.byteLength(s, "utf8");

beforeEach(() => vi.stubEnv("CURIO_SITE_URL", "https://example.com"));
afterEach(() => vi.unstubAllEnvs());

describe("isRevealDay", () => {
  it("is every other day: odd dig numbers", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(isRevealDay)).toEqual([true, false, true, false, true, false, true]);
  });
  it("is false for anything that is not a day number", () => {
    for (const n of [0, -1, 1.5, Number.NaN]) expect(isRevealDay(n)).toBe(false);
  });
});

describe("revealUrl", () => {
  it("is the dated answers page, tagged so landings are credited to the channel", () => {
    const u = new URL(revealUrl("2026-11-14", "threads"));
    expect(u.origin).toBe("https://example.com");
    expect(u.pathname).toBe("/dig/2026-11-14");
    expect(u.searchParams.get("utm_source")).toBe("threads");
    expect(u.searchParams.get("utm_medium")).toBe("social");
    expect(u.searchParams.get("utm_campaign")).toBe("dig-reveal");
  });
  it.each(["bluesky", "threads"] as const)("%s is a recognised traffic source", (s) => {
    expect(isTrafficSource(new URL(revealUrl("2026-11-14", s)).searchParams.get("utm_source"))).toBe(true);
  });
});

describe("buildBlueskyReveal", () => {
  it("names the prompt and the rarest answer, then the fact, the link on its own line, then the hashtags", () => {
    const text = buildBlueskyReveal(reveal);
    const [lead, link, tags] = text.split("\n\n");
    expect(lead).toBe(`Yesterday's curio dig asked “Name a beverage”. The rarest answer: kvass. ${reveal.fact}`);
    expect(link).toBe(revealUrl("2026-11-14", "bluesky"));
    expect(tags).toBe("#etymology #wordoftheday");
    expect(text.split("\n\n")).toHaveLength(3);
  });

  it("keeps the link a bare paragraph so Bluesky's facet detection makes it clickable", () => {
    const url = revealUrl("2026-11-14", "bluesky");
    const text = buildBlueskyReveal(reveal);
    expect(text.split("\n").filter((l) => l === url)).toHaveLength(1);
  });

  it("never exceeds 300 graphemes, however long the fact", () => {
    for (const len of [0, 20, 60, 120, 200, 400, 2000]) {
      const text = buildBlueskyReveal(withFact("word ".repeat(len / 5).trim()));
      expect(graphemeLength(text)).toBeLessThanOrEqual(300);
    }
  });

  it("trims a long fact at a word boundary with an ellipsis, keeping the link and hashtags", () => {
    const fact = "Borrowed from Russian, where it names a fermented drink made from stale rye bread, sold from street barrels in summer.";
    const text = buildBlueskyReveal(withFact(fact));
    const lead = text.split("\n\n")[0];
    expect(lead.endsWith("…")).toBe(true);
    const kept = lead.slice(lead.indexOf(". ", lead.indexOf("rarest")) + 2, -1);
    expect(fact.startsWith(kept)).toBe(true);
    expect(fact.charAt(kept.length)).toBe(" ");
    expect(text).toContain(revealUrl("2026-11-14", "bluesky"));
    expect(text.endsWith("#etymology #wordoftheday")).toBe(true);
    expect(graphemeLength(text)).toBeLessThanOrEqual(300);
  });

  it("drops the fact rather than keep a scrap of it", () => {
    const text = buildBlueskyReveal(withFact("x".repeat(500)));
    expect(text.split("\n\n")[0]).toBe("Yesterday's curio dig asked “Name a beverage”. The rarest answer: kvass.");
  });

  it("has no fact sentence when there is none", () => {
    expect(buildBlueskyReveal(withFact(""))).toBe(
      `Yesterday's curio dig asked “Name a beverage”. The rarest answer: kvass.\n\n${revealUrl("2026-11-14", "bluesky")}\n\n#etymology #wordoftheday`
    );
  });

  it("counts graphemes, not UTF-16 units, when fitting the fact", () => {
    // 60 skin-toned thumbs are 60 graphemes but 240 UTF-16 units.
    const text = buildBlueskyReveal(withFact("👍🏽 ".repeat(60).trim(), { fossilWord: "kvass" }));
    expect(graphemeLength(text)).toBeLessThanOrEqual(300);
  });

  it("drops a fact that would trip the copy audit", () => {
    const text = buildBlueskyReveal(withFact("Everyone in Russia drinks it, and 90% of cafes sell it every single day."));
    expect(text).not.toMatch(/everyone|90%/i);
    expect(text.split("\n\n")[0]).toBe("Yesterday's curio dig asked “Name a beverage”. The rarest answer: kvass.");
  });

  it("is clean under the shared copy audit and says dug or asked, never played", () => {
    expect(bannedHits(buildBlueskyReveal(reveal))).toEqual([]);
  });

  it("still fits when the prompt and word are unusually long", () => {
    const text = buildBlueskyReveal(withFact("", { prompt: "Name a word English took from " + "Old Norse ".repeat(6), fossilWord: "a".repeat(40) }));
    expect(graphemeLength(text)).toBeLessThanOrEqual(300);
    expect(text).toContain(revealUrl("2026-11-14", "bluesky"));
  });
});

describe("buildThreadsReveal", () => {
  it("is the same lead, the Threads-tagged link, and the single Threads tag", () => {
    const text = buildThreadsReveal(reveal);
    expect(text).toBe(
      `Yesterday's curio dig asked “Name a beverage”. The rarest answer: kvass. ${reveal.fact}\n\n${revealUrl("2026-11-14", "threads")}\n\n#etymology`
    );
  });

  it("never exceeds 500 UTF-8 bytes, however long or multibyte the fact", () => {
    for (const fact of ["", "word ".repeat(300).trim(), "é".repeat(400), "👍🏽 ".repeat(120).trim(), "кв".repeat(300)]) {
      expect(bytes(buildThreadsReveal(withFact(fact)))).toBeLessThanOrEqual(500);
    }
  });

  it("trims at a word boundary with an ellipsis", () => {
    const text = buildThreadsReveal(withFact("word ".repeat(300).trim()));
    expect(text.split("\n\n")[0]).toMatch(/word…$/);
    expect(text).toContain(revealUrl("2026-11-14", "threads"));
  });

  it("is clean under the shared copy audit", () => {
    expect(bannedHits(buildThreadsReveal(reveal))).toEqual([]);
  });
});

describe("buildRevealCard", () => {
  it("links the same tagged page and uses its own link-preview image", () => {
    const card = buildRevealCard(reveal);
    expect(card.uri).toBe(revealUrl("2026-11-14", "bluesky"));
    expect(card.thumbUrl).toBe("https://example.com/dig/2026-11-14/opengraph-image");
    expect(card.title).toContain("day 8");
    expect(bannedHits(`${card.title} ${card.description}`)).toEqual([]);
  });
});

describe("SAMPLE_REVEAL", () => {
  it("is a reveal day that fits both limits, for the preview scripts", () => {
    expect(isRevealDay(SAMPLE_REVEAL.number)).toBe(true);
    expect(graphemeLength(buildBlueskyReveal(SAMPLE_REVEAL))).toBeLessThanOrEqual(300);
    expect(bytes(buildThreadsReveal(SAMPLE_REVEAL))).toBeLessThanOrEqual(500);
  });
});

describe("module hygiene", () => {
  it("imports nothing from ./server or the poster libraries, so previews stay offline", () => {
    const src = readFileSync(new URL("./revealText.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/from ["']\.\/server["']/);
    expect(src).not.toMatch(/@atproto|metaTokens|\/redis/);
  });
});
