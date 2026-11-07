import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bannedHits } from "./copyAudit";
import { isTrafficSource } from "@/lib/traffic";
import { digLineText, digLineUrl } from "./digLineText";

describe("digLineText", () => {
  it("quotes the first prompt and states the length", () => {
    expect(digLineText("Name a beverage")).toBe("Today's dig starts with “Name a beverage”. Seven prompts, about three minutes.");
  });
  it("has a short form", () => expect(digLineText("Name a beverage", { short: true })).toBe("Today's dig starts with “Name a beverage”."));
  it("passes the shared copy audit: no gap, no count of people, no deadline", () => {
    expect(bannedHits(digLineText("Name a beverage"))).toEqual([]);
    expect(digLineText("x")).not.toMatch(/left|deadline|\d+ (people|players)/i);
  });
  it("imports nothing from ./server, so email and social code never pull in Redis or fs", () => {
    const src = readFileSync(new URL("./digLineText.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/from ["']\.\/server["']/);
  });
});

describe("digLineUrl", () => {
  it("points at /dig with the channel's utm_source", () => {
    const u = new URL(digLineUrl("threads"));
    expect(u.pathname).toBe("/dig");
    expect(u.searchParams.get("utm_source")).toBe("threads");
    expect(u.searchParams.get("utm_medium")).toBe("social");
    expect(u.searchParams.get("utm_campaign")).toBe("daily-dig");
  });
  it("uses medium email for the digest and the sample", () => {
    expect(new URL(digLineUrl("email")).searchParams.get("utm_medium")).toBe("email");
    expect(new URL(digLineUrl("sample")).searchParams.get("utm_medium")).toBe("email");
  });
  it.each(["email", "bluesky", "threads", "instagram"] as const)("%s is a recognised traffic source, so landings are credited", (s) => {
    expect(isTrafficSource(new URL(digLineUrl(s)).searchParams.get("utm_source"))).toBe(true);
  });
  it("leaves sample untagged on purpose", () => {
    expect(isTrafficSource(new URL(digLineUrl("sample")).searchParams.get("utm_source"))).toBe(false);
  });
});
