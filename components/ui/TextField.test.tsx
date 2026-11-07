import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TextField from "./TextField";

describe("TextField", () => {
  it("uses 16px text, so iOS Safari doesn't zoom the page when the field is focused", () => {
    const input = renderToStaticMarkup(<TextField aria-label="Answer" />).match(/<input[^>]*>/)![0];
    expect(input).toContain("text-base");
    expect(input).not.toMatch(/\btext-(xs|sm)\b/);
  });
});
