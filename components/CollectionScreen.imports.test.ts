import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Collection's first load must not carry the language sheets: only the tiny
// generated sheetIndex. data.ts (and lookup.ts, which imports it) load with
// the lazy LanguagePanel.
describe("CollectionScreen imports", () => {
  const src = readFileSync(path.join(process.cwd(), "components", "CollectionScreen.tsx"), "utf8");
  const specifiers = [...src.matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)].map((m) => m[1]);

  it("does not import lib/languages/data or lib/languages/lookup", () => {
    const offenders = specifiers.filter((s) => /languages\/(data|lookup)(\.ts)?$/.test(s));
    expect(offenders).toEqual([]);
  });

  it("does import the generated name index", () => {
    expect(specifiers).toContain("@/lib/languages/sheetIndex");
  });
});
