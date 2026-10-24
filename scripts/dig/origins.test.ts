import { describe, expect, it } from "vitest";
import { indexWiktionary } from "./wiktionary";
import { originCandidates } from "./origins";
import type { Catalogue } from "./catalogue";
import type { CompactEntry } from "./sources/compact";

const e = (w: string, lang: string, code: string | null): CompactEntry => ({
  w, pos: "noun", t: [], c: [`English terms derived from ${lang}`], g: [], e: code ? [`der:${code}`] : [], f: [], n: 1, et: "",
});
const cat: Catalogue = {
  anchorOverrides: {}, renames: {}, blockPatterns: [], wikidataThemes: [],
  originGroups: [{ id: "origin:group:scandinavian", text: "Name a word that came to English from a Scandinavian language", languages: ["Old Norse", "Danish"] }],
  originExclude: ["Latin"], langCodes: { Arabic: "ar", "Old Norse": "non", Danish: "da", Latin: "la" },
};

describe("originCandidates", () => {
  it("needs both the category and the template, and respects exclusions and Curio lineage", async () => {
    const idx = await indexWiktionary(
      [e("algebra", "Arabic", "ar"), e("sofa", "Arabic", "ar"), e("zero", "Arabic", null), e("saffron", "Arabic", "ar"),
       e("sky", "Old Norse", "non"), e("smorgasbord", "Danish", "da"), e("via", "Latin", "la")],
      new Set()
    );
    const lineage = new Map([["saffron", ["Persian", "French", "English"]]]);
    const out = originCandidates(idx, new Map(), cat, lineage);
    const arabic = out.find((c) => c.id === "origin:arabic")!;
    expect(arabic.core.sort()).toEqual(["algebra", "sofa"]);
    expect(arabic.accepted).toEqual(expect.arrayContaining(["algebra", "sofa", "zero", "saffron"]));
    expect(arabic.text).toBe("Name a word that came to English from Arabic");
    expect(arabic.languages).toEqual(["Arabic"]);
    expect(out.some((c) => c.id === "origin:latin")).toBe(false);
    const group = out.find((c) => c.id === "origin:group:scandinavian")!;
    expect(group.core.sort()).toEqual(["sky", "smorgasbord"]);
    expect(group.languages).toEqual(["Old Norse", "Danish"]);
  });
});
