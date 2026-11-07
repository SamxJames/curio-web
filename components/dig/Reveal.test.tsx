import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Reveal, { announceReveal } from "./Reveal";
import { bannedHits } from "@/lib/dig/copyAudit";
import { noop, secret } from "./testFixtures";

describe("Reveal", () => {
  const given = { answer: "keel", tier: "familiar" as const, rejected: [], lastGuess: null };
  const timedOut = { answer: null, tier: null, rejected: ["jib"], lastGuess: "jib" };
  const props = { secret, isLast: false, onNext: noop, onClaim: noop, claimed: false, canClaim: true };

  it("shows the layer line, points and the fossil", () => {
    const html = renderToStaticMarkup(<Reveal {...props} result={given} />);
    expect(html).toContain("keel");
    expect(html).toContain("Loam. Familiar, and a little below the surface.");
    expect(html).toContain("30 points");
    expect(html).toContain("The fossil was");
    expect(html).not.toContain("Familiar, 30 points");
    expect(html).toContain("halyard");
    expect(html).toContain("/story/halyard");
    expect(html).toContain("Next prompt");
  });

  it("varies the layer line by how many times that layer was already hit", () => {
    const mk = (n: number) => renderToStaticMarkup(<Reveal {...props} result={given} variantIndex={n} />);
    expect(new Set([mk(0), mk(1), mk(2)]).size).toBe(3);
  });
  it("a fossil hit is one block with the bone mark, no layer line and no second fossil heading", () => {
    const html = renderToStaticMarkup(<Reveal {...props} result={{ answer: "halyard", tier: "fossil", rejected: [], lastGuess: null }} />);
    expect(html).toContain("You found the fossil.");
    expect(html).toContain('aria-hidden="true"');
    expect(html.match(/You found the fossil./g)).toHaveLength(1);
    expect(html).not.toContain("The fossil was");
    expect(html).not.toContain("This prompt&#x27;s fossil");
    expect(html).not.toContain("Loam.");
    expect(html).toContain("From haul + yard.");
  });
  it("a different fossil-tier word reads as a found fossil, naming the prompt's own fossil", () => {
    const html = renderToStaticMarkup(<Reveal {...props} result={{ answer: "gaff", tier: "fossil", rejected: [], lastGuess: null }} />);
    expect(html).toContain("You found a fossil. The fossil was halyard.");
  });
  it("a miss shows The fossil was, no layer line, no points", () => {
    const html = renderToStaticMarkup(<Reveal {...props} result={{ answer: null, tier: null, rejected: [], lastGuess: null }} />);
    expect(html).toContain("The fossil was");
    expect(html).not.toMatch(/points/);
  });
  it("a story fact links with descriptive text and reports the click", () => {
    const html = renderToStaticMarkup(<Reveal {...props} secret={{ ...secret, stories: { tea: "tea" } }} result={{ answer: "tea", tier: "common", rejected: [], lastGuess: null }} onStory={noop} />);
    expect(html).toContain("Read the story of tea");
    expect(html).toContain("/story/tea");
    expect(html).not.toContain(">Read it<");
  });
  it("shows an origin fact on an origin prompt", () => {
    const html = renderToStaticMarkup(<Reveal {...props} kind="origin" promptText="Name a word that came to English from Russian" result={{ answer: "kvass", tier: "common", rejected: [], lastGuess: null }} />);
    expect(html).toContain("English took kvass from Russian.");
  });
  it("every tier's reveal passes the copy audit", () => {
    for (const tier of ["common", "popular", "familiar", "uncommon", "rare", "fossil"] as const) for (const n of [0, 1, 2]) {
      expect(bannedHits(renderToStaticMarkup(<Reveal {...props} result={{ answer: "tea", tier, rejected: [], lastGuess: null }} variantIndex={n} />))).toEqual([]);
    }
  });
  it("hides a dictionary-notation fact and links to its source instead", () => {
    const raw = { ...secret, fossil: { word: "phial", fact: "The noun is derived partly: * from Middle English fiole [and other forms]…" } };
    const html = renderToStaticMarkup(<Reveal {...props} secret={raw} result={given} />);
    expect(html).not.toContain("derived partly");
    expect(html).toContain("https://en.wiktionary.org/wiki/phial#Etymology");
    expect(html).toContain("Where phial came from");
  });
  it("says Time's up, never 'missed', and offers a claim for a rejected guess", () => {
    const html = renderToStaticMarkup(<Reveal {...props} result={timedOut} isLast />);
    expect(html).toContain("Time&#x27;s up");
    expect(html.toLowerCase()).not.toContain("missed");
    expect(html).toContain("“jib” should count");
    expect(html).toContain("See your dig");
  });
  it("claims the player's own last guess in display form, even when the rejected list is full", () => {
    const full = { answer: null, tier: null, rejected: ["Jib", "Boom", "Mast"], lastGuess: "Gaff Rig" };
    const html = renderToStaticMarkup(<Reveal {...props} result={full} />);
    expect(html).toContain("“Gaff Rig” should count");
    expect(html).not.toContain("“Mast” should count");
  });
  it("offers no claim when nothing was guessed wrong", () => {
    const html = renderToStaticMarkup(<Reveal {...props} result={{ answer: null, tier: null, rejected: [], lastGuess: null }} />);
    expect(html).not.toContain("should count");
  });
  it("thanks the player after a claim", () => {
    const html = renderToStaticMarkup(<Reveal {...props} result={timedOut} claimed />);
    expect(html).toContain("Thanks. We look at these every week.");
    expect(html).not.toContain("should count");
  });
  it("shows no claim button and no thanks line on a past day", () => {
    const open = renderToStaticMarkup(<Reveal {...props} result={timedOut} canClaim={false} />);
    expect(open).not.toContain("should count");
    expect(open).not.toContain("Thanks");
    const claimed = renderToStaticMarkup(<Reveal {...props} result={timedOut} canClaim={false} claimed />);
    expect(claimed).not.toContain("Thanks");
  });
  it("keeps Next prompt as the secondary button, not red", () => {
    const html = renderToStaticMarkup(<Reveal {...props} result={timedOut} />);
    expect(html).not.toContain("bg-accent-button");
  });
  it("offers a claim only when the prompt ended with no answer", () => {
    const answeredAfterMiss = { answer: "keel", tier: "familiar" as const, rejected: ["jib"], lastGuess: "jib" };
    const html = renderToStaticMarkup(<Reveal {...props} result={answeredAfterMiss} />);
    expect(html).not.toContain("should count");
    expect(html).not.toContain("Thanks");
  });
  it("makes the heading a focus target and leaves announcing to DigRun's persistent live region", () => {
    const html = renderToStaticMarkup(<Reveal {...props} result={given} />);
    expect(html).toMatch(/<h2[^>]*tabindex="-1"[^>]*>keel<\/h2>/);
    expect(html).not.toContain("aria-live");
    expect(html).not.toContain("focus:outline-none");
  });
  it("heads a passed prompt 'Passed', not 'Time's up'", () => {
    const html = renderToStaticMarkup(<Reveal {...props} result={timedOut} passed />);
    expect(html).toMatch(/<h2[^>]*>Passed<\/h2>/);
    expect(html).not.toContain("Time&#x27;s up");
  });
});

describe("announceReveal", () => {
  it("announces the fossil only when found", () => {
    expect(announceReveal({ answer: "halyard", tier: "fossil", rejected: [], lastGuess: null }, secret, false)).toBe("halyard, Fossil, 100 points. You found the fossil.");
    expect(announceReveal({ answer: "tea", tier: "common", rejected: [], lastGuess: null }, secret, false)).toContain("Fossil: halyard.");
  });
  it("says the outcome and the fossil word once, for the persistent live region", () => {
    expect(announceReveal({ answer: "keel", tier: "familiar", rejected: [], lastGuess: null }, secret, false)).toBe("keel, Familiar, 30 points. Fossil: halyard.");
    expect(announceReveal({ answer: null, tier: null, rejected: [], lastGuess: null }, secret, false)).toBe("Time's up. Fossil: halyard.");
    expect(announceReveal({ answer: null, tier: null, rejected: [], lastGuess: null }, secret, true)).toBe("Passed. Fossil: halyard.");
  });
});
