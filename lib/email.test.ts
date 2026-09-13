import { describe, expect, it } from "vitest";
import { buildDigestSubject } from "./email";

describe("buildDigestSubject", () => {
  it("returns a short teaser unchanged", () => {
    expect(buildDigestSubject("A short teaser.")).toBe("A short teaser.");
  });

  it("truncates a long teaser to the max length, breaking on a word boundary", () => {
    const teaser =
      "Venice once made incoming ships wait offshore for exactly forty days — no more, no less.";
    const subject = buildDigestSubject(teaser, 60);
    expect(subject.length).toBeLessThanOrEqual(61); // 60 + the ellipsis character
    expect(subject.endsWith("…")).toBe(true);
    // No partial word before the ellipsis: strip it and confirm what's left
    // doesn't end mid-word (the char before the ellipsis, if not itself the
    // ellipsis, must be preceded by a word boundary in the original text).
    const withoutEllipsis = subject.slice(0, -1);
    expect(teaser.startsWith(withoutEllipsis)).toBe(true);
    expect(teaser[withoutEllipsis.length]).toMatch(/\s/);
  });

  it("never leaves dangling punctuation immediately before the ellipsis", () => {
    // Constructed so the naive word-boundary cut would land right after a comma.
    const teaser = "A word for something, done in a very particular and quite specific way, historically.";
    const subject = buildDigestSubject(teaser, 30);
    expect(subject.endsWith("…")).toBe(true);
    expect(subject).not.toMatch(/[.,;:!?—–-]…$/);
  });

  it("uses a 60-character default when no maxLength is given", () => {
    const teaser = "T".repeat(100);
    const subject = buildDigestSubject(teaser);
    expect(subject.length).toBeLessThanOrEqual(61);
  });
});
