import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PuzzleRules } from "./PuzzleGame";

describe("PuzzleRules", () => {
  it("states the rules in one line", () => {
    const html = renderToStaticMarkup(<PuzzleRules />);
    expect(html).toMatch(/Guess today(&#x27;|')s word in up to three clues\. Each clue gives more away\./);
  });
});
