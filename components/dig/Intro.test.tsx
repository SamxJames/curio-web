import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Intro from "./Intro";
import { bannedHits } from "@/lib/dig/copyAudit";
import { noop } from "./testFixtures";
import { DIG_PITCH } from "@/lib/dig/pitch";

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
  it("explains the game before Start with a real sample and no 'How it works' below", () => {
    const html = renderToStaticMarkup(<Intro noTimer={false} onToggleTimer={noop} onStart={noop} />);
    expect(html).toContain("Each prompt hides one word nobody expects.");
    expect(html).toContain("7 prompts. 25 seconds each. Rarer answers dig deeper.");
    expect(html).toContain("Your answers build a cross-section as you go. The hidden word is the fossil, buried in the bedrock.");
    expect(html).toContain("For example: Name a fruit");
    expect(html).toContain("apple lands in the topsoil. quince digs down to the clay.");
    expect(html).toContain("No timer counts the same. Use it any time.");
    expect(bannedHits(html)).toEqual([]);
  });
  it("leads with the pitch and the rules", () => {
    const html = renderToStaticMarkup(<Intro noTimer={false} onToggleTimer={noop} onStart={noop} />);
    expect(html).toContain(DIG_PITCH);
    expect(html).toContain("7 prompts. 25 seconds each.");
  });
  it("shows the rules but a disabled Start while loading", () => {
    const html = renderToStaticMarkup(<Intro noTimer={false} onToggleTimer={noop} onStart={noop} loading />);
    expect(html).toContain("7 prompts. 25 seconds each.");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*Loading…/);
  });
  it("shows a friend's challenge line when given", () => {
    const html = renderToStaticMarkup(<Intro noTimer={false} onToggleTimer={noop} onStart={noop} challenge="A friend dug 2.3 m today. Can you go deeper?" />);
    expect(html).toContain("A friend dug 2.3 m today.");
  });
});
