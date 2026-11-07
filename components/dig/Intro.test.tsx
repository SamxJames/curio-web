import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Intro from "./Intro";
import { noop } from "./testFixtures";

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
