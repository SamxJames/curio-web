import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EndScreen, { announceDone, wordsWorthKnowing } from "./EndScreen";
import { copyResult, shareImage } from "./shareImage";
import { prepareDay } from "@/lib/dig/game";
import { encodeDay } from "@/lib/dig/payload";
import { devDay } from "@/lib/dig/devDay";

// A signed-out reader, so SignupOffer renders the email form.
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "unauthenticated" }) }));

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
  it("lists a word once, the first occurrence winning", () => {
    const twin = { ...day, secrets: day.secrets.map((s, i) => (i === 3 ? { ...s, fossil: { ...s.fossil, word: "halyard" } } : s)) };
    const words = wordsWorthKnowing(twin, game.answers).map((w) => w.word);
    expect(new Set(words).size).toBe(words.length);
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
  it("heads the answers 'Today's answers' today and 'The day's answers' on a past day", () => {
    const today = renderToStaticMarkup(<EndScreen day={day} game={game} isToday />);
    expect(today).toContain("Today&#x27;s answers");
    expect(today).not.toContain("The day&#x27;s answers");
    const past = renderToStaticMarkup(<EndScreen day={day} game={game} isToday={false} />);
    expect(past).toContain("The day&#x27;s answers");
    expect(past).not.toContain("Today&#x27;s answers");
  });
  it("renders one empty, always-mounted status line for share feedback", () => {
    const html = renderToStaticMarkup(<EndScreen day={day} game={game} isToday />);
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toMatch(/<p[^>]*role="status"[^>]*aria-live="polite"[^>]*><\/p>/);
    expect(html).not.toContain("Copied");
  });
  it("renders the depth line as a focus-target heading", () => {
    const html = renderToStaticMarkup(<EndScreen day={day} game={game} isToday autoFocus />);
    expect(html).toMatch(/<h2[^>]*tabindex="-1"[^>]*>1\.1 m down<\/h2>/);
    expect(html).not.toContain("focus:outline-none");
  });
  it("keeps red for Copy result and the signup button alone", () => {
    const html = renderToStaticMarkup(<EndScreen day={day} game={game} isToday />);
    expect(html.match(/bg-accent-button/g)).toHaveLength(2);
    expect(html).toMatch(/<button[^>]*bg-accent-button[^>]*>Copy result<\/button>/);
    expect(html).toMatch(/<button[^>]*bg-accent-button[^>]*>Get tomorrow&#x27;s word<\/button>/);
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
  it("reports a dismissed share sheet as dismissed, not shared and not failed", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }, share: vi.fn().mockRejectedValue(abort()) });
    await expect(copyResult("hello")).resolves.toBe("dismissed");
  });
  it("reports failure when the share sheet errors for another reason", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }, share: vi.fn().mockRejectedValue(new Error("nope")) });
    await expect(copyResult("hello")).resolves.toBe("failed");
  });
  it("reports failure when neither clipboard nor share is available", async () => {
    vi.stubGlobal("navigator", {});
    await expect(copyResult("hello")).resolves.toBe("failed");
  });
});

describe("shareImage", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  const input = { number: 5, score: 110, tiers: ["common", null, null, null, null, null, "fossil"] as never, text: "t" };
  const abort = () => Object.assign(new Error("dismissed"), { name: "AbortError" });

  function stubBrowser(nav: object, fonts?: object) {
    vi.useFakeTimers();
    const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
    const anchor = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
    const appendChild = vi.fn();
    const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: (cb: (b: Blob) => void) => cb(new Blob(["x"])) };
    vi.stubGlobal("document", {
      fonts,
      body: { appendChild },
      createElement: (tag: string) => (tag === "canvas" ? canvas : anchor),
    });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
    vi.stubGlobal("navigator", nav);
    return { anchor, appendChild };
  }

  it("still draws and downloads when the font API is missing", async () => {
    const { anchor, appendChild } = stubBrowser({});
    await expect(shareImage(input)).resolves.toBe("downloaded");
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalled();
    expect(anchor.remove).toHaveBeenCalled();
  });
  it("still draws when a font fails to load", async () => {
    stubBrowser({}, { load: () => Promise.reject(new Error("no font")) });
    await expect(shareImage(input)).resolves.toBe("downloaded");
  });
  it("shares the file when the browser can", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubBrowser({ canShare: () => true, share });
    await expect(shareImage(input)).resolves.toBe("shared");
    expect(share).toHaveBeenCalled();
  });
  it("reports a dismissed share sheet as dismissed, with no download", async () => {
    const { anchor } = stubBrowser({ canShare: () => true, share: vi.fn().mockRejectedValue(abort()) });
    await expect(shareImage(input)).resolves.toBe("dismissed");
    expect(anchor.click).not.toHaveBeenCalled();
  });
  it("falls through to a download when the share fails for another reason", async () => {
    const { anchor } = stubBrowser({ canShare: () => true, share: vi.fn().mockRejectedValue(new Error("nope")) });
    await expect(shareImage(input)).resolves.toBe("downloaded");
    expect(anchor.click).toHaveBeenCalled();
  });
});
