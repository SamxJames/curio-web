import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TodayStrip, { isDigDone, isPuzzleDone } from "./TodayStrip";

describe("isPuzzleDone", () => {
  it("is done once solved or out of clues, not while playing", () => {
    const base = { puzzleDate: "2026-11-07", cluesRevealed: 1 as const, cluesUsedToSolve: null };
    expect(isPuzzleDone(null)).toBe(false);
    expect(isPuzzleDone({ ...base, status: "playing" })).toBe(false);
    expect(isPuzzleDone({ ...base, status: "solved" })).toBe(true);
    expect(isPuzzleDone({ ...base, status: "failed" })).toBe(true);
  });
});

describe("isDigDone", () => {
  it("is done only when today's game is stored", () => {
    const store = { v: 1 as const, settings: { noTimer: false }, games: { "2026-11-06": {} as never } };
    expect(isDigDone(store, "2026-11-07")).toBe(false);
    expect(isDigDone(store, "2026-11-06")).toBe(true);
  });
});

describe("TodayStrip", () => {
  it("lists the puzzle and the dig with no ticks on the server and no counts", () => {
    const html = renderToStaticMarkup(<TodayStrip digOpen />);
    expect(html).toContain('href="/play"');
    expect(html).toContain('href="/dig?from=home"');
    expect(html).toContain("Also today");
    expect(html).not.toContain("done today");
    expect(html).not.toMatch(/\d of \d/);
  });
  it("labels the list with the 'Also today' heading", () => {
    const html = renderToStaticMarkup(<TodayStrip digOpen />);
    const labelledBy = html.match(/<ul[^>]*aria-labelledby="([^"]+)"/)?.[1];
    const headingId = html.match(/<p[^>]*id="([^"]+)"[^>]*>Also today<\/p>/)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(headingId).toBe(labelledBy);
  });
  it("omits the dig while dig is closed", () => {
    expect(renderToStaticMarkup(<TodayStrip digOpen={false} />)).not.toContain("/dig");
  });
});
