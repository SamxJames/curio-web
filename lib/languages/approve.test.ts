import { describe, expect, it } from "vitest";
import {
  approveSheets,
  buildSheetIndex,
  renderDataModule,
  renderSheetIndexModule,
  toSheet,
} from "./approve";
import { SHEET_NAMES } from "./sheetIndex";
import type { LanguageSheet } from "./types";

const base = {
  aliases: [] as string[],
  status: "extinct",
  classification: "A branch of a family",
  region: "Somewhere specific",
  map: { lat: 45, lon: 9, radiusKm: 300 },
  era: { from: 500, to: 1000, approximate: true },
  peakSpeakers: null,
  unknownSpeakersNote: "No census of its speakers exists.",
  parent: null,
  origin: "It was spoken by a people who settled in a region and left a few words behind.",
  approved: false,
};
const draft = (name: string, patch: Record<string, unknown> = {}) => ({
  ...base,
  name,
  sourceUrl: `https://en.wikipedia.org/wiki/${name.replace(/ /g, "_")}`,
  ...patch,
});

describe("approveSheets", () => {
  it("approves only the drafts named in --only (by name or alias) and reports missing names", () => {
    const res = approveSheets([draft("Latin"), draft("Old French")], [], { only: ["Latin", "Gothic"] });
    expect(res.approved).toEqual(["Latin"]);
    expect(res.missing).toEqual(["Gothic"]);
    expect(res.sheets.map((s) => s.name)).toEqual(["Latin"]);
    expect(res.sheets[0].approved).toBe(true);
  });

  it("refuses a draft carrying _problems, even with --only", () => {
    const res = approveSheets([draft("Latin", { _problems: ["origin too short"] })], [], { only: ["Latin"] });
    expect(res.approved).toEqual([]);
    expect(res.refused).toEqual([{ name: "Latin", reasons: ["origin too short"] }]);
    expect(res.sheets).toEqual([]);
  });

  it("refuses a draft that fails validation, including malformed JSON shapes", () => {
    const res = approveSheets(
      [draft("Latin", { origin: "short" }), draft("Gothic", { status: "dead" }), { name: 7 }, null],
      [],
      { allValid: true },
    );
    expect(res.approved).toEqual([]);
    expect(res.refused.map((r) => r.name)).toEqual(["Latin", "Gothic", "(unnamed draft 3)", "(unnamed draft 4)"]);
    expect(res.refused[0].reasons[0]).toMatch(/origin too short/);
  });

  it("--all-valid approves every passing draft and refuses the rest", () => {
    const res = approveSheets([draft("Latin"), draft("Gothic", { origin: "x" })], [], { allValid: true });
    expect(res.approved).toEqual(["Latin"]);
    expect(res.refused.map((r) => r.name)).toEqual(["Gothic"]);
  });

  it("merges an alias-named draft under its canonical name", () => {
    const res = approveSheets([draft("Lombardic")], [], { allValid: true });
    expect(res.sheets.map((s) => [s.name, s.aliases])).toEqual([["Lombard", ["Lombardic"]]]);
  });

  it("merges aliases with an existing sheet and lets a canonical draft win over an alias draft", () => {
    const existing = [toSheet({ ...draft("Lombard", { aliases: ["Langobardic"] }), approved: true })];
    const res = approveSheets(
      [draft("Lombardic", { region: "from alias" }), draft("Lombard", { region: "from canonical" })],
      existing,
      { allValid: true },
    );
    expect(res.sheets).toHaveLength(1);
    expect(res.sheets[0].region).toBe("from canonical");
    expect(res.sheets[0].aliases).toEqual(["Langobardic", "Lombardic"]);
  });

  it("keeps existing sheets that weren't re-approved", () => {
    const existing = [toSheet({ ...draft("Gothic"), approved: true })];
    const res = approveSheets([draft("Latin")], existing, { allValid: true });
    expect(res.sheets.map((s) => s.name)).toEqual(["Gothic", "Latin"]);
  });
});

describe("toSheet", () => {
  it("keeps only LanguageSheet fields, in a fixed order", () => {
    const s = toSheet({ ...draft("Latin"), extra: "x", _problems: [] });
    expect(Object.keys(s)).toEqual([
      "name",
      "aliases",
      "status",
      "classification",
      "region",
      "map",
      "era",
      "peakSpeakers",
      "unknownSpeakersNote",
      "parent",
      "origin",
      "sourceUrl",
      "approved",
    ]);
  });
});

describe("renderDataModule", () => {
  const sheets: LanguageSheet[] = approveSheets(
    [draft("Old Norse"), draft("Latin"), draft("Gothic")],
    [],
    { allValid: true },
  ).sheets;

  it("is canonical-sorted and stable regardless of input order", () => {
    const a = renderDataModule(sheets);
    const b = renderDataModule([...sheets].reverse());
    expect(a).toBe(b);
    expect(a.indexOf('"Gothic"')).toBeLessThan(a.indexOf('"Latin"'));
    expect(a.indexOf('"Latin"')).toBeLessThan(a.indexOf('"Old Norse"'));
  });

  it("has a header comment, a type import and satisfies LanguageSheet[]", () => {
    const out = renderDataModule(sheets);
    expect(out.startsWith("// written by scripts/languages/approveSheets.ts")).toBe(true);
    expect(out).toContain('import type { LanguageSheet } from "./types";');
    expect(out).toContain("] satisfies LanguageSheet[];");
    expect(out.endsWith("\n")).toBe(true);
  });

  it("renders an empty list", () => {
    expect(renderDataModule([])).toContain("export const LANGUAGE_SHEETS: LanguageSheet[] = [] satisfies LanguageSheet[];");
  });
});

describe("sheet index", () => {
  const sheets: LanguageSheet[] = [
    ...approveSheets(
      [draft("Old Norse", { aliases: ["Norse"] }), draft("Latin", { aliases: ["Classical Latin"] })],
      [],
      { allValid: true },
    ).sheets,
    toSheet({ ...draft("Gothic", { aliases: ["Gothic tongue"] }), approved: false } as unknown as LanguageSheet),
  ];

  it("maps every approved name and alias to its canonical name", () => {
    expect(buildSheetIndex(sheets)).toEqual({
      "Classical Latin": "Latin",
      Latin: "Latin",
      Norse: "Old Norse",
      "Old Norse": "Old Norse",
    });
  });

  it("excludes unapproved sheets and their aliases", () => {
    const index = buildSheetIndex(sheets);
    expect(index.Gothic).toBeUndefined();
    expect(index["Gothic tongue"]).toBeUndefined();
  });

  it("renders stable output regardless of input order", () => {
    const a = renderSheetIndexModule(sheets);
    expect(renderSheetIndexModule([...sheets].reverse())).toBe(a);
    expect(a.startsWith("// GENERATED by scripts/languages/approveSheets.ts")).toBe(true);
    expect(a).toContain("export const SHEET_NAMES: Record<string, string> = {");
    expect(a.endsWith("\n")).toBe(true);
  });

  it("renders an empty index, matching the committed module", () => {
    expect(renderSheetIndexModule([])).toContain("export const SHEET_NAMES: Record<string, string> = {};");
    expect(SHEET_NAMES).toEqual({});
  });
});
