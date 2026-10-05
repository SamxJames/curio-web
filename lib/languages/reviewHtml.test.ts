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

  it("describes written-only use only for an actual year, matching the panel", () => {
    const year = new Date().getUTCFullYear();
    const page = (writtenUntil: number) =>
      renderReviewPage([{ ...latin, era: { ...latin.era, writtenUntil } }]);
    expect(page(year)).toContain("then in writing to today");
    expect(page(1900)).toContain("then in writing to 1900");
  });

  it("shows every field in plain text, escaped", () => {
    expect(html).toContain("c. 700 BCE – 600 CE");
    // writtenUntil: null is "no information" — the panel draws no tail, so neither does the review.
    expect(html).not.toContain("in writing");
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

describe("renderReviewPage source facts (fix round 1)", () => {
  const facts = {
    Latin: {
      name: "Latin",
      aliases: [],
      wikipedia: {
        title: "Latin",
        extract: "Latin is a <classical> language & was spoken in Latium.",
        url: "https://en.wikipedia.org/wiki/Latin",
        description: null,
        wikibaseItem: "Q397",
        type: "standard",
      },
      wikidata: {
        qid: "Q397",
        coordinates: { lat: 41.9, lon: 12.5 },
        inception: -700,
        dissolved: 600,
        speakers: { count: 50000000, year: 200 },
        instanceOf: ["language"],
      },
      fetchedAt: "2026-10-04T00:00:00.000Z",
    },
  };
  const html = renderReviewPage([latin, { ...latin, name: "Gothic" }], facts);

  it("shows the fetched facts beside the draft, escaped", () => {
    expect(html).toContain('class="facts"');
    expect(html).toContain("Latin is a &lt;classical&gt; language &amp; was spoken in Latium.");
    expect(html).toContain("Fact coordinates");
    expect(html).toContain("41.9, 12.5");
    expect(html).toContain("Fact inception");
    expect(html).toContain("700 BCE (-700)");
    expect(html).toContain("Fact dissolved");
    expect(html).toContain("600 CE (600)");
    expect(html).toContain("Fact speakers");
    expect(html).toContain("50,000,000 (year 200)");
  });

  it("says when a draft has no facts file", () => {
    expect(html).toContain("No facts file found for this draft.");
  });
});

describe("renderReviewPage re-runs the fact cross-checks (final review)", () => {
  const facts = {
    Latin: {
      name: "Latin",
      aliases: [],
      wikipedia: null,
      wikidata: {
        qid: "Q397",
        coordinates: { lat: 41.9, lon: 12.5 },
        inception: -700,
        dissolved: 600,
        speakers: { count: 50000000, year: 200 },
        instanceOf: [],
      },
      fetchedAt: "2026-10-04T00:00:00.000Z",
    },
  };

  it("shows factProblems in red even when _problems was deleted", () => {
    const draft = { ...latin, peakSpeakers: { count: 60000000, year: 200 } };
    expect("_problems" in draft).toBe(false);
    const page = renderReviewPage([draft], facts);
    expect(page).toContain('class="problems"');
    expect(page).toContain("peakSpeakers.count 60000000 differs from the fact 50000000");
  });

  it("shows no problems list for a draft that matches its facts", () => {
    expect(renderReviewPage([latin], facts)).not.toContain('class="problems"');
  });

  it("labels the speakers row without the word peak", () => {
    expect(renderReviewPage([latin], facts)).not.toMatch(/peak at|at its peak/i);
  });
});

describe("renderReviewPage lead and labels (lang-sources)", () => {
  const facts = {
    Latin: {
      name: "Latin",
      aliases: [],
      wikipedia: {
        title: "Latin",
        extract: "short",
        lead: "Latin <b>was</b> spoken in Latium & beyond.",
        url: "https://en.wikipedia.org/wiki/Latin",
        description: null,
        wikibaseItem: "Q397",
        type: "standard",
      },
      wikidata: {
        qid: "Q397",
        coordinates: null,
        inception: null,
        dissolved: null,
        speakers: null,
        instanceOf: [],
        parentLabels: ["Italic <languages>"],
        regionLabels: ["Latium & co"],
      },
      fetchedAt: "2026-10-04T00:00:00.000Z",
    },
  };
  const html = renderReviewPage([latin], facts);

  it("shows the lead collapsed in a details element, escaped", () => {
    expect(html).toContain("<details>");
    expect(html).toContain("<summary>Wikipedia lead section</summary>");
    expect(html).toContain("Latin &lt;b&gt;was&lt;/b&gt; spoken in Latium &amp; beyond.");
  });

  it("shows parent and region labels, escaped", () => {
    expect(html).toContain("Fact parent labels");
    expect(html).toContain("Italic &lt;languages&gt;");
    expect(html).toContain("Fact region labels");
    expect(html).toContain("Latium &amp; co");
  });

  it("shows no details element when there is no lead", () => {
    expect(renderReviewPage([latin], {})).not.toContain("<details>");
  });
});
