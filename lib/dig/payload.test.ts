import { describe, expect, it } from "vitest";
import { decodeDay, decodeSecret, encodeDay, encodeSecret } from "./payload";
import type { DigDayPlain, PromptSecret } from "./types";

const secret: PromptSecret = {
  answers: [["halyard", "rare", 1], ["Crème brûlée", "uncommon", 0]],
  aliases: { halyards: 0 },
  guard: ["mallard"],
  fossil: { word: "halyard", fact: 'From "haul" + "yard": the rope that hauls a sail up.' },
  stories: { halyard: "halyard" },
};

describe("payload", () => {
  it("round-trips a secret", () => {
    const p = encodeSecret(secret, "2026-12-01", "theme:sailing");
    expect(decodeSecret(p, "2026-12-01", "theme:sailing")).toEqual(secret);
  });
  it("hides answers from a casual look", () => {
    const p = encodeSecret(secret, "2026-12-01", "theme:sailing");
    expect(p).not.toContain("halyard");
    expect(p).not.toContain("answers");
  });
  it("varies by date and prompt", () => {
    expect(encodeSecret(secret, "2026-12-01", "theme:sailing")).not.toBe(encodeSecret(secret, "2026-12-02", "theme:sailing"));
  });
  it("round-trips a whole day", () => {
    const day: DigDayPlain = {
      v: 1,
      date: "2026-12-01",
      rejSample: 1,
      prompts: [{ id: "theme:sailing", kind: "theme", text: "Name a word from sailing", ...secret }],
    };
    const encoded = encodeDay(day);
    expect(encoded.prompts[0]).toEqual({ id: "theme:sailing", kind: "theme", text: "Name a word from sailing", payload: expect.any(String) });
    expect(decodeDay(JSON.parse(JSON.stringify(encoded)))).toEqual(day);
  });
});
