import { describe, expect, it } from "vitest";
import { isEmailArrival } from "./emailArrival";

describe("isEmailArrival", () => {
  it("is true for a digest link's query string", () => {
    expect(isEmailArrival("?utm_source=email&utm_medium=email&utm_campaign=daily-word")).toBe(true);
  });

  it("is false for Bluesky links, other sources and no query at all", () => {
    expect(isEmailArrival("?utm_source=bluesky&utm_medium=social")).toBe(false);
    expect(isEmailArrival("?utm_source=emailx")).toBe(false);
    expect(isEmailArrival("")).toBe(false);
  });
});
