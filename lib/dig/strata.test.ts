import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STRATUM } from "./score";
import { bandOf, STRATA, STRATUM_DARK, STRATUM_HEX, strataLayout } from "./strata";
import { TIERS } from "./types";

describe("strataLayout", () => {
  it("drops each answer into its stratum, blanks stay at the surface", () => {
    const { bands, markers } = strataLayout(["common", "fossil", null], 300, 500);
    expect(bands.map((b) => b.name)).toEqual(["topsoil", "loam", "clay", "stone", "bedrock"]);
    expect(bands[1]).toEqual({ name: "loam", y: 100, h: 100 });
    expect(markers).toEqual([{ x: 50, y: 50, band: 0 }, { x: 150, y: 450, band: 4 }, { x: 250, y: 0, band: null }]);
    expect(bandOf("popular")).toBe(0);
    expect(bandOf("rare")).toBe(3);
  });
});

describe("strata mirrors", () => {
  it("matches the --stratum-N tokens in globals.css, for canvas and OG which cannot read CSS", () => {
    const css = readFileSync("app/globals.css", "utf8");
    STRATUM_HEX.forEach((hex, i) => {
      expect(css.match(new RegExp(`--stratum-${i + 1}:\\s*(#[0-9a-f]{6})`, "i"))?.[1].toLowerCase()).toBe(hex.toLowerCase());
    });
  });

  it("puts every tier in the stratum score.ts names for it", () => {
    for (const t of TIERS) expect(STRATA[bandOf(t)!]).toBe(STRATUM[t]);
  });
});

/** WCAG relative luminance and contrast ratio. */
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const mix = (fg: string, bg: string, alpha: number) =>
  `#${[1, 3, 5].map((i) => Math.round(parseInt(fg.slice(i, i + 2), 16) * alpha + parseInt(bg.slice(i, i + 2), 16) * (1 - alpha)).toString(16).padStart(2, "0")).join("")}`;

describe("strip contrast (WCAG 1.4.11, non-text 3:1)", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const token = (name: string) => css.match(new RegExp(`${name}: *(#[0-9a-f]{6})`, "i"))![1];
  const ink = token("--stratum-ink"), paper = token("--stratum-paper");
  const markOn = (band: number) => (STRATUM_DARK[band] ? paper : ink);

  it("the strip's ink and paper are fixed: defined once, with no dark-theme override, so light and dark match", () => {
    expect(css.match(/--stratum-ink:/g)).toHaveLength(1);
    expect(css.match(/--stratum-paper:/g)).toHaveLength(1);
    expect(css.match(/--stratum-\d:/g)).toHaveLength(5);
  });
  it("a filled marker and the fossil mark reach 3:1 against every band", () => {
    STRATUM_HEX.forEach((band, i) => expect(contrast(markOn(i), band), `band ${STRATA[i]}`).toBeGreaterThanOrEqual(3));
  });
  it("the open ring sits at the surface: it reaches 3:1 against topsoil", () => {
    expect(contrast(ink, STRATUM_HEX[0])).toBeGreaterThanOrEqual(3);
  });
  it("the dotted guide stays distinguishable from every band", () => {
    // Mirrors components/dig/Strata.tsx: ink over the light bands, paper through the dark ones.
    const GUIDE_OPACITY = 0.5;
    STRATUM_HEX.forEach((band, i) => {
      const line = mix(markOn(i), band, GUIDE_OPACITY);
      expect(contrast(line, band), `band ${STRATA[i]}`).toBeGreaterThan(1.3);
    });
  });
});
