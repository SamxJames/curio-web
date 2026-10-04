import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { LAND_DOTS } from "./mapDots";

const near = (lat: number, lon: number, within: number) =>
  LAND_DOTS.some(([dLon, dLat]) => Math.abs(dLat - lat) <= within && Math.abs(dLon - lon) <= within);

describe("LAND_DOTS", () => {
  it("has a plausible dot count", () => {
    expect(LAND_DOTS.length).toBeGreaterThan(4000);
    expect(LAND_DOTS.length).toBeLessThan(9000);
  });

  it("has a dot within 1.5 degrees of Rome", () => {
    expect(near(42, 12.5, 1.5)).toBe(true);
  });

  it("has no dot in the mid-Atlantic", () => {
    expect(near(30, -40, 1.5)).toBe(false);
  });
});

describe("map generator dependencies stay out of the app", () => {
  const banned = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["'](?:d3-geo|topojson-client|world-atlas)(?:\/[^"']*)?["']/;
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (name === "node_modules" || name === ".next") return [];
      if (statSync(full).isDirectory()) return walk(full);
      return /\.(tsx?|jsx?|mjs|mts)$/.test(name) ? [full] : [];
    });

  it("no file under app/ or components/ imports them", () => {
    const root = process.cwd();
    const offenders = ["app", "components"]
      .flatMap((d) => walk(path.join(root, d)))
      .filter((f) => banned.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
