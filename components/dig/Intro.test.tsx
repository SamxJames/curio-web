import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Intro from "./Intro";
import { bannedHits } from "@/lib/dig/copyAudit";
import { noop } from "./testFixtures";
import { DIG_PITCH } from "@/lib/dig/pitch";

describe("Intro", () => {
  it("says the rules in plain words, with the example and Start", () => {
    const html = renderToStaticMarkup(<Intro noTimer onToggleTimer={noop} onStart={noop} />);
    expect(html).toContain("Name a word that fits each prompt. Any word that fits counts.");
    expect(html).toContain("For example: Name a fruit");
    expect(html).toContain("apple lands in the topsoil. quince digs down to the clay.");
    expect(html).not.toMatch(/fossil|bedrock|cross-section/);
    expect(html).toContain("Seven prompts. No clock: take your time.");
    expect(html).toContain('aria-pressed="true"');
    expect(bannedHits(html)).toEqual([]);
  });
  it("names the clock when the timer is on", () => {
    const html = renderToStaticMarkup(<Intro noTimer={false} onToggleTimer={noop} onStart={noop} />);
    expect(html).toContain("Seven prompts, 25 seconds each.");
    expect(html).toContain('aria-pressed="false"');
  });
  it("labels the toggle in plain words, unchanged by its state, and puts it after Start", () => {
    for (const noTimer of [true, false]) {
      const html = renderToStaticMarkup(<Intro noTimer={noTimer} onToggleTimer={noop} onStart={noop} />);
      const toggle = html.match(/<button[^>]*aria-pressed[^>]*>.*?<\/button>/)![0];
      expect(toggle).toContain("Take your time (no timer)");
      expect(toggle).toContain("min-h-11");
      expect(html).not.toContain("No timer: on");
      expect(html.indexOf(">Start<")).toBeLessThan(html.indexOf("Take your time (no timer)"));
    }
  });
  it("keeps red for Start alone", () => {
    const html = renderToStaticMarkup(<Intro noTimer={false} onToggleTimer={noop} onStart={noop} />);
    expect(html.match(/bg-accent-button/g)).toHaveLength(1);
  });
  it("leads with the pitch, before the rules", () => {
    const html = renderToStaticMarkup(<Intro noTimer={false} onToggleTimer={noop} onStart={noop} />);
    expect(html).toContain(DIG_PITCH);
    expect(html.indexOf(DIG_PITCH)).toBeLessThan(html.indexOf("Name a word that fits each prompt."));
    expect(html).not.toContain("Rarer words score more.");
  });
  it("shows the rules but a disabled Start and no toggle while loading", () => {
    const html = renderToStaticMarkup(<Intro noTimer={false} onToggleTimer={noop} onStart={noop} loading />);
    expect(html).toContain("Name a word that fits each prompt.");
    expect(html).toContain("Seven prompts, 25 seconds each.");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*Loading…/);
    expect(html).not.toContain("aria-pressed");
    expect(html).not.toContain(">Start<");
  });
  it("shows a friend's challenge line above the pitch when given", () => {
    const html = renderToStaticMarkup(<Intro noTimer={false} onToggleTimer={noop} onStart={noop} challenge="A friend dug 2.3 m today. Can you go deeper?" />);
    expect(html).toContain("A friend dug 2.3 m today.");
    expect(html.indexOf("A friend dug")).toBeLessThan(html.indexOf(DIG_PITCH));
    expect(bannedHits(html)).toEqual([]);
  });
});
