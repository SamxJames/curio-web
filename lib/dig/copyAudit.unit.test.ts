import { describe, expect, it } from "vitest";
import { auditText, bannedHits } from "./copyAudit";

describe("copyAudit", () => {
  it.each([
    "Your streak is 3", "You missed yesterday", "3 in a row", "You played 4 digs", "You haven't played today",
    "You didn't finish", "Come back tomorrow", "A countdown", "Opens in 6 hours", "9 hours left",
    "Don&#x27;t break it", "Catch up on the unplayed ones", "3 of 12", "80% complete", "Most people said tea",
    "Everyone digs here", "Nobody else found it", "Not done",
  ])("flags %s", (t) => expect(bannedHits(t).length).toBeGreaterThan(0));
  it("allows progress through today's seven and the depth percentile", () => {
    expect(bannedHits("<p>Prompt 3 of 7</p>")).toEqual([]);
    expect(bannedHits("Deeper than 72% of today&#x27;s diggers")).toEqual([]);
  });
  it("decodes entities and strips tags before matching", () => {
    expect(auditText("<b>Don&#39;t</b> Break")).toBe("don't break");
    expect(bannedHits("<span>Don&#39;t break it</span>")).toEqual(["don't break"]);
  });
  it("leaves the planned copy alone", () => {
    for (const t of ["A new dig opens at midnight UTC.", "Topsoil. Right on the surface.", "Today's dig starts with “Name a beverage”. Seven prompts, about three minutes.", "Take your time.", "Pass? Tap again"]) expect(bannedHits(t)).toEqual([]);
  });
});
