import { describe, expect, it } from "vitest";
import { validateSheet } from "./validate";
import type { LanguageSheet } from "./types";

const valid: LanguageSheet = {
  name: "Latin",
  aliases: ["Classical Latin"],
  status: "extinct",
  classification: "Italic branch of the Indo-European family",
  region: "Latium, central Italy → across the Roman Empire",
  map: { lat: 41.9, lon: 12.5, radiusKm: 600 },
  era: { from: -700, to: 600, approximate: true },
  peakSpeakers: { count: 50000000, year: 200, note: "Estimate" },
  unknownSpeakersNote: null,
  parent: "Proto-Italic",
  origin:
    "Latin began as the language of Latium and spread with Roman power across Europe and the Mediterranean.",
  sourceUrl: "https://en.wikipedia.org/wiki/Latin",
  approved: true,
};

const with_ = (patch: Partial<LanguageSheet>): LanguageSheet => ({ ...valid, ...patch });

describe("validateSheet", () => {
  it("passes a complete valid sheet", () => {
    expect(validateSheet(valid)).toEqual([]);
  });

  it("flags an empty name", () => {
    expect(validateSheet(with_({ name: "  " })).length).toBeGreaterThan(0);
  });

  it("flags origin too long or too short", () => {
    expect(validateSheet(with_({ origin: "x".repeat(601) })).length).toBeGreaterThan(0);
    expect(validateSheet(with_({ origin: "too short" })).length).toBeGreaterThan(0);
  });

  it("flags a non-Wikipedia sourceUrl", () => {
    expect(validateSheet(with_({ sourceUrl: "https://example.com/Latin" })).length).toBeGreaterThan(0);
  });

  it("flags null peakSpeakers with an empty note", () => {
    expect(
      validateSheet(with_({ peakSpeakers: null, unknownSpeakersNote: "" })).length,
    ).toBeGreaterThan(0);
    expect(
      validateSheet(with_({ peakSpeakers: null, unknownSpeakersNote: null })).length,
    ).toBeGreaterThan(0);
    expect(
      validateSheet(with_({ peakSpeakers: null, unknownSpeakersNote: "No reliable count." })),
    ).toEqual([]);
  });

  it("flags a non-positive or non-integer speaker count", () => {
    expect(validateSheet(with_({ peakSpeakers: { count: 0, year: 1 } })).length).toBeGreaterThan(0);
    expect(validateSheet(with_({ peakSpeakers: { count: -5, year: 1 } })).length).toBeGreaterThan(0);
    expect(validateSheet(with_({ peakSpeakers: { count: 1.5, year: 1 } })).length).toBeGreaterThan(0);
  });

  it("flags era.to before era.from", () => {
    expect(
      validateSheet(with_({ era: { from: 600, to: -700, approximate: false } })).length,
    ).toBeGreaterThan(0);
  });

  it("flags out-of-range map values", () => {
    expect(validateSheet(with_({ map: { lat: 91, lon: 0, radiusKm: 10 } })).length).toBeGreaterThan(0);
    expect(validateSheet(with_({ map: { lat: 0, lon: -181, radiusKm: 10 } })).length).toBeGreaterThan(0);
    expect(validateSheet(with_({ map: { lat: 0, lon: 0, radiusKm: 0 } })).length).toBeGreaterThan(0);
    expect(validateSheet(with_({ map: { lat: 0, lon: 0, radiusKm: 5001 } })).length).toBeGreaterThan(0);
  });

  it("flags a Proto- name that is not reconstructed", () => {
    expect(
      validateSheet(
        with_({ name: "Proto-Italic", status: "extinct", peakSpeakers: null, unknownSpeakersNote: "None." }),
      ).length,
    ).toBeGreaterThan(0);
  });

  it("flags a reconstructed language with peakSpeakers", () => {
    expect(validateSheet(with_({ name: "Proto-Italic", status: "reconstructed" })).length).toBeGreaterThan(0);
    expect(
      validateSheet(
        with_({
          name: "Proto-Italic",
          status: "reconstructed",
          peakSpeakers: null,
          unknownSpeakersNote: "Reconstructed.",
        }),
      ),
    ).toEqual([]);
  });
});

describe("validateSheet on malformed (LLM-written) input", () => {
  const raw = (patch: Record<string, unknown>): unknown => ({ ...valid, ...patch });
  const without = (key: string): unknown => {
    const copy: Record<string, unknown> = { ...valid };
    delete copy[key];
    return copy;
  };

  it("returns problems instead of throwing for non-objects", () => {
    for (const bad of [null, undefined, 42, "Latin", [valid]]) {
      expect(() => validateSheet(bad)).not.toThrow();
      expect(validateSheet(bad)).toContain("sheet must be a JSON object");
    }
  });

  it("flags peakSpeakers that is undefined or not an object", () => {
    expect(() => validateSheet(without("peakSpeakers"))).not.toThrow();
    expect(validateSheet(without("peakSpeakers"))).toContain(
      "peakSpeakers is missing (use null when unknown)",
    );
    expect(validateSheet(raw({ peakSpeakers: 5000 }))).toContain(
      "peakSpeakers must be an object or null",
    );
    expect(validateSheet(raw({ peakSpeakers: { count: "lots", year: 1 } }))).toContain(
      "peakSpeakers.count must be a number",
    );
  });

  it("flags a missing era or map key", () => {
    expect(validateSheet(without("era"))).toContain("era is missing (use null when unknown)");
    expect(validateSheet(without("map"))).toContain("map is missing (use null when unknown)");
    expect(validateSheet(raw({ era: "700 BCE" }))).toContain("era must be an object or null");
    expect(validateSheet(raw({ map: { lat: "41", lon: 12, radiusKm: 5 } }))).toContain(
      "map.lat must be a number",
    );
  });

  it("flags a status outside the enum", () => {
    expect(validateSheet(raw({ status: "dead" }))).toContain(
      "status must be one of living, extinct, historical, reconstructed",
    );
  });

  it("flags aliases that are not a string array", () => {
    const msg = "aliases must be an array of strings";
    expect(validateSheet(raw({ aliases: "Classical Latin" }))).toContain(msg);
    expect(validateSheet(raw({ aliases: ["ok", 3] }))).toContain(msg);
    expect(validateSheet(without("aliases"))).toContain(msg);
  });

  it("flags a parent that is neither a string nor null", () => {
    const msg = "parent must be a string or null";
    expect(validateSheet(raw({ parent: 7 }))).toContain(msg);
    expect(validateSheet(raw({ parent: ["Proto-Italic"] }))).toContain(msg);
    expect(validateSheet(without("parent"))).toContain(msg);
    expect(validateSheet(raw({ parent: null }))).toEqual([]);
  });

  it("flags wrongly-typed string and boolean fields", () => {
    expect(validateSheet(raw({ origin: 12 }))).toContain("origin must be a string");
    expect(validateSheet(raw({ approved: "yes" }))).toContain("approved must be a boolean");
  });
});
