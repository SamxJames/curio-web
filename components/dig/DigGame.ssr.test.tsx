import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DigGame from "./DigGame";

describe("DigGame before the day loads", () => {
  it("shows the rules and a disabled Loading button", () => {
    const html = renderToStaticMarkup(<DigGame heading="curio dig" />);
    expect(html).toContain("7 prompts. 25 seconds each.");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Loading…<\/button>/);
  });
});
