import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WORDS, type WordEntry } from "./words";
import {
  buildCarouselSlides,
  buildInstagramCaption,
  buildThreadsPost,
  carouselSlideUrl,
  GEIST_EXTRAS,
  INSTAGRAM_HASHTAGS,
  needsFallbackFont,
  slideText,
  socialStoryUrl,
  splitSentences,
  storyLabel,
  type Slide,
} from "./socialPost";

const ketchup = WORDS.find((w) => w.slug === "ketchup") as WordEntry;

beforeEach(() => vi.stubEnv("CURIO_SITE_URL", "https://curioword.com"));
afterEach(() => vi.unstubAllEnvs());

describe("carouselSlideUrl", () => {
  it("is the absolute, 1-based slide URL", () => {
    expect(carouselSlideUrl(ketchup, 3)).toBe("https://curioword.com/social/carousel/ketchup/3");
  });
});

/** The code points a TrueType font maps to a real glyph, from its cmap's
 * format 4 (BMP) and format 12 (full Unicode) subtables. Enough to check
 * Geist; not a general font parser. */
function cmapCodePoints(font: Buffer): Set<number> {
  const dv = new DataView(font.buffer, font.byteOffset, font.byteLength);
  let cmap = -1;
  for (let i = 0; i < dv.getUint16(4); i++) {
    const rec = 12 + i * 16;
    if (font.toString("latin1", rec, rec + 4) === "cmap") cmap = dv.getUint32(rec + 8);
  }
  if (cmap < 0) throw new Error("no cmap table");
  const covered = new Set<number>();
  for (let i = 0; i < dv.getUint16(cmap + 2); i++) {
    const sub = cmap + dv.getUint32(cmap + 4 + i * 8 + 4);
    const format = dv.getUint16(sub);
    if (format === 4) {
      const segX2 = dv.getUint16(sub + 6);
      const ends = sub + 14;
      const starts = ends + segX2 + 2; // + reservedPad
      const deltas = starts + segX2;
      const rangeOffsets = deltas + segX2;
      for (let s = 0; s < segX2 / 2; s++) {
        const start = dv.getUint16(starts + s * 2);
        const end = dv.getUint16(ends + s * 2);
        const delta = dv.getUint16(deltas + s * 2);
        const rangeOffset = dv.getUint16(rangeOffsets + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let glyph = c;
          if (rangeOffset !== 0) {
            // idRangeOffset counts from its own slot in the array.
            glyph = dv.getUint16(rangeOffsets + s * 2 + rangeOffset + (c - start) * 2);
            if (glyph === 0) continue;
          }
          if ((glyph + delta) & 0xffff) covered.add(c);
        }
      }
    } else if (format === 12) {
      for (let g = 0; g < dv.getUint32(sub + 12); g++) {
        const group = sub + 16 + g * 12;
        const [first, last, glyph] = [0, 4, 8].map((o) => dv.getUint32(group + o));
        for (let c = first; c <= last; c++) if (glyph + (c - first) !== 0) covered.add(c);
      }
    }
  }
  return covered;
}

// The font next/og actually draws with: any character outside it sends
// next/og to Google Fonts, and that is what needsFallbackFont must catch.
const GEIST = cmapCodePoints(
  readFileSync(resolve(process.cwd(), "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"))
);
const geistLacks = (text: string) =>
  [...text].filter((ch) => ch !== "\n" && ch !== "\t" && !GEIST.has(ch.codePointAt(0) as number));

describe("the Geist cmap reader", () => {
  it("reads next/og's bundled Geist: ASCII yes, ǭ and Han no", () => {
    expect(geistLacks("Aa0 ~")).toEqual([]);
    expect(geistLacks("ǭ汁")).toEqual(["ǭ", "汁"]);
  });
});

describe("needsFallbackFont", () => {
  it.each(["fiasco", 'Plain ASCII: "quotes", 1 / 3 & (parens)!', "a → b · c — “d” ‘e’ – f…", "Swipe →", ""])(
    "is false for ASCII and the few punctuation marks the copy uses: %j",
    (text) => expect(needsFallbackFont(text)).toBe(false)
  );

  it("allows newlines and tabs", () => {
    expect(needsFallbackFont("a\nb\tc")).toBe(false);
  });

  it.each([
    "Old Norse ǭ, Middle English", // ǭ
    "Proto-Indo-European *ǵʰer-", // ǵʰ
    "*ḱerh₂-", // ḱ, subscript 2
    "ǣ ḗ ʷ ṓ ˀ", // ǣ ḗ ʷ ṓ ˀ
    "n̥", // combining ring below
  ])("is true for Latin-extended and IPA characters Geist lacks: %j", (text) =>
    expect(needsFallbackFont(text)).toBe(true)
  );

  it.each(["Hokkien 膎汁 (kê-chiap)", "Greek λόγος", "Arabic قهوة", "Hebrew שבת", "Russian водка"])(
    "is true for other scripts: %j",
    (text) => expect(needsFallbackFont(text)).toBe(true)
  );

  it("is conservative: even an accented letter Geist may have counts", () => {
    expect(needsFallbackFont("café")).toBe(true);
    expect(needsFallbackFont("café")).toBe(true);
  });

  it("allows only characters next/og's Geist really has", () => {
    const ascii = Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i));
    const allowed = [...ascii, ...GEIST_EXTRAS];
    for (const ch of allowed) expect(needsFallbackFont(ch), ch).toBe(false);
    // A Next upgrade whose Geist drops one of these fails here.
    expect(geistLacks(allowed.join(""))).toEqual([]);
  });

  it("flags every slide in the bank that draws a character Geist lacks", () => {
    const missed: string[] = [];
    for (const word of WORDS) {
      buildCarouselSlides(word).forEach((slide, i) => {
        const text = slideText(slide);
        if (geistLacks(text).length > 0 && !needsFallbackFont(text)) missed.push(`${word.slug}/${i + 1}`);
      });
    }
    expect(missed).toEqual([]);
  });
});

describe("storyLabel", () => {
  it("numbers the story slides, but a lone one gets no '1 / 1'", () => {
    expect(storyLabel({ kind: "story", text: "t", index: 2, total: 3 })).toBe("2 / 3");
    expect(storyLabel({ kind: "story", text: "t", index: 1, total: 1 })).toBeNull();
    expect(slideText({ kind: "story", text: "t", index: 1, total: 1 })).not.toContain("1 / 1");
  });
});

describe("slideText", () => {
  // A Han character in each drawn field in turn: every one must reach the check.
  const HAN = "汁";
  const cases: [string, Slide][] = [
    ["hook text", { kind: "hook", text: HAN }],
    ["word", { kind: "word", word: HAN, respelling: "r", partOfSpeech: "noun", lineage: "a" }],
    ["respelling", { kind: "word", word: "w", respelling: HAN, partOfSpeech: "noun", lineage: "a" }],
    ["part of speech", { kind: "word", word: "w", respelling: "r", partOfSpeech: HAN, lineage: "a" }],
    ["lineage", { kind: "word", word: "w", respelling: "r", partOfSpeech: "noun", lineage: HAN }],
    ["story text", { kind: "story", text: HAN, index: 1, total: 2 }],
  ];
  it.each(cases)("includes the %s", (_field, slide) => {
    expect(needsFallbackFont(slideText(slide))).toBe(true);
  });

  it("includes the fixed hook and outro copy, which is all Latin", () => {
    expect(slideText({ kind: "hook", text: "t" })).toContain("CURIO");
    expect(slideText({ kind: "outro" })).toContain("curioword.com");
    expect(needsFallbackFont(slideText({ kind: "outro" }))).toBe(false);
  });

  it("flags ketchup's first story slide (膎汁) and not its hook", () => {
    const slides = buildCarouselSlides(ketchup);
    expect(needsFallbackFont(slideText(slides[2]))).toBe(true);
    expect(needsFallbackFont(slideText(slides[0]))).toBe(false);
  });
});

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
