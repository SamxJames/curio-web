import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { bannedHits } from "@/lib/dig/copyAudit";
import TomorrowHint from "./TomorrowHint";

describe("TomorrowHint", () => {
  it("renders nothing when there is no hint", () => {
    expect(renderToStaticMarkup(<TomorrowHint isToday />)).toBe("");
    expect(renderToStaticMarkup(<TomorrowHint isToday hint={null} />)).toBe("");
  });
  it("renders one plain line on today's dig", () => {
    const html = renderToStaticMarkup(<TomorrowHint isToday hint="a word English took from Japanese" />);
    expect(html).toContain("Tomorrow: a word English took from Japanese");
    expect(bannedHits(html)).toEqual([]);
  });
  it("never renders on a past dig, even with a hint (that 'tomorrow' has already happened)", () => {
    expect(renderToStaticMarkup(<TomorrowHint isToday={false} hint="a word English took from Japanese" />)).toBe("");
  });
});
