import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import PromptScreen, { focusOnShow, nextPassState } from "./PromptScreen";
import { bannedHits } from "@/lib/dig/copyAudit";
import { noop, promptBase } from "./testFixtures";

describe("PromptScreen", () => {
  const base = promptBase;
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
    expect(miss).toContain("Not one we know yet. Try another, or Skip.");
  });
  it("offers 'should count' at a miss only when claiming is possible", () => {
    const feedback = { kind: "miss", guess: "medlar" } as const;
    const open = renderToStaticMarkup(<PromptScreen {...base} phase="answering" clock={0} noTimer feedback={feedback} canClaim onClaim={noop} />);
    expect(open).toContain("should count");
    expect(open).toContain("medlar");
    const closed = renderToStaticMarkup(<PromptScreen {...base} phase="answering" clock={0} noTimer feedback={feedback} />);
    expect(closed).not.toContain("should count");
    const past = renderToStaticMarkup(<PromptScreen {...base} phase="answering" clock={0} noTimer feedback={feedback} canClaim={false} onClaim={noop} />);
    expect(past).not.toContain("should count");
  });
  it("words the prompt for a phone until the client knows there is a mouse", () => {
    // A server render has no pointer information, so it gets the touch wording.
    const html = renderToStaticMarkup(<PromptScreen {...base} phase="answering" clock={10} noTimer={false} feedback={null} />);
    expect(html).toContain('placeholder="Tap to type"');
    const near = renderToStaticMarkup(<PromptScreen {...base} phase="answering" clock={0} noTimer feedback={{ kind: "near", guess: "halyrd", suggestion: "halyard", index: 0 }} />);
    expect(near).toContain("Tap Yes to accept.");
    expect(near).not.toContain("Press Enter");
  });
  it("offers Skip while answering, as a text button that is not the red primary", () => {
    const html = renderToStaticMarkup(<PromptScreen {...base} phase="answering" clock={0} noTimer feedback={null} />);
    const pass = html.match(/<button[^>]*>Skip<\/button>/);
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
  it("keeps the answer box typeable during the read pause, so a tap there opens a phone keyboard", () => {
    // iOS gives a read-only field focus but no keyboard, and a later tap on the focused field
    // often doesn't bring one up. Dig stays disabled and the reducer ignores early submits.
    const html = renderToStaticMarkup(<PromptScreen {...base} phase="reading" clock={3} noTimer={false} feedback={null} />);
    const input = html.match(/<input[^>]*>/)![0];
    expect(input.toLowerCase()).not.toContain("readonly");
  });
  it("leaves focusing to the client, never autofocus in the markup", () => {
    const html = renderToStaticMarkup(<PromptScreen {...base} phase="answering" clock={10} noTimer={false} feedback={null} />);
    expect(html.toLowerCase()).not.toContain("autofocus");
  });
  it("focuses the answer box by script only with a mouse or trackpad, never on a touch screen", () => {
    const media = (fine: boolean) => ((q: string) => ({ matches: q === "(pointer: fine)" ? fine : !fine })) as (q: string) => { matches: boolean };
    expect(focusOnShow(media(true))).toBe(true);
    expect(focusOnShow(media(false))).toBe(false);
    expect(focusOnShow(undefined)).toBe(false);
  });
  it("disables Skip and Dig during the read pause", () => {
    const html = renderToStaticMarkup(<PromptScreen {...base} phase="reading" clock={3} noTimer={false} feedback={null} />);
    expect(html.match(/<button[^>]*disabled=""[^>]*>Skip<\/button>/)).not.toBeNull();
    expect(html.match(/<button[^>]*disabled=""[^>]*>Dig<\/button>/)).not.toBeNull();
  });
  it("offers 'Turn off timer' only while the timer runs", () => {
    const timed = renderToStaticMarkup(<PromptScreen {...base} phase="answering" clock={10} noTimer={false} feedback={null} onTimer={noop} />);
    const button = timed.match(/<button[^>]*>Turn off timer<\/button>/);
    expect(button).not.toBeNull();
    expect(button![0]).toContain("min-h-11");
    expect(button![0]).not.toContain("bg-accent-button");
    expect(timed).toContain('role="progressbar"');
    const off = renderToStaticMarkup(<PromptScreen {...base} phase="answering" clock={0} noTimer feedback={null} onTimer={noop} />);
    expect(off).not.toContain("Turn off timer");
    expect(off).toContain("Take your time.");
    expect(off).not.toContain('role="progressbar"');
    expect(off).not.toContain("aria-pressed");
  });
  it("renders no timer control until onTimer is supplied", () => {
    expect(renderToStaticMarkup(<PromptScreen {...base} phase="answering" clock={10} noTimer={false} feedback={null} />)).not.toContain("Turn off timer");
  });
  it("Skip starts as 'Skip' and is disabled while reading", () => {
    const html = renderToStaticMarkup(<PromptScreen {...base} phase="reading" clock={3} noTimer={false} feedback={null} onTimer={noop} />);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Skip<\/button>/);
  });
  it("nextPassState: first tap arms, second fires; typing and blur disarm; nothing is timed", () => {
    expect(nextPassState("idle", "tap")).toEqual({ state: "armed", fire: false });
    expect(nextPassState("armed", "tap")).toEqual({ state: "idle", fire: true });
    expect(nextPassState("armed", "type")).toEqual({ state: "idle", fire: false });
    expect(nextPassState("armed", "blur")).toEqual({ state: "idle", fire: false });
    expect(nextPassState("idle", "blur")).toEqual({ state: "idle", fire: false });
  });
  it("the prompt screen passes the copy audit", () => {
    const html = renderToStaticMarkup(<PromptScreen {...base} phase="answering" clock={10} noTimer={false} feedback={null} onTimer={noop} />);
    expect(bannedHits(html)).toEqual([]);
  });
  it("has no timeout tied to Skip", () => {
    expect(readFileSync("components/dig/PromptScreen.tsx", "utf8")).not.toMatch(/setTimeout\([^)]*3000/);
  });
});

describe("PromptScreen on a phone with the keyboard open", () => {
  const src = readFileSync("components/dig/PromptScreen.tsx", "utf8");
  it("scrolls a wrapper holding the form and the feedback line, not the input alone", () => {
    expect(src).toContain("ref={answerArea}");
    expect(src).not.toContain("e.currentTarget.scrollIntoView");
    expect(src).toContain("useEffect(() => { if (round > 0) showAnswerArea(); }, [round])");
  });
  it("drops the section and form gaps on short viewports", () => {
    expect(src).toContain("mt-8 short:mt-2");
    expect(src).toContain("short:mt-3");
    expect(readFileSync("components/dig/DigGame.tsx", "utf8")).toContain("mt-4 short:mt-2");
    expect(readFileSync("app/globals.css", "utf8")).toContain("@custom-variant short (@media (max-height: 700px))");
  });
});
