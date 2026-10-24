import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Strata from "./Strata";

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
});
