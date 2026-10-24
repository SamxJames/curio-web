import { describe, expect, it } from "vitest";
import { validateDay } from "./validate";
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
});
