import { describe, expect, it } from "vitest";
import { DEV_LAUNCH_DATE, dayNumber, digLaunchDate, isDateKey, isDigOpen, isPastDay, secondsToRollover } from "./clock";

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

describe("clock", () => {
  it("validates real calendar dates only", () => {
    expect(isDateKey("2026-12-01")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2026-12-1")).toBe(false);
    expect(isDateKey("../etc")).toBe(false);
  });
  it("keeps /dig closed in production until DIG_LAUNCH_DATE is set", () => {
    expect(digLaunchDate(env({ VERCEL_ENV: "production" }))).toBeNull();
    expect(digLaunchDate(env({ VERCEL_ENV: "production", DIG_LAUNCH_DATE: "2026-12-01" }))).toBe("2026-12-01");
    expect(digLaunchDate(env({ VERCEL_ENV: "production", DIG_LAUNCH_DATE: "soon" }))).toBeNull();
    expect(digLaunchDate(env({}))).toBe(DEV_LAUNCH_DATE);
    expect(isDigOpen(new Date("2026-11-30T23:59:59Z"), "2026-12-01")).toBe(false);
    expect(isDigOpen(new Date("2026-12-01T00:00:00Z"), "2026-12-01")).toBe(true);
    expect(isDigOpen(new Date(), null)).toBe(false);
  });
  it("numbers days from 1 on launch day", () => {
    expect(dayNumber("2026-12-01", "2026-12-01")).toBe(1);
    expect(dayNumber("2026-12-14", "2026-12-01")).toBe(14);
  });
  it("counts seconds to 00:00 UTC, never zero", () => {
    expect(secondsToRollover(new Date("2026-12-01T23:59:00Z"))).toBe(60);
    expect(secondsToRollover(new Date("2026-12-01T00:00:00Z"))).toBe(86400);
    expect(secondsToRollover(new Date("2026-12-01T23:59:59.900Z"))).toBe(1);
  });
  it("treats only launched dates before today as past", () => {
    const now = new Date("2026-12-10T12:00:00Z");
    expect(isPastDay("2026-12-09", now, "2026-12-01")).toBe(true);
    expect(isPastDay("2026-12-10", now, "2026-12-01")).toBe(false);
    expect(isPastDay("2026-12-11", now, "2026-12-01")).toBe(false);
    expect(isPastDay("2026-11-30", now, "2026-12-01")).toBe(false);
    expect(isPastDay("2026-12-09", now, null)).toBe(false);
  });
});
