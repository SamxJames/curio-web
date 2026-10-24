import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Intro from "./Intro";
import PromptScreen from "./PromptScreen";
import Reveal, { announceReveal } from "./Reveal";
import { LoadFailed } from "./DigGame";

const noop = () => {};
const prompt = { id: "theme:sailing", kind: "theme" as const, text: "Name a word from sailing" };
const secret = { answers: [], aliases: {}, guard: [], fossil: { word: "halyard", fact: "From haul + yard.", story: "halyard" }, stories: {} };

describe("Intro", () => {
  it("states the rules, offers Start and the No timer setting", () => {
    const html = renderToStaticMarkup(<Intro noTimer={false} onToggleTimer={noop} onStart={noop} />);
    expect(html).toContain("7 prompts. 25 seconds each. Rarer answers dig deeper.");
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("No timer");
    expect(html).toContain("Start");
  });
  it("keeps red for Start alone", () => {
    const html = renderToStaticMarkup(<Intro noTimer={false} onToggleTimer={noop} onStart={noop} />);
    expect(html.match(/bg-accent-button/g)).toHaveLength(1);
  });
});

describe("PromptScreen", () => {
  const base = { index: 2, total: 7, prompt, onSubmit: noop, onPass: noop };
  it("shows the clock as a number and a bar while answering", () => {
    const html = renderToStaticMarkup(<PromptScreen {...base} phase="answering" clock={10} noTimer={false} feedback={null} />);
    expect(html).toContain("Prompt 3 of 7");
    expect(html).toContain("10 seconds left");
    expect(html).toContain('role="progressbar"');
  });
  it("animates the bar with transition-all and no arbitrary values", () => {
    const html = renderToStaticMarkup(<PromptScreen {...base} phase="answering" clock={10} noTimer={false} feedback={null} />);
    expect(html).toContain("transition-all");
    expect(html).not.toContain("transition-[");
  });
  it("hides the clock with No timer and words the outcomes neutrally", () => {
    const near = renderToStaticMarkup(<PromptScreen {...base} phase="answering" clock={0} noTimer feedback={{ kind: "near", guess: "halyrd", suggestion: "halyard", index: 0 }} />);
    expect(near).not.toContain("seconds left");
    expect(near).toContain("Did you mean");
    expect(near).toContain("halyard");
    const miss = renderToStaticMarkup(<PromptScreen {...base} phase="answering" clock={0} noTimer feedback={{ kind: "miss", guess: "zz" }} />);
    expect(miss).toContain("Not on today&#x27;s list. Try another.");
  });
  it("offers Pass while answering, as a text button that is not the red primary", () => {
    const html = renderToStaticMarkup(<PromptScreen {...base} phase="answering" clock={0} noTimer feedback={null} />);
    const pass = html.match(/<button[^>]*>Pass<\/button>/);
    expect(pass).not.toBeNull();
    expect(pass![0]).toContain('type="button"');
    expect(pass![0]).not.toContain("bg-accent-button");
    expect(pass![0]).not.toContain('disabled=""');
  });
  it("makes Dig a secondary button, so no red button is on a prompt", () => {
    const html = renderToStaticMarkup(<PromptScreen {...base} phase="answering" clock={10} noTimer={false} feedback={null} />);
    const dig = html.match(/<button[^>]*type="submit"[^>]*>Dig<\/button>/);
    expect(dig).not.toBeNull();
    expect(dig![0]).toContain("border-line-strong");
    expect(html).not.toContain("bg-accent-button");
  });
  it("says '1 second left' in the singular", () => {
    const html = renderToStaticMarkup(<PromptScreen {...base} phase="answering" clock={1} noTimer={false} feedback={null} />);
    expect(html).toContain("1 second left");
    expect(html).not.toContain("1 seconds");
  });
  it("announces 'Get ready.' in the live region during the read pause only", () => {
    const reading = renderToStaticMarkup(<PromptScreen {...base} phase="reading" clock={3} noTimer={false} feedback={null} />);
    expect(reading).toMatch(/aria-live="assertive"[^>]*>Get ready.</);
    const answering = renderToStaticMarkup(<PromptScreen {...base} phase="answering" clock={20} noTimer={false} feedback={null} />);
    expect(answering).not.toContain("Get ready.");
  });
  it("disables Pass and Dig during the read pause", () => {
    const html = renderToStaticMarkup(<PromptScreen {...base} phase="reading" clock={3} noTimer={false} feedback={null} />);
    expect(html.match(/<button[^>]*disabled=""[^>]*>Pass<\/button>/)).not.toBeNull();
    expect(html.match(/<button[^>]*disabled=""[^>]*>Dig<\/button>/)).not.toBeNull();
  });
});

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

describe("LoadFailed", () => {
  it("names today for today's dig and not for a past one", () => {
    expect(renderToStaticMarkup(<LoadFailed past={false} />)).toContain("Today&#x27;s dig didn&#x27;t load. Refresh to try again.");
    const past = renderToStaticMarkup(<LoadFailed past />);
    expect(past).toContain("This dig didn&#x27;t load. Refresh to try again.");
    expect(past).not.toContain("Today");
  });
});
