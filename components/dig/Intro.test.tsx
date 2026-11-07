import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Intro from "./Intro";
import { bannedHits } from "@/lib/dig/copyAudit";
import { noop } from "./testFixtures";

describe("Intro", () => {
  it("says the rules in plain words, with the example and Start", () => {
    const html = renderToStaticMarkup(<Intro noTimer onToggleTimer={noop} onStart={noop} />);
    expect(html).toContain("Name a word that fits each prompt.");
    expect(html).toContain("Any word that fits counts. Rarer words score more.");
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
  it("keeps red for Start alone", () => {
    const html = renderToStaticMarkup(<Intro noTimer={false} onToggleTimer={noop} onStart={noop} />);
    expect(html.match(/bg-accent-button/g)).toHaveLength(1);
  });
});
