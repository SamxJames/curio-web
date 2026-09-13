import { describe, it, expect } from "vitest";
import { parseEmailMetricsResponse } from "./resendMetrics";

describe("parseEmailMetricsResponse", () => {
  it("parses a well-formed response", () => {
    const json = {
      object: "metrics",
      totals: { sent: 18, delivered: 18, opened: 8, clicked: 3, open_rate: 44.4, click_rate: 16.7 },
    };
    expect(parseEmailMetricsResponse(json)).toEqual({
      sent: 18,
      delivered: 18,
      opened: 8,
      clicked: 3,
      openRate: 44.4,
      clickRate: 16.7,
    });
  });

  it("returns null when the response has no totals object", () => {
    expect(parseEmailMetricsResponse({ object: "metrics" })).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(parseEmailMetricsResponse(null)).toBeNull();
    expect(parseEmailMetricsResponse("not json")).toBeNull();
    expect(parseEmailMetricsResponse(undefined)).toBeNull();
  });

  it("coerces missing or non-numeric count fields to 0 rather than throwing", () => {
    const json = { totals: { sent: 5 } }; // delivered/opened/clicked all missing
    expect(parseEmailMetricsResponse(json)).toEqual({
      sent: 5,
      delivered: 0,
      opened: 0,
      clicked: 0,
      openRate: null,
      clickRate: null,
    });
  });

  it("leaves rate fields as null (not 0) when missing, since 0% and 'unknown' are different", () => {
    const json = { totals: { sent: 5, delivered: 5, opened: 0, clicked: 0 } };
    const result = parseEmailMetricsResponse(json);
    expect(result?.openRate).toBeNull();
    expect(result?.clickRate).toBeNull();
  });
});
