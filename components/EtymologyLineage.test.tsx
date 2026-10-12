import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EtymologyLineage from "./EtymologyLineage";

describe("EtymologyLineage", () => {
  it("renders plain text when no hrefs are given (TodayHero)", () => {
    const html = renderToStaticMarkup(<EtymologyLineage lineage={["Latin", "French", "English"]} />);
    expect(html).not.toContain("<a");
    expect(html).toContain(">Latin<");
  });

  it("links only the names in hrefs", () => {
    const html = renderToStaticMarkup(
      <EtymologyLineage
        lineage={["Latin", "Old French", "English"]}
        hrefs={{ Latin: "/language/latin" }}
      />,
    );
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toMatch(/<a [^>]*href="\/language\/latin"[^>]*>Latin<\/a>/);
    expect(html).toContain("<span>Old French</span>");
    expect(html).toContain("<span>English</span>");
  });
});
