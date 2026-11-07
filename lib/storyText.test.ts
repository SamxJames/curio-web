import { describe, expect, it } from "vitest";
import { cleanStoryText } from "./storyText";
import { WORDS } from "./words";

describe("cleanStoryText", () => {
  it("cuts a trailing disclaimer clause and keeps the lead", () => {
    expect(cleanStoryText("It shares a root with other words built on that stem, though the facts here don't name them specifically."))
      .toBe("It shares a root with other words built on that stem.");
  });
  it("keeps what follows 'but' in a sentence that opens with the facts", () => {
    expect(cleanStoryText("The facts here don't name a specific English cognate, but the root verb means 'to remember'. Next sentence."))
      .toBe("The root verb means 'to remember'. Next sentence.");
  });
  it("drops a sentence that is only a disclaimer", () => {
    expect(cleanStoryText("Real fact. The facts given don't support tracing this word to any other English cognate."))
      .toBe("Real fact.");
    expect(cleanStoryText("The facts given don't support tracing this word to any other English cognate.")).toBe("");
  });
  it("never leaves a fragment: a leading disclaimer followed by a non-sentence drops the sentence", () => {
    expect(cleanStoryText("The facts don't trace a shift in meaning, only the chain of borrowing from Greek through Latin, Old French, and Old English into Middle English."))
      .toBe("");
    expect(cleanStoryText("The facts given show only the Latin formation — 'to draw out' — carried directly into English as exhaust.")).toBe("");
  });
  it("keeps what a leading disclaimer introduces when it stands as a sentence", () => {
    expect(cleanStoryText("The facts don't show a shift in meaning — the word has stayed tied to its root sense."))
      .toBe("The word has stayed tied to its root sense.");
    expect(cleanStoryText("The facts don't trace a shift in meaning, so the honest story is simply that the word passed from Latin into English."))
      .toBe("The word passed from Latin into English.");
  });
  it("handles closing quotes and other pipeline phrasings", () => {
    expect(cleanStoryText("It's possibly linked to \"stingo,\" though the facts don't clarify how strong that link is."))
      .toBe("It's possibly linked to \"stingo.\"");
    expect(cleanStoryText("It shares a root with pilus, though no specific English cognate is given in the record."))
      .toBe("It shares a root with pilus.");
  });
  it("leaves clean text alone", () => {
    expect(cleanStoryText("From Hindustani jangal, 'desert'.")).toBe("From Hindustani jangal, 'desert'.");
  });
  it("leaves no disclaimer anywhere in the word bank", () => {
    const leftovers: string[] = [];
    for (const w of WORDS) for (const k of ["origin", "journey", "related"] as const) {
      const out = cleanStoryText(w[k]);
      if (/\bthe facts\b|\bfacts (given|here|don't)\b|\bgiven facts\b|\bsource facts\b|\b(?:in|by) the record\b|\bgiven sources?\b/i.test(out)) leftovers.push(`${w.slug}.${k}: ${out}`);
    }
    expect(leftovers).toEqual([]);
  });
});
