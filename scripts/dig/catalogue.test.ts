import { describe, expect, it } from "vitest";
import { curatedAnswers, loadCatalogue } from "./catalogue";

describe("curatedAnswers", () => {
  const cat = { extraAnswers: { "theme:beverages": ["water", "milk"] } };
  it("gives a theme its hand-picked answers", () => {
    expect(curatedAnswers(cat, { id: "theme:beverages", base: "theme:beverages" })).toEqual(["water", "milk"]);
  });
  it("gives a letter variant only the answers with its letter", () => {
    expect(curatedAnswers(cat, { id: "theme:beverages:w", base: "theme:beverages" })).toEqual(["water"]);
  });
  it("gives nothing to a theme without a list", () => {
    expect(curatedAnswers({}, { id: "theme:birds", base: "theme:birds" })).toEqual([]);
  });
  it("ships water as a beverage, which neither source lists", () => {
    expect(curatedAnswers(loadCatalogue(), { id: "theme:beverages", base: "theme:beverages" })).toContain("water");
  });
});
