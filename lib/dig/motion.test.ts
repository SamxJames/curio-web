import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const css = readFileSync("app/globals.css", "utf8");

/** Returns the full text of the first block whose header matches `head`, braces balanced. */
function block(src: string, head: RegExp): string {
  const m = head.exec(src);
  if (!m) return "";
  let depth = 0;
  for (let i = src.indexOf("{", m.index); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(m.index, i + 1);
  }
  return "";
}

describe("dig motion", () => {
  it("registers the three tokens", () => {
    for (const t of ["--duration-drop: 420ms", "--duration-found: 700ms", "--ease-settle: cubic-bezier(0.2, 0.8, 0.2, 1)"]) expect(css).toContain(t);
  });
  const media = block(css, /@media \(prefers-reduced-motion: no-preference\)/);
  it("only animates under prefers-reduced-motion: no-preference", () => {
    expect(media).toContain("dig-drop");
    expect(media).toContain("dig-found");
    expect(css.replace(media, "")).not.toMatch(/animation:\s*dig-/);
  });
  it("scales SVG shapes from their own centre, not the viewBox origin", () => {
    for (const cls of [".dig-drop", ".dig-found"]) {
      const rule = block(media, new RegExp(`\\${cls}\\s*\\{`));
      expect(rule).toContain("transform-box: fill-box");
      expect(rule).toContain("transform-origin: center");
    }
  });
});
