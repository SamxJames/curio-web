import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  FIXTURE_SHEETS,
  LATIN_FIXTURE,
  PROTO_INDO_EUROPEAN_FIXTURE,
  PROTO_ITALIC_FIXTURE,
} from "./__fixtures__/latin";
import { LANGUAGE_SHEETS } from "./data";
import type { Dot } from "./mapGeometry";
import {
  MIN_BAR_WIDTH,
  PANEL_WIDTH,
  favouriteCount,
  mapHeight,
  mapModel,
  panelModel,
  speakersModel,
  statusNote,
  timelineModel,
} from "./panel";
import { yearToX } from "./timeline";
import type { LanguageSheet } from "./types";

const latin = (p: Partial<LanguageSheet> = {}): LanguageSheet => ({ ...LATIN_FIXTURE, ...p });

const lineages = [
  ["Proto-Italic", "Latin", "Old French", "English"],
  ["Latin", "English"],
  ["Classical Latin", "Middle French", "English"],
  ["Old Norse", "English"],
];

describe("panelModel", () => {
  it("builds the family path from fixtures: ancestors › current › next steps › English", () => {
    const m = panelModel(LATIN_FIXTURE, lineages, FIXTURE_SHEETS);
    expect(m.family.map((g) => g.map((c) => c.name))).toEqual([
      ["Proto-Indo-European"],
      ["Proto-Italic"],
      ["Latin"],
      ["Old French", "Middle French"],
      ["English"],
    ]);
    const flat = m.family.flat();
    expect(flat.find((c) => c.current)?.name).toBe("Latin");
    expect(flat.filter((c) => c.reconstructed).map((c) => c.name)).toEqual([
      "Proto-Indo-European",
      "Proto-Italic",
    ]);
    expect(m.showDashedCaption).toBe(true);
  });

  it("hides the dashed caption when no chip is reconstructed", () => {
    const m = panelModel(latin({ parent: null }), [["Latin", "English"]], [latin({ parent: null })]);
    expect(m.family.map((g) => g.map((c) => c.name))).toEqual([["Latin"], ["English"]]);
    expect(m.showDashedCaption).toBe(false);
  });

  it("treats an unsheeted Proto-* next step as reconstructed", () => {
    const m = panelModel(latin({ parent: null }), [["Latin", "Proto-Thing", "English"]], []);
    expect(m.family.flat().find((c) => c.name === "Proto-Thing")?.reconstructed).toBe(true);
  });

  it("counts favourites through any spelling of the language", () => {
    expect(favouriteCount(LATIN_FIXTURE, lineages)).toBe(3);
    expect(panelModel(LATIN_FIXTURE, lineages, FIXTURE_SHEETS).favouriteCount).toBe(3);
  });

  it("uses the shipped (empty) data by default without throwing", () => {
    expect(LANGUAGE_SHEETS).toEqual([]);
    const m = panelModel(LATIN_FIXTURE, lineages);
    expect(m.family[0].map((c) => c.name)).toEqual(["Latin"]);
  });
});

describe("statusNote", () => {
  it("covers every status", () => {
    expect(statusNote(latin({ status: "living" }), [])).toBe("spoken today");
    expect(statusNote(latin({ status: "extinct" }), [])).toBe("no native speakers today");
    expect(statusNote(latin({ status: "historical" }), ["Old French"])).toBe(
      "an earlier stage of Old French",
    );
    expect(statusNote(latin({ status: "historical" }), [])).toBe(
      "an earlier stage of a living language",
    );
    expect(statusNote(PROTO_ITALIC_FIXTURE, [])).toMatch(/^reconstructed by scholars/);
  });
});

describe("timelineModel", () => {
  it("returns null when dates are unknown", () => {
    expect(timelineModel(PROTO_ITALIC_FIXTURE)).toBeNull();
  });

  it("places the bar on the shared axis with a written-only tail to now", () => {
    const t = timelineModel(LATIN_FIXTURE)!;
    expect(t.label).toBe("c. 700 BCE – 600 CE");
    expect(t.bar.x).toBeCloseTo(yearToX(-700, PANEL_WIDTH));
    expect(t.bar.x + t.bar.width).toBeCloseTo(yearToX(600, PANEL_WIDTH));
    expect(t.tail).not.toBeNull();
    expect(t.tail!.x + t.tail!.width).toBeCloseTo(PANEL_WIDTH);
    expect(t.dashed).toBe(false);
    expect(t.ariaLabel).toBe(
      "Timeline: Latin was spoken from about 700 BCE to about 600 CE; still used in writing today.",
    );
    expect(t.ticks.map((x) => x.label)).toEqual(["4500 BCE", "1000 BCE"]);
    expect(t.ticks[0].percent).toBe(0);
  });

  it("has no tail when writtenUntil is absent, and runs to now when still spoken", () => {
    const t = timelineModel(latin({ status: "living", era: { from: 1100, to: null, approximate: false } }))!;
    expect(t.tail).toBeNull();
    expect(t.bar.x + t.bar.width).toBeCloseTo(PANEL_WIDTH);
    expect(t.ariaLabel).toContain("spoken from 1100 to today");
    expect(t.labelAnchor.side).toBe("right");
  });

  it("enforces a minimum bar width, even at the end of the axis", () => {
    const t = timelineModel(latin({ era: { from: 1990, to: 1995, approximate: false } }))!;
    expect(t.bar.width).toBe(MIN_BAR_WIDTH);
    expect(t.bar.x + t.bar.width).toBeLessThanOrEqual(PANEL_WIDTH);
  });

  it("dashes reconstructed languages", () => {
    expect(timelineModel(PROTO_INDO_EUROPEAN_FIXTURE)!.dashed).toBe(true);
  });
});

describe("speakersModel", () => {
  it("formats a count compactly with its year and note", () => {
    // en-GB compact notation; current ICU renders millions as a lower-case "m".
    expect(speakersModel(LATIN_FIXTURE)).toEqual({
      kind: "count",
      value: expect.stringMatching(/^4.5[mM]$/),
      year: "100 CE",
      note: "Test fixture value, not a sourced figure.",
    });
  });

  it("falls back to the unknown note, never a number", () => {
    expect(speakersModel(PROTO_ITALIC_FIXTURE)).toEqual({
      kind: "unknown",
      note: PROTO_ITALIC_FIXTURE.unknownSpeakersNote,
    });
  });
});

describe("mapModel", () => {
  const dots: Dot[] = [
    [12, 42], // next to the centre: lit
    [30, 42], // in view, outside the radius
    [-120, 40], // out of view
  ];

  it("lights dots within the radius and drops dots outside the view", () => {
    const m = mapModel(LATIN_FIXTURE.map!, dots);
    expect(m.dots).toHaveLength(2);
    expect(m.dots.map((d) => d.lit)).toEqual([true, false]);
    expect(m.litRadius).toBeGreaterThan(m.dotRadius);
    expect(m.centre.x).toBeCloseTo(m.width / 2, 0);
    for (const d of m.dots) {
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.x).toBeLessThanOrEqual(m.width);
      expect(d.y).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeLessThanOrEqual(m.height);
    }
  });

  it("keeps the canvas height within bounds", () => {
    for (const map of [
      { lat: 0, lon: 0, radiusKm: 100 },
      { lat: 70, lon: 20, radiusKm: 3000 },
    ]) {
      const h = mapHeight(map);
      expect(h).toBeGreaterThanOrEqual(120);
      expect(h).toBeLessThanOrEqual(240);
    }
  });
});

describe("test fixtures stay out of the app", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (name === "node_modules" || name === ".next") return [];
      if (statSync(full).isDirectory()) return walk(full);
      return /\.(tsx?|jsx?|mjs|mts)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
    });

  it("no non-test file under app/, components/ or lib/ imports __fixtures__", () => {
    const root = process.cwd();
    const offenders = ["app", "components", "lib"]
      .flatMap((d) => walk(path.join(root, d)))
      .filter((f) => !f.includes("__fixtures__"))
      .filter((f) => /__fixtures__/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
