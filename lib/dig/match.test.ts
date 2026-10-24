import { describe, expect, it } from "vitest";
import { guessForms, normalizeKey } from "./normalize";
import { buildLookup, checkGuess, editDistance, oneEditVariants } from "./match";
import type { PromptSecret } from "./types";

const secret: Pick<PromptSecret, "answers" | "aliases" | "guard"> = {
  answers: [
    ["keel", "familiar", 1],
    ["halyard", "rare", 1],
    ["flotilla", "uncommon", 1],
    ["harbour", "common", 1],
    ["crème brûlée", "uncommon", 0],
    ["hurdy-gurdy", "rare", 1],
    ["cart", "common", 1],
    ["card", "common", 1],
  ],
  aliases: { harbor: 3 },
  guard: ["heel", "peel", "reel", "feel", "kneel", "keen"],
};
const lookup = buildLookup(secret);

describe("normalizeKey", () => {
  it("folds case, accents, ligatures, articles and separators", () => {
    expect(normalizeKey("  Crème Brûlée ")).toBe("cremebrulee");
    expect(normalizeKey("the Hurdy-Gurdy")).toBe("hurdygurdy");
    expect(normalizeKey("Æther")).toBe("aether");
    expect(normalizeKey("an o'clock")).toBe("oclock");
    expect(normalizeKey("123")).toBe("");
  });
  it("offers plural-stripped forms after the key itself", () => {
    expect(guessForms("berries")).toEqual(["berries", "berry", "berri", "berrie"]);
    expect(guessForms("keels")).toEqual(["keels", "keel"]);
    expect(guessForms("glass")).toEqual(["glass"]);
  });
});

describe("editDistance", () => {
  it("counts insert, delete, substitute and adjacent swap as one edit", () => {
    expect(editDistance("halyard", "halyrd", 1)).toBe(1);
    expect(editDistance("halyard", "hlayard", 1)).toBe(1);
    expect(editDistance("keel", "keep", 1)).toBe(1);
    expect(editDistance("keel", "kneel", 1)).toBe(1);
    expect(editDistance("keel", "kale", 1)).toBe(2);
  });
});

describe("checkGuess", () => {
  it("matches exact answers, plurals, aliases and separator variants", () => {
    expect(checkGuess(lookup, "Keel")).toEqual({ kind: "match", index: 0 });
    expect(checkGuess(lookup, "keels")).toEqual({ kind: "match", index: 0 });
    expect(checkGuess(lookup, "HARBOR")).toEqual({ kind: "match", index: 3 });
    expect(checkGuess(lookup, "the halyard")).toEqual({ kind: "match", index: 1 });
    expect(checkGuess(lookup, "creme brulee")).toEqual({ kind: "match", index: 4 });
    expect(checkGuess(lookup, "hurdy gurdy")).toEqual({ kind: "match", index: 5 });
  });
  it("offers a near miss only when it is unique and the guess is not a guarded real word", () => {
    expect(checkGuess(lookup, "halyrd")).toEqual({ kind: "near", index: 1 });
    expect(checkGuess(lookup, "flotila")).toEqual({ kind: "near", index: 2 });
    expect(checkGuess(lookup, "heel")).toEqual({ kind: "miss" });
    expect(checkGuess(lookup, "carx")).toEqual({ kind: "miss" });
    expect(checkGuess(lookup, "kel")).toEqual({ kind: "miss" });
  });
  it("reports empty input and plain misses", () => {
    expect(checkGuess(lookup, "  ")).toEqual({ kind: "empty" });
    expect(checkGuess(lookup, "zebra")).toEqual({ kind: "miss" });
  });
});

describe("oneEditVariants", () => {
  it("produces only strings exactly one edit away", () => {
    const vs = oneEditVariants("keel");
    expect(vs.has("heel")).toBe(true);
    expect(vs.has("kneel")).toBe(true);
    expect(vs.has("kele")).toBe(true);
    expect(vs.has("keel")).toBe(false);
    for (const v of vs) expect(editDistance("keel", v, 1)).toBe(1);
  });
});
