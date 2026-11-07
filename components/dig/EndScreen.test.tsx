import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import EndScreen, { announceDone, formatDigDate, rowEvent, wordsWorthKnowing } from "./EndScreen";
import { bannedHits } from "@/lib/dig/copyAudit";
import { copyResult, shareImage } from "./shareImage";
import { prepareDay } from "@/lib/dig/game";
import { encodeDay } from "@/lib/dig/payload";
import { devDay } from "@/lib/dig/devDay";

// A signed-out reader, so SignupOffer renders the email form.
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "unauthenticated" }) }));

const plain = devDay("2026-12-05");
plain.prompts[0].stories = { apple: "apple" };
const day = prepareDay({ ...encodeDay(plain), number: 5 });
const game = { answers: ["apple", null, null, null, null, null, "gimlet"], tiers: ["common", null, null, null, null, null, "fossil"] as never, score: 110, finishedAt: "x", spread: { "1": 100 } };

describe("timer offer", () => {
  it("offers a timer once, as an opt-in, when the player never chose one", () => {
    const html = renderToStaticMarkup(<EndScreen day={day} game={game} isToday offerTimer onAddTimer={() => {}} />);
    expect(html).toContain("Want more of a challenge? Add a 25-second timer next time.");
    expect(bannedHits(html)).toEqual([]);
    expect(renderToStaticMarkup(<EndScreen day={day} game={game} isToday />)).not.toContain("Add a 25-second timer");
  });
});

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
  it("is a postcard: wordmark, dig number, UTC date, depth, depth before the drawing", () => {
    const html = renderToStaticMarkup(<EndScreen day={day} game={game} isToday />);
    expect(html).toContain("curio dig");
    expect(html).toContain("Dig #5");
    expect(html).toContain("5 December 2026");
    expect(html).toContain("1.1 m down");
    expect(html.indexOf("1.1 m down")).toBeLessThan(html.indexOf("<svg"));
    expect(html).toContain('viewBox="0 0 360 240"');
    expect(html).toContain("Your dig, 5 December 2026");
    expect(html).not.toMatch(/Your dig, day/);
    expect(html).toContain(">Share<");
    expect(html).toContain("Save image");
    expect(html).not.toContain("Copy result");
    expect(html).not.toContain("Share image");
  });
  it("shows the percentile on today's dig once there are 100 finishers, with no backlog language", () => {
    const html = renderToStaticMarkup(<EndScreen day={day} game={game} isToday />);
    expect(html).toContain("Deeper than 100% of today&#x27;s diggers");
    expect(html.toLowerCase()).not.toMatch(/missed|streak|unplayed|left to play/);
  });
  it("Share is the only red action (Join is secondary)", () => {
    const html = renderToStaticMarkup(<EndScreen day={day} game={game} isToday />);
    expect(html.match(/bg-accent-button/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*bg-accent-button[^>]*>Share<\/button>/);
    expect(html).toMatch(/<button[^>]*>Get tomorrow&#x27;s word<\/button>/);
    expect(html).not.toMatch(/<button[^>]*bg-accent-button[^>]*>Get tomorrow/);
  });
  it("today: midnight line, play row, no Today's dig row; past: the reverse, no percentile or midnight line", () => {
    const today = renderToStaticMarkup(<EndScreen day={day} game={game} isToday />);
    expect(today).toContain("A new dig opens at midnight UTC.");
    expect(today).toContain("Cool down with a clue puzzle");
    expect(today).toContain("Guess the word from three clues.");
    expect(today).toContain('href="/play"');
    expect(today).not.toContain("Dig today&#x27;s prompts.");
    const past = renderToStaticMarkup(<EndScreen day={day} game={game} isToday={false} />);
    expect(past).not.toContain("midnight UTC");
    expect(past).not.toContain("Deeper than");
    expect(past).toContain("Today&#x27;s dig");
    expect(past).toContain("Dig today&#x27;s prompts.");
    expect(past).toContain('href="/dig"');
    expect(past).not.toContain('href="/play"');
  });
  it("keeps the email offer, Past digs, and both disclosures closed by default", () => {
    const html = renderToStaticMarkup(<EndScreen day={day} game={game} isToday />);
    expect(html).toContain("Email address");
    expect(html).toContain("/dig/past");
    expect(html).toContain("Play or read any earlier dig.");
    expect(html).toContain("Words worth knowing");
    expect(html).toContain("Today&#x27;s answers");
    expect(html).not.toMatch(/<details[^>]*\sopen/);
  });
  it("heads the answers disclosure 'Today's answers' today and 'The day's answers' on a past day", () => {
    const today = renderToStaticMarkup(<EndScreen day={day} game={game} isToday />);
    expect(today).not.toContain("The day&#x27;s answers");
    const past = renderToStaticMarkup(<EndScreen day={day} game={game} isToday={false} />);
    expect(past).toContain("The day&#x27;s answers");
    expect(past).not.toContain("Today&#x27;s answers");
  });
  it("renders no tomorrow line while the day has no hint", () => {
    expect(renderToStaticMarkup(<EndScreen day={day} game={game} isToday />)).not.toContain("Tomorrow:");
  });
  it("renders the tomorrow line first in the come-back row, today only", () => {
    const withHint = { ...day, tomorrow: "a word English took from Japanese" };
    const today = renderToStaticMarkup(<EndScreen day={withHint} game={game} isToday />);
    expect(today).toContain("Tomorrow: a word English took from Japanese");
    expect(today.indexOf("Tomorrow:")).toBeLessThan(today.indexOf("Email address"));
    expect(renderToStaticMarkup(<EndScreen day={withHint} game={game} isToday={false} />)).not.toContain("Tomorrow:");
  });
  it("hides the depth percentile below 100 finishers", () => {
    const few = { ...game, spread: { "10": 40, "30": 9 } };
    expect(renderToStaticMarkup(<EndScreen day={day} game={few} isToday />)).not.toContain("Deeper than");
  });
  it("leaves out the percentile on a past day", () => {
    expect(renderToStaticMarkup(<EndScreen day={day} game={game} isToday={false} />)).not.toContain("Deeper than");
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
  it("copy audit over the whole rendered postcard, today and past, with and without a hint", () => {
    for (const isToday of [true, false]) {
      for (const d of [day, { ...day, tomorrow: "a word from sailing" }]) {
        expect(bannedHits(renderToStaticMarkup(<EndScreen day={d} game={game} isToday={isToday} />))).toEqual([]);
      }
    }
  });
});

describe("formatDigDate", () => {
  it("formats the UTC date as day month year", () => {
    expect(formatDigDate("2026-11-07")).toBe("7 November 2026");
    expect(formatDigDate("2026-12-05")).toBe("5 December 2026");
  });
});

describe("rowEvent", () => {
  it("sends on today's dig only", () => {
    expect(rowEvent("play", true)).toEqual({ kind: "row", to: "play" });
    expect(rowEvent("past", true)).toEqual({ kind: "row", to: "past" });
    expect(rowEvent("play", false)).toBeNull();
    expect(rowEvent("past", false)).toBeNull();
  });
});

describe("postcard contrast (WCAG 1.4.3, text 4.5:1)", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const block = (selector: string) => {
    const at = css.indexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf("}", at));
  };
  const token = (b: string, name: string) => b.match(new RegExp(`${name}: *(#[0-9a-f]{6})`, "i"))![1];
  for (const [theme, selector] of [["light", '[data-brand="next"]'], ["dark", '[data-theme="dark"] [data-brand="next"]']] as const) {
    it(`ink and soft ink read on the raised postcard surface, ${theme}`, () => {
      const b = block(selector);
      const raised = token(b, "--paper-raised");
      expect(ratio(token(b, "--ink"), raised)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(token(b, "--ink-soft"), raised)).toBeGreaterThanOrEqual(4.5);
    });
  }
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

describe("EndScreen touch targets and postcard", () => {
  const src = readFileSync("components/dig/EndScreen.tsx", "utf8");
  it("every disclosure summary is padded to a comfortable target", () => {
    const summaries = src.match(/<summary [^>]*>/g) ?? [];
    expect(summaries.length).toBe(3);
    for (const s of summaries) expect(s).toMatch(/block [^"]*py-[23]/);
  });
  it("the drawing bleeds to the card's inner edge so its labels stay near 12px", () => {
    expect(src).toContain("-mx-4 -mb-4 mt-4 overflow-hidden rounded-b-lg");
  });
});

describe("EndScreen today's-word link", () => {
  it("links today's finished dig to today's word", () => {
    const html = renderToStaticMarkup(<EndScreen day={day} game={game} isToday />);
    expect(html).toContain("Today&#x27;s word on Curio");
    expect(html).toContain("Read where today&#x27;s word came from.");
    expect(bannedHits(html)).toEqual([]);
  });
  it("does not show the today's-word row on a past dig", () => {
    expect(renderToStaticMarkup(<EndScreen day={day} game={game} isToday={false} />)).not.toContain("Today&#x27;s word on Curio");
  });
});
