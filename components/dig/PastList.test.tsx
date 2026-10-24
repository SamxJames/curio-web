import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PastList from "./PastList";

describe("PastList", () => {
  it("lists every past day newest first with no counts or unplayed marks", () => {
    const html = renderToStaticMarkup(<PastList days={[{ date: "2026-12-09", number: 9 }, { date: "2026-12-08", number: 8 }]} />);
    expect(html.indexOf("Day 9")).toBeLessThan(html.indexOf("Day 8"));
    expect(html).toContain("/dig/2026-12-09/play");
    expect(html).toContain("/dig/2026-12-09");
    expect(html.toLowerCase()).not.toMatch(/unplayed|missed|\d+ of \d+|not played/);
  });
});
