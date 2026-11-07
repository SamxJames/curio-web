import { describe, expect, it } from "vitest";
import { etymologyLink, presentableFact } from "./fact";

// Real fossil facts from the 2026-11-07 dig.
describe("presentableFact", () => {
  it("always keeps a Curio story teaser", () => {
    const fact = "A strong little sip that came to English straight from a German glass.";
    expect(presentableFact({ fact, story: "schnapps" })).toBe(fact);
  });

  it("keeps a sourced fact that reads as a sentence", () => {
    const fact = "First attested in 1799, borrowed from Swedish rotabagge, a dialectal word from Västergötland, from rot (“root”) + bagge (“lump, bunch”)";
    expect(presentableFact({ fact })).toBe(fact);
    const vireo = "From translingual Vireo (genus name), from Latin vireō (“to be green”)";
    expect(presentableFact({ fact: vireo })).toBe(vireo);
  });

  it("hides dictionary notation", () => {
    expect(presentableFact({ fact: "The noun is derived partly: * from Middle English fiole, phiole, phial (“small bowl or cup for liquids, etc.; flask”) [and other forms]…" })).toBeNull();
    expect(presentableFact({ fact: "From god- + child" })).toBeNull();
  });

  it("hides cut-off facts and non-Latin script", () => {
    expect(presentableFact({ fact: "From Russian друг (drug, “friend”), in which sense it is used in the invented slang Nadsat in Anthony Burgess's dystopian novel A…" })).toBeNull();
    expect(presentableFact({ fact: "From French gourami, from Malay gurami, from Javanese ꦒꦸꦫꦩꦶ (gurami)" })).toBeNull();
  });

  it("returns null for an empty fact", () => {
    expect(presentableFact({ fact: "  " })).toBeNull();
  });
});

describe("etymologyLink", () => {
  it("points at the word's Wiktionary etymology", () => {
    expect(etymologyLink("phial")).toBe("https://en.wiktionary.org/wiki/phial#Etymology");
    expect(etymologyLink("great aunt")).toBe("https://en.wiktionary.org/wiki/great_aunt#Etymology");
  });
});
