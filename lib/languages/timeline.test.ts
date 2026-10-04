import { describe, expect, it } from "vitest";
import { AXIS, eraLabel, formatYear, yearToX } from "./timeline";

describe("timeline", () => {
  it("AXIS spans 4500 BCE to the current year", () => {
    expect(AXIS).toEqual({ from: -4500, to: new Date().getUTCFullYear() });
  });
  it("maps the axis ends to 0 and width", () => {
    expect(yearToX(-4500, 300)).toBe(0);
    expect(yearToX(AXIS.to, 300)).toBe(300);
  });
  it("clamps outside the axis", () => {
    expect(yearToX(-9000, 300)).toBe(0);
    expect(yearToX(AXIS.to + 500, 300)).toBe(300);
  });
  it("formats years", () => {
    expect(formatYear(-700)).toBe("700 BCE");
    expect(formatYear(600)).toBe("600 CE");
    expect(formatYear(1400)).toBe("1400");
  });
  it("labels eras", () => {
    expect(eraLabel({ from: -700, to: 600, approximate: true })).toBe("c. 700 BCE – 600 CE");
    expect(eraLabel({ from: 1100, to: null, approximate: false })).toBe("1100 – today");
  });
});
