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

  it("drops words whose main etymology doesn't name the language (a homograph's sense carried the tag)", async () => {
    const withEt = (w: string, et: string) => ({ ...e(w, "Old Norse", "non"), et });
    const idx = await indexWiktionary(
      [withEt("and", "Etymology tree\nProto-Germanic *andi\nEnglish and\nFrom Middle English and, from Old English and."),
       withEt("sky", "From Middle English sky, borrowed from Old Norse ský (“cloud”)."),
       withEt("ransack", "Borrowed from Norse rannsaka.")],
      new Set()
    );
    const norse = originCandidates(idx, new Map(), cat, new Map()).find((c) => c.id === "origin:old-norse")!;
    expect(norse.core.sort()).toEqual(["ransack", "sky"]);
    expect(norse.accepted).not.toContain("and");
  });

  it("drops an origin too broad to play (more than 1,200 core words)", async () => {
    const letters = (i: number) => [i % 26, Math.floor(i / 26) % 26, Math.floor(i / 676)].map((n) => String.fromCharCode(97 + n)).join("");
    const words = (n: number) => Array.from({ length: n }, (_, i) => e(`qu${letters(i)}`, "Arabic", "ar"));
    const ids = async (n: number) => originCandidates(await indexWiktionary(words(n), new Set()), new Map(), cat, new Map()).map((c) => c.id);
    expect(await ids(1200)).toContain("origin:arabic");
    expect(await ids(1201)).not.toContain("origin:arabic");
  });
});
