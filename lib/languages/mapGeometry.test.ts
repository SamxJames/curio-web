import { describe, expect, it } from "vitest";
import { dotsInView, isLit, project, viewAround } from "./mapGeometry";

describe("mapGeometry", () => {
  it("projects the view centre to the middle of the canvas", () => {
    const view = { minLon: -10, maxLon: 10, minLat: -5, maxLat: 5 };
    expect(project([0, 0], view, 200, 100)).toEqual([100, 50]);
  });

  it("viewAround is at least 30x18 degrees and clamped to the world", () => {
    const v = viewAround({ lat: 41.9, lon: 12.5, radiusKm: 100 });
    expect(v.maxLon - v.minLon).toBeGreaterThanOrEqual(30);
    expect(v.maxLat - v.minLat).toBeGreaterThanOrEqual(18);
    const big = viewAround({ lat: 80, lon: 175, radiusKm: 5000 });
    expect(big.minLon).toBeGreaterThanOrEqual(-180);
    expect(big.maxLon).toBeLessThanOrEqual(180);
    expect(big.minLat).toBeGreaterThanOrEqual(-90);
    expect(big.maxLat).toBeLessThanOrEqual(90);
  });

  it("viewAround pads to 2.5x the radius", () => {
    const v = viewAround({ lat: 0, lon: 0, radiusKm: 2000 });
    const halfLatDeg = (2000 * 2.5) / 111.2;
    expect(v.maxLat).toBeCloseTo(halfLatDeg, 0);
  });

  it("dotsInView filters to the box", () => {
    const view = { minLon: 0, maxLon: 10, minLat: 0, maxLat: 10 };
    const dots: [number, number][] = [
      [5, 5],
      [20, 5],
      [5, -3],
    ];
    expect(dotsInView(dots, view)).toEqual([[5, 5]]);
  });

  it("isLit uses the haversine radius (dots are [lon, lat])", () => {
    const rome = { lat: 41.9, lon: 12.5 };
    expect(isLit([11.25, 43.8], rome, 600)).toBe(true);
    expect(isLit([-0.1, 51.5], rome, 600)).toBe(false);
  });
});
