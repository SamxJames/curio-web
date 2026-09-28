import { describe, it, expect } from "vitest";
import { RichText } from "@atproto/api";
import { WORDS } from "./words";
import { buildBlueskyPost, graphemeLength } from "./blueskyPost";

// Unmocked on purpose (lib/bluesky.test.ts mocks @atproto/api wholesale):
// this guards against future approved content — a `#`, `@handle`, `$TICKER`
// or domain-like token in a teaser — silently adding a stray facet to a
// real public post. detectFacetsWithoutResolution is pure and offline: it
// never resolves handles or links over the network.
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
