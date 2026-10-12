import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  CURIO_PROFILES,
  buildLanguageJsonLd,
  buildSiteJsonLd,
  buildStoryJsonLd,
  serializeJsonLd,
} from "./storyJsonLd";
import { WORDS } from "./words";

const original = process.env.CURIO_SITE_URL;
const quarantine = WORDS.find((w) => w.slug === "quarantine")!;

beforeEach(() => {
  process.env.CURIO_SITE_URL = "https://curio.example";
});

afterEach(() => {
  if (original === undefined) delete process.env.CURIO_SITE_URL;
  else process.env.CURIO_SITE_URL = original;
});

describe("buildStoryJsonLd", () => {
  it("describes the word as a DefinedTerm in Curio's term set", () => {
    expect(buildStoryJsonLd(quarantine)).toEqual({
      "@context": "https://schema.org",
      "@type": "DefinedTerm",
      name: "quarantine",
      description: quarantine.teaser,
      url: "https://curio.example/story/quarantine",
      inDefinedTermSet: {
        "@type": "DefinedTermSet",
        name: "Curio",
        url: "https://curio.example/words",
      },
    });
  });

  it("claims nothing Curio cannot support", () => {
    // No author, no dates, no ratings — see the spec's "only true claims".
    for (const word of WORDS.slice(0, 50)) {
      const keys = Object.keys(buildStoryJsonLd(word));
      for (const forbidden of ["author", "datePublished", "dateModified", "aggregateRating", "publisher"]) {
        expect(keys).not.toContain(forbidden);
      }
    }
  });

  it("produces valid JSON for every word in the bank", () => {
    for (const word of WORDS) {
      expect(() => JSON.parse(serializeJsonLd(buildStoryJsonLd(word)))).not.toThrow();
    }
  });
});

describe("serializeJsonLd", () => {
  it("escapes < so content can never close the script tag", () => {
    const output = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(output).not.toContain("</script>");
    expect(output).toContain("\\u003c");
    expect(JSON.parse(output)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});

describe("buildSiteJsonLd", () => {
  it("names the site Curio and links the organisation to its social accounts", () => {
    const graph = buildSiteJsonLd()["@graph"] as Record<string, unknown>[];
    const site = graph.find((node) => node["@type"] === "WebSite")!;
    const org = graph.find((node) => node["@type"] === "Organization")!;
    expect(site).toMatchObject({
      name: "Curio",
      url: "https://curio.example/",
      publisher: { "@id": org["@id"] },
    });
    expect(org).toMatchObject({
      name: "Curio",
      url: "https://curio.example/",
      logo: "https://curio.example/apple-icon.png",
      sameAs: CURIO_PROFILES,
    });
  });
});

describe("buildLanguageJsonLd", () => {
  it("describes the page as a DefinedTermSet listing each word", () => {
    expect(
      buildLanguageJsonLd({
        name: "Arabic",
        slug: "arabic",
        words: [
          { word: "algebra", slug: "algebra" },
          { word: "coffee", slug: "coffee" },
        ],
      }),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "DefinedTermSet",
      name: "Words from Arabic",
      url: "https://curio.example/language/arabic",
      hasDefinedTerm: [
        { "@type": "DefinedTerm", name: "algebra", url: "https://curio.example/story/algebra" },
        { "@type": "DefinedTerm", name: "coffee", url: "https://curio.example/story/coffee" },
      ],
    });
  });
});
