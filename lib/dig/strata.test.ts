import { describe, expect, it } from "vitest";
import { bandOf, strataLayout } from "./strata";

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
