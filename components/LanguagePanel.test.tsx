import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LanguagePanel, { LanguagePanelView } from "./LanguagePanel";
import { LATIN_FIXTURE, PROTO_ITALIC_FIXTURE } from "@/lib/languages/__fixtures__/latin";
import type { LanguageSheet } from "@/lib/languages/types";

const render = (sheet: LanguageSheet, lineages: string[][] = [["Latin", "English"]]) =>
  renderToStaticMarkup(<LanguagePanelView id="lp" sheet={sheet} favouriteLineages={lineages} />);

describe("LanguagePanel", () => {
  it("is a labelled inline region with every section in order", () => {
    const html = render(LATIN_FIXTURE);
    expect(html).toMatch(/^<section id="lp" aria-labelledby="lp-heading"/);
    expect(html).toContain('<h2 id="lp-heading"');
    const order = ["Language", "Where", "When", "Speakers", "Family path", "Where it came from"];
    const positions = order.map((t) => html.indexOf(`>${t}<`));
    expect(positions.every((p) => p > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html).toContain("no native speakers today");
    expect(html).toContain("1 of your favourites passed through Latin");
    expect(html).toContain(
      `href="${LATIN_FIXTURE.sourceUrl}" target="_blank" rel="noopener noreferrer"`,
    );
  });

  it("gives each SVG role=img and a meaningful label", () => {
    const html = render(LATIN_FIXTURE);
    const svgs = html.match(/<svg[^>]*>/g) ?? [];
    expect(svgs).toHaveLength(2);
    for (const svg of svgs) {
      expect(svg).toContain('role="img"');
      expect(svg).toMatch(/aria-label="[^"]{20,}"/);
    }
    expect(html).toContain("Map: the lit area marks where Latin was spoken");
    expect(html).toContain("Timeline: Latin was spoken from about 700 BCE");
  });

  it("renders the region line only when map is null", () => {
    const html = render({ ...LATIN_FIXTURE, map: null });
    expect(html).not.toContain("Map:");
    expect(html).toContain(LATIN_FIXTURE.region);
  });

  it("says Dates unknown when era is null", () => {
    const html = render({ ...LATIN_FIXTURE, era: null });
    expect(html).toContain("Dates unknown");
    expect(html).not.toContain("Timeline:");
  });

  it("shows the unknown note, never a number, when speakers are unknown", () => {
    const html = render({
      ...LATIN_FIXTURE,
      peakSpeakers: null,
      unknownSpeakersNote: "Test: no census survives.",
    });
    expect(html).toContain("No reliable count");
    expect(html).toContain("Test: no census survives.");
    expect(html).not.toContain("around ");
  });

  it("shows the count with an 'as of' line and never says peak or around", () => {
    const html = render(LATIN_FIXTURE);
    expect(html).toContain("4.5M");
    expect(html).toContain("as of 100 CE");
    expect(html).toContain("Test fixture value, not a sourced figure.");
    expect(html).not.toMatch(/\bpeak\b|\baround\b/i);
    expect(html.indexOf("as of 100 CE")).toBeLessThan(html.indexOf("Test fixture value"));
  });

  it("marks the timeline era label aria-hidden and the heading one step below the page h1", () => {
    const html = render(LATIN_FIXTURE);
    expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*>c. 700 BCE/);
    expect(html).toMatch(/<h2 id="lp-heading" class="[^"]*\btext-3xl\b/);
  });

  it("dashes the bar and chips of a reconstructed language", () => {
    const html = render(
      { ...PROTO_ITALIC_FIXTURE, era: { from: -2000, to: -1000, approximate: true } },
      [["Proto-Italic", "Latin", "English"]],
    );
    expect(html).toContain('stroke-dasharray="4 3"');
    expect(html).toMatch(/aria-current="true" class="[^"]*border-dashed[^"]*">Proto-Italic</);
    expect(html).toContain("Dashed: reconstructed, never written down");
    expect(html).toContain("reconstructed by scholars");
  });

  it("renders nothing for a name with no approved sheet", () => {
    expect(
      renderToStaticMarkup(<LanguagePanel id="lp" name="Latin" favouriteLineages={[]} />),
    ).toBe("");
  });

  it("omits the dashed caption when nothing is reconstructed", () => {
    expect(render({ ...LATIN_FIXTURE, parent: null })).not.toContain("Dashed:");
  });
});
