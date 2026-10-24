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
  it("round-trips across dates and prompt ids", () => {
    const dates = ["2026-12-01", "2026-12-02", "2027-01-31", "2028-02-29"];
    const ids = ["theme:sailing", "origin:latin", "theme:birds"];
    for (const date of dates) {
      for (const id of ids) {
        expect(decodeSecret(encodeSecret(secret, date, id), date, id)).toEqual(secret);
      }
    }
  });
  it("does not encode every date, or every prompt id, the same way", () => {
    const dates = Array.from({ length: 10 }, (_, i) => `2026-12-${String(i + 1).padStart(2, "0")}`);
    const ids = Array.from({ length: 10 }, (_, i) => `theme:word${i}`);
    expect(new Set(dates.map((d) => encodeSecret(secret, d, "theme:sailing"))).size).toBeGreaterThan(1);
    expect(new Set(ids.map((id) => encodeSecret(secret, "2026-12-01", id))).size).toBeGreaterThan(1);
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
