import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PromptScreen from "./PromptScreen";
import { promptBase } from "./testFixtures";

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
