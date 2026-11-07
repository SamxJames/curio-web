import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Strata, { StrataSkeleton } from "./Strata";

const rest6 = [undefined, undefined, undefined, undefined, undefined, undefined];

describe("Strata", () => {
  it("names every layer and every answer's tier in text, not colour alone", () => {
    const html = renderToStaticMarkup(<Strata tiers={["rare", null]} words={["halyard", null]} label="Your dig" />);
    expect(html).toContain('role="img"');
    expect(html).toContain("Your dig");
    expect(html).toContain("bedrock");
    expect(html).toContain("halyard, Rare, in the stone");
    expect(html).toContain("No answer");
  });

  it("uses the stratum ink and paper tokens, never the page ink or paper, so light and dark match", () => {
    const html = renderToStaticMarkup(<Strata tiers={["rare", "common"]} words={["halyard", "adze"]} label="Your dig" />);
    expect(html).not.toMatch(/(?:fill|stroke)-(?:ink|paper)\b/);
    expect(html).toContain("fill-stratum-ink");
    expect(html).toContain("fill-stratum-paper");
    expect(html).toContain("stroke-stratum-ink");
  });

  it("switches the drop line and label to paper inside the dark strata", () => {
    const html = renderToStaticMarkup(<Strata tiers={["fossil"]} words={["trilobite"]} label="Your dig" />);
    expect(html).toContain("stroke-stratum-paper");
    expect(html).toMatch(/class="fill-stratum-paper"[^>]*>trilobite</);
  });

  it("the full drawing keeps its accessible name", () => {
    expect(renderToStaticMarkup(<Strata tiers={["rare", null]} words={["halyard", null]} label="Your dig" />)).toContain("halyard, Rare, in the stone");
  });
});

describe("Strata compact strip", () => {
  it("is hidden from assistive tech, has no band names or word labels, and is 80 units tall", () => {
    const html = renderToStaticMarkup(<Strata compact tiers={["rare", ...rest6]} words={["halyard"]} label="Your dig" current={1} />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="img"');
    expect(html).not.toContain("<figure");
    expect(html).not.toContain("topsoil");
    expect(html).not.toContain("halyard");
    expect(html).toContain('viewBox="0 0 360 80"');
  });
  it("height overrides the viewBox for the postcard drawing and keeps it accessible", () => {
    const html = renderToStaticMarkup(<Strata height={240} tiers={["rare", null]} words={["halyard", null]} label="Your dig, 7 November 2026" />);
    expect(html).toContain('viewBox="0 0 360 240"');
    expect(html).toContain('role="img"');
  });
  it("only the justDropped column animates, and only when it holds an answer", () => {
    const two = ["common", "rare", ...Array(5).fill(undefined)];
    expect(renderToStaticMarkup(<Strata compact tiers={two} label="x" justDropped={1} />).match(/dig-drop/g)).toHaveLength(1);
    expect(renderToStaticMarkup(<Strata compact tiers={two} label="x" />)).not.toContain("dig-drop");
    expect(renderToStaticMarkup(<Strata compact tiers={[null, ...rest6]} label="x" justDropped={0} />)).not.toContain("dig-drop");
  });
  it("the drop starts at the surface, as a negative offset in SVG units", () => {
    const html = renderToStaticMarkup(<Strata compact tiers={["rare", ...rest6]} label="x" justDropped={0} />);
    expect(html).toMatch(/--drop-from:-\d+(?:\.\d+)?px/);
  });
  it("a found fossil adds one pulse ring in its column", () => {
    expect(renderToStaticMarkup(<Strata compact tiers={["fossil", ...rest6]} label="x" justDropped={0} />).match(/dig-found/g)).toHaveLength(1);
    expect(renderToStaticMarkup(<Strata compact tiers={["fossil", ...rest6]} label="x" />)).not.toContain("dig-found");
  });
  it("a pass or timeout is an open RING (a circle with no fill), not a rect", () => {
    const html = renderToStaticMarkup(<Strata compact tiers={[null, ...rest6]} label="x" />);
    expect(html.match(/<circle(?=[^>]*fill="none")(?=[^>]*r="5\.5")[^>]*>/g)).toHaveLength(1);
  });
  it("the current column shows the surface ring", () => {
    const html = renderToStaticMarkup(<Strata compact tiers={["common", ...rest6]} label="x" current={1} />);
    expect(html.match(/<circle(?=[^>]*fill="none")(?=[^>]*r="5\.5")[^>]*>/g)).toHaveLength(1);
  });
  it("the dotted guide appears only in unanswered columns", () => {
    expect(renderToStaticMarkup(<Strata compact tiers={["common", "rare", ...Array(5).fill(undefined)]} label="x" />).match(/data-guide/g)).toHaveLength(5);
    expect(renderToStaticMarkup(<Strata compact tiers={Array(7).fill("common")} label="x" />)).not.toContain("data-guide");
  });
});

describe("StrataSkeleton", () => {
  it("is a hidden 80-unit strip with seven columns and five bands", () => {
    const html = renderToStaticMarkup(<StrataSkeleton />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('viewBox="0 0 360 80"');
    expect(html.match(/--stratum-\d/g)).toHaveLength(5);
    expect(html.match(/<line/g)).toHaveLength(7);
  });
});
