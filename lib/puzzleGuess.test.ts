import { describe, expect, it } from "vitest";
import {
  isCloseGuess,
  isRepeatGuess,
  revealedLetterPositions,
  MAX_FREE_CLOSE_GUESSES,
} from "./puzzleGuess";

describe("isCloseGuess", () => {
  it("accepts a one-letter typo on a short word", () => {
    expect(isCloseGuess("voley", "volley")).toBe(true); // missing letter
    expect(isCloseGuess("vollez", "volley")).toBe(true); // wrong letter
    expect(isCloseGuess("vollley", "volley")).toBe(true); // extra letter
    expect(isCloseGuess("volely", "volley")).toBe(true); // swapped pair
  });

  it("rejects two edits on a word under 8 letters", () => {
    expect(isCloseGuess("voly", "volley")).toBe(false);
  });

  it("allows two edits on a word of 8+ letters", () => {
    expect(isCloseGuess("entrepeneur", "entrepreneur")).toBe(true);
    expect(isCloseGuess("enterpeneur", "entrepreneur")).toBe(true);
    expect(isCloseGuess("entrepxxxxur", "entrepreneur")).toBe(false);
  });

  it("is never true for the correct answer", () => {
    expect(isCloseGuess("volley", "volley")).toBe(false);
    expect(isCloseGuess("Volleys", "volley")).toBe(false);
  });

  it("ignores case, plurals and UK spellings when measuring", () => {
    expect(isCloseGuess("VOLEYS", "volley")).toBe(true);
    expect(isCloseGuess("colur", "colour")).toBe(true);
  });

  it("gives no close calls on words under 4 letters", () => {
    expect(isCloseGuess("dot", "dog")).toBe(false);
    expect(isCloseGuess("ax", "ox")).toBe(false);
  });

  it("rejects empty and very short guesses", () => {
    expect(isCloseGuess("", "volley")).toBe(false);
    expect(isCloseGuess("  ", "cats")).toBe(false);
  });
});

describe("isRepeatGuess", () => {
  it("matches earlier guesses regardless of case and spacing", () => {
    expect(isRepeatGuess(" Flying ", ["flying"])).toBe(true);
    expect(isRepeatGuess("flight", ["flying"])).toBe(false);
  });
});

describe("revealedLetterPositions", () => {
  it("reveals nothing on clue 1, the first letter on clue 2", () => {
    expect(revealedLetterPositions("volley", 1)).toEqual([]);
    expect(revealedLetterPositions("volley", 2)).toEqual([0]);
  });

  it("adds the last letter on clue 3 for words of 5+ letters", () => {
    expect(revealedLetterPositions("volley", 3)).toEqual([0, 5]);
  });

  it("keeps short words to the first letter only", () => {
    expect(revealedLetterPositions("mugs", 3)).toEqual([0]);
    expect(revealedLetterPositions("ox", 3)).toEqual([0]);
  });
});

it("allows two free close guesses per game", () => {
  expect(MAX_FREE_CLOSE_GUESSES).toBe(2);
});
