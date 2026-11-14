import { describe, expect, it } from "vitest";
import { indexWiktionary } from "./wiktionary";
import { ORIGIN_CORE_CAP, ORIGIN_EVERYDAY_EXTRA, originCandidates } from "./origins";
import { ACCEPTED_CAP } from "./themes";
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

  it("counts a word that came through another language: sugar is from Arabic, though it reached English through French", async () => {
    const sugar = { ...e("sugar", "Arabic", null), et: "From Middle English sugre, from Middle French sucre, from Old French çucre, from Medieval Latin zuccarum, from Arabic sukkar." };
    // "tell" (a mound, in archaeology) is tagged Arabic too, but its main etymology is the Old English verb's.
    const tell = { ...e("tell", "Arabic", "ar"), et: "From Middle English tellen, from Old English tellan (“to count, tell”)." };
    const idx = await indexWiktionary([e("algebra", "Arabic", "ar"), sugar, tell], new Set());
    const arabic = originCandidates(idx, new Map(), cat, new Map()).find((c) => c.id === "origin:arabic")!;
    expect(arabic.accepted).toContain("sugar");
    expect(arabic.accepted).not.toContain("tell");
    expect(arabic.core).toEqual(["algebra"]); // the shown list stays strict
  });

  it("counts dialect labels as their language: pizza (Neapolitan) is Italian, taco (Mexican Spanish) is Spanish, amen (Biblical Hebrew) is Hebrew", async () => {
    const variants: Catalogue = {
      ...cat, langCodes: { Italian: "it", Neapolitan: "nap", Spanish: "es", Hebrew: "he" },
      originVariants: { Italian: ["Neapolitan"], Spanish: ["Mexican Spanish"], Hebrew: ["Biblical Hebrew"] },
    };
    const idx = await indexWiktionary(
      [e("pasta", "Italian", "it"), { ...e("pizza", "Neapolitan", "nap"), et: "Borrowed from Neapolitan pizza." }, e("siesta", "Spanish", "es"), e("taco", "Mexican Spanish", null),
       e("kosher", "Hebrew", "he"), e("amen", "Biblical Hebrew", null), e("jubilee", "the Biblical Hebrew root י־ב־ל", null), e("alcohol", "the Arabic root ك ح ل", null)],
      new Set()
    );
    const out = originCandidates(idx, new Map(), variants, new Map());
    const of = (id: string) => out.find((c) => c.id === id)!;
    expect(of("origin:italian").accepted).toContain("pizza");
    expect(of("origin:italian").core).toEqual(["pasta"]);
    expect(of("origin:italian").sources.some((s) => s.has("pizza"))).toBe(true); // adjudication can use it
    expect(of("origin:spanish").accepted).toContain("taco");
    expect(of("origin:hebrew").accepted).toEqual(expect.arrayContaining(["amen", "jubilee"]));
    expect(out.some((c) => c.id === "origin:neapolitan")).toBe(false); // a variant never gets its own prompt
    // A root category belongs to its language even with no variants listed.
    const arabic = originCandidates(idx, new Map(), { ...cat, originVariants: {} }, new Map()).find((c) => c.id === "origin:arabic");
    expect(arabic).toBeUndefined(); // no "Arabic" category in this index, so no prompt
    const idx2 = await indexWiktionary([e("algebra", "Arabic", "ar"), e("alcohol", "the Arabic root ك ح ل", null)], new Set());
    expect(originCandidates(idx2, new Map(), cat, new Map()).find((c) => c.id === "origin:arabic")!.accepted).toContain("alcohol");
  });

  it("keeps everyday words past the size cap for a big language: opera and violin are from Italian", async () => {
    const letters = (i: number) => [i % 26, Math.floor(i / 26) % 26, Math.floor(i / 676)].map((n) => String.fromCharCode(97 + n)).join("");
    const core = Array.from({ length: ACCEPTED_CAP + 50 }, (_, i) => e(`qu${letters(i)}`, "Arabic", "ar"));
    const idx = await indexWiktionary([...core, e("opera", "Arabic", null), e("violin", "Arabic", null), e("zzyzx", "Arabic", null)], new Set());
    const zipf = new Map([["opera", 4.3], ["violin", 3.7], ["zzyzx", 1.2]]);
    const arabic = originCandidates(idx, zipf, cat, new Map()).find((c) => c.id === "origin:arabic")!;
    expect(arabic.core).toHaveLength(ACCEPTED_CAP + 50);
    expect(arabic.accepted).toEqual(expect.arrayContaining(["opera", "violin"]));
    expect(arabic.accepted).not.toContain("zzyzx"); // rare words past the cap are still cut
    expect(arabic.accepted.length).toBeLessThanOrEqual(ACCEPTED_CAP + 50 + ORIGIN_EVERYDAY_EXTRA);
  });

  it("keeps a big language (the spec counts Japanese at 1,576) and drops one too broad to play (more than ORIGIN_CORE_CAP)", async () => {
    const letters = (i: number) => [i % 26, Math.floor(i / 26) % 26, Math.floor(i / 676)].map((n) => String.fromCharCode(97 + n)).join("");
    const words = (n: number) => Array.from({ length: n }, (_, i) => e(`qu${letters(i)}`, "Arabic", "ar"));
    const ids = async (n: number) => originCandidates(await indexWiktionary(words(n), new Set()), new Map(), cat, new Map()).map((c) => c.id);
    expect(await ids(ORIGIN_CORE_CAP)).toContain("origin:arabic");
    expect(await ids(ORIGIN_CORE_CAP + 1)).not.toContain("origin:arabic");
  });
});
