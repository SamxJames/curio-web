import { describe, expect, it } from "vitest";
import { fossilTypoCollides, validateDay } from "./validate";
import type { DigDayPlain, DigPromptPlain, Tier } from "../../lib/dig/types";

function prompt(id: string, kind: "theme" | "origin", prefix: string): DigPromptPlain {
  const answers: [string, Tier, 0 | 1][] = Array.from({ length: 45 }, (_, i) => [`${prefix}${"abcdefghijklmnopqrstuvwxyz"[i % 26]}${"abcdefghijklmnopqrstuvwxyz"[Math.floor(i / 26)]}word`, i < 10 ? "common" : i < 25 ? "rare" : "uncommon", 1]);
  answers[30][1] = "fossil";
  return { id, kind, text: `Name ${id}`, answers, aliases: {}, guard: [], fossil: { word: answers[30][0], fact: "A fact." }, stories: {} };
}
const good = (): DigDayPlain => ({
  v: 1, date: "2026-12-05", rejSample: 1,
  prompts: [prompt("theme:a", "theme", "a"), prompt("theme:b", "theme", "b"), prompt("origin:x", "origin", "x"), prompt("theme:c", "theme", "c"), prompt("theme:d", "theme", "d"), prompt("origin:y", "origin", "y"), prompt("theme:e", "theme", "e")],
});
const ctx = { history: [], storySlugs: new Set<string>(), dailyWords: new Set<string>(), blocked: new Set<string>() };

describe("validateDay", () => {
  it("passes a well-formed day", () => {
    expect(validateDay(good(), ctx)).toEqual([]);
  });
  it("catches wrong mix and positions", () => {
    const d = good();
    [d.prompts[2], d.prompts[3]] = [d.prompts[3], d.prompts[2]];
    expect(validateDay(d, ctx)).toContain("origins must be at positions 3 and 6");
  });
  it("catches a bad fossil, an unknown story slug and a blocked word", () => {
    const d = good();
    d.prompts[0].fossil.fact = "";
    d.prompts[1].stories = { bawordx: "no-such-slug" };
    d.prompts[3].answers[0][0] = "badword";
    const problems = validateDay(d, { ...ctx, blocked: new Set(["badword"]) });
    expect(problems).toEqual(expect.arrayContaining([
      "theme:a: fossil fact must be 1–140 characters",
      "theme:b: 1 unknown story slug(s)",
      "theme:c: blocked word",
    ]));
  });
  it("catches overlap, duplicate fossils and daily-word clashes", () => {
    const d = good();
    d.prompts[1] = { ...prompt("theme:b", "theme", "a") };
    const problems = validateDay(d, { ...ctx, dailyWords: new Set([d.prompts[4].fossil.word]) });
    expect(problems).toEqual(expect.arrayContaining(["theme:a and theme:b overlap ≥ 20%", "fossils must all differ", "theme:d: fossil clashes with the daily word or /play"]));
  });
  it("catches an answer key that hides a different tier", () => {
    const d = good();
    d.prompts[0].answers.push(["Aa-aword", "rare", 1]);
    d.prompts[0].answers[0] = ["aaaword", "common", 1];
    expect(validateDay(d, ctx)).toContain("theme:a: answer 45 shares a key with answer 0 at a different tier");
  });
  it("flags an alias whose target is out of range without throwing", () => {
    const d = good();
    d.prompts[0].aliases = { xyzword: 999 };
    expect(() => validateDay(d, ctx)).not.toThrow();
    expect(validateDay(d, ctx)).toContain("theme:a: alias target 999 out of range");
  });
  it("flags an alias that points at the wrong answer", () => {
    const d = good();
    d.prompts[0].aliases = { aaaword: 3 };
    expect(validateDay(d, ctx)).toContain("theme:a: alias 3 does not match");
  });
  it("flags a fossil typo at the end of the word that resolves to another answer", () => {
    const d = good();
    d.prompts[0].answers[0] = ["box", "common", 1];
    d.prompts[0].answers[30] = ["boxey", "fossil", 1];
    d.prompts[0].fossil.word = "boxey";
    expect(validateDay(d, ctx)).toContain("theme:a: a fossil typo resolves to another answer");
  });
  it("catches a blocked word inside a multi-word answer", () => {
    const d = good();
    d.prompts[2].answers[0][0] = "glans badword";
    expect(validateDay(d, { ...ctx, blocked: new Set(["badword"]) })).toContain("origin:x: blocked word");
  });
  it("fossilTypoCollides: the same test, usable before a fossil is chosen", () => {
    const answers: [string, Tier, 0 | 1][] = [["box", "common", 1], ["boxey", "rare", 1], ["gunwale", "rare", 1]];
    expect(fossilTypoCollides({ answers, aliases: {}, guard: [] }, "boxey")).toBe(true);
    expect(fossilTypoCollides({ answers, aliases: {}, guard: [] }, "gunwale")).toBe(false);
  });
  it("counts casing differences as overlap", () => {
    const d = good();
    d.prompts[1].answers = d.prompts[0].answers.map(([w, t, c]): [string, Tier, 0 | 1] => [w[0].toUpperCase() + w.slice(1), t, c]);
    d.prompts[1].fossil.word = d.prompts[1].answers[30][0];
    expect(validateDay(d, ctx)).toContain("theme:a and theme:b overlap ≥ 20%");
  });
  it("flags a theme whose base was used 29 days earlier", () => {
    const d = good();
    d.prompts[0].id = "theme:weather:a";
    const history = [{ date: "2026-11-06", prompts: [{ id: "theme:weather:b", base: "theme:weather", fossil: "zzzword" }] }];
    expect(validateDay(d, { ...ctx, history })).toContain("theme:weather:a: shares a base theme within 30 days");
  });
  it("passes a theme whose base was used 30 days earlier", () => {
    const d = good();
    d.prompts[0].id = "theme:weather:a";
    const history = [{ date: "2026-11-05", prompts: [{ id: "theme:weather:b", base: "theme:weather", fossil: "zzzword" }] }];
    expect(validateDay(d, { ...ctx, history })).toEqual([]);
  });
});
