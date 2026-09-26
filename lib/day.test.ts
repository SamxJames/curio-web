import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dayKey, dayStart, formatDay } from "./day";

describe("the one clock", () => {
  // A viewer west of Greenwich is exactly where a missing timeZone:"UTC"
  // shows the previous day — run these under one to prove it can't.
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/Los_Angeles";
  });
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("rolls over at 00:00 UTC, not at local midnight", () => {
    expect(dayKey(new Date("2026-09-26T23:59:59.999Z"))).toBe("2026-09-26");
    expect(dayKey(new Date("2026-09-27T00:00:00.000Z"))).toBe("2026-09-27");
  });

  it("formats a day as its UTC date for a viewer west of UTC", () => {
    expect(formatDay("2026-09-26")).toBe("Saturday, September 26");
    expect(formatDay("2026-09-26", { month: "short", day: "numeric" })).toBe("Sep 26");
  });

  it("dayStart and dayKey round-trip", () => {
    expect(dayStart("2026-09-26").toISOString()).toBe("2026-09-26T00:00:00.000Z");
    expect(dayKey(dayStart("2026-09-26"))).toBe("2026-09-26");
  });
});
