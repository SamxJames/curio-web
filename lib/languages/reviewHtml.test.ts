import { describe, expect, it } from "vitest";
import { renderReviewPage } from "./reviewHtml";

const latin = {
  name: "Latin",
  aliases: ["Classical Latin"],
  status: "extinct",
  classification: "Italic branch of the Indo-European family",
  region: "Latium, central Italy",
  map: { lat: 41.9, lon: 12.5, radiusKm: 400 },
  era: { from: -700, to: 600, writtenUntil: null, approximate: true },
  peakSpeakers: { count: 50000000, year: 200, note: "Wikidata estimate" },
  unknownSpeakersNote: null,
  parent: "Proto-Italic",
  origin: "Latin was first spoken in <Latium> & spread with Rome.",
  sourceUrl: "https://en.wikipedia.org/wiki/Latin",
  approved: false,
};

describe("renderReviewPage", () => {
  const html = renderReviewPage([
    latin,
    {
      ...latin,
      name: "Gothic",
      peakSpeakers: null,
      unknownSpeakersNote: "No census of its speakers exists.",
      era: null,
      parent: null,
      _problems: ["origin too short (5 < 40)"],
    },
  ]);

  it("is a self-contained page with one card per draft", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).not.toMatch(/<script|<link/);
    expect(html.match(/<article/g)).toHaveLength(2);
  });

  it("shows every field in plain text, escaped", () => {
    expect(html).toContain("c. 700 BCE – 600 CE");
    expect(html).toContain("then in writing to today");
    expect(html).toContain("50,000,000 (200 CE) — Wikidata estimate");
    expect(html).toContain("Latium, central Italy");
    expect(html).toContain("Latin was first spoken in &lt;Latium&gt; &amp; spread with Rome.");
    expect(html).toContain("Italic branch of the Indo-European family");
    expect(html).toContain("Proto-Italic");
    expect(html).toContain('href="https://en.wikipedia.org/wiki/Latin"');
    expect(html).toContain("Classical Latin");
    expect(html).toContain("41.9, 12.5 · 400 km");
  });

  it("shows the unknown-speakers note, unknown dates and problems in red", () => {
    expect(html).toContain("No census of its speakers exists.");
    expect(html).toContain("dates unknown");
    expect(html).toContain('class="problems"');
    expect(html).toContain("origin too short (5 &lt; 40)");
    expect(html).toMatch(/\.problems\s*\{[^}]*color:\s*#b00020/);
  });

  it("renders a malformed draft without throwing", () => {
    expect(() => renderReviewPage([{ name: "Odd", era: "soon", peakSpeakers: 5 }, null])).not.toThrow();
  });
});
