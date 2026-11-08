import { describe, expect, it } from "vitest";
import { shareImageLines } from "./shareImage";

describe("shareImageLines", () => {
  it("puts the address on the challenge card only", () => {
    expect(shareImageLines(5, 125, true)).toContain("Can you go deeper? curioword.com/dig");
    expect(shareImageLines(5, 125).join(" ")).not.toContain("curioword.com");
  });
});
