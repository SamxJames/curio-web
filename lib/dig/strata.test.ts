import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STRATUM } from "./score";
import { bandOf, STRATA, STRATUM_HEX, strataLayout } from "./strata";
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
