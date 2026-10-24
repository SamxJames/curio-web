import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EndScreen, { announceDone, wordsWorthKnowing } from "./EndScreen";
import { copyResult } from "./shareImage";
import { prepareDay } from "@/lib/dig/game";
import { encodeDay } from "@/lib/dig/payload";
import { devDay } from "@/lib/dig/devDay";

const plain = devDay("2026-12-05");
plain.prompts[0].stories = { apple: "apple" };
const day = prepareDay({ ...encodeDay(plain), number: 5 });
const game = { answers: ["apple", null, null, null, null, null, "gimlet"], tiers: ["common", null, null, null, null, null, "fossil"] as never, score: 110, finishedAt: "x", spread: { "1": 60 } };

describe("wordsWorthKnowing", () => {
  it("lists the player's story words first, then each prompt's fossil", () => {
    const list = wordsWorthKnowing(day, game.answers);
    expect(list[0]).toEqual({ word: "apple", note: "Your answer to “Name a fruit”", story: "apple" });
    expect(list.slice(1).map((w) => w.word)).toEqual(["pawpaw", "halyard", "zenith", "chough", "stinking bishop", "loot", "gimlet"]);
  });
});

describe("EndScreen", () => {
  it("shows depth, share, signup and Past digs, with no backlog language", () => {
    const html = renderToStaticMarkup(<EndScreen day={day} game={game} isToday />);
    expect(html).toContain("1.1 m down");
    expect(html).toContain("Deeper than 100% of today&#x27;s diggers");
    expect(html).toContain("Copy result");
    expect(html).toContain("Share image");
    expect(html).toContain("/dig/past");
    expect(html).toContain("Email address");
    expect(html.toLowerCase()).not.toMatch(/missed|streak|unplayed|left to play/);
  });
  it("leaves out the percentile on a past day", () => {
    expect(renderToStaticMarkup(<EndScreen day={day} game={game} isToday={false} />)).not.toContain("Deeper than");
  });
  it("renders the depth line as a focus-target heading", () => {
    const html = renderToStaticMarkup(<EndScreen day={day} game={game} isToday autoFocus />);
    expect(html).toMatch(/<h2[^>]*tabindex="-1"[^>]*>1\.1 m down<\/h2>/);
    expect(html).not.toContain("focus:outline-none");
  });
  it("keeps red for Copy result and the signup's Join alone", () => {
    const html = renderToStaticMarkup(<EndScreen day={day} game={game} isToday />);
    expect(html.match(/bg-accent-button/g)).toHaveLength(2);
    expect(html).toMatch(/<button[^>]*bg-accent-button[^>]*>Copy result<\/button>/);
    expect(html).toMatch(/<button[^>]*bg-accent-button[^>]*>Join<\/button>/);
    expect(html).not.toMatch(/<button[^>]*bg-accent-button[^>]*>Share image<\/button>/);
  });
});

describe("announceDone", () => {
  it("says the dig is complete and how deep, for the persistent live region", () => {
    expect(announceDone(110)).toBe("Dig complete. 1.1 m down.");
  });
});

describe("copyResult", () => {
  afterEach(() => vi.unstubAllGlobals());
  const abort = () => Object.assign(new Error("dismissed"), { name: "AbortError" });

  it("writes the text to the clipboard and never opens a share sheet when the write works", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText }, share });
    await expect(copyResult("hello")).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("hello");
    expect(share).not.toHaveBeenCalled();
  });
  it("falls back to navigator.share when the clipboard write throws", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }, share });
    await expect(copyResult("hello")).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ text: "hello" });
  });
  it("falls back to navigator.share when there is no clipboard at all", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });
    await expect(copyResult("hello")).resolves.toBe("shared");
  });
  it("reports failure, not a share, when the share sheet is dismissed", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }, share: vi.fn().mockRejectedValue(abort()) });
    await expect(copyResult("hello")).resolves.toBe("failed");
  });
  it("reports failure when neither clipboard nor share is available", async () => {
    vi.stubGlobal("navigator", {});
    await expect(copyResult("hello")).resolves.toBe("failed");
  });
});
