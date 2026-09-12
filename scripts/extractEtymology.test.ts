import { describe, expect, it } from "vitest";
import path from "path";
import { extractEtymologyFacts } from "./extractEtymology";

const FIXTURE = path.join(__dirname, "__fixtures__", "sample-wiktextract.jsonl");

describe("extractEtymologyFacts", () => {
  it("returns every distinct English etymology_text for the word", async () => {
    const facts = await extractEtymologyFacts(FIXTURE, "bank");
    expect(facts).toHaveLength(2);
    expect(facts).toContain(
      "From Middle English banke, from Old Norse banki, of the same origin as bank (raised shelf of ground)."
    );
    expect(facts).toContain(
      'From Middle English banke, from Old Italian banca ("table, counter"), from Old High German banc ("bench").'
    );
  });

  it("excludes non-English-language entries", async () => {
    const facts = await extractEtymologyFacts(FIXTURE, "bank");
    expect(facts.join(" ")).not.toContain("Emprunt");
  });

  it("returns a single fact for a word with only one, thin, etymology", async () => {
    const facts = await extractEtymologyFacts(FIXTURE, "thistle");
    expect(facts).toEqual(["From Old English þistel."]);
  });

  it("returns an empty array for a word not in the dump", async () => {
    const facts = await extractEtymologyFacts(FIXTURE, "nonexistent-word");
    expect(facts).toEqual([]);
  });
});
