import { describe, expect, it } from "vitest";
import { familyPath, findSheet, nextLanguages } from "./lookup";
import type { LanguageSheet } from "./types";

const base: LanguageSheet = {
  name: "X",
  aliases: [],
  status: "extinct",
  classification: "c",
  region: "r",
  map: null,
  era: null,
  peakSpeakers: null,
  unknownSpeakersNote: "n",
  parent: null,
  origin: "o".repeat(50),
  sourceUrl: "https://en.wikipedia.org/wiki/X",
  approved: true,
};
const s = (p: Partial<LanguageSheet>): LanguageSheet => ({ ...base, ...p });

const sheets: LanguageSheet[] = [
  s({ name: "Proto-Indo-European", status: "reconstructed" }),
  s({ name: "Proto-Italic", status: "reconstructed", parent: "Proto-Indo-European" }),
  s({ name: "Latin", aliases: ["Lombardic"], parent: "Proto-Italic" }),
  s({ name: "Draft", approved: false, aliases: ["Draftish"] }),
];

describe("findSheet", () => {
  it("matches canonical names and aliases", () => {
    expect(findSheet("Latin", sheets)?.name).toBe("Latin");
    expect(findSheet("Lombardic", sheets)?.name).toBe("Latin");
  });
  it("ignores unapproved sheets", () => {
    expect(findSheet("Draft", sheets)).toBeUndefined();
    expect(findSheet("Draftish", sheets)).toBeUndefined();
  });
  it("returns undefined for unknown names", () => {
    expect(findSheet("Klingon", sheets)).toBeUndefined();
  });
});

describe("familyPath", () => {
  it("walks parents to the root, oldest first", () => {
    expect(familyPath("Latin", sheets)).toEqual(["Proto-Indo-European", "Proto-Italic", "Latin"]);
  });
  it("stops on a cycle", () => {
    const cyc = [s({ name: "A", parent: "B" }), s({ name: "B", parent: "A" })];
    const path = familyPath("A", cyc);
    expect(path.length).toBeLessThanOrEqual(2);
    expect(new Set(path).size).toBe(path.length);
  });
  it("stops at a missing parent", () => {
    const m = [s({ name: "A", parent: "Ghost" })];
    expect(familyPath("A", m)).toEqual(["A"]);
  });
  it("only follows approved sheets", () => {
    const m = [
      s({ name: "Root" }),
      s({ name: "Mid", parent: "Root", approved: false }),
      s({ name: "Leaf", parent: "Mid" }),
    ];
    expect(familyPath("Leaf", m)).toEqual(["Leaf"]);
  });
  it("does not walk up from an unapproved starting sheet", () => {
    const m = [s({ name: "Root" }), s({ name: "Leaf", parent: "Root", approved: false })];
    expect(familyPath("Leaf", m)).toEqual(["Leaf"]);
  });
  it("uses canonical names, not the alias it was given or a parent's alias", () => {
    const m = [
      s({ name: "Old Norse", aliases: ["Norse"] }),
      s({ name: "Icelandic", aliases: ["Islandic"], parent: "Norse" }),
    ];
    expect(familyPath("Islandic", m)).toEqual(["Old Norse", "Icelandic"]);
  });
});

describe("nextLanguages", () => {
  it("returns unique next steps in first-seen order", () => {
    expect(
      nextLanguages("Latin", [
        ["Latin", "Old French", "English"],
        ["Latin", "English"],
        ["Proto-Italic", "Latin", "Old French", "English"],
      ]),
    ).toEqual(["Old French", "English"]);
  });
});
