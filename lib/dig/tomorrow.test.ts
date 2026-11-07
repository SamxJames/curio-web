import { devDay } from "./devDay";
import { prepareDay } from "./game";
import { encodeDay } from "./payload";
import { describe, expect, it } from "vitest";
import { bannedHits } from "./copyAudit";
import { tomorrowHint } from "./tomorrow";

describe("tomorrowHint", () => {
  it("drops the leading 'Name ' and keeps the rest", () => {
    expect(tomorrowHint("Name a word English took from Japanese")).toBe("a word English took from Japanese");
  });
  it("trims stray whitespace", () => {
    expect(tomorrowHint("  Name  a fruit  ")).toBe("a fruit");
  });
  it("gives null when the prompt does not start with 'Name ' or nothing follows it", () => {
    expect(tomorrowHint("Which word means a fruit")).toBeNull();
    expect(tomorrowHint("Names of fruit")).toBeNull();
    expect(tomorrowHint("Name ")).toBeNull();
    expect(tomorrowHint("Name")).toBeNull();
    expect(tomorrowHint("")).toBeNull();
  });
  it("passes the shared copy audit", () => {
    expect(bannedHits(`Tomorrow: ${tomorrowHint("Name a word from sailing")}`)).toEqual([]);
  });
});

describe("prepareDay carries the hint through", () => {
  const raw = { ...encodeDay(devDay("2026-12-05")), number: 5 };
  it("keeps tomorrow when the response has one, and leaves it off otherwise", () => {
    expect(prepareDay({ ...raw, tomorrow: "a fruit" }).tomorrow).toBe("a fruit");
    expect(prepareDay({ ...raw, tomorrow: null }).tomorrow).toBeUndefined();
    expect(prepareDay(raw).tomorrow).toBeUndefined();
  });
});
