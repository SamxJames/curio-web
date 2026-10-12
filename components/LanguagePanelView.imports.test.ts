import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// The language page renders LanguagePanelView as a client component. Its import
// graph must not reach the sheets (data.ts, or lookup/panel/pages which import it)
// or the word bank (value imports of lib/words). Type-only imports are erased.
const valueSpecifiers = (file: string) =>
  [
    ...readFileSync(path.join(process.cwd(), file), "utf8")
      .split("\n")
      .filter((line) => !/^\s*import\s+type\b/.test(line))
      .join("\n")
      .matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g),
  ].map((m) => m[1]);

const FORBIDDEN = /(?:^|\/)(data|lookup|panel|pages|words)(\.tsx?)?$/;

describe("LanguagePanelView imports", () => {
  for (const file of ["components/LanguagePanelView.tsx", "lib/languages/panelView.ts"]) {
    it(`${file} imports nothing that loads the sheets or the word bank`, () => {
      expect(valueSpecifiers(file).filter((s) => FORBIDDEN.test(s))).toEqual([]);
    });
  }

  it("the view takes its model from the data-free panelView module", () => {
    expect(valueSpecifiers("components/LanguagePanelView.tsx")).toContain("@/lib/languages/panelView");
  });
});
