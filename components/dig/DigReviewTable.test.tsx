import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DigReviewTable from "./DigReviewTable";

describe("DigReviewTable", () => {
  it("says so when nothing has been reviewed", () => {
    expect(renderToStaticMarkup(<DigReviewTable log={{}} />)).toContain("No reviews yet.");
  });

  it("lists words the reviewer would accept, with why we refused them, and counts the rest", () => {
    const html = renderToStaticMarkup(
      <DigReviewTable
        log={{
          "theme:sailing|boom": { date: "2026-12-01", text: "Name a word from sailing", n: 9, ours: "not-in-sources", ai: { ok: true, conf: "high", reason: "a spar on a boat" } },
          "theme:sailing|banana": { date: "2026-12-01", text: "Name a word from sailing", n: 4, ours: "not-in-sources", ai: { ok: false, conf: "high", reason: "a fruit" } },
        }}
      />,
    );
    expect(html).toContain("boom");
    expect(html).toContain("no source puts it here");
    expect(html).toContain("a spar on a boat");
    expect(html).toContain("2 reviewed: 1 the reviewer would accept, 1 it agrees were right to refuse.");
    expect(html).not.toContain("banana");
  });
});
