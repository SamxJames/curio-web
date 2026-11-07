import { describe, expect, it } from "vitest";
import { bannedHits } from "./copyAudit";
import { ROLLOVER_FALLBACK, rolloverLine } from "./rollover";

const now = new Date("2026-11-07T15:30:00Z");

describe("rolloverLine", () => {
  it("names the next 00:00 UTC on the player's own clock", () => {
    expect(rolloverLine(now, { timeZone: "America/New_York", locale: "en-US" })).toBe("A new dig opens at 7:00 pm your time.");
    expect(rolloverLine(now, { timeZone: "Asia/Kolkata", locale: "en-GB" })).toBe("A new dig opens at 5:30 your time.");
  });
  it("says midnight for a player on UTC", () => {
    expect(rolloverLine(now, { timeZone: "UTC", locale: "en-GB" })).toBe("A new dig opens at midnight your time.");
    expect(rolloverLine(now, { timeZone: "Europe/London", locale: "en-US" })).toBe("A new dig opens at midnight your time.");
  });
  it("passes the copy audit", () => {
    for (const t of [ROLLOVER_FALLBACK, rolloverLine(now, { timeZone: "America/Los_Angeles" })]) expect(bannedHits(t)).toEqual([]);
  });
});
