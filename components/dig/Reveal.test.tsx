import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Reveal, { announceReveal } from "./Reveal";
import { noop, secret } from "./testFixtures";

describe("Reveal", () => {
  const given = { answer: "keel", tier: "familiar" as const, rejected: [], lastGuess: null };
  const timedOut = { answer: null, tier: null, rejected: ["jib"], lastGuess: "jib" };
  const props = { secret, isLast: false, onNext: noop, onClaim: noop, claimed: false, canClaim: true };

  it("shows the tier, points, stratum and the fossil", () => {
    const html = renderToStaticMarkup(<Reveal {...props} result={given} />);
    expect(html).toContain("keel");
    expect(html).toContain("Familiar, 30 points, into the loam");
    expect(html).toContain("halyard");
    expect(html).toContain("/story/halyard");
    expect(html).toContain("Next prompt");
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
  it("says the outcome and the fossil word once, for the persistent live region", () => {
    expect(announceReveal({ answer: "keel", tier: "familiar", rejected: [], lastGuess: null }, secret, false)).toBe("keel, Familiar, 30 points. Fossil: halyard.");
    expect(announceReveal({ answer: null, tier: null, rejected: [], lastGuess: null }, secret, false)).toBe("Time's up. Fossil: halyard.");
    expect(announceReveal({ answer: null, tier: null, rejected: [], lastGuess: null }, secret, true)).toBe("Passed. Fossil: halyard.");
  });
});
