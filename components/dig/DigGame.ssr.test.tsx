import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DigGame from "./DigGame";

describe("DigGame before the day loads", () => {
  it("shows the rules and a disabled Loading button", () => {
    const html = renderToStaticMarkup(<DigGame heading="curio dig" />);
    expect(html).toContain("Name a word that fits each prompt.");
    expect(html).toContain("Seven prompts. No clock: take your time.");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Loading…<\/button>/);
  });
});
