import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DIG_PITCH } from "@/lib/dig/pitch";
import DigCard from "./DigCard";

describe("DigCard", () => {
  it("links to /dig with the pitch", () => {
    const html = renderToStaticMarkup(<DigCard />);
    expect(html).toContain('href="/dig"');
    expect(html).toContain('aria-label="Start today&#x27;s dig"');
    expect(html).toMatch(/Today(&#x27;|')s dig/);
    expect(html).toContain(DIG_PITCH);
  });
});
