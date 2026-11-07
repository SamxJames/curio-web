import { describe, it, expect } from "vitest";
import { RichText } from "@atproto/api";
import { WORDS } from "./words";
import { buildBlueskyPost, graphemeLength } from "./blueskyPost";
import { digLineUrl } from "./dig/digLineText";

// Unmocked on purpose (lib/bluesky.test.ts mocks @atproto/api wholesale):
// this guards against future approved content — a `#`, `@handle`, `$TICKER`
// or domain-like token in a teaser — silently adding a stray facet to a
// real public post. detectFacetsWithoutResolution is pure and offline: it
// never resolves handles or links over the network.
describe("buildBlueskyPost's dig line, against the real @atproto/api lexicon", () => {
  it("makes the dig URL one clickable link facet beside the two tags, wherever it fits", () => {
    let withDig = 0;
    for (const word of WORDS) {
      const text = buildBlueskyPost(word, { prompt: "Name a beverage" });
      const rt = new RichText({ text });
      rt.detectFacetsWithoutResolution();
      const kinds = rt.facets!.map((f) => f.features[0].$type);
      if (text.includes("/dig?")) {
        withDig++;
        expect(kinds).toEqual(["app.bsky.richtext.facet#link", "app.bsky.richtext.facet#tag", "app.bsky.richtext.facet#tag"]);
        expect((rt.facets![0].features[0] as { uri: string }).uri).toBe(digLineUrl("bluesky"));
      } else {
        expect(kinds).toEqual(["app.bsky.richtext.facet#tag", "app.bsky.richtext.facet#tag"]);
      }
      expect(rt.graphemeLength).toBeLessThanOrEqual(300);
    }
    expect(withDig).toBeGreaterThan(0);
  });
});

describe("buildBlueskyPost's facets, against the real @atproto/api lexicon", () => {
  it("is exactly the two intended #etymology/#wordoftheday tag facets, for every word in the bank", () => {
    for (const word of WORDS) {
      const text = buildBlueskyPost(word);
      const rt = new RichText({ text });
      rt.detectFacetsWithoutResolution();

      expect(rt.facets).toHaveLength(2);
      const tags = rt.facets!.map((facet) => {
        expect(facet.features).toHaveLength(1);
        const feature = facet.features[0];
        expect(feature.$type).toBe("app.bsky.richtext.facet#tag");
        return (feature as { tag: string }).tag;
      });
      expect(tags).toEqual(["etymology", "wordoftheday"]);
      expect(rt.graphemeLength).toBe(graphemeLength(text));
    }
  });
});
