import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DigFunnelTable from "./DigFunnelTable";

const row = { date: "2026-12-02", land: 1, start: 4, finish: 3, share: 0, story: 0, signup: 0, past: 0, returning: 1, returnShare: 25, via: { nav: 3, home: 2 } };

describe("DigFunnelTable", () => {
  it("shows the returner kill line, the share and a Return % column", () => {
    const html = renderToStaticMarkup(<DigFunnelTable summary={{ rows: [row], killLine: 6, killReturnShare: 28.5 }} />);
    expect(html).toContain("median daily returning starts");
    expect(html).toContain("below 5 means stop");
    expect(html).toContain("28.5%");
    expect(html).toContain("Return %");
    expect(html).toContain("25%");
    expect(html).toContain("nav 3 · home 2");
    expect(html).not.toContain("below 20");
  });
});
